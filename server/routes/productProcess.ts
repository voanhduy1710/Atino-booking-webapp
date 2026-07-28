import { randomUUID } from "crypto";
import { Router, Request, Response } from "express";
import { requireAuth } from "../lib/httpAuth.js";
import { getSupabase } from "../lib/supabase.js";
import { CAPABILITY_ROLES } from "../config/capabilities.js";
import { resilientFetch } from "../lib/resilientFetch.js";

const router = Router();

router.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

const LARK_BASE_URL = "https://open.larksuite.com/open-apis";
const LARK_APP_TOKEN = "At3fbwyI5a1Ps1srOpxlhkfqgVf";
const LARK_TABLE_ID = "tbliLUxbP4F5kHA8";

const FIELDS = {
  product: "Tên SP",
  order: "Mã đơn",
  warehouse: "Mã kho",
  mau: "Màu",
  orderDate: "Ngày đặt",
  total: "Tổng số lượng",
  s28: "S/28",
  m29: "M/29",
  l30: "L/30",
  xl31: "XL/31",
  x2xl32: "2XL/32",
  x3xl33: "3XL/33",
  x4xl34: "4XL/34",
} as const;

const CATALOG_SELECT_WITH_MAU =
  "id, lark_record_id, product_name, order_code, warehouse_code, mau, order_date, total_quantity, size_s_28, size_m_29, size_l_30, size_xl_31, size_2xl_32, size_3xl_33, size_4xl_34, last_synced_at";

let syncInProgress = false;
let cachedLarkToken: { value: string; expiresAt: number } | null = null;

interface LarkRow {
  lark_record_id: string;
  product_name: string;
  order_code: string;
  warehouse_code: string | null;
  mau: string | null;
  order_date: string | null;
  total_quantity: number;
  size_s_28: number | null;
  size_m_29: number | null;
  size_l_30: number | null;
  size_xl_31: number | null;
  size_2xl_32: number | null;
  size_3xl_33: number | null;
  size_4xl_34: number | null;
}

type CatalogRow = {
  id: string;
  lark_record_id: string;
  product_name: string;
  order_code: string;
  warehouse_code?: string | null;
  mau?: string | null;
  order_date?: string | null;
  total_quantity?: number | null;
  size_s_28?: number | null;
  size_m_29?: number | null;
  size_l_30?: number | null;
  size_xl_31?: number | null;
  size_2xl_32?: number | null;
  size_3xl_33?: number | null;
  size_4xl_34?: number | null;
  active?: boolean;
  last_synced_at?: string | null;
};

function normalizeCatalogRows(
  rows: CatalogRow[] | null | undefined,
): CatalogRow[] {
  return (rows ?? []).map((row) => ({
    ...row,
    warehouse_code: row.warehouse_code ?? null,
    mau: row.mau ?? null,
    order_date: row.order_date ?? null,
    total_quantity: row.total_quantity ?? 0,
    size_s_28: row.size_s_28 ?? null,
    size_m_29: row.size_m_29 ?? null,
    size_l_30: row.size_l_30 ?? null,
    size_xl_31: row.size_xl_31 ?? null,
    size_2xl_32: row.size_2xl_32 ?? null,
    size_3xl_33: row.size_3xl_33 ?? null,
    size_4xl_34: row.size_4xl_34 ?? null,
  }));
}

async function getLarkTenantToken() {
  if (process.env.LARK_TENANT_ACCESS_TOKEN)
    return process.env.LARK_TENANT_ACCESS_TOKEN;
  if (cachedLarkToken && cachedLarkToken.expiresAt > Date.now())
    return cachedLarkToken.value;

  const appId = process.env.LARK_APP_ID;
  const appSecret = process.env.LARK_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error(
      "LARK_TENANT_ACCESS_TOKEN or LARK_APP_ID/LARK_APP_SECRET not set",
    );
  }

  const res = await resilientFetch(
    `${LARK_BASE_URL}/auth/v3/tenant_access_token/internal`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
      retryUnsafe: true,
      circuitKey: "lark",
    },
  );
  const json = (await res.json()) as {
    code?: number;
    msg?: string;
    tenant_access_token?: string;
    expire?: number;
  };
  if (!res.ok || json.code !== 0 || !json.tenant_access_token) {
    throw new Error(`Lark token failed: ${json.msg ?? res.statusText}`);
  }
  cachedLarkToken = {
    value: json.tenant_access_token,
    expiresAt: Date.now() + Math.max(60, (json.expire ?? 7200) - 120) * 1000,
  };
  return cachedLarkToken.value;
}

