import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navbar } from "@/shared/components/Navbar";
import { LoadingSpinner } from "@/shared/components/LoadingSpinner";
import { ROLE_TABS } from "@/shared/config/navTabs";
import { getCurrentUser } from "@/shared/lib/auth";
import {
  formatDateDisplay,
  formatDateTimeDisplay,
} from "@/shared/lib/dateUtils";
import { pageMainClass } from "@/shared/config/pageLayout";
import { postJson } from "@/shared/lib/apiClient";
import type { ProductProcessCatalog } from "@/shared/types/domain";
import { TEXT_SIZE } from "@/shared/constants/textSizes";
import {
  fetchProductProcessPage,
  PRODUCT_PROCESS_CATALOG_QUERY_KEY,
} from "@/features/productProcess/api";

function displayQuantity(value: number | null | undefined): string {
  return value ? String(value) : "";
}

export default function ProductProcessPage() {
  const user = getCurrentUser();
  const tabs = user ? (ROLE_TABS[user.role] ?? []) : [];
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [syncError, setSyncError] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [isHydrating, setIsHydrating] = useState(false);
  const [isHydrationLeaving, setIsHydrationLeaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 50;

  const {
    data: pageData = { items: [] as ProductProcessCatalog[], total: 0 },
    isLoading,
  } = useQuery({
    queryKey: [
      ...PRODUCT_PROCESS_CATALOG_QUERY_KEY,
      "page",
      currentPage,
      debouncedSearch,
    ],
    queryFn: () =>
      fetchProductProcessPage(currentPage, rowsPerPage, debouncedSearch),
  });
  const rows = pageData.items;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setCurrentPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  const totalPages = Math.ceil(pageData.total / rowsPerPage);

  const lastSync = rows
    .map((row) => row.last_synced_at)
    .sort()
    .at(-1);

  const finishHydration = () => {
    setIsHydrationLeaving(true);
    window.setTimeout(() => {
      setIsHydrating(false);
      setIsHydrationLeaving(false);
    }, 450);
  };

  const handleRefresh = useCallback(
    async (showLoading = true, showOverlay = false) => {
      if (showLoading) setIsSyncing(true);
      if (showLoading) setSyncError("");
      if (showOverlay) {
        setIsHydrating(true);
        setIsHydrationLeaving(false);
      }
      try {
        await postJson<{ synced: number; ts: string }>(
          "/api/product-process/sync",
        );
        await queryClient.invalidateQueries({
          queryKey: PRODUCT_PROCESS_CATALOG_QUERY_KEY,
        });
      } catch (err) {
        if (showLoading) setSyncError((err as Error).message);
      } finally {
        if (showLoading) setIsSyncing(false);
        if (showOverlay) finishHydration();
      }
    },
    [queryClient],
  );

  useEffect(() => {
    const handleSyncStart = () => {
      setIsHydrating(true);
      setIsHydrationLeaving(false);
    };
    const handleSyncEnd = () => finishHydration();

    window.addEventListener("product-process-sync:start", handleSyncStart);
    window.addEventListener("product-process-sync:end", handleSyncEnd);
    return () => {
      window.removeEventListener("product-process-sync:start", handleSyncStart);
      window.removeEventListener("product-process-sync:end", handleSyncEnd);
    };
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-[#fdf8ff]">
      <Navbar tabs={tabs} activeTab="product-process" />

      <main className={pageMainClass("productProcess")}>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h1 className={`${TEXT_SIZE.pageHeading} font-bold`}>
              Danh mục Tên SP / Mã đơn
            </h1>
            <p className="text-xs text-[#888888] mt-1">
              {lastSync
                ? `Đồng bộ lần cuối: ${formatDateTimeDisplay(lastSync)}`
                : "Chưa có dữ liệu đồng bộ"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field text-sm py-1.5 w-64"
              placeholder="Tìm Tên SP, Mã đơn, Mã kho hoặc Màu..."
            />
            <button
              type="button"
              onClick={() => void handleRefresh()}
              disabled={isSyncing}
              className="btn-primary inline-flex items-center gap-2 text-sm py-2 disabled:opacity-50"
            >
              <span
                aria-hidden="true"
                className={isSyncing ? "animate-spin" : ""}
              >
                ↻
              </span>
              {isSyncing ? "Đang đồng bộ..." : "Làm mới"}
            </button>
          </div>
        </div>

        {syncError && (
          <div className="mb-3 border border-[#CC0000] bg-white text-[#CC0000] rounded p-3 text-sm">
            {syncError}
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-16">
            <LoadingSpinner size="lg" />
          </div>
        ) : (
          <div className="relative overflow-hidden bg-white border border-[#ecdbe8] rounded-lg">
            <div
              className={`hidden overflow-x-auto transition-opacity duration-300 sm:block ${isHydrating ? "opacity-40" : "opacity-100"}`}
            >
              <table className={`w-full data-table ${TEXT_SIZE.body}`}>
                <thead>
                  <tr>
                    <th className="table-header w-16">STT</th>
                    <th className="table-header">Tên SP</th>
                    <th className="table-header">Mã đơn</th>
                    <th className="table-header">Mã kho</th>
                    <th className="table-header">Màu</th>
                    <th className="table-header">Ngày đặt</th>
                    <th className="table-header text-right">Tổng số lượng</th>
                    <th className="table-header text-right">S/28</th>
                    <th className="table-header text-right">M/29</th>
                    <th className="table-header text-right">L/30</th>
                    <th className="table-header text-right">XL/31</th>
                    <th className="table-header text-right">2XL/32</th>
                    <th className="table-header text-right">3XL/33</th>
                    <th className="table-header text-right">4XL/34</th>
                    <th className="table-header w-44">Thời gian đồng bộ</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={row.id}>
                      <td className="table-cell text-center text-[#888888]">
                        {(currentPage - 1) * rowsPerPage + index + 1}
                      </td>
                      <td className="table-cell font-medium">
                        {row.product_name}
                      </td>
                      <td className="table-cell font-mono">{row.order_code}</td>
                      <td className="table-cell font-mono">
                        {row.warehouse_code ?? "—"}
                      </td>
                      <td className="table-cell">{row.mau ?? "—"}</td>
                      <td className="table-cell">
                        {row.order_date
                          ? formatDateDisplay(row.order_date)
                          : "—"}
                      </td>
                      <td className="table-cell text-right">
                        {displayQuantity(row.total_quantity)}
                      </td>
                      <td className="table-cell text-right">
                        {displayQuantity(row.size_s_28)}
                      </td>
                      <td className="table-cell text-right">
                        {displayQuantity(row.size_m_29)}
                      </td>
                      <td className="table-cell text-right">
                        {displayQuantity(row.size_l_30)}
                      </td>
                      <td className="table-cell text-right">
                        {displayQuantity(row.size_xl_31)}
                      </td>
                      <td className="table-cell text-right">
                        {displayQuantity(row.size_2xl_32)}
                      </td>
                      <td className="table-cell text-right">
                        {displayQuantity(row.size_3xl_33)}
                      </td>
                      <td className="table-cell text-right">
                        {displayQuantity(row.size_4xl_34)}
                      </td>
                      <td className="table-cell text-[#888888]">
                        {formatDateTimeDisplay(row.last_synced_at)}
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td
                        className="table-cell text-center text-[#888888] py-10"
                        colSpan={14}
                      >
                        Không có dữ liệu
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div
              className={`divide-y divide-[#ecdbe8] transition-opacity duration-300 sm:hidden ${isHydrating ? "opacity-40" : "opacity-100"}`}
            >
              {rows.map((row) => (
                <article key={row.id} className="p-4">
                  <p className="font-medium">{row.product_name}</p>
                  <p className="font-mono text-xs text-[#555555]">
                    {row.order_code}
                  </p>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <dt className="text-[#888888]">Kho / Màu</dt>
                      <dd>
                        {row.warehouse_code ?? "—"} / {row.mau ?? "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[#888888]">Ngày đặt</dt>
                      <dd>
                        {row.order_date
                          ? formatDateDisplay(row.order_date)
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[#888888]">Tổng số lượng</dt>
                      <dd>{displayQuantity(row.total_quantity) || "0"}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-[#888888]">Size</dt>
                      <dd>
                        S {displayQuantity(row.size_s_28) || "0"} · M{" "}
                        {displayQuantity(row.size_m_29) || "0"} · L{" "}
                        {displayQuantity(row.size_l_30) || "0"} · XL{" "}
                        {displayQuantity(row.size_xl_31) || "0"} · 2XL{" "}
                        {displayQuantity(row.size_2xl_32) || "0"} · 3XL{" "}
                        {displayQuantity(row.size_3xl_33) || "0"} · 4XL{" "}
                        {displayQuantity(row.size_4xl_34) || "0"}
                      </dd>
                    </div>
                  </dl>
                </article>
              ))}
              {rows.length === 0 && (
                <p className="p-8 text-center text-sm text-[#888888]">
                  Không có dữ liệu
                </p>
              )}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-[#ecdbe8] px-4 py-3 bg-white flex-wrap gap-2">
                <div className="text-sm text-[#888888]">
                  Hiển thị{" "}
                  {Math.min(
                    pageData.total,
                    (currentPage - 1) * rowsPerPage + 1,
                  )}{" "}
                  - {Math.min(pageData.total, currentPage * rowsPerPage)} trong
                  tổng số {pageData.total} dòng
                </div>
                <div className="flex items-center gap-2">
                  <button
                    disabled={currentPage === 1}
                    onClick={() =>
                      setCurrentPage((prev) => Math.max(1, prev - 1))
                    }
                    className="btn-secondary py-1 px-3 text-xs disabled:opacity-50"
                  >
                    Trước
                  </button>
                  <span className="text-sm font-medium text-[#514253]">
                    Trang {currentPage} / {totalPages}
                  </span>
                  <button
                    disabled={currentPage === totalPages}
                    onClick={() =>
                      setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                    }
                    className="btn-secondary py-1 px-3 text-xs disabled:opacity-50"
                  >
                    Sau
                  </button>
                </div>
              </div>
            )}
            {isHydrating && (
              <div
                className={`product-process-sync-overlay ${isHydrationLeaving ? "product-process-sync-overlay--leave" : ""}`}
              >
                <div className="flex items-center gap-3 rounded border border-[#ecdbe8] bg-white px-4 py-3 shadow-sm">
                  <LoadingSpinner size="sm" />
                  <span className="text-sm font-medium text-[#514253]">
                    Đang đồng bộ dữ liệu mới...
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
