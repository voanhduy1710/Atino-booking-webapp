import { Router } from "express";
import { z } from "zod";
import {
  requireAuth,
  type AuthedRequest,
  usernameOf,
} from "../lib/httpAuth.js";
import { getSupabase } from "../lib/supabase.js";
import { signBookingMedia } from "../lib/mediaDto.js";
import { CAPABILITY_ROLES } from "../config/capabilities.js";

const router = Router();
const reportDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  });

const reportStatuses = [
  "pending",
  "confirmed",
  "rejected",
  "returned",
] as const;

type ReportItemStatus = (typeof reportStatuses)[number];

interface ReportBookingSummary {
  id: string;
  booking_code: string;
  supplier_name: string;
  status: ReportItemStatus;
  total_quantity: number;
}

interface ReportBookingDetailRow {
  booking_id: string;
  supplier_code: string;
  delivery_date: string;
  time_slot: string;
  product_code: string;
  process_code: string;
  warehouse_code: string | null;
  mau: string | null;
  total_quantity: number;
  status: ReportItemStatus;
  reject_reason: string | null;
}

function summaryStatus(items: Array<{ status: ReportItemStatus }>): ReportItemStatus {
  if (items.some((item) => item.status === "returned")) return "returned";
  if (items.some((item) => item.status === "confirmed")) return "confirmed";
  if (items.some((item) => item.status === "rejected")) return "rejected";
  return "pending";
}

function supplierNameOf(
  supplier: { name?: string } | Array<{ name?: string }> | null,
): string {
  return (Array.isArray(supplier) ? supplier[0] : supplier)?.name ?? "—";
}

async function legacyReport(
  dateFrom?: string,
  dateTo?: string,
  statusFilter?: string,
  supplierId?: string,
) {
  let query = getSupabase()
    .from("bookings")
    .select(
      "id, booking_code, delivery_date, time_slot, suppliers!inner(name, code), booking_items(status, total_quantity, quantity_booked, product_code, process_code, warehouse_code, mau, reject_reason)",
    )
    .order("delivery_date", { ascending: true })
    .limit(5000);
  if (dateFrom) query = query.gte("delivery_date", dateFrom);
  if (dateTo) query = query.lte("delivery_date", dateTo);
  if (supplierId) query = query.eq("supplier_id", supplierId);
  const { data, error } = await query;
  if (error) throw error;

  const byStatus: Record<string, number> = {};
  const daily = new Map<
    string,
    {
      date: string;
      total: number;
      statuses: Record<string, number>;
      total_items: number;
      confirmed: number;
      rejected: number;
      pending: number;
      returned: number;
      bookings: ReportBookingSummary[];
      details: ReportBookingDetailRow[];
    }
  >();
  const suppliers = new Map<string, number>();
  let totalItems = 0;

  for (const booking of (data ?? []) as unknown as Array<{
    id: string;
    booking_code: string;
    delivery_date: string;
    time_slot: string;
    suppliers: { name: string; code: string } | Array<{ name: string; code: string }> | null;
    booking_items: Array<{
      status: string;
      total_quantity: number | null;
      quantity_booked: number;
      product_code: string;
      process_code: string;
      warehouse_code: string | null;
      mau: string | null;
      reject_reason: string | null;
    }> | null;
  }>) {
    const items = booking.booking_items ?? [];
    const supplierName = supplierNameOf(booking.suppliers);
    const supplierCode = (Array.isArray(booking.suppliers) ? booking.suppliers[0] : booking.suppliers)?.code ?? "—";

    const includedItems = items.filter((item): item is typeof item & { status: ReportItemStatus } =>
      reportStatuses.includes(item.status as ReportItemStatus) && (!statusFilter || item.status === statusFilter),
    );
    if (includedItems.length === 0) continue;

    const day = daily.get(booking.delivery_date) ?? {
      date: booking.delivery_date,
      total: 0,
      statuses: {},
      total_items: 0,
      confirmed: 0,
      rejected: 0,
      pending: 0,
      returned: 0,
      bookings: [],
      details: [],
    };
    let bookingTotal = 0;

    for (const item of includedItems) {

      const status = item.status as ReportItemStatus;
      const quantity = Number(item.total_quantity ?? item.quantity_booked ?? 0);
      byStatus[status] = (byStatus[status] ?? 0) + quantity;
      totalItems += quantity;

      day.total += quantity;
      day.statuses[status] = (day.statuses[status] ?? 0) + quantity;
      day.total_items += quantity;
      day[status] += quantity;
      bookingTotal += quantity;
      day.details.push({
        booking_id: booking.id,
        supplier_code: supplierCode,
        delivery_date: booking.delivery_date,
        time_slot: booking.time_slot,
        product_code: item.product_code,
        process_code: item.process_code,
        warehouse_code: item.warehouse_code,
        mau: item.mau,
        total_quantity: quantity,
        status,
        reject_reason: item.reject_reason,
      });
      suppliers.set(supplierName, (suppliers.get(supplierName) ?? 0) + quantity);
    }
    day.bookings.push({
      id: booking.id,
      booking_code: booking.booking_code,
      supplier_name: supplierName,
      status: summaryStatus(includedItems),
      total_quantity: bookingTotal,
    });
    daily.set(booking.delivery_date, day);
  }

  return {
    total: totalItems,
    total_items: totalItems,
    by_status: byStatus,
    daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
    suppliers: [...suppliers]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
  };
}

