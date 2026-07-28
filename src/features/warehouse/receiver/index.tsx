import { useState, useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import jsQR from "jsqr";
import { Navbar } from "@/shared/components/Navbar";
import { TEXT_SIZE } from "@/shared/constants/textSizes";
import { Button } from "@/shared/components/Button";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { formatDateDisplay } from "@/shared/lib/dateUtils";
import { deriveBookingStatus } from "@/shared/lib/bookingStatus";
import { type TimeSlot, type BookingStatus } from "@/shared/types/domain";
import { getCurrentUser } from "@/shared/lib/auth";
import { getJson, postJson } from "@/shared/lib/apiClient";
import { ROLE_TABS } from "@/shared/config/navTabs";

interface BookingDetail {
  id: string;
  booking_code: string;
  booking_token: string;
  delivery_date: string;
  time_slot: TimeSlot;
  status: BookingStatus;
  supplier_name: string;
  warehouse_name: string;
  ghi_chu: string | null;
  items: Array<{
    id: string;
    product_code: string;
    process_code: string;
    delivery_round: number;
    is_final_round: boolean;
    quantity_booked: number;
    quantity_received: number | null;
    status: string;
  }>;
}

export default function ReceiverPage() {
  const [tokenInput, setTokenInput] = useState("");
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [isLooking, setIsLooking] = useState(false);
  const [scanning, setScanning] = useState(false);
  const user = getCurrentUser();
  const tabs = user ? (ROLE_TABS[user.role] ?? []) : [];
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scanIntervalRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    document.title = "Nhận hàng — Atino";
    return () => {
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  const lookupBooking = async (tokenStr: string) => {
    setLookupError(null);
    setIsLooking(true);
    try {
      const parts = tokenStr.split(":");
      const tok = parts.length === 3 ? parts[2] : tokenStr;

      const { booking: data } = await getJson<{ booking: any }>(
        `/api/receiver/bookings/${encodeURIComponent(tok)}`,
      );

      const d = data as any;
      const b: BookingDetail = {
        id: d.id,
        booking_code: d.booking_code,
        booking_token: d.booking_token,
        delivery_date: d.delivery_date,
        time_slot: d.time_slot as TimeSlot,
        status: deriveBookingStatus(d.status, d.booking_items ?? []),
        supplier_name: d.suppliers?.name ?? "—",
        warehouse_name: d.warehouses?.name ?? "—",
        ghi_chu: d.ghi_chu,
        items: d.booking_items ?? [],
      };
      setBooking(b);
      const init: Record<string, number> = {};
      for (const item of b.items) init[item.id] = item.quantity_booked;
      setQuantities(init);
    } catch (err) {
      setLookupError((err as Error).message || "Không tìm thấy booking");
    } finally {
      setIsLooking(false);
    }
  };

  const receiveDirectMutation = useMutation({
    mutationFn: async () => {
      if (!booking) return;
      await postJson<{ ok: true }>(
        `/api/receiver/bookings/${encodeURIComponent(booking.booking_token)}/receive`,
        {
          quantities,
        },
      );
    },
    onSuccess: () => {
      if (booking) void lookupBooking(booking.booking_token);
    },
  });

  const startScanning = async () => {
    setScanning(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        scanIntervalRef.current = window.setInterval(() => {
          if (!videoRef.current || !canvasRef.current) return;
          const ctx = canvasRef.current.getContext("2d");
          if (!ctx) return;
          const sourceWidth = videoRef.current.videoWidth;
          const sourceHeight = videoRef.current.videoHeight;
          if (!sourceWidth || !sourceHeight) return;
          const scale = Math.min(1, 960 / sourceWidth);
          canvasRef.current.width = Math.round(sourceWidth * scale);
          canvasRef.current.height = Math.round(sourceHeight * scale);
          ctx.drawImage(
            videoRef.current,
            0,
            0,
            canvasRef.current.width,
            canvasRef.current.height,
          );
          const imageData = ctx.getImageData(
            0,
            0,
            canvasRef.current.width,
            canvasRef.current.height,
          );
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          if (code?.data) {
            setTokenInput(code.data);
            stopScanning();
            void lookupBooking(code.data);
          }
        }, 300);
      }
    } catch {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setScanning(false);
      alert("Không thể truy cập camera");
    }
  };

  const stopScanning = () => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setScanning(false);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#fdf8ff]">
      <Navbar tabs={tabs} activeTab="receiver" />
      <main className="flex-1 lg:w-[80vw] max-w-none mx-auto w-full px-4 py-6">
        <h1 className={`${TEXT_SIZE.pageHeading} mb-6 font-bold`}>Nhận hàng</h1>

        <div className="bg-white border border-[#ecdbe8] rounded-lg px-6 py-5 mb-4">
          <p className="font-semibold text-sm mb-3">
            Quét mã QR hoặc nhập mã booking
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void lookupBooking(tokenInput);
              }}
              placeholder="Nhập mã booking hoặc dán mã QR..."
              className="input-field flex-1"
              id="booking-token-input"
            />
            <Button
              fullWidth
              onClick={() => void lookupBooking(tokenInput)}
              loading={isLooking}
              disabled={!tokenInput.trim()}
              id="lookup-btn"
            >
              Tra cứu
            </Button>
            <Button
              fullWidth
              variant="outline"
              onClick={scanning ? stopScanning : () => void startScanning()}
              id="scan-btn"
            >
              {scanning ? "⏹ Dừng" : "📷 Quét"}
            </Button>
          </div>
          {scanning && (
            <div className="mt-3 relative">
              <video
                ref={videoRef}
                className="w-full rounded border border-[#ecdbe8]"
                playsInline
                muted
              />
              <canvas ref={canvasRef} className="hidden" />
            </div>
          )}
          {lookupError && <p className="form-error mt-2">{lookupError}</p>}
        </div>

        {booking && (
          <div className="bg-white border border-[#ecdbe8] rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-[#ecdbe8] flex items-center justify-between">
              <div>
                <p className="font-mono font-bold">{booking.booking_code}</p>
                <p className="text-xs text-[#888888]">
                  {booking.supplier_name} •{" "}
                  {formatDateDisplay(booking.delivery_date)}
                </p>
              </div>
              <StatusBadge status={booking.status} />
            </div>

            {booking.status === "confirmed" ||
            booking.status === "partially_approved" ? (
              <>
                <div className="hidden overflow-x-auto sm:block">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[#F5F5F5]">
                        <th className="table-header">Mã SP</th>
                        <th className="table-header">Mã QT</th>
                        <th className="table-header">SL đăng ký</th>
                        <th className="table-header">SL thực nhận</th>
                      </tr>
                    </thead>
                    <tbody>
                      {booking.items
                        .filter((i) => i.status === "confirmed")
                        .map((item) => (
                          <tr
                            key={item.id}
                            className="border-t border-[#ecdbe8]"
                          >
                            <td className="table-cell font-mono">
                              {item.product_code}
                            </td>
                            <td className="table-cell font-mono">
                              {item.process_code}
                            </td>
                            <td className="table-cell text-right">
                              {item.quantity_booked}
                            </td>
                            <td className="table-cell">
                              <input
                                type="number"
                                min={0}
                                value={
                                  quantities[item.id] ?? item.quantity_booked
                                }
                                onChange={(e) =>
                                  setQuantities((prev) => ({
                                    ...prev,
                                    [item.id]: Number(e.target.value),
                                  }))
                                }
                                className="input-field w-20 text-right"
                              />
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                <div className="space-y-3 p-4 sm:hidden">
                  {booking.items
                    .filter((i) => i.status === "confirmed")
                    .map((item) => (
                      <div
                        key={item.id}
                        className="rounded border border-[#ecdbe8] p-3"
                      >
                        <p className="font-mono text-sm font-semibold">
                          {item.product_code} · {item.process_code}
                        </p>
                        <div className="mt-2 flex items-center justify-between gap-3 text-sm">
                          <span>SL đăng ký: {item.quantity_booked}</span>
                          <label className="flex items-center gap-2">
                            Nhận
                            <input
                              type="number"
                              min={0}
                              inputMode="numeric"
                              value={
                                quantities[item.id] ?? item.quantity_booked
                              }
                              onChange={(e) =>
                                setQuantities((prev) => ({
                                  ...prev,
                                  [item.id]: Number(e.target.value),
                                }))
                              }
                              className="input-field h-11 w-24 text-right"
                            />
                          </label>
                        </div>
                      </div>
                    ))}
                </div>
                <div className="px-6 py-4">
                  <Button
                    fullWidth
                    loading={receiveDirectMutation.isPending}
                    onClick={() => receiveDirectMutation.mutate()}
                    id="confirm-receive-btn"
                  >
                    Xác nhận nhận hàng
                  </Button>
                </div>
              </>
            ) : (
              <div className="px-6 py-8 text-center text-[#888888] text-sm">
                {booking.status === "received"
                  ? "✅ Đã nhận hàng thành công."
                  : booking.status === "pending"
                    ? "⏳ Booking chưa được reviewer xác nhận."
                    : booking.status === "partially_rejected"
                      ? "⏳ Booking còn sản phẩm chưa được duyệt để nhận hàng."
                      : "❌ Booking đã bị từ chối."}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
