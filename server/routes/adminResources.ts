import { Router } from "express";
import { requireAuth } from "../lib/httpAuth.js";
import { getSupabase } from "../lib/supabase.js";
import { CAPABILITY_ROLES } from "../config/capabilities.js";

const router = Router();

router.use(requireAuth([...CAPABILITY_ROLES.manageResources]));

router.get("/warehouses", async (_req, res, next) => {
  try {
    const { data, error } = await getSupabase()
      .from("warehouses")
      .select("id, code, name, active")
      .order("code");
    if (error) throw error;
    res.json({ warehouses: data ?? [] });
  } catch (err) {
    next(err);
  }
});

router.get("/suppliers", async (_req, res, next) => {
  try {
    const { data, error } = await getSupabase()
      .from("suppliers")
      .select("id, code, name, active")
      .order("code");
    if (error) throw error;
    res.json({ suppliers: data ?? [] });
  } catch (err) {
    next(err);
  }
});

router.post("/warehouses", async (req, res, next) => {
  try {
    const code = String(req.body?.code ?? "")
      .trim()
      .toUpperCase();
    const name = String(req.body?.name ?? "").trim();
    if (!code || !name) {
      res.status(400).json({ error: "Code and name are required" });
      return;
    }
    const { error } = await getSupabase()
      .from("warehouses")
      .insert({ code, name, active: true } as never);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.put("/warehouses/:id", async (req, res, next) => {
  try {
    const name = String(req.body?.name ?? "").trim();
    if (!name) {
      res.status(400).json({ error: "Name is required" });
      return;
    }
    const { error } = await getSupabase()
      .from("warehouses")
      .update({ name } as never)
      .eq("id", req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.patch("/warehouses/:id/toggle-active", async (req, res, next) => {
  try {
    const supabase = getSupabase();
    const current = await supabase
      .from("warehouses")
      .select("active")
      .eq("id", req.params.id)
      .maybeSingle();
    if (current.error) throw current.error;
    if (!current.data) {
      res.status(404).json({ error: "Warehouse not found" });
      return;
    }
    const active = !current.data.active;
    const { error } = await supabase
      .from("warehouses")
      .update({ active } as never)
      .eq("id", req.params.id);
    if (error) throw error;
    res.json({ ok: true, active });
  } catch (err) {
    next(err);
  }
});

router.delete("/warehouses/:id", async (req, res, next) => {
  try {
    const { error } = await getSupabase()
      .from("warehouses")
      .delete()
      .eq("id", req.params.id);
    if ((error as { code?: string } | null)?.code === "23503") {
      res.status(409).json({
        error:
          "Kho đang được sử dụng và không thể xóa. Hãy vô hiệu hóa kho thay thế.",
      });
      return;
    }
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post("/suppliers", async (req, res, next) => {
  try {
    const code = String(req.body?.code ?? "")
      .trim()
      .toUpperCase();
    const name = String(req.body?.name ?? "").trim();
    if (!code || !name) {
      res.status(400).json({ error: "Code and name are required" });
      return;
    }
    const { error } = await getSupabase()
      .from("suppliers")
      .insert({ code, name, active: true } as never);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post("/suppliers/import", async (req, res, next) => {
  try {
    const rows = Array.isArray(req.body?.suppliers) ? req.body.suppliers : [];
    if (rows.length === 0 || rows.length > 1000) {
      res.status(400).json({ error: "Excel phải có từ 1 đến 1000 dòng" });
      return;
    }

    const suppliers: Array<{
      row: number;
      code: string;
      name: string;
    }> = rows.map((row: unknown, index: number) => {
      const record = row as Record<string, unknown>;
      return {
        row: index + 2,
        code: String(record.code ?? "")
          .trim()
          .toUpperCase(),
        name: String(record.name ?? "").trim(),
      };
    });
    const errors: string[] = [];
    const seenCodes = new Set<string>();
    for (const supplier of suppliers) {
      if (!supplier.code)
        errors.push(`Dòng ${supplier.row}: Mã NCC không được để trống`);
      if (!supplier.name)
        errors.push(`Dòng ${supplier.row}: Tên NCC không được để trống`);
      if (seenCodes.has(supplier.code)) {
        errors.push(
          `Dòng ${supplier.row}: Mã NCC "${supplier.code}" bị trùng trong file`,
        );
      }
      seenCodes.add(supplier.code);
    }

    const codes = suppliers.map(({ code }) => code).filter(Boolean);
    if (codes.length > 0) {
      const existing = await getSupabase()
        .from("suppliers")
        .select("code")
        .in("code", codes);
      if (existing.error) throw existing.error;
      const existingCodes = new Set(
        (existing.data ?? []).map(({ code }) => code),
      );
      for (const supplier of suppliers) {
        if (existingCodes.has(supplier.code)) {
          errors.push(
            `Dòng ${supplier.row}: Mã NCC "${supplier.code}" đã tồn tại`,
          );
        }
      }
    }

    if (errors.length > 0) {
      res.status(400).json({ error: errors.join("\n"), errors });
      return;
    }

    const { error } = await getSupabase()
      .from("suppliers")
      .insert(
        suppliers.map(({ code, name }) => ({
          code,
          name,
          active: true,
        })) as never,
      );
    if (error) throw error;
    res.json({ ok: true, created: suppliers.length });
  } catch (err) {
    next(err);
  }
});

router.put("/suppliers/:id", async (req, res, next) => {
  try {
    const code = String(req.body?.code ?? "")
      .trim()
      .toUpperCase();
    const name = String(req.body?.name ?? "").trim();
    if (!code || !name) {
      res.status(400).json({ error: "Code and name are required" });
      return;
    }
    const { error } = await getSupabase()
      .from("suppliers")
      .update({ code, name } as never)
      .eq("id", req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.patch("/suppliers/:id/toggle-active", async (req, res, next) => {
  try {
    const supabase = getSupabase();
    const current = await supabase
      .from("suppliers")
      .select("active")
      .eq("id", req.params.id)
      .maybeSingle();
    if (current.error) throw current.error;
    if (!current.data) {
      res.status(404).json({ error: "Supplier not found" });
      return;
    }
    const active = !current.data.active;
    const { error } = await supabase
      .from("suppliers")
      .update({ active } as never)
      .eq("id", req.params.id);
    if (error) throw error;
    res.json({ ok: true, active });
  } catch (err) {
    next(err);
  }
});

router.delete("/suppliers/:id", async (req, res, next) => {
  try {
    const { error } = await getSupabase()
      .from("suppliers")
      .delete()
      .eq("id", req.params.id);
    if ((error as { code?: string } | null)?.code === "23503") {
      res.status(409).json({
        error:
          "Nhà cung cấp đang được sử dụng và không thể xóa. Hãy vô hiệu hóa nhà cung cấp thay thế.",
      });
      return;
    }
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
