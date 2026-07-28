/**
 * ReportPage — Báo cáo tổng hợp
 * Shared between /admin/report and /manager/report
 * SVG-only charts, no external charting library (same pattern as DASHBOARD ARCHITECTURE.md)
 */
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { getJson } from "@/shared/lib/apiClient";
import { DateRangePickerPopup } from "@/shared/components/filters";
import { LoadingSpinner } from "@/shared/components/LoadingSpinner";
import { Navbar } from "@/shared/components/Navbar";
import { getCurrentUser } from "@/shared/lib/auth";
import { ROLE_TABS } from "@/shared/config/navTabs";
import { TIME_SLOT_LABELS, type BookingItemStatus, type TimeSlot } from "@/shared/types/domain";
import { CHART_PALETTE } from "@/shared/constants/ui";
import { formatChartDate } from "@/features/admin/reportDate";
import { TEXT_SIZE, TEXT_SIZE_PX } from "@/shared/constants/textSizes";

// ── Premium chart palette ───────────────────────────────────────────────────
const PALETTE = CHART_PALETTE;
const TREND_COLOR = PALETTE[0];
const DETAIL_STATUS_ORDER: BookingItemStatus[] = [
  "pending",
  "confirmed",
  "rejected",
  "returned",
];
const STATUS_COLORS: Record<BookingItemStatus, string> = {
  pending: "#D97706",
  confirmed: "#10B981",
  rejected: "#EF4444",
  returned: "#8B5CF6",
};
const STATUS_VI: Record<BookingItemStatus, string> = {
  pending: "Chờ xác nhận",
  confirmed: "Đã xác nhận",
  rejected: "Đã từ chối",
  returned: "Trả hàng",
};
const AXIS_TEXT_COLOR = "#1F2937";
const AXIS_FONT_SIZE = TEXT_SIZE_PX.caption;
const formatReportNumber = (value: number) => new Intl.NumberFormat("de-DE").format(value);

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KPICard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: number | string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="bg-white border border-[#ecdbe8] rounded-lg p-5 flex flex-col gap-1">
      <p className="text-xs text-[#888888] font-medium uppercase tracking-wider">
        {label}
      </p>
      <p
        className={`${TEXT_SIZE.metric} font-bold`}
        style={{ color: color ?? "inherit" }}
      >
        {typeof value === "number" ? formatReportNumber(value) : value}
      </p>
      {sub && <p className="text-xs text-[#888888]">{sub}</p>}
    </div>
  );
}

