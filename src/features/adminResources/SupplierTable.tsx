import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { LinkBtn } from "@/shared/components/LinkBtn";
import { ActionIconButton } from "@/shared/components/ActionIconButton";
import { postJson } from "@/shared/lib/apiClient";
import { supabase } from "@/shared/lib/supabase";
import type { Supplier } from "@/shared/types/domain";
import { TEXT_SIZE } from "@/shared/constants/textSizes";

interface Props {
  canDelete?: boolean;
  canManage?: boolean;
  queryKey?: string;
}

export function SupplierTable({
  canDelete = false,
  canManage = canDelete,
  queryKey = "suppliers",
}: Props) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [editCode, setEditCode] = useState("");
  const [editName, setEditName] = useState("");
  const [error, setError] = useState("");
  const uploadRef = useRef<HTMLInputElement>(null);

  const { data: suppliers = [] } = useQuery({
    queryKey: [queryKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, code, name, active")
        .order("code");
      if (error) throw error;
      return data as Supplier[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async ({ code, name }: { code: string; name: string }) => {
      await postJson<{ ok: true }>("/api/admin-resources/suppliers", {
        code,
        name,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [queryKey] });
      setAdding(false);
      setNewCode("");
      setNewName("");
    },
  });

  const editMutation = useMutation({
    mutationFn: async ({
      id,
      code,
      name,
    }: {
      id: string;
      code: string;
      name: string;
    }) => {
      await postJson<{ ok: true }>(
        `/api/admin-resources/suppliers/${id}`,
        { code, name },
        { method: "PUT" },
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [queryKey] });
      setEditing(null);
      setError("");
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await postJson<{ ok: true }>(
        `/api/admin-resources/suppliers/${id}`,
        undefined,
        { method: "DELETE" },
      );
    },
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: [queryKey] }),
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async (id: string) => {
      await postJson<{ ok: true; active: boolean }>(
        `/api/admin-resources/suppliers/${id}/toggle-active`,
        {},
        { method: "PATCH" },
      );
    },
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: [queryKey] }),
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  const downloadExcel = () => {
    const sheet = XLSX.utils.json_to_sheet(
      suppliers.map((supplier) => ({
        "Mã NCC": supplier.code,
        "Tên NCC": supplier.name,
      })),
    );
    sheet["!cols"] = [{ wch: 18 }, { wch: 32 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Nhà cung cấp");
    XLSX.writeFile(workbook, "nha-cung-cap.xlsx");
  };

  const uploadExcel = async (file: File) => {
    setError("");
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
        workbook.Sheets[workbook.SheetNames[0]],
        { defval: "" },
      );
      const requiredHeaders = ["Mã NCC", "Tên NCC"];
      const headers = Object.keys(rows[0] ?? {});
      if (
        requiredHeaders.some((header) => !headers.includes(header)) ||
        headers.some((header) => !requiredHeaders.includes(header))
      ) {
        throw new Error("Excel phải có đúng 2 cột: Mã NCC, Tên NCC");
      }
      const result = await postJson<{ created: number }>(
        "/api/admin-resources/suppliers/import",
        {
          suppliers: rows.map((row) => ({
            code: row["Mã NCC"],
            name: row["Tên NCC"],
          })),
        },
      );
      window.alert(`Đã tạo ${result.created} nhà cung cấp`);
      void queryClient.invalidateQueries({ queryKey: [queryKey] });
    } catch (uploadError) {
      setError((uploadError as Error).message);
    } finally {
      if (uploadRef.current) uploadRef.current.value = "";
    }
  };

  return (
    <>
      {canManage && (
        <div className="mb-3 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="rounded border border-[#1a7a3e] px-3 py-2 text-sm font-medium text-[#1a7a3e] hover:bg-[#F0FFF4]"
            onClick={downloadExcel}
          >
            Tải Excel
          </button>
          <button
            type="button"
            className="rounded border border-[#1565C0] px-3 py-2 text-sm font-medium text-[#1565C0] hover:bg-[#EFF6FF]"
            onClick={() => uploadRef.current?.click()}
          >
            Upload Excel
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(true);
              setNewCode("");
              setNewName("");
            }}
            className="rounded border border-[#80417A] px-3 py-2 text-sm font-medium text-[#80417A] hover:bg-[#F8F0F7]"
          >
            + Tạo tài khoản NCC
          </button>
          <input
            ref={uploadRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadExcel(file);
            }}
          />
        </div>
      )}
      {error && (
        <p className="form-error mb-3 whitespace-pre-line text-right">
          {error}
        </p>
      )}
      <div className="overflow-x-auto bg-white border border-[#ecdbe8] rounded-lg">
        <table className={`hidden w-full sm:table ${TEXT_SIZE.body}`}>
          <thead>
            <tr className="bg-[#F5F5F5]">
              <th className="table-header">Mã NCC</th>
              <th className="table-header">Tên NCC</th>
              <th className="table-header">Trạng thái</th>
              <th className="table-header w-40 text-center">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((s) => (
              <tr key={s.id} className="border-t border-[#ecdbe8]">
                <td className="table-cell font-mono">
                  {editing?.id === s.id ? (
                    <input
                      autoFocus
                      value={editCode}
                      onChange={(e) =>
                        setEditCode(e.target.value.toUpperCase())
                      }
                      className="input-field py-1 font-mono w-28"
                    />
                  ) : (
                    s.code
                  )}
                </td>
                <td className="table-cell">
                  {editing?.id === s.id ? (
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="input-field py-1"
                    />
                  ) : (
                    s.name
                  )}
                </td>
                <td className="table-cell">
                  {s.active ? (
                    <span className="status-confirmed">Hoạt động</span>
                  ) : (
                    <span className="status-rejected">Ngừng</span>
                  )}
                </td>
                <td className="table-cell">
                  <div className="flex justify-center gap-1">
                    {editing?.id === s.id ? (
                      <>
                        <LinkBtn
                          onClick={() =>
                            editMutation.mutate({
                              id: s.id,
                              code: editCode,
                              name: editName,
                            })
                          }
                        >
                          {editMutation.isPending ? "Lưu..." : "Lưu"}
                        </LinkBtn>
                        <LinkBtn onClick={() => setEditing(null)}>Hủy</LinkBtn>
                      </>
                    ) : (
                      <>
                        {canManage && (
                          <ActionIconButton
                            action="edit"
                            label={`Sửa nhà cung cấp ${s.code}`}
                            onClick={() => {
                              setEditing(s);
                              setEditCode(s.code);
                              setEditName(s.name);
                            }}
                          />
                        )}
                        {canManage && (
                          <ActionIconButton
                            action={s.active ? "disable" : "enable"}
                            label={`${s.active ? "Vô hiệu hóa" : "Kích hoạt"} nhà cung cấp ${s.code}`}
                            onClick={() => toggleMutation.mutate(s.id)}
                          />
                        )}
                        {canDelete && (
                          <ActionIconButton
                            action="delete"
                            label={`Xóa nhà cung cấp ${s.code}`}
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Xóa NCC "${s.name}"? Không thể hoàn tác.`,
                                )
                              )
                                deleteMutation.mutate(s.id);
                            }}
                          />
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {adding && (
              <tr className="border-t border-[#ecdbe8] bg-[#FAFAFA]">
                <td className="table-cell">
                  <input
                    autoFocus
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                    placeholder="VD: GC01"
                    className="input-field py-1 font-mono w-28"
                  />
                </td>
                <td className="table-cell">
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Tên nhà cung cấp..."
                    className="input-field py-1"
                  />
                </td>
                <td className="table-cell text-[#888888]">Hoạt động</td>
                <td className="table-cell">
                  <div className="flex gap-3">
                    <LinkBtn
                      onClick={() =>
                        addMutation.mutate({ code: newCode, name: newName })
                      }
                    >
                      {addMutation.isPending ? "Lưu..." : "Lưu"}
                    </LinkBtn>
                    <LinkBtn onClick={() => setAdding(false)}>Hủy</LinkBtn>
                  </div>
                  {addMutation.isError && (
                    <p className="text-xs text-[#CC0000] mt-1">
                      {(addMutation.error as Error).message}
                    </p>
                  )}
                </td>
              </tr>
            )}
            {suppliers.length === 0 && !adding && (
              <tr>
                <td
                  colSpan={4}
                  className="table-cell text-center text-[#888888] py-8"
                >
                  Không có dữ liệu
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="divide-y divide-[#ecdbe8] sm:hidden">
          {adding && (
            <div className="space-y-2 p-4">
              <input
                value={newCode}
                onChange={(event) =>
                  setNewCode(event.target.value.toUpperCase())
                }
                placeholder="Mã NCC"
                className="input-field font-mono"
              />
              <input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="Tên nhà cung cấp"
                className="input-field"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  className="min-h-11 rounded bg-[#1a7a3e] px-3 text-sm text-white"
                  onClick={() =>
                    addMutation.mutate({ code: newCode, name: newName })
                  }
                >
                  Lưu
                </button>
                <button
                  type="button"
                  className="min-h-11 rounded border border-[#d5c0d5] px-3 text-sm"
                  onClick={() => setAdding(false)}
                >
                  Hủy
                </button>
              </div>
            </div>
          )}
          {suppliers.map((supplier) => (
            <article key={supplier.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{supplier.name}</p>
                  <p className="font-mono text-xs text-[#555555]">
                    {supplier.code}
                  </p>
                </div>
                {supplier.active ? (
                  <span className="status-confirmed">Hoạt động</span>
                ) : (
                  <span className="status-rejected">Ngừng</span>
                )}
              </div>
              {canManage &&
                (editing?.id === supplier.id ? (
                  <div className="mt-3 space-y-2">
                    <input
                      value={editCode}
                      onChange={(event) =>
                        setEditCode(event.target.value.toUpperCase())
                      }
                      className="input-field font-mono"
                      aria-label="Mã nhà cung cấp"
                    />
                    <input
                      value={editName}
                      onChange={(event) => setEditName(event.target.value)}
                      className="input-field"
                      aria-label="Tên nhà cung cấp"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="min-h-11 rounded bg-[#1a7a3e] px-3 text-sm text-white"
                        onClick={() =>
                          editMutation.mutate({
                            id: supplier.id,
                            code: editCode,
                            name: editName,
                          })
                        }
                      >
                        Lưu
                      </button>
                      <button
                        type="button"
                        className="min-h-11 rounded border border-[#d5c0d5] px-3 text-sm"
                        onClick={() => setEditing(null)}
                      >
                        Hủy
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex gap-2">
                    <ActionIconButton
                      action="edit"
                      label={`Sửa nhà cung cấp ${supplier.code}`}
                      onClick={() => {
                        setEditing(supplier);
                        setEditCode(supplier.code);
                        setEditName(supplier.name);
                      }}
                    />
                    <ActionIconButton
                      action={supplier.active ? "disable" : "enable"}
                      label={`${supplier.active ? "Vô hiệu hóa" : "Kích hoạt"} nhà cung cấp ${supplier.code}`}
                      onClick={() => toggleMutation.mutate(supplier.id)}
                    />
                    {canDelete && (
                      <ActionIconButton
                        action="delete"
                        label={`Xóa nhà cung cấp ${supplier.code}`}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Xóa NCC "${supplier.name}"? Không thể hoàn tác.`,
                            )
                          )
                            deleteMutation.mutate(supplier.id);
                        }}
                      />
                    )}
                  </div>
                ))}
            </article>
          ))}
          {suppliers.length === 0 && (
            <p className="p-8 text-center text-sm text-[#888888]">
              Không có dữ liệu
            </p>
          )}
        </div>
      </div>
    </>
  );
}
