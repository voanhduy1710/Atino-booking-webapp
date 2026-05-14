import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const GCS_BUCKET = "atino-media";
const GCS_PREFIX = "duy_booking_images";

interface JWTPayload {
  sub: string;
  role: string;
  supplier_id?: string;
  supplier_account_id?: string;
  exp: number;
}

// b64u() strips "=" padding; Deno's atob() is strict — must re-add padding before decoding
function padBase64(s: string): string {
  return s + "=".repeat((4 - (s.length % 4)) % 4);
}

async function verifyJWT(token: string): Promise<JWTPayload | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const padded = padBase64(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(atob(padded)) as JWTPayload;
    if (payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

interface PoItem {
  product_code: string;
  process_code: string;
  delivery_round: number;
  is_final_round: boolean;
  quantity_booked: number;
  vat_temp_paths?: string[];
  slip_temp_paths?: string[];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  const cors = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
  const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: cors });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const token = authHeader.slice(7);
    const payload = await verifyJWT(token);
    if (!payload || payload.role !== "supplier") return json({ error: "Unauthorized" }, 401);
    if (!payload.supplier_account_id) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: account } = await supabase
      .from("supplier_accounts")
      .select("status, supplier_id")
      .eq("id", payload.supplier_account_id)
      .single();

    if (!account || account.status !== "active") {
      return json({ error: "Tài khoản chưa được kích hoạt" }, 403);
    }
    if (!account.supplier_id) {
      return json({ error: "Tài khoản nhà cung cấp chưa được gán NCC" }, 400);
    }

    const body = await req.json() as {
      warehouse_id: string;
      time_slot: string;
      ghi_chu?: string;
      delivery_note: string;
      session_id: string;
      items: PoItem[];
    };

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .insert({
        supplier_account_id: payload.supplier_account_id,
        supplier_id: account.supplier_id,
        warehouse_id: body.warehouse_id,
        time_slot: body.time_slot,
        ghi_chu: body.ghi_chu ?? null,
        delivery_note: body.delivery_note,
      })
      .select("id, booking_code, booking_token, delivery_date")
      .single();

    if (bookingError || !booking) {
      console.error("Booking insert error:", bookingError);
      return json({ error: "Lỗi tạo booking" }, 500);
    }

    for (const item of body.items) {
      const { data: ins, error: ie } = await supabase
        .from("booking_items")
        .insert({
          booking_id: booking.id,
          product_code: item.product_code,
          process_code: item.process_code,
          delivery_round: item.delivery_round,
          is_final_round: item.is_final_round ?? false,
          quantity_booked: item.quantity_booked,
          vat_invoice_url: item.vat_temp_paths?.[0]
            ? `https://storage.googleapis.com/${GCS_BUCKET}/${GCS_PREFIX}/${item.vat_temp_paths[0]}`
            : null,
        })
        .select("id")
        .single();

      if (ie || !ins) { console.error("Item error:", ie); continue; }

      const photoPaths = [
        ...(item.slip_temp_paths ?? []).map((p) => ({ path: p, type: "delivery_slip" as const })),
        ...(item.vat_temp_paths ?? []).map((p) => ({ path: p, type: "vat_invoice" as const })),
      ];

      for (const { path, type } of photoPaths) {
        const url = path.startsWith("https://")
          ? path
          : `https://storage.googleapis.com/${GCS_BUCKET}/${GCS_PREFIX}/${path}`;
        await supabase.from("booking_item_photos").insert({
          booking_item_id: ins.id,
          storage_path: url,
          photo_type: type,
        });
      }
    }

    const { data: sup } = await supabase
      .from("suppliers").select("name").eq("id", account.supplier_id).single();

    const STAFF_RECIPIENTS = ["voanhduy1710", "lethientinh", "lethiendung", "lethihong"];
    const notificationMessage = `C\u00f3 booking m\u1edbi t\u1eeb ${sup?.name ?? "NCC"}: ${booking.booking_code}`;

    await supabase.from("notifications").insert(
      STAFF_RECIPIENTS.map((username) => ({
        recipient_type: "staff",
        recipient_id: username,
        event_type: "booking_submitted",
        message: notificationMessage,
        booking_id: booking.id,
      })),
    );

    return json({
      booking_code: booking.booking_code,
      booking_token: booking.booking_token,
      delivery_date: booking.delivery_date,
    });

  } catch (err) {
    console.error("finalize_booking error:", err);
    return new Response(
      JSON.stringify({ error: "Có lỗi xảy ra, vui lòng thử lại" }),
      { status: 500, headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" } }
    );
  }
});
