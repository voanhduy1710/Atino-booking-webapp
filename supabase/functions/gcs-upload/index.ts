/**
 * gcs-upload — Supabase Edge Function
 *
 * Accepts a single file (multipart/form-data, field "file")
 * plus a "path" field (e.g. "temp/{sessionId}/slip_0_1234.jpg")
 * and uploads it to gs://atino-media/duy_booking_images/{path}
 *
 * Returns: { url: "https://storage.googleapis.com/atino-media/duy_booking_images/{path}" }
 *
 * Required env vars (Supabase secrets):
 *   GCS_SERVICE_ACCOUNT_JSON  — full JSON of the service account key file
 *
 * The bucket atino-media must have:
 *   - allUsers with objectViewer (for public reads)
 *   - Service account with roles/storage.objectAdmin (for writes)
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const BUCKET = "atino-media";
const PREFIX = "duy_booking_images";
const MAX_MB = 10;
const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "application/pdf"];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// ── GCS OAuth2 token via service account JWT ──────────────────────────────────

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

function base64url(s: string): string {
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function base64urlBytes(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/devstorage.read_write",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    })
  );

  const payload = `${header}.${claim}`;

  // Strip PEM headers and decode the private key
  const pemBody = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\n/g, "");
  const keyBytes = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyBytes,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(payload)
  );

  const jwt = `${payload}.${base64urlBytes(sig)}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`GCS token error: ${err}`);
  }

  const { access_token } = await tokenRes.json() as { access_token: string };
  return access_token;
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const saRaw = Deno.env.get("GCS_SERVICE_ACCOUNT_JSON");
    if (!saRaw) return json({ error: "GCS_SERVICE_ACCOUNT_JSON not configured" }, 500);
    const sa = JSON.parse(saRaw) as ServiceAccount;

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const path = formData.get("path") as string | null;

    if (!file || !path) return json({ error: "Missing file or path" }, 400);
    if (!ALLOWED_TYPES.includes(file.type)) return json({ error: "Loại tệp không hợp lệ" }, 400);
    if (file.size > MAX_MB * 1024 * 1024) return json({ error: `Tệp vượt quá ${MAX_MB}MB` }, 400);

    const gcsPath = `${PREFIX}/${path}`;
    const accessToken = await getAccessToken(sa);

    const uploadUrl = `https://storage.googleapis.com/upload/storage/v1/b/${BUCKET}/o?uploadType=media&name=${encodeURIComponent(gcsPath)}`;

    const fileBytes = await file.arrayBuffer();

    const uploadRes = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": file.type,
        "Content-Length": String(file.size),
      },
      body: fileBytes,
    });

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      throw new Error(`GCS upload error: ${err}`);
    }

    const publicUrl = `https://storage.googleapis.com/${BUCKET}/${gcsPath}`;
    return json({ url: publicUrl, path: gcsPath });
  } catch (err) {
    console.error(err);
    return json({ error: "Lỗi hệ thống khi tải ảnh" }, 500);
  }
});
