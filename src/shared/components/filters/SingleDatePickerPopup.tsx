import { useEffect, useRef, useState } from "react";
import { formatLocalDate, parseLocalDate } from "./filterDateUtils";

const MONTHS = [
  "Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6",
  "Tháng 7", "Tháng 8", "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12",
];
const WEEKDAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

export interface SingleDatePickerPopupProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  minDate?: string;
  maxDate?: string;
  isClearable?: boolean;
  isLoading?: boolean;
  maxWidth?: number | string;
  className?: string;
}

function addDays(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
}

function monthGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  const start = addDays(first, -((first.getDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

function formatDisplay(value: string) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return `${day}-${month}-${year}`;
}

function parseDisplay(raw: string) {
  const match = raw.trim().match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (!match) return "";
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (year < 2000 || year > 2099) return "";
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) return "";
  return formatLocalDate(date);
}

function isOutsideRange(value: string, minDate?: string, maxDate?: string) {
  return Boolean(
    value && ((minDate && value < minDate) || (maxDate && value > maxDate)),
  );
}

export function SingleDatePickerPopup({
  value,
  onChange,
  label,
  placeholder = "Chọn ngày giao",
  minDate,
  maxDate,
  isClearable = true,
  isLoading = false,
  maxWidth,
  className = "",
}: SingleDatePickerPopupProps) {
  const initialDate = parseLocalDate(value) ?? parseLocalDate(minDate ?? "") ?? new Date();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(value);
  const [text, setText] = useState(formatDisplay(value));
  const [view, setView] = useState<[number, number]>([
    initialDate.getFullYear(),
    initialDate.getMonth(),
  ]);
  const [popupLeft, setPopupLeft] = useState<number>();
  const wrapRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const showMonth = (next: string) => {
    const date = parseLocalDate(next);
    if (date) setView([date.getFullYear(), date.getMonth()]);
  };

  useEffect(() => {
    if (!open) return;
    setPending(value);
    setText(formatDisplay(value));
    showMonth(value || minDate || "");
  }, [open, value, minDate]);

  useEffect(() => {
    if (!open) return;
    const onOutsideClick = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onOutsideClick);
    return () => document.removeEventListener("mousedown", onOutsideClick);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setPopupLeft(undefined);
    requestAnimationFrame(() => {
      const popup = popupRef.current?.getBoundingClientRect();
      const wrap = wrapRef.current?.getBoundingClientRect();
      if (!popup || !wrap) return;
      let left = 0;
      if (wrap.left + popup.width + 8 > window.innerWidth) {
        left = window.innerWidth - 8 - popup.width - wrap.left;
      }
      if (wrap.left + left < 8) left = 8 - wrap.left;
      setPopupLeft(left);
    });
  }, [open]);

  const commitText = () => {
    if (!text.trim()) {
      if (isClearable) setPending("");
      else setText(formatDisplay(pending));
      return;
    }
    const parsed = parseDisplay(text);
    if (!parsed || isOutsideRange(parsed, minDate, maxDate)) {
      setText(formatDisplay(pending));
      return;
    }
    setPending(parsed);
    setText(formatDisplay(parsed));
    showMonth(parsed);
  };

  const apply = () => {
    if (!pending && !isClearable) return;
    onChange(pending);
    setOpen(false);
  };

  const days = monthGrid(view[0], view[1]);
  const years = Array.from({ length: 11 }, (_, index) => view[0] - 5 + index);
  const rootStyle = maxWidth === undefined
    ? undefined
    : { maxWidth: typeof maxWidth === "number" ? `${maxWidth}px` : maxWidth };

  return (
    <div ref={wrapRef} className={`relative min-w-[220px] ${className}`} style={rootStyle}>
      {label && <label className="mb-1 block text-[13px] font-medium text-[#888888]">{label}</label>}
      <button
        ref={triggerRef}
        type="button"
        disabled={isLoading}
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded border border-[#ecdbe8] bg-white px-3 text-left text-[15px] transition-colors hover:border-[#80417A] focus:border-[#80417A] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={value ? "text-black" : "text-[#888888]"}>{formatDisplay(value) || placeholder}</span>
        <span className="text-[#888888]">▾</span>
      </button>

      {open && (
        <div
          ref={popupRef}
          role="dialog"
          aria-modal="true"
          aria-label="Chọn ngày giao hàng"
          className="fixed inset-2 z-50 max-h-[calc(100dvh-1rem)] overflow-y-auto rounded-lg border border-[#ecdbe8] bg-white p-4 shadow-xl sm:absolute sm:inset-auto sm:mt-2 sm:w-80 sm:max-h-none"
          style={{
            left: typeof window !== "undefined" && window.innerWidth >= 640 ? (popupLeft ?? 0) : undefined,
            visibility: typeof window !== "undefined" && window.innerWidth >= 640 && popupLeft === undefined ? "hidden" : "visible",
          }}
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              type="button"
              aria-label="Tháng trước"
              onClick={() => {
                const date = new Date(view[0], view[1] - 1, 1);
                setView([date.getFullYear(), date.getMonth()]);
              }}
              className="h-8 w-8 rounded text-lg hover:bg-[#F5F5F5]"
            >‹</button>
            <div className="flex items-center gap-1">
              <select value={view[1]} onChange={(event) => setView([view[0], Number(event.target.value)])} className="rounded border border-[#ecdbe8] px-1 py-1 text-[15px]">
                {MONTHS.map((month, index) => <option key={month} value={index}>{month}</option>)}
              </select>
              <select value={view[0]} onChange={(event) => setView([Number(event.target.value), view[1]])} className="rounded border border-[#ecdbe8] px-1 py-1 text-[15px]">
                {years.map((year) => <option key={year} value={year}>{year}</option>)}
              </select>
            </div>
            <button
              type="button"
              aria-label="Tháng sau"
              onClick={() => {
                const date = new Date(view[0], view[1] + 1, 1);
                setView([date.getFullYear(), date.getMonth()]);
              }}
              className="h-8 w-8 rounded text-lg hover:bg-[#F5F5F5]"
            >›</button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[13px] font-semibold text-[#888888]">
            {WEEKDAYS.map((day) => <div key={day}>{day}</div>)}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {days.map((date) => {
              const dateValue = formatLocalDate(date);
              const outside = date.getMonth() !== view[1];
              const disabled = isOutsideRange(dateValue, minDate, maxDate);
              const selected = dateValue === pending;
              const today = dateValue === formatLocalDate(new Date());
              return (
                <button
                  key={dateValue}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    setPending(dateValue);
                    setText(formatDisplay(dateValue));
                  }}
                  className={`h-9 rounded text-[13px] transition-colors ${disabled ? "cursor-not-allowed text-gray-300" : selected ? "font-bold text-white" : today ? "border border-[#80417A] font-semibold text-black" : "text-gray-800 hover:bg-[#F4E8F3]"}${outside ? " opacity-40" : ""}`}
                  style={selected ? { backgroundColor: "#80417A" } : undefined}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>

          <div className="mt-4 border-t border-[#ecdbe8] pt-3">
            <input
              value={text}
              onChange={(event) => setText(event.target.value)}
              onBlur={commitText}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitText();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  setOpen(false);
                  triggerRef.current?.focus();
                }
              }}
              placeholder="dd-mm-yyyy"
              className="w-full rounded border border-[#ecdbe8] px-2 py-2 text-[15px] focus:border-[#80417A] focus:outline-none"
            />
            <div className="mt-3 flex justify-end gap-2">
              {isClearable && <button type="button" onClick={() => { setPending(""); setText(""); }} className="rounded border border-[#ecdbe8] px-3 py-1.5 text-[13px] font-medium hover:bg-[#F5F5F5]">Xóa</button>}
              <button type="button" onClick={() => setOpen(false)} className="rounded border border-[#ecdbe8] px-3 py-1.5 text-[13px] font-medium hover:bg-[#F5F5F5]">Hủy</button>
              <button type="button" onClick={apply} disabled={!pending && !isClearable} className="rounded border border-[#80417A] bg-[#80417A] px-3 py-1.5 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50">Áp dụng</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