function cellToText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number")
    return String(value).trim();
  if (Array.isArray(value))
    return value.map(cellToText).filter(Boolean).join(" ").trim();
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.text === "string") return record.text.trim();
    if (typeof record.name === "string") return record.name.trim();
    if (typeof record.value === "string" || typeof record.value === "number")
      return String(record.value).trim();
  }
  return "";
}

function cellToNumber(value: unknown): number {
  const parsed = Number(cellToText(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

function cellToNullableNumber(value: unknown): number | null {
  const text = cellToText(value).replace(/,/g, "");
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : null;
}

function cellToISODate(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value === "number")
    return new Date(value).toISOString().slice(0, 10);
  const text = cellToText(value);
  if (!text) return null;
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return text;
  const [, day, month, year] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

async function selectCatalogRows() {
  const supabase = getSupabase();
  const allRows: CatalogRow[] = [];
  let from = 0;
  const limit = 1000;
  let hasMore = true;

  while (hasMore) {
    const withMau = await supabase
      .from("product_process_catalog")
      .select(CATALOG_SELECT_WITH_MAU)
      .eq("active", true)
      .order("product_name", { ascending: true })
      .order("order_code", { ascending: true })
      .order("warehouse_code", { ascending: true })
      .order("mau", { ascending: true })
      .range(from, from + limit - 1);

    if (withMau.error) throw withMau.error;

    const data = withMau.data as CatalogRow[];
    allRows.push(...data);
    if (data.length < limit) {
      hasMore = false;
    } else {
      from += limit;
    }
  }

  return normalizeCatalogRows(allRows);
}

async function fetchLarkRows() {
  const token = await getLarkTenantToken();
  const rows: LarkRow[] = [];
  let pageToken = "";

  do {
    const url = new URL(
      `${LARK_BASE_URL}/bitable/v1/apps/${LARK_APP_TOKEN}/tables/${LARK_TABLE_ID}/records`,
    );
    url.searchParams.set("page_size", "100");
    if (pageToken) url.searchParams.set("page_token", pageToken);

    const res = await resilientFetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      circuitKey: "lark",
    });
    const json = (await res.json()) as {
      code?: number;
      msg?: string;
      data?: {
        has_more?: boolean;
        page_token?: string;
        items?: Array<{
          record_id?: string;
          id?: string;
          fields?: Record<string, unknown>;
        }>;
      };
    };

    if (!res.ok || json.code !== 0) {
      throw new Error(`Lark records failed: ${json.msg ?? res.statusText}`);
    }

    for (const item of json.data?.items ?? []) {
      const recordId = item.record_id ?? item.id;
      const productName = cellToText(item.fields?.[FIELDS.product]);
      const orderCode = cellToText(item.fields?.[FIELDS.order]);
      if (!recordId || !productName || !orderCode) continue;

      const size_s_28 = cellToNullableNumber(item.fields?.[FIELDS.s28]);
      const size_m_29 = cellToNullableNumber(item.fields?.[FIELDS.m29]);
      const size_l_30 = cellToNullableNumber(item.fields?.[FIELDS.l30]);
      const size_xl_31 = cellToNullableNumber(item.fields?.[FIELDS.xl31]);
      const size_2xl_32 = cellToNullableNumber(item.fields?.[FIELDS.x2xl32]);
      const size_3xl_33 = cellToNullableNumber(item.fields?.[FIELDS.x3xl33]);
      const size_4xl_34 = cellToNullableNumber(item.fields?.[FIELDS.x4xl34]);
      const computedTotal =
        (size_s_28 ?? 0) +
        (size_m_29 ?? 0) +
        (size_l_30 ?? 0) +
        (size_xl_31 ?? 0) +
        (size_2xl_32 ?? 0) +
        (size_3xl_33 ?? 0) +
        (size_4xl_34 ?? 0);
      const larkTotal = cellToNumber(item.fields?.[FIELDS.total]);

      rows.push({
        lark_record_id: recordId,
        product_name: productName,
        order_code: orderCode,
        warehouse_code: cellToText(item.fields?.[FIELDS.warehouse]) || null,
        mau: cellToText(item.fields?.[FIELDS.mau]) || null,
        order_date: cellToISODate(item.fields?.[FIELDS.orderDate]),
        total_quantity: larkTotal || computedTotal,
        size_s_28,
        size_m_29,
        size_l_30,
        size_xl_31,
        size_2xl_32,
        size_3xl_33,
        size_4xl_34,
      });
    }

    pageToken = json.data?.has_more ? (json.data.page_token ?? "") : "";
  } while (pageToken);

  return rows;
}

router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.query.page_size) {
      const page = Math.max(
        1,
        Number.parseInt(String(req.query.page ?? "1"), 10) || 1,
      );
      const pageSize = Math.min(
        100,
        Math.max(1, Number.parseInt(String(req.query.page_size), 10) || 50),
      );
      const search = String(req.query.search ?? "")
        .trim()
        .slice(0, 100)
        .replace(/[%_,()]/g, "");
      let query = getSupabase()
        .from("product_process_catalog")
        .select(CATALOG_SELECT_WITH_MAU, { count: "exact" })
        .eq("active", true)
        .order("product_name")
        .order("order_code")
        .range((page - 1) * pageSize, page * pageSize - 1);
      if (search) {
        query = query.or(
          `product_name.ilike.%${search}%,order_code.ilike.%${search}%,warehouse_code.ilike.%${search}%,mau.ilike.%${search}%`,
        );
      }
      const { data, error, count } = await query;
      if (error) throw error;
      res.json({
        items: normalizeCatalogRows(data as CatalogRow[]),
        total: count ?? 0,
        page,
        page_size: pageSize,
      });
      return;
    }
    const items = await selectCatalogRows();
    res.json({ items });
  } catch (err) {
    void err;
    res.status(500).json({ error: "Catalog lookup failed" });
  }
});