function ReportChartPopover({
  datum,
  x,
  y,
  onClose,
  onMouseEnter,
  onMouseLeave,
}: {
  datum: Pick<BookingDateDatum, "date" | "total" | "details">;
  x: number;
  y: number;
  onClose: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const details = datum.details ?? [];
  const popoverWidth = Math.min(window.innerWidth * 0.95, 800);
  const left = Math.max(8, Math.min(x + 14, window.innerWidth - popoverWidth - 8));
  const top = Math.max(8, Math.min(y + 14, window.innerHeight - 420));

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!popoverRef.current?.contains(event.target as Node)) onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("mousedown", closeOnOutsideClick);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={popoverRef}
      className="pointer-events-auto fixed z-[70] w-[min(95vw,800px)] rounded-xl border border-[#ecdbe8] bg-white p-3 text-xs text-[#342332] shadow-xl transition-opacity duration-150"
      style={{ left, top }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="mb-2.5 flex items-center justify-between gap-3 border-b border-[#ecdbe8] pb-2.5">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-[#888888]">Ngày giao</p>
          <p className="mt-0.5 font-semibold text-[#342332]">{datum.date}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="rounded-full bg-[#f5eaf4] px-2 py-1 text-[11px] font-semibold text-[#6b2e65]">{formatReportNumber(datum.total)} sản phẩm</span>
          <button type="button" onClick={onClose} className="grid h-6 w-6 place-items-center rounded text-base leading-none text-[#888888] hover:bg-[#f5eaf4] hover:text-[#80417A]" aria-label="Đóng popover">×</button>
        </div>
      </div>
      {details.length === 0 ? (
        <p className="py-3 text-center text-[#888888]">Không có booking</p>
      ) : (
        <div className="max-h-[58vh] w-fit max-w-full overflow-auto rounded-lg border border-[#ecdbe8]">
          <table className="w-max border-collapse text-left">
            <thead className="sticky top-0 bg-[#f8f1f8] text-[10px] uppercase tracking-wide text-[#6b2e65]">
              <tr>
                <th className="px-1.5 py-1.5 font-semibold">Mã NCC</th>
                <th className="px-1.5 py-1.5 font-semibold">Ngày giao</th>
                <th className="px-1.5 py-1.5 font-semibold">Khung giờ</th>
                <th className="px-1.5 py-1.5 font-semibold">Tên SP</th>
                <th className="px-1.5 py-1.5 font-semibold">Mã Đơn</th>
                <th className="px-1.5 py-1.5 font-semibold">Kho</th>
                <th className="px-1.5 py-1.5 font-semibold">Màu</th>
                <th className="px-1.5 py-1.5 text-right font-semibold">Số lượng</th>
                <th className="px-1.5 py-1.5 font-semibold">Trạng thái SP</th>
                <th className="px-1.5 py-1.5 font-semibold">Lí do</th>
              </tr>
            </thead>
            <tbody>
              {details.map((detail, index) => {
                const firstInBooking = index === 0 || details[index - 1].booking_id !== detail.booking_id;
                const nextBookingIndex = details.slice(index).findIndex((row) => row.booking_id !== detail.booking_id);
                const rowSpan = firstInBooking
                  ? nextBookingIndex === -1 ? details.length - index : nextBookingIndex
                  : 0;
                return (
                  <tr key={`${detail.booking_id}-${index}`} className="border-t border-[#f0e2ee] bg-white even:bg-[#fdf8ff]">
                    {firstInBooking && <td rowSpan={rowSpan} className="whitespace-nowrap align-middle px-1.5 py-1.5 text-center font-mono font-semibold text-[#80417A]">{detail.supplier_code}</td>}
                    {firstInBooking && <td rowSpan={rowSpan} className="whitespace-nowrap align-middle px-1.5 py-1.5 text-center font-medium">{detail.delivery_date}</td>}
                    {firstInBooking && <td rowSpan={rowSpan} className="whitespace-nowrap align-middle px-1.5 py-1.5 text-center text-[#555555]">{TIME_SLOT_LABELS[detail.time_slot] ?? detail.time_slot}</td>}
                    <td className="whitespace-nowrap px-1.5 py-1.5 font-mono">{detail.product_code}</td>
                    <td className="whitespace-nowrap px-1.5 py-1.5 font-mono">{detail.process_code}</td>
                    <td className="whitespace-nowrap px-1.5 py-1.5">{detail.warehouse_code ?? "—"}</td>
                    <td className="whitespace-nowrap px-1.5 py-1.5">{detail.mau ?? "—"}</td>
                    <td className="whitespace-nowrap px-1.5 py-1.5 text-right font-semibold">{formatReportNumber(detail.total_quantity)}</td>
                    <td className="whitespace-nowrap px-1.5 py-1.5"><span className="inline-block rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ backgroundColor: STATUS_COLORS[detail.status] }}>{STATUS_VI[detail.status]}</span></td>
                    <td className="max-w-32 truncate px-1.5 py-1.5 text-[#555555]" title={detail.reject_reason ?? ""}>{detail.reject_reason || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  , document.body);
}

// ── useContainerWidth (ResizeObserver, same pattern as DASHBOARD ARCHITECTURE) ─
function useContainerWidth(ref: React.RefObject<HTMLDivElement | null>) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    );
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

// ── SVG Stacked Bar Chart — booking statuses by date ─────────────────────────
interface BookingDateDatum {
  date: string;
  label: string;
  weekday: string;
  total: number;
  statuses: Record<string, number>;
  bookings: ReportBookingSummary[];
  details: ReportBookingDetailRow[];
}

interface ItemDateDatum {
  date: string;
  label: string;
  weekday: string;
  total: number;
  confirmed: number;
  rejected: number;
  pending: number;
  returned: number;
  bookings: ReportBookingSummary[];
  details: ReportBookingDetailRow[];
}

interface ReportBookingSummary {
  id: string;
  booking_code: string;
  supplier_name: string;
  status: BookingItemStatus;
  total_quantity: number;
}

interface ReportBookingDetailRow {
  booking_id: string;
  supplier_code: string;
  delivery_date: string;
  time_slot: TimeSlot;
  product_code: string;
  process_code: string;
  warehouse_code: string | null;
  mau: string | null;
  total_quantity: number;
  status: BookingItemStatus;
  reject_reason: string | null;
}

interface ReportData {
  total: number;
  total_items: number;
  by_status: Record<string, number>;
  daily: Array<{
    date: string;
    total: number;
    statuses: Record<string, number>;
    total_items: number;
    confirmed: number;
    rejected: number;
    pending: number;
    returned: number;
    bookings: ReportBookingSummary[];
    details: ReportBookingDetailRow[];
  }>;
  suppliers: Array<{ name: string; count: number }>;
}

function SVGBookingStackedBarChart({
  data,
  height = 220,
}: {
  data: BookingDateDatum[];
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const width = useContainerWidth(containerRef);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hovered, setHovered] = useState<{ index: number; x: number; y: number } | null>(null);
  const [pinned, setPinned] = useState(false);

  const cancelHide = () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
  };
  const hideDelayed = () => {
    if (pinned) return;
    cancelHide();
    hideTimerRef.current = setTimeout(() => setHovered(null), 140);
  };
  const showHover = (index: number, event: React.MouseEvent<SVGElement>) => {
    cancelHide();
    if (pinned) return;
    setHovered({ index, x: event.clientX, y: event.clientY });
  };
  const pinHover = (index: number, event: React.MouseEvent<SVGElement>) => {
    cancelHide();
    setHovered({ index, x: event.clientX, y: event.clientY });
    setPinned(true);
  };
  const closeHover = () => {
    setPinned(false);
    setHovered(null);
  };

  const maxVal = Math.max(...data.map((d) => d.total), 1);
  const paddingLeft = 44;
  const paddingRight = 8;
  const paddingTop = 16;
  const paddingBottom = 44;
  const chartW = width - paddingLeft - paddingRight;
  const chartH = height - paddingTop - paddingBottom;
  const barGap = 4;
  const barW = data.length > 0 ? Math.max(4, chartW / data.length - barGap) : 0;
  const xStep = data.length > 1 ? chartW / (data.length - 1) : chartW;
  const xForPoint = (i: number) =>
    paddingLeft + (data.length > 1 ? i * xStep : chartW / 2);
  const barXFor = (i: number) =>
    paddingLeft + (i * chartW) / data.length + barGap / 2;

  const labelMinGap = 56;
  const visibleLabels: boolean[] = new Array(data.length).fill(false);
  let lastLabelRight = -Infinity;
  for (let i = 0; i < data.length; i++) {
    const x = xForPoint(i);
    const labelLeft = x - 28;
    if (labelLeft >= lastLabelRight + labelMinGap || i === 0) {
      visibleLabels[i] = true;
      lastLabelRight = labelLeft + 56;
    }
  }
  // Always show last label
  if (data.length > 0) visibleLabels[data.length - 1] = true;

  return (
    <div ref={containerRef} className="w-full">
      {width === 0 ? (
        <div style={{ height }} className="flex items-center justify-center">
          <LoadingSpinner />
        </div>
      ) : data.length === 0 ? (
        <div
          style={{ height }}
          className="flex items-center justify-center text-[#888888] text-sm"
        >
          Không có dữ liệu
        </div>
      ) : (
        <>
        <svg
          width={width}
          height={height}
          style={{ overflow: "visible" }}
          aria-label="Booking theo ngày giao"
        >
          {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
            const y = paddingTop + chartH * (1 - pct);
            const val = Math.round(maxVal * pct);
            return (
              <g key={pct}>
                <line
                  x1={paddingLeft}
                  x2={paddingLeft + chartW}
                  y1={y}
                  y2={y}
                  stroke="#E5E7EB"
                  strokeDasharray={pct === 0 ? undefined : "3 3"}
                />
                <text
                  x={paddingLeft - 6}
                  y={y + 4}
                  textAnchor="end"
                  fontSize={AXIS_FONT_SIZE}
                  fill={AXIS_TEXT_COLOR}
                >
                  {formatReportNumber(val)}
                </text>
              </g>
            );
          })}

          {data.map((d, i) => {
            const x = barXFor(i);
            let yCursor = paddingTop + chartH;
            return (
              <g key={i}>
                {DETAIL_STATUS_ORDER.map((status) => {
                  const value = d.statuses[status] ?? 0;
                  if (value === 0) return null;
                  const h = (value / maxVal) * chartH;
                  yCursor -= h;
                  return (
                    <rect
                      key={status}
                      x={x}
                      y={yCursor}
                      width={barW}
                      height={h}
                      fill={STATUS_COLORS[status]}
                      rx={yCursor + h >= paddingTop + chartH - 1 ? 2 : 0}
                      opacity={hovered && hovered.index !== i ? 0.35 : 1}
                      className="cursor-pointer transition-opacity"
                      onMouseEnter={(event) => showHover(i, event)}
                      onMouseMove={(event) => showHover(i, event)}
                      onMouseLeave={hideDelayed}
                      onClick={(event) => pinHover(i, event)}
                    />
                  );
                })}
                {d.total > 0 && (
                  <text
                    x={x + barW / 2}
                    y={Math.max(11, yCursor - 7)}
                    textAnchor="middle"
                    fontSize={12}
                    fill={AXIS_TEXT_COLOR}
                    fontWeight="700"
                  >
                    {formatReportNumber(d.total)}
                  </text>
                )}
                {visibleLabels[i] && (
                  <text
                    x={xForPoint(i)}
                    y={paddingTop + chartH + 16}
                    textAnchor="middle"
                    fontSize={AXIS_FONT_SIZE}
                    fill={AXIS_TEXT_COLOR}
                  >
                    <tspan x={xForPoint(i)} dy="0">
                      {d.label}
                    </tspan>
                    <tspan x={xForPoint(i)} dy="14">
                      {d.weekday}
                    </tspan>
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {hovered && (
          <ReportChartPopover
            datum={data[hovered.index]}
            x={hovered.x}
            y={hovered.y}
            onClose={closeHover}
            onMouseEnter={cancelHide}
            onMouseLeave={hideDelayed}
          />
        )}
        </>
      )}
    </div>
  );
}

// ── SVG Line Chart — total items by date + hover tooltip ─────────────────────
function SVGItemsLineChart({
  data,
  height = 220,
}: {
  data: ItemDateDatum[];
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const width = useContainerWidth(containerRef);
  const [hovered, setHovered] = useState<{ index: number; x: number; y: number } | null>(null);
  const [pinned, setPinned] = useState(false);

  const maxVal = Math.max(...data.map((d) => d.total), 1);
  const paddingLeft = 44;
  const paddingRight = 18;
  const paddingTop = 18;
  const paddingBottom = 44;
  const chartW = width - paddingLeft - paddingRight;
  const chartH = height - paddingTop - paddingBottom;
  const xStep = data.length > 1 ? chartW / (data.length - 1) : chartW;
  const xFor = (i: number) =>
    paddingLeft + (data.length > 1 ? i * xStep : chartW / 2);
  const yFor = (value: number) =>
    paddingTop + chartH - (value / maxVal) * chartH;
  const points = data.map((d, i) => ({ x: xFor(i), y: yFor(d.total) }));

  const linePath = points.reduce((path, point, i) => {
    if (i === 0) return `M ${point.x} ${point.y}`;
    const p0 = points[i - 2] ?? points[i - 1];
    const p1 = points[i - 1];
    const p2 = point;
    const p3 = points[i + 1] ?? point;
    const t = 0.3;
    const cp1x = p1.x + (p2.x - p0.x) * t;
    const cp1y = p1.y + (p2.y - p0.y) * t;
    const cp2x = p2.x - (p3.x - p1.x) * t;
    const cp2y = p2.y - (p3.y - p1.y) * t;
    return `${path} C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p2.x} ${p2.y}`;
  }, "");

  const cancelHide = () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
  };
  const hideDelayed = () => {
    if (pinned) return;
    cancelHide();
    hideTimerRef.current = setTimeout(() => setHovered(null), 140);
  };
  const showHover = (index: number, event: React.MouseEvent<SVGElement>) => {
    cancelHide();
    if (pinned) return;
    setHovered({ index, x: event.clientX, y: event.clientY });
  };
  const pinHover = (index: number, event: React.MouseEvent<SVGElement>) => {
    cancelHide();
    setHovered({ index, x: event.clientX, y: event.clientY });
    setPinned(true);
  };
  const closeHover = () => {
    setPinned(false);
    setHovered(null);
  };

  const labelMinGap = 56;
  const visibleLabels: boolean[] = new Array(data.length).fill(false);
  let lastLabelRight = -Infinity;
  for (let i = 0; i < data.length; i++) {
    const x = xFor(i);
    const labelLeft = x - 28;
    if (labelLeft >= lastLabelRight + labelMinGap || i === 0) {
      visibleLabels[i] = true;
      lastLabelRight = labelLeft + 56;
    }
  }
  if (data.length > 0) visibleLabels[data.length - 1] = true;

  return (
    <div ref={containerRef} className="relative w-full">
      {width === 0 ? (
        <div style={{ height }} className="flex items-center justify-center">
          <LoadingSpinner />
        </div>
      ) : data.length === 0 ? (
        <div
          style={{ height }}
          className="flex items-center justify-center text-[#888888] text-sm"
        >
          Không có dữ liệu
        </div>
      ) : (
        <>
          <svg
            width={width}
            height={height}
            style={{ overflow: "visible" }}
            aria-label="Tổng kiện hàng theo ngày giao"
          >
            {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
              const y = paddingTop + chartH * (1 - pct);
              const val = Math.round(maxVal * pct);
              return (
                <g key={pct}>
                  <line
                    x1={paddingLeft}
                    x2={paddingLeft + chartW}
                    y1={y}
                    y2={y}
                    stroke="#E5E7EB"
                    strokeDasharray={pct === 0 ? undefined : "3 3"}
                  />
                  <text
                    x={paddingLeft - 6}
                    y={y + 4}
                    textAnchor="end"
                    fontSize={AXIS_FONT_SIZE}
                    fill={AXIS_TEXT_COLOR}
                  >
                    {val}
                  </text>
                </g>
              );
            })}

            <g>
              <path
                d={linePath}
                fill="none"
                stroke={TREND_COLOR}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {points.map((point, i) => (
                <g key={data[i].label}>
                  <rect
                    x={point.x - Math.max(10, xStep / 2)}
                    y={paddingTop}
                    width={Math.max(20, xStep)}
                    height={chartH}
                    fill="transparent"
                    onMouseEnter={(event) => showHover(i, event)}
                    onMouseMove={(event) => showHover(i, event)}
                    onMouseLeave={hideDelayed}
                    onClick={(event) => pinHover(i, event)}
                  />
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={hovered?.index === i ? 5 : 3.5}
                    fill={TREND_COLOR}
                    stroke="white"
                    strokeWidth={1.5}
                    onMouseEnter={(event) => showHover(i, event)}
                    onMouseMove={(event) => showHover(i, event)}
                    onMouseLeave={hideDelayed}
                    onClick={(event) => pinHover(i, event)}
                  />
                  <text
                    x={point.x}
                    y={point.y - 7}
                    textAnchor="middle"
                    fontSize={9}
                    fill={TREND_COLOR}
                    fontWeight="600"
                  >
                    {data[i].total}
                  </text>
                </g>
              ))}
            </g>
            {data.map(
              (d, i) =>
                visibleLabels[i] && (
                  <text
                    key={`${d.label}-${d.weekday}`}
                    x={xFor(i)}
                    y={paddingTop + chartH + 16}
                    textAnchor="middle"
                    fontSize={AXIS_FONT_SIZE}
                    fill={AXIS_TEXT_COLOR}
                  >
                    <tspan x={xFor(i)} dy="0">
                      {d.label}
                    </tspan>
                    <tspan x={xFor(i)} dy="14">
                      {d.weekday}
                    </tspan>
                  </text>
                ),
            )}
          </svg>
          {hovered && (
            <ReportChartPopover
              datum={data[hovered.index]}
              x={hovered.x}
              y={hovered.y}
              onClose={closeHover}
              onMouseEnter={cancelHide}
              onMouseLeave={hideDelayed}
            />
          )}
        </>
      )}
    </div>
  );
}

// ── SVG Donut / Pie Chart ─────────────────────────────────────────────────────
function SVGDonut({
  slices,
  size = 120,
}: {
  slices: { value: number; color: string; label: string }[];
  size?: number;
}) {
  const total = slices.reduce((s, d) => s + d.value, 0);
  if (total === 0)
    return (
      <div
        style={{ width: size, height: size }}
        className="flex items-center justify-center text-[#888888] text-xs"
      >
        N/A
      </div>
    );

  const r = Math.min(48, size * 0.22);
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const strokeWidth = Math.min(24, size * 0.13);

  let offset = 0;
  return (
    <svg width={size} height={size} className="overflow-visible">
      {slices.map((s, i) => {
        const pct = s.value / total;
        const dash = pct * circumference;
        const gap = circumference - dash;
        const startPct = offset / circumference;
        const midAngle = (-90 + (startPct + pct / 2) * 360) * (Math.PI / 180);
        const direction = Math.cos(midAngle) >= 0 ? 1 : -1;
        const leaderStart = r + strokeWidth / 2 + 2;
        const leaderEnd = r + strokeWidth / 2 + 13;
        const x1 = cx + Math.cos(midAngle) * leaderStart;
        const y1 = cy + Math.sin(midAngle) * leaderStart;
        const x2 = cx + Math.cos(midAngle) * leaderEnd;
        const y2 = cy + Math.sin(midAngle) * leaderEnd;
        const textX = cx + direction * (r + strokeWidth / 2 + 19);
        const el = (
          <g key={i}>
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${dash} ${gap}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${cx} ${cy})`}
            />
            <path
              d={`M ${x1} ${y1} L ${x2} ${y2} L ${textX} ${y2}`}
              fill="none"
              stroke={s.color}
              strokeWidth={1.25}
            />
            <text
              x={textX + direction * 3}
              y={y2 + 3.5}
              textAnchor={direction === 1 ? "start" : "end"}
              fontSize={10}
              fontWeight={700}
              fill="#334155"
            >
              {`${s.label} ${formatReportNumber(s.value)}`}
            </text>
          </g>
        );
        offset += dash;
        return el;
      })}
      {/* Center hole */}
      <circle cx={cx} cy={cy} r={r - strokeWidth / 2 + 1} fill="white" />
    </svg>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function ReportPage({
  embedded = false,
}: {
  embedded?: boolean;
}) {
  const user = getCurrentUser();
  const tabs = user ? (ROLE_TABS[user.role] ?? []) : [];

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [status, setStatus] = useState<BookingItemStatus | "">("");
  const [supplierId, setSupplierId] = useState("");

  const { data: suppliers = [] } = useQuery({
    queryKey: ["report-suppliers"],
    queryFn: async () =>
      (
        await getJson<{
          suppliers: Array<{ id: string; code: string; name: string }>;
        }>("/api/reviewer/suppliers")
      ).suppliers,
  });

  useEffect(() => {
    document.title = "Báo cáo — Atino";
  }, []);

  const {
    data: report = {
      total: 0,
      total_items: 0,
      by_status: {},
      daily: [],
      suppliers: [],
    } as ReportData,
    isLoading,
  } = useQuery({
    queryKey: ["report-bookings", dateFrom, dateTo, status, supplierId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      if (status) params.set("status", status);
      if (supplierId) params.set("supplier_id", supplierId);
      return getJson<ReportData>(`/api/reviewer/report?${params}`);
    },
  });

  const total = report.total;
  const byStatus = report.by_status;

  const dateSeries: BookingDateDatum[] = report.daily.map((row) => {
    const date = formatChartDate(row.date);
    return {
      ...date,
      date: row.date,
      total: row.total,
      statuses: row.statuses,
      bookings: row.bookings ?? [],
      details: row.details ?? [],
    };
  });

  const itemSeries: ItemDateDatum[] = report.daily.map((row) => {
    const date = formatChartDate(row.date);
    return {
      ...date,
      date: row.date,
      total: row.total_items,
      confirmed: row.confirmed,
      rejected: row.rejected,
      pending: row.pending,
      returned: row.returned,
      bookings: row.bookings ?? [],
      details: row.details ?? [],
    };
  });

  const supplierEntries = report.suppliers.map(
    ({ name, count }) => [name, count] as [string, number],
  );

  const supplierMax = supplierEntries[0]?.[1] ?? 1;

  // ── Status donut slices ───────────────────────────────────────────────────
  const donutSlices = DETAIL_STATUS_ORDER
    .filter((status) => byStatus[status])
    .map((status) => ({
      value: byStatus[status] ?? 0,
      color: STATUS_COLORS[status],
      label: STATUS_VI[status],
    }));

  const mainContent = (
    <main className="flex-1 lg:w-[80vw] max-w-none mx-auto w-full px-4 py-6">
      {/* Header + date filter */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className={`${TEXT_SIZE.pageHeading} font-bold`}>
          Báo cáo tổng hợp
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangePickerPopup
            startDate={dateFrom}
            endDate={dateTo}
            onStartDateChange={setDateFrom}
            onEndDateChange={setDateTo}
            maxWidth={320}
          />
          <select
            aria-label="Lọc Mã NCC"
            className="input-field !w-auto !py-2 text-sm"
            value={supplierId}
            onChange={(event) => setSupplierId(event.target.value)}
          >
            <option value="">Tất cả Mã NCC</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.code} — {supplier.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Lọc trạng thái"
            className="input-field !w-auto !py-2 text-sm"
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as BookingItemStatus | "")
            }
          >
            <option value="">Tất cả trạng thái</option>
            {DETAIL_STATUS_ORDER.map((item) => (
              <option key={item} value={item}>
                {STATUS_VI[item]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner />
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
            <KPICard
              label="Tổng sản phẩm"
              value={total}
            />
            <KPICard
              label="Chờ xác nhận"
              value={byStatus["pending"] ?? 0}
              color={STATUS_COLORS.pending}
            />
            <KPICard
              label="Đã xác nhận"
              value={byStatus["confirmed"] ?? 0}
              color={STATUS_COLORS.confirmed}
            />
            <KPICard
              label="Đã từ chối"
              value={byStatus["rejected"] ?? 0}
              color={STATUS_COLORS.rejected}
            />
            <KPICard
              label="Trả hàng"
              value={byStatus["returned"] ?? 0}
              color={STATUS_COLORS.returned}
            />
          </div>

          {/* Row: bar chart + donut */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            {/* Bookings by date */}
            <div className="lg:col-span-2 bg-white border border-[#ecdbe8] rounded-lg p-5">
              <p className="text-sm font-semibold mb-4">
                Sản phẩm theo ngày giao
              </p>
              <div className="flex gap-4 items-start">
                <div className="flex-1 min-w-0">
                  <SVGBookingStackedBarChart data={dateSeries} height={220} />
                </div>
                <div className="flex flex-col gap-1.5 text-xs flex-shrink-0 pt-2">
                  {DETAIL_STATUS_ORDER.map((status) => (
                    <span
                      key={status}
                      className="inline-flex items-center gap-1.5"
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-sm flex-shrink-0"
                        style={{ backgroundColor: STATUS_COLORS[status] }}
                      />
                      {STATUS_VI[status]}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Status donut */}
            <div className="bg-white border border-[#ecdbe8] rounded-lg p-5">
              <p className="text-sm font-semibold mb-4">Phân bố trạng thái</p>
              {total === 0 ? (
                <div className="flex items-center justify-center h-32 text-[#888888] text-sm">
                  Không có dữ liệu
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  <SVGDonut slices={donutSlices} size={210} />
                  <div className="w-full space-y-1.5">
                    {donutSlices.map((s) => (
                      <div
                        key={s.label}
                        className="flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-1.5">
                          <span
                            className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                            style={{ backgroundColor: s.color }}
                          />
                          <span className="text-[#555]">{s.label}</span>
                        </div>
                        <span className="font-semibold">{s.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Items over time */}
          <div className="bg-white border border-[#ecdbe8] rounded-lg p-5 mb-4">
            <div className="mb-4">
              <p className="text-sm font-semibold">
                Tổng kiện hàng theo ngày giao
              </p>
            </div>
            <SVGItemsLineChart data={itemSeries} height={220} />
          </div>

          {/* By supplier — horizontal bars */}
          <div className="bg-white border border-[#ecdbe8] rounded-lg p-5">
            <p className="text-sm font-semibold mb-4">
              Top nhà cung cấp (theo số lượng sản phẩm)
            </p>
            {supplierEntries.length === 0 ? (
              <div className="text-[#888888] text-sm text-center py-6">
                Không có dữ liệu
              </div>
            ) : (
              <div className="space-y-2.5">
                {supplierEntries.map(([name, count], i) => {
                  const pct = (count / supplierMax) * 100;
                  const color = PALETTE[i % PALETTE.length];
                  return (
                    <div key={name} className="flex items-center gap-3">
                      <span
                        className="text-xs text-[#555] w-32 truncate flex-shrink-0"
                        title={name}
                      >
                        {name}
                      </span>
                      <div className="flex-1 h-5 bg-[#F5F5F5] rounded overflow-hidden">
                        <div
                          className="h-full rounded transition-all duration-500"
                          style={{ width: `${pct}%`, backgroundColor: color }}
                        />
                      </div>
                      <span className="text-xs font-semibold w-6 text-right">
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </main>
  );

  if (embedded) return mainContent;
  return (
    <div className="min-h-screen flex flex-col bg-[#fdf8ff]">
      <Navbar tabs={tabs} activeTab="report" />
      {mainContent}
    </div>
  );
}
