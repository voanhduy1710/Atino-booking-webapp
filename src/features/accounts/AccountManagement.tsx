import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { Button } from "@/shared/components/Button";
import { LoadingSpinner } from "@/shared/components/LoadingSpinner";
import { Modal } from "@/shared/components/Modal";
import { getJson, postJson } from "@/shared/lib/apiClient";
import { formatDateTimeDisplay } from "@/shared/lib/dateUtils";
import type { Supplier, SupplierAccount } from "@/shared/types/domain";

interface Props {
  accountsQueryKey?: string;
  suppliersQueryKey?: string;
}
type AccountForm = {
  full_name: string;
  username: string;
  password: string;
  supplier_id: string;
};
const emptyForm = (): AccountForm => ({
  full_name: "",
  username: "",
  password: "",
  supplier_id: "",
});

function Icon({
  name,
}: {
  name: "edit" | "disable" | "enable" | "delete" | "eye";
}) {
  const path =
    name === "eye"
      ? "M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6"
      : name === "edit"
        ? "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"
        : name === "delete"
          ? "M3 6h18M8 6V4h8v2m-9 0 1 15h8l1-15M10 11v6m4-6v6"
          : name === "enable"
            ? "M20 6 9 17l-5-5"
            : "";
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {name === "disable" ? (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M5.6 5.6 18.4 18.4" />
        </>
      ) : (
        <path d={path} />
      )}
    </svg>
  );
}

