import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { Button } from "@/shared/components/Button";
import { LoadingSpinner } from "@/shared/components/LoadingSpinner";
import { Modal } from "@/shared/components/Modal";
import { getJson, postJson } from "@/shared/lib/apiClient";
import { formatDateTimeDisplay } from "@/shared/lib/dateUtils";
import type { Supplier, SupplierAccount, UserRole } from "@/shared/types/domain";

interface Props {
  accountsQueryKey?: string;
  suppliersQueryKey?: string;
}
type AccountForm = {
  full_name: string;
  username: string;
  password: string;
  supplier_id: string;
  account_type: "supplier" | "staff";
  role: Exclude<UserRole, "supplier"> | "supplier";
};
type ManagedAccount = SupplierAccount & {
  account_type: "supplier" | "staff";
  role: UserRole;
};
const emptyForm = (): AccountForm => ({
  full_name: "",
  username: "",
  password: "",
  supplier_id: "",
  account_type: "supplier",
  role: "supplier",
});

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Quản trị viên",
  warehouse_reviewer: "Nhân sự xác nhận booking",
  warehouse_receiver: "Nhân sự nhận hàng",
  manager: "Quản lý",
  supplier: "Nhà cung cấp",
};

const ROLE_GUIDE: Array<{ role: UserRole; permissions: string[] }> = [
  {
    role: "admin",
    permissions: [
      "Toàn quyền quản lý tài khoản, nhà cung cấp, kho hàng và danh mục sản phẩm.",
      "Tạo booking, xác nhận booking, nhận hàng và xem báo cáo.",
    ],
  },
  {
    role: "warehouse_reviewer",
    permissions: [
      "Xem danh mục, nhà cung cấp và kho hàng.",
      "Xác nhận hoặc từ chối chi tiết booking và xem báo cáo.",
    ],
  },
  {
    role: "warehouse_receiver",
    permissions: [
      "Xem danh mục, nhà cung cấp và kho hàng.",
      "Xác nhận việc nhận hàng cho booking và xem báo cáo.",
    ],
  },
  {
    role: "manager",
    permissions: [
      "Xem danh mục, nhà cung cấp, kho hàng và báo cáo.",
      "Xác nhận booking và xác nhận nhận hàng.",
    ],
  },
  {
    role: "supplier",
    permissions: [
      "Tạo và theo dõi booking của chính nhà cung cấp.",
      "Không có quyền quản trị tài khoản, danh mục hoặc báo cáo.",
    ],
  },
];

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
  const [roleGuideOpen, setRoleGuideOpen] = useState(false);
  const [form, setForm] = useState<AccountForm>(emptyForm);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [editAccount, setEditAccount] = useState<ManagedAccount | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRole | "all">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "disabled">("all");
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [revealErrors, setRevealErrors] = useState<Record<string, string>>({});
  const { data: accounts = [], isLoading } = useQuery({
    queryKey: [accountsQueryKey],
    queryFn: async () =>
      (
        await getJson<{ accounts: ManagedAccount[] }>(
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
  const visibleAccounts = accounts.filter((account) =>
    (roleFilter === "all" || account.role === roleFilter) &&
    (statusFilter === "all" || account.status === statusFilter) &&
    (!search.trim() || `${account.username} ${account.full_name}`.toLowerCase().includes(search.trim().toLowerCase())),
  );
  const availableRoles = Array.from(new Set(accounts.map((account) => account.role)))
    .sort((left, right) => ROLE_LABELS[left].localeCompare(ROLE_LABELS[right], "vi"));

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
    mutationFn: (account: ManagedAccount) =>
      postJson(`/api/accounts/${account.id}/toggle-disabled`, { account_type: account.account_type }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (account: ManagedAccount) =>
      postJson(`/api/accounts/${account.id}`, { account_type: account.account_type }, { method: "DELETE" }),
    onSuccess: refresh,
  });
  const reveal = useMutation({
    mutationFn: (account: ManagedAccount) =>
      postJson<{ account_id: string; actual_password: string }>(
        `/api/accounts/${account.id}/reveal-password`,
        { account_type: account.account_type },
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
    onError: (e: Error, account) =>
      setRevealErrors((current) => ({ ...current, [account.id]: e.message })),
  });

  const downloadExcel = () => {
    const sheet = XLSX.utils.json_to_sheet(
      accounts.map((account) => ({
        "Họ tên": account.full_name,
        Username: account.username,
        Password: "",
        "Vai trò": ROLE_LABELS[account.role],
        "Mã NCC": account.supplier_code_requested ?? "",
      })),
    );
    sheet["!cols"] = [{ wch: 24 }, { wch: 14 }, { wch: 20 }, { wch: 18 }, { wch: 30 }];
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
      const requiredHeaders = ["Họ tên", "Username", "Password", "Mã NCC", "Vai trò"];
      const headers = Object.keys(rows[0] ?? {});
      if (
        requiredHeaders.some((header) => !headers.includes(header)) ||
        headers.some((header) => !requiredHeaders.includes(header))
      ) {
        throw new Error(
          "Excel phải có đúng 5 cột: Họ tên, Username, Password, Mã NCC, Vai trò",
        );
      }
      const payload = rows.map((row) => ({
        full_name: row["Họ tên"] ?? row.full_name,
        username: row.Username ?? row.username,
        password: row.Password ?? row.password,
        supplier_code: row["Mã NCC"] ?? row.supplier_code,
        role: row["Vai trò"] ?? row.role,
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

  const openEdit = (account: ManagedAccount) => {
    setEditAccount(account);
    setShowEditPassword(false);
    setError("");
    setForm({
      full_name: account.full_name,
      username: account.username,
      password: "",
      supplier_id: account.supplier_id ?? "",
      account_type: account.account_type,
      role: account.role,
    });
  };
  const valid =
    form.full_name.trim() &&
    form.username.trim().length >= 3 &&
    (form.account_type === "staff" || form.supplier_id) &&
    (!form.password || form.password.length >= 8);
  const createValid = Boolean(
    valid && form.password.length >= 8 && form.password === confirmPassword,
  );

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <input className="input-field !w-52 !py-2 text-sm" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm username, tên..." />
          <select className="input-field !w-auto !py-2 text-sm" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as UserRole | "all")}>
            <option value="all">Tất cả vai trò</option>
            {availableRoles.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
          </select>
          <select className="input-field !w-auto !py-2 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | "active" | "disabled")}>
            <option value="all">Tất cả trạng thái</option><option value="active">Đang hoạt động</option><option value="disabled">Đã vô hiệu hóa</option>
          </select>
          <span className="text-xs text-[#888888]">{visibleAccounts.length} tài khoản</span>
        </div>
        <div className="flex flex-wrap gap-2">
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
          className="!border-[#5B4B99] !px-3 !py-2 !text-sm !text-[#5B4B99] hover:!bg-[#F4F1FF]"
          onClick={() => setRoleGuideOpen(true)}
        >
          Vai trò & quyền
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
                <th className="table-header">Vai trò</th>
                <th className="table-header">Mã NCC</th>
                <th className="table-header">Tạo lúc</th>
                <th className="table-header">Trạng thái</th>
                <th className="table-header text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {visibleAccounts.map((account) => (
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
                        onClick={() => reveal.mutate(account)}
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
                  <td className="table-cell">
                    {editAccount?.id === account.id && account.account_type === "staff" ? (
                      <select className="input-field !py-1 text-sm" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as AccountForm["role"] })}>
                        <option value="admin">Quản trị viên</option><option value="warehouse_reviewer">Nhân sự xác nhận booking</option><option value="warehouse_receiver">Nhân sự nhận hàng</option><option value="manager">Quản lý</option>
                      </select>
                    ) : ROLE_LABELS[account.role]}
                  </td>
                  <td className="table-cell font-mono">
                    {editAccount?.id === account.id && account.account_type === "supplier" ? (
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
                  <td className="hidden">
                    {editAccount?.id === account.id && account.account_type === "staff" ? (
                      <select className="input-field !py-1 text-sm" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as AccountForm["role"] })}>
                        <option value="admin">Quản trị viên</option><option value="warehouse_reviewer">Nhân sự xác nhận booking</option><option value="warehouse_receiver">Nhân sự nhận hàng</option><option value="manager">Quản lý</option>
                      </select>
                    ) : ROLE_LABELS[account.role]}
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
                        onClick={() => toggle.mutate(account)}
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
                            remove.mutate(account);
                        }}
                      >
                        <Icon name="delete" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {visibleAccounts.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
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
          <select
            className="input-field"
            value={form.account_type}
            onChange={(event) => {
              const account_type = event.target.value as AccountForm["account_type"];
              setForm({ ...form, account_type, role: account_type === "supplier" ? "supplier" : "manager", supplier_id: account_type === "supplier" ? form.supplier_id : "" });
            }}
          >
            <option value="supplier">Tài khoản nhà cung cấp</option>
            <option value="staff">Tài khoản nhân sự</option>
          </select>
          {form.account_type === "staff" && (
            <select className="input-field" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as AccountForm["role"] })}>
              <option value="admin">Quản trị viên</option><option value="warehouse_reviewer">Nhân sự xác nhận booking</option><option value="warehouse_receiver">Nhân sự nhận hàng</option><option value="manager">Quản lý</option>
            </select>
          )}
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
          {form.account_type === "supplier" && <select
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
          </select>}
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

      <Modal
        isOpen={roleGuideOpen}
        onClose={() => setRoleGuideOpen(false)}
        title="Vai trò và quyền hạn"
        size="lg"
      >
        <div className="space-y-3">
          <p className="text-sm text-[#665B67]">
            Quyền hiển thị dưới đây khớp với phân quyền hiện tại của hệ thống.
          </p>
          {ROLE_GUIDE.map(({ role, permissions }) => (
            <section key={role} className="rounded-lg border border-[#ecdbe8] p-4">
              <h3 className="font-bold text-[#514253]">{ROLE_LABELS[role]}</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[#665B67]">
                {permissions.map((permission) => <li key={permission}>{permission}</li>)}
              </ul>
            </section>
          ))}
        </div>
      </Modal>
    </>
  );
}
