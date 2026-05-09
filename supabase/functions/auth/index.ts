import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const JWT_SECRET = Deno.env.get("JWT_SECRET") ?? "dev-secret-change-me";
const AUTH_USERS_RAW = Deno.env.get("AUTH_USERS") ?? "";

interface StaffUser { username: string; password_hash: string; role: string; allowedRoutes: string[]; }
interface JWTPayload { sub: string; role: string; allowedRoutes?: string[]; supplier_id?: string; supplier_account_id?: string; exp: number; iat: number; }

// voanhduy1710 password = "voanhduy1710" (SHA-256: 379a28089ae4a622dd241afce153daa1a39aceecb78137f1f90cc2a92f1194dd)
// others initial password = "123456"     (SHA-256: 8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92)
const DEFAULT_STAFF: StaffUser[] = [
  { username: "voanhduy1710", password_hash: "379a28089ae4a622dd241afce153daa1a39aceecb78137f1f90cc2a92f1194dd", role: "admin",              allowedRoutes: ["/admin","/manager","/reviewer","/receiver"] },
  { username: "lethientinh",  password_hash: "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92", role: "warehouse_reviewer", allowedRoutes: ["/reviewer"] },
  { username: "lethiendung",  password_hash: "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92", role: "warehouse_receiver", allowedRoutes: ["/receiver"] },
  { username: "lethihong",    password_hash: "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92", role: "manager",             allowedRoutes: ["/manager"] },
];

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}
async function verify(pw: string, hash: string) { return (await sha256(pw)) === hash; }
function b64u(s: string) { return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, ""); }
async function makeJWT(p: JWTPayload): Promise<string> {
  const hdr = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const bdy = b64u(JSON.stringify(p));
  const inp = `${hdr}.${bdy}`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(JWT_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(inp));
  return `${inp}.${b64u(String.fromCharCode(...Array.from(new Uint8Array(sig))))}`;
}

const CORS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: CORS });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type,Authorization" } });
  try {
    const body = await req.json() as Record<string, string>;
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (body.action === "login") {
      const { username, password } = body;
      if (!username || !password) return json({ error: "Thieu thong tin dang nhap" }, 400);
      let staff = DEFAULT_STAFF;
      if (AUTH_USERS_RAW) { try { const p = JSON.parse(AUTH_USERS_RAW); if (Array.isArray(p) && p.length) staff = p; } catch (_) { /* ignore */ } }
      const su = staff.find(u => u.username === username);
      if (su) {
        if (!(await verify(password, su.password_hash))) return json({ error: "Sai ten dang nhap hoac mat khau" }, 401);
        const now = Math.floor(Date.now() / 1000);
        return json({ token: await makeJWT({ sub: su.username, role: su.role, allowedRoutes: su.allowedRoutes, exp: now + 28800, iat: now }), role: su.role });
      }
      const { data: acc, error: e } = await sb.from("supplier_accounts").select("id,username,password_hash,status,supplier_id").eq("username", username).single();
      if (e || !acc) return json({ error: "Sai ten dang nhap hoac mat khau" }, 401);
      if (acc.status === "pending")  return json({ error: "Tai khoan dang cho admin xac nhan" }, 403);
      if (acc.status === "rejected") return json({ error: "Tai khoan da bi tu choi" }, 403);
      if (!(await verify(password, acc.password_hash))) return json({ error: "Sai ten dang nhap hoac mat khau" }, 401);
      const now = Math.floor(Date.now() / 1000);
      return json({ token: await makeJWT({ sub: acc.username, role: "supplier", supplier_id: acc.supplier_id ?? "", supplier_account_id: acc.id, exp: now + 28800, iat: now }), role: "supplier" });
    }

    if (body.action === "register-supplier") {
      const { full_name, username, password } = body;
      if (!full_name || !username || !password) return json({ error: "Vui long dien day du thong tin" }, 400);
      const { data: ex } = await sb.from("supplier_accounts").select("id").eq("username", username).single();
      if (ex) return json({ error: "Ten dang nhap da ton tai" }, 409);
      const { error: ie } = await sb.from("supplier_accounts").insert({ username, password_hash: await sha256(password), full_name, status: "pending" });
      if (ie) return json({ error: "Loi he thong" }, 500);
      await sb.from("notifications").insert({ recipient_type: "staff", recipient_id: "voanhduy1710", event_type: "account_pending", message: `NCC m\u1edbi \u0111\u0103ng k\u00fd: ${full_name}` });
      return json({ message: "\u0110\u0103ng k\u00fd th\u00e0nh c\u00f4ng. Vui l\u00f2ng ch\u1edd admin x\u00e1c nh\u1eadn." }, 201);
    }

    if (body.action === "approve-supplier") {
      if (!req.headers.get("Authorization")?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
      await sb.from("supplier_accounts").update({ status: "active", supplier_id: body.supplier_id || null, approved_at: new Date().toISOString() }).eq("id", body.supplier_account_id);
      await sb.from("notifications").insert({ recipient_type: "supplier_account", recipient_id: body.supplier_account_id, event_type: "account_approved", message: "T\u00e0i kho\u1ea3n \u0111\u00e3 \u0111\u01b0\u1ee3c k\u00edch ho\u1ea1t." });
      return json({ message: "\u0110\u00e3 ph\u00ea duy\u1ec7t t\u00e0i kho\u1ea3n" });
    }

    if (body.action === "reject-supplier") {
      await sb.from("supplier_accounts").update({ status: "rejected", reject_reason: body.reason ?? "Khong du dieu kien" }).eq("id", body.supplier_account_id);
      await sb.from("notifications").insert({ recipient_type: "supplier_account", recipient_id: body.supplier_account_id, event_type: "account_rejected", message: `Bi tu choi: ${body.reason ?? ""}` });
      return json({ message: "Da tu choi tai khoan" });
    }

    return json({ error: "Hanh dong khong hop le" }, 400);
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Loi he thong" }), { status: 500, headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" } });
  }
});