export function AccountManagement({
  accountsQueryKey = "accounts",
  suppliersQueryKey = "suppliers",
}: Props) {
  const queryClient = useQueryClient();
  const uploadRef = useRef<HTMLInputElement>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<AccountForm>(emptyForm);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [editAccount, setEditAccount] = useState<SupplierAccount | null>(null);
  const [error, setError] = useState("");
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [revealErrors, setRevealErrors] = useState<Record<string, string>>({});
  const { data: accounts = [], isLoading } = useQuery({
    queryKey: [accountsQueryKey],
    queryFn: async () =>
      (
        await getJson<{ accounts: SupplierAccount[] }>(
          "/api/accounts?status=all",
        )
      ).accounts,
  });
  const { data: suppliers = [] } = useQuery({
    queryKey: [suppliersQueryKey],
    queryFn: async () =>
      (await getJson<{ suppliers: Supplier[] }>("/api/accounts/suppliers"))
        .suppliers,
  });
  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: [accountsQueryKey] });

  const create = useMutation({
    mutationFn: () => postJson("/api/accounts", form),
    onSuccess: () => {
      setCreateOpen(false);
      setForm(emptyForm());
      setConfirmPassword("");
      setShowPassword(false);
      setError("");
      refresh();
    },
    onError: (e: Error) => setError(e.message),
  });
  const edit = useMutation({
    mutationFn: () =>
      postJson(`/api/accounts/${editAccount?.id}`, form, { method: "PATCH" }),
    onSuccess: () => {
      setEditAccount(null);
      setShowEditPassword(false);
      setForm(emptyForm());
      setError("");
      refresh();
    },
    onError: (e: Error) => setError(e.message),
  });
  const toggle = useMutation({
    mutationFn: (id: string) =>
      postJson(`/api/accounts/${id}/toggle-disabled`, {}),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      postJson(`/api/accounts/${id}`, undefined, { method: "DELETE" }),
    onSuccess: refresh,
  });
  const reveal = useMutation({
    mutationFn: (id: string) =>
      postJson<{ account_id: string; actual_password: string }>(
        `/api/accounts/${id}/reveal-password`,
        {},
      ),
    onSuccess: (data) => {
      setRevealErrors((current) => ({ ...current, [data.account_id]: "" }));
      setRevealed((current) => ({
        ...current,
        [data.account_id]: data.actual_password,
      }));
      window.setTimeout(
        () =>
          setRevealed((current) => {
            const next = { ...current };
            delete next[data.account_id];
            return next;
          }),
        30_000,
      );
    },
    onError: (e: Error, id) =>
      setRevealErrors((current) => ({ ...current, [id]: e.message })),
  });

  const downloadExcel = () => {
    const sheet = XLSX.utils.json_to_sheet(
      accounts.map((account) => ({
        "Họ tên": account.full_name,
        Username: account.username,
        Password: "",
        "Mã NCC": account.supplier_code_requested ?? "",
      })),
    );
    sheet["!cols"] = [{ wch: 24 }, { wch: 14 }, { wch: 20 }, { wch: 18 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Accounts");
    XLSX.writeFile(workbook, "accounts.xlsx");
  };

  const uploadExcel = async (file: File) => {
    setError("");
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
        workbook.Sheets[workbook.SheetNames[0]],
        { defval: "" },
      );
      const requiredHeaders = ["Họ tên", "Username", "Password", "Mã NCC"];
      const headers = Object.keys(rows[0] ?? {});
      if (
        requiredHeaders.some((header) => !headers.includes(header)) ||
        headers.some((header) => !requiredHeaders.includes(header))
      ) {
        throw new Error(
          "Excel phải có đúng 4 cột: Họ tên, Username, Password, Mã NCC",
        );
      }
      const payload = rows.map((row) => ({
        full_name: row["Họ tên"] ?? row.full_name,
        username: row.Username ?? row.username,
        password: row.Password ?? row.password,
        supplier_code: row["Mã NCC"] ?? row.supplier_code,
      }));
      const result = await postJson<{ created: number }>(
        "/api/accounts/import",
        { accounts: payload },
      );
      window.alert(`Đã tạo ${result.created} tài khoản`);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (uploadRef.current) uploadRef.current.value = "";
    }
  };

  const openEdit = (account: SupplierAccount) => {
    setEditAccount(account);
    setShowEditPassword(false);
    setError("");
    setForm({
      full_name: account.full_name,
      username: account.username,
      password: "",
      supplier_id: account.supplier_id ?? "",
    });
  };
  const valid =
    form.full_name.trim() &&
    form.username.trim().length >= 3 &&
    form.supplier_id &&
    (!form.password || form.password.length >= 8);
  const createValid = Boolean(
    valid && form.password.length >= 8 && form.password === confirmPassword,
  );

  return (
    <>
      <div className="mb-4 flex flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          className="!border-[#1a7a3e] !px-3 !py-2 !text-sm !text-[#1a7a3e] hover:!bg-[#F0FFF4]"
          onClick={downloadExcel}
        >
          Tải Excel
        </Button>
        <Button
          variant="outline"
          className="!border-[#1565C0] !px-3 !py-2 !text-sm !text-[#1565C0] hover:!bg-[#EFF6FF]"
          onClick={() => uploadRef.current?.click()}
        >
          Upload Excel
        </Button>
        <Button
          variant="outline"
          className="!border-[#80417A] !px-3 !py-2 !text-sm !text-[#80417A] hover:!bg-[#F8F0F7]"
          onClick={() => {
            setForm(emptyForm());
            setConfirmPassword("");
            setShowPassword(false);
            setError("");
            setCreateOpen(true);
          }}
        >
          Tạo tài khoản NCC
        </Button>
        <input
          ref={uploadRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void uploadExcel(file);
          }}
        />
      </div>
      {error && !createOpen && (
        <p className="form-error mb-3 whitespace-pre-line text-right">
          {error}
        </p>
      )}
      {isLoading ? (
        <LoadingSpinner className="mx-auto" />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[#ecdbe8] bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#F5F5F5]">
                <th className="table-header">Họ tên</th>
                <th className="table-header">Username</th>
                <th className="table-header">Password</th>
                <th className="table-header">Mã NCC</th>
                <th className="table-header">Tạo lúc</th>
                <th className="table-header">Trạng thái</th>
                <th className="table-header text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id} className="border-t border-[#ecdbe8]">
                  <td className="table-cell">
                    {editAccount?.id === account.id ? (
                      <input
                        className="input-field !py-1 text-sm"
                        value={form.full_name}
                        onChange={(e) =>
                          setForm({ ...form, full_name: e.target.value })
                        }
                      />
                    ) : (
                      account.full_name
                    )}
                  </td>
                  <td className="table-cell font-mono">
                    {editAccount?.id === account.id ? (
                      <input
                        className="input-field !py-1 text-sm"
                        value={form.username}
                        onChange={(e) =>
                          setForm({ ...form, username: e.target.value })
                        }
                      />
                    ) : (
                      account.username
                    )}
                  </td>
                  <td className="table-cell font-mono">
                    {editAccount?.id === account.id ? (
                      <div className="relative">
                        <input
                          type={showEditPassword ? "text" : "password"}
                          autoComplete="new-password"
                          className="input-field !py-1 pr-10 text-sm"
                          placeholder="Mật khẩu mới (tuỳ chọn)"
                          value={form.password}
                          onChange={(e) =>
                            setForm({ ...form, password: e.target.value })
                          }
                        />
                        <button
                          type="button"
                          aria-label={
                            showEditPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"
                          }
                          title={
                            showEditPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"
                          }
                          className={`absolute inset-y-0 right-0 px-3 ${showEditPassword ? "text-[#80417A]" : "text-[#888]"}`}
                          onClick={() => setShowEditPassword((value) => !value)}
                        >
                          <Icon name="eye" />
                        </button>
                      </div>
                    ) : revealed[account.id] ? (
                      <span>{revealed[account.id]}</span>
                    ) : (
                      <button
                        type="button"
                        className="text-[#80417A] underline"
                        onClick={() => reveal.mutate(account.id)}
                      >
                        <Icon name="eye" />
                      </button>
                    )}
                    {revealErrors[account.id] && (
                      <span
                        className="ml-2 text-[#CC0000]"
                        title={revealErrors[account.id]}
                      >
                        Reset required
                      </span>
                    )}
                  </td>
                  <td className="table-cell font-mono">
                    {editAccount?.id === account.id ? (
                      <select
                        className="input-field !py-1 text-sm"
                        value={form.supplier_id}
                        onChange={(e) =>
                          setForm({ ...form, supplier_id: e.target.value })
                        }
                      >
                        {suppliers.map((supplier) => (
                          <option key={supplier.id} value={supplier.id}>
                            {supplier.code}
                          </option>
                        ))}
                      </select>
                    ) : (
                      (account.supplier_code_requested ?? "—")
                    )}
                  </td>
                  <td className="table-cell">
                    {formatDateTimeDisplay(account.created_at)}
                  </td>
                  <td className="table-cell">
                    <span
                      className={`font-bold ${account.status === "active" ? "text-[#1a7a3e]" : account.status === "disabled" ? "text-[#CC0000]" : "text-[#555]"}`}
                    >
                      {account.status === "active"
                        ? "✔ Đang hoạt động"
                        : account.status === "disabled"
                          ? "Ø Đã vô hiệu hóa"
                          : account.status}
                    </span>
                  </td>
                  <td className="table-cell">
                    <div className="flex justify-center gap-1">
                      {editAccount?.id === account.id ? (
                        <>
                          <button
                            type="button"
                            title="Save"
                            className="rounded p-2 text-[#1a7a3e] hover:bg-[#F0FFF4]"
                            disabled={!valid || edit.isPending}
                            onClick={() => edit.mutate()}
                          >
                            ✓
                          </button>
                          <button
                            type="button"
                            title="Cancel"
                            className="rounded p-2 text-[#888] hover:bg-[#F5F5F5]"
                            onClick={() => {
                              setEditAccount(null);
                              setShowEditPassword(false);
                              setForm(emptyForm());
                              setError("");
                            }}
                          >
                            ×
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          title="Edit"
                          aria-label={`Edit ${account.username}`}
                          className="rounded p-2 text-[#80417A] hover:bg-[#f1ebf4]"
                          onClick={() => openEdit(account)}
                        >
                          <Icon name="edit" />
                        </button>
                      )}
                      <button
                        type="button"
                        title={
                          account.status === "disabled" ? "Enable" : "Disable"
                        }
                        aria-label={`${account.status === "disabled" ? "Enable" : "Disable"} ${account.username}`}
                        className="rounded p-2 text-[#A06B00] hover:bg-[#FFF8E1]"
                        onClick={() => toggle.mutate(account.id)}
                      >
                        <Icon
                          name={
                            account.status === "disabled" ? "enable" : "disable"
                          }
                        />
                      </button>
                      <button
                        type="button"
                        title="Delete"
                        aria-label={`Delete ${account.username}`}
                        className="rounded p-2 text-[#CC0000] hover:bg-[#FFF0F0]"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Xóa tài khoản "${account.username}"? Hành động này không thể hoàn tác.`,
                            )
                          )
                            remove.mutate(account.id);
                        }}
                      >
                        <Icon name="delete" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {accounts.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="table-cell py-8 text-center text-[#888888]"
                  >
                    Không có dữ liệu
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        isOpen={createOpen}
        onClose={() => {
          setCreateOpen(false);
          setEditAccount(null);
        }}
        title="Tạo tài khoản nhà cung cấp"
        size="md"
      >
        <form
          autoComplete="off"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <input
            tabIndex={-1}
            aria-hidden="true"
            autoComplete="username"
            className="pointer-events-none absolute h-0 w-0 opacity-0"
          />
          <input
            tabIndex={-1}
            aria-hidden="true"
            type="password"
            autoComplete="current-password"
            className="pointer-events-none absolute h-0 w-0 opacity-0"
          />
          <input
            name="account-display-name"
            autoComplete="off"
            data-lpignore="true"
            className="input-field"
            placeholder="Họ tên"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          />
          <input
            name="account-login-id"
            autoComplete="off"
            data-lpignore="true"
            className="input-field"
            placeholder="Username"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
          />
          <div className="relative">
            <input
              name="account-new-secret"
              autoComplete="new-password"
              data-lpignore="true"
              data-1p-ignore="true"
              className="input-field pr-11"
              type={showPassword ? "text" : "password"}
              placeholder="Mật khẩu (ít nhất 8 ký tự)"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
            <button
              type="button"
              aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              className={`absolute inset-y-0 right-0 px-3 ${showPassword ? "text-[#80417A]" : "text-[#888]"}`}
              onClick={() => setShowPassword((value) => !value)}
            >
              <Icon name="eye" />
            </button>
          </div>
          <input
            name="account-confirm-secret"
            autoComplete="new-password"
            data-lpignore="true"
            data-1p-ignore="true"
            className="input-field"
            type={showPassword ? "text" : "password"}
            placeholder="Xác nhận mật khẩu"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          {confirmPassword && form.password !== confirmPassword && (
            <p className="form-error">Mật khẩu xác nhận không khớp</p>
          )}
          <select
            name="account-supplier"
            autoComplete="off"
            className="input-field"
            value={form.supplier_id}
            onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}
          >
            <option value="">— Chọn nhà cung cấp —</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                [{supplier.code}] {supplier.name}
              </option>
            ))}
          </select>
          {error && <p className="form-error">{error}</p>}
          <Button
            type="submit"
            fullWidth
            loading={create.isPending}
            disabled={!createValid}
          >
            Tạo tài khoản
          </Button>
        </form>
      </Modal>
    </>
  );
}
