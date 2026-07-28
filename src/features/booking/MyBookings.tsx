import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCurrentUser } from "@/shared/lib/auth";
import { getJson } from "@/shared/lib/apiClient";
import { Navbar } from "@/shared/components/Navbar";
import { TEXT_SIZE } from "@/shared/constants/textSizes";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { LoadingSpinner } from "@/shared/components/LoadingSpinner";
import { formatDateDisplay } from "@/shared/lib/dateUtils";
import {
  TIME_SLOT_LABELS,
  type BookingStatus,
  type TimeSlot,
} from "@/shared/types/domain";
import { Link } from "react-router-dom";
import { SUPPLIER_TABS } from "@/features/booking/components/BookingForm";

type SupplierFilter = "all" | "confirmed" | "rejected" | "returned";

interface MyBooking {
  row_id: string;
  id: string;
  booking_code: string;
  booking_token: string;
  delivery_date: string;
  time_slot: TimeSlot;
  status: BookingStatus;
  submitted_at: string;
  warehouse_name: string;
  warehouse_code: string;
  ghi_chu: string | null;
  reject_reasons: string;
  item_count: number;
  total_quantity: number;
}

export default function MyBookingsPage() {
  const user = getCurrentUser();
  const [statusFilter, setStatusFilter] = useState<SupplierFilter>("all");

  useEffect(() => {
    document.title = "Lich su dang ky - Atino Booking";
  }, []);

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ["my-bookings", user?.supplier_account_id, statusFilter],
    queryFn: async () => {
      if (!user?.supplier_account_id) return [];
      const result = await getJson<{ bookings: MyBooking[] }>(
        "/api/booking/finalize/mine",
      );
      const rows = result.bookings;

      if (statusFilter === "all") return rows;
      return rows.filter((b) => b.status === statusFilter);
    },
    enabled: !!user?.supplier_account_id,
  });

  const STATUS_TABS: { label: string; value: SupplierFilter }[] = [
    { label: "Tất cả", value: "all" },
    { label: "Xác nhận", value: "confirmed" },
    { label: "Từ chối", value: "rejected" },
    { label: "Trả hàng", value: "returned" },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#fdf8ff]">
      <Navbar tabs={SUPPLIER_TABS} activeTab="my-bookings" />

      <main className="flex-1 lg:w-[80vw] max-w-none mx-auto w-full px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className={`${TEXT_SIZE.pageHeading} font-bold`}>
            Lịch sử đăng ký giao hàng
          </h1>
          <Link to="/booking/new" className="btn-green" id="new-booking-btn">
            + Đăng ký mới
          </Link>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                statusFilter === tab.value
                  ? "bg-[#80417A] text-white border-[#80417A] font-bold"
                  : "bg-white text-[#888888] border-[#ecdbe8] hover:border-[#80417A] hover:text-black"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <LoadingSpinner size="lg" />
          </div>
        ) : bookings.length === 0 ? (
          <div className="bg-white border border-[#ecdbe8] rounded-lg p-16 text-center text-[#888888]">
            <p>Chưa có đăng ký nào</p>
            <Link
              to="/booking/new"
              className="mt-3 text-sm text-black underline block"
            >
              Tạo đơn đăng ký ngay
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {bookings.map((b) => (
              <Link
                key={b.row_id}
                to={`/booking/${b.booking_token}`}
                className="block bg-white border border-[#ecdbe8] rounded-lg px-5 py-4 hover:border-[#80417A] transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-bold">
                      {b.booking_code}
                    </p>
                    <p className="text-xs text-[#888888] mt-0.5">
                      {b.warehouse_name} • Giao ngày{" "}
                      {formatDateDisplay(b.delivery_date)} •{" "}
                      {TIME_SLOT_LABELS[b.time_slot]}
                    </p>
                    <div className="mt-2 grid gap-1 text-xs text-[#555555] sm:grid-cols-3">
                      <p>
                        <span className="font-semibold text-black">
                          Ghi chú:
                        </span>{" "}
                        {b.ghi_chu || <span className="text-[#BBBBBB]">—</span>}
                      </p>
                      <p>
                        <span className="font-semibold text-black">Lý do:</span>{" "}
                        {b.reject_reasons || (
                          <span className="text-[#BBBBBB]">—</span>
                        )}
                      </p>
                      <p>
                        <span className="font-semibold text-black">SL:</span>{" "}
                        {b.total_quantity} / {b.item_count} dòng
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge status={b.status} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