router.post(
  "/sync",
  requireAuth([...CAPABILITY_ROLES.syncCatalog]),
  async (_req: Request, res: Response): Promise<void> => {
    if (syncInProgress) {
      res.status(409).json({ error: "Catalog sync is already running" });
      return;
    }
    syncInProgress = true;
    const leaseOwner = randomUUID();
    let leaseAcquired = false;
    try {
      const supabase = getSupabase();
      const lease = await supabase.rpc("acquire_job_lease", {
        p_job_name: "product_catalog_sync",
        p_owner_id: leaseOwner,
        p_ttl_seconds: 300,
      } as never);
      if (lease.error) throw lease.error;
      leaseAcquired = lease.data === true;
      if (!leaseAcquired) {
        res.status(409).json({ error: "Catalog sync is already running" });
        return;
      }

      const syncStartTime = new Date().toISOString();
      const rows = await fetchLarkRows();
      if (rows.length === 0) {
        res
          .status(502)
          .json({
            error:
              "Catalog sync returned no rows; existing catalog was not changed",
          });
        return;
      }
      const syncResult = await supabase.rpc("sync_product_catalog_atomic", {
        p_rows: rows,
        p_sync_started_at: syncStartTime,
      } as never);
      if (syncResult.error) throw syncResult.error;

      res.json({ synced: rows.length, ts: syncStartTime });
    } catch {
      res.status(500).json({ error: "Catalog sync failed" });
    } finally {
      if (leaseAcquired) {
        await getSupabase().rpc("release_job_lease", {
          p_job_name: "product_catalog_sync",
          p_owner_id: leaseOwner,
        } as never);
      }
      syncInProgress = false;
    }
  },
);

export default router;