router.use(requireAuth([...CAPABILITY_ROLES.reviewBookings]));

router.get("/suppliers", async (_req, res, next) => {
  try {
    const { data, error } = await getSupabase()
      .from("suppliers")
      .select("id, code, name")
      .eq("active", true)
      .order("code");
    if (error) throw error;
    res.json({ suppliers: data ?? [] });
  } catch (err) {
    next(err);
  }
});

router.get("/bookings", async (req, res, next) => {
  try {
    const dateFrom = String(req.query.date_from ?? "").trim();
    const dateTo = String(req.query.date_to ?? "").trim();
    const search = String(req.query.search ?? "")
      .trim()
      .slice(0, 100);
    const supplierId = String(req.query.supplier_id ?? "").trim();
    const status = String(req.query.status ?? "").trim();
    const page = Math.max(
      1,
      Number.parseInt(String(req.query.page ?? "1"), 10) || 1,
    );
    const pageSize = Math.min(
      100,
      Math.max(
        1,
        Number.parseInt(String(req.query.page_size ?? "20"), 10) || 20,
      ),
    );
    if (
      status &&
      !["pending", "confirmed", "rejected", "returned"].includes(status)
    ) {
      res.status(400).json({ error: "Invalid booking status" });
      return;
    }
    const select = status
      ? "id, booking_code, booking_token, supplier_account_id, delivery_date, time_slot, status, submitted_at, ghi_chu, nhanh_draft_bill_id, suppliers!inner(name, code), warehouses!inner(name), matching_items:booking_items!inner(status), booking_items(id, status, reject_reason, product_code, process_code, warehouse_code, mau, total_quantity, quantity_booked)"
      : "id, booking_code, booking_token, supplier_account_id, delivery_date, time_slot, status, submitted_at, ghi_chu, nhanh_draft_bill_id, suppliers!inner(name, code), warehouses!inner(name), booking_items(id, status, reject_reason, product_code, process_code, warehouse_code, mau, total_quantity, quantity_booked)";
    let query = getSupabase()
      .from("bookings")
      .select(select, { count: "exact" })
      .order("submitted_at", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);
    if (dateFrom) query = query.gte("delivery_date", dateFrom);
    if (dateTo) query = query.lte("delivery_date", dateTo);
    if (search)
      query = query.ilike("booking_code", `%${search.replace(/[%_]/g, "")}%`);
    if (supplierId) query = query.eq("supplier_id", supplierId);
    if (status) query = query.eq("matching_items.status", status);
    const { data, error, count } = await query;
    if (error) throw error;
    res.json({
      bookings: data ?? [],
      total: count ?? 0,
      page,
      page_size: pageSize,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/bookings/:bookingId", async (req, res, next) => {
  try {
    const { data, error } = await getSupabase()
      .from("bookings")
      .select(
        "id, booking_code, booking_token, supplier_account_id, supplier_id, warehouse_id, delivery_date, time_slot, status, submitted_at, ghi_chu, delivery_note, nhanh_draft_bill_id, suppliers(name, code), warehouses(name, code), booking_items(id, product_code, process_code, warehouse_code, mau, delivery_round, is_final_round, quantity_booked, total_quantity, quantity_received, size_s_28, size_m_29, size_l_30, size_xl_31, size_2xl_32, size_3xl_33, status, reject_reason, vat_invoice_url, booking_item_photos(id, storage_path, photo_type))",
      )
      .eq("id", req.params.bookingId)
      .single();
    if (error || !data) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }
    res.json({ booking: await signBookingMedia(data as Record<string, any>) });
  } catch (err) {
    next(err);
  }
});

router.get("/report", async (req, res, next) => {
  try {
    const parsed = z
      .object({
        date_from: reportDate.optional(),
        date_to: reportDate.optional(),
        status: z.enum(reportStatuses).optional(),
        supplier_id: z.string().uuid().optional(),
      })
      .safeParse({
        date_from: String(req.query.date_from ?? "").trim() || undefined,
        date_to: String(req.query.date_to ?? "").trim() || undefined,
        status: String(req.query.status ?? "").trim() || undefined,
        supplier_id: String(req.query.supplier_id ?? "").trim() || undefined,
      });
    if (
      !parsed.success ||
      (parsed.data.date_from &&
        parsed.data.date_to &&
        parsed.data.date_from > parsed.data.date_to)
    ) {
      res.status(400).json({ error: "Invalid report date range" });
      return;
    }
    res.json(
      await legacyReport(
        parsed.data.date_from,
        parsed.data.date_to,
        parsed.data.status,
        parsed.data.supplier_id,
      ),
    );
  } catch (err) {
    next(err);
  }
});

router.get("/admin-view", requireAuth(["admin"]), async (_req, res, next) => {
  try {
    const { data, error } = await getSupabase()
      .from("bookings")
      .select(
        "id, booking_code, booking_token, delivery_date, time_slot, status, submitted_at, ghi_chu, suppliers!inner(name), warehouses!inner(name), booking_items(status, reject_reason)",
      )
      .order("submitted_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    res.json({ bookings: data ?? [] });
  } catch (err) {
    next(err);
  }
});

async function notifyForItemAction(
  itemId: string,
  eventType: "booking_confirmed" | "booking_rejected" | "booking_returned",
  messageFor: (bookingCode: string) => string,
): Promise<void> {
  const supabase = getSupabase();
  const item = await supabase
    .from("booking_items")
    .select("booking_id")
    .eq("id", itemId)
    .single();
  if (item.error || !item.data?.booking_id) return;

  const booking = await supabase
    .from("bookings")
    .select("id, booking_code, supplier_account_id")
    .eq("id", item.data.booking_id)
    .single();
  if (booking.error || !booking.data?.supplier_account_id) return;

  await supabase.from("notifications").insert({
    recipient_type: "supplier_account",
    recipient_id: booking.data.supplier_account_id,
    event_type: eventType,
    message: messageFor(booking.data.booking_code),
    booking_id: booking.data.id,
  } as never);
}

router.post("/items/:itemId/confirm", async (req, res, next) => {
  try {
    const supabase = getSupabase();
    const username = usernameOf((req as unknown as AuthedRequest).user);
    const { error } = await supabase.rpc("confirm_booking_item", {
      p_item_id: req.params.itemId,
      p_reviewer_username: username,
    } as never);
    if (error) throw error;
    await notifyForItemAction(
      req.params.itemId,
      "booking_confirmed",
      (code) => `Đơn ${code} có sản phẩm đã được duyệt.`,
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post("/items/:itemId/reject", async (req, res, next) => {
  try {
    const reason = String(req.body?.reason ?? "").trim();
    if (!reason) {
      res.status(400).json({ error: "Reason is required" });
      return;
    }
    const supabase = getSupabase();
    const username = usernameOf((req as unknown as AuthedRequest).user);
    const { error } = await supabase.rpc("reject_booking_item", {
      p_item_id: req.params.itemId,
      p_reason: reason,
      p_reviewer_username: username,
    } as never);
    if (error) throw error;
    await notifyForItemAction(
      req.params.itemId,
      "booking_rejected",
      (code) => `Đơn ${code} có sản phẩm bị từ chối. Lý do: ${reason}`,
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post("/items/:itemId/return", async (req, res, next) => {
  try {
    const supabase = getSupabase();
    const username = usernameOf((req as unknown as AuthedRequest).user);
    const { error } = await supabase.rpc("return_booking_item", {
      p_item_id: req.params.itemId,
      p_reason: req.body?.reason ?? null,
      p_reviewer_username: username,
    } as never);
    if (error) {
      if (error.message.includes("already been reviewed")) {
        res.status(409).json({ error: "Sản phẩm này đã được xử lý" });
        return;
      }
      if (error.message.includes("booking item not found")) {
        res.status(404).json({ error: "Không tìm thấy sản phẩm booking" });
        return;
      }
      throw error;
    }
    await notifyForItemAction(
      req.params.itemId,
      "booking_returned",
      (code) => `Đơn ${code} có sản phẩm bị trả hàng.`,
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post("/items/:itemId/revert", async (req, res, next) => {
  try {
    const supabase = getSupabase();
    const username = usernameOf((req as unknown as AuthedRequest).user);
    const { data, error } = await supabase.rpc("revert_booking_item", {
      p_item_id: req.params.itemId,
      p_reviewer_username: username,
    } as never);
    if (error) throw error;
    const result = data as { error?: string } | null;
    if (result?.error) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete(
  "/bookings/:bookingId",
  requireAuth(["admin"]),
  async (req, res, next) => {
    try {
      const supabase = getSupabase();
      const { error } = await supabase.rpc("admin_delete_booking", {
        p_booking_id: req.params.bookingId,
      } as never);
      if (error) throw error;
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

router.post("/bookings/:bookingId/draft-bill", async (req, res, next) => {
  try {
    const value = String(req.body?.nhanh_draft_bill_id ?? "").trim() || null;
    const supabase = getSupabase();
    const { error } = await supabase
      .from("bookings")
      .update({ nhanh_draft_bill_id: value })
      .eq("id", req.params.bookingId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
