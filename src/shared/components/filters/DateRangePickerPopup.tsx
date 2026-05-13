import { useEffect, useMemo, useRef, useState } from 'react'
import { formatLocalDate, parseLocalDate } from './filterDateUtils'

const VI_MONTHS = [
  'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
  'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12',
]
const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']
const ACCENT = '#AD58A6'

interface DateRangePickerPopupProps {
  startDate: string
  endDate: string
  onStartDateChange: (v: string) => void
  onEndDateChange: (v: string) => void
  label?: string
  minDate?: string
  maxWidth?: number | string
  isLoading?: boolean
  className?: string
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1)
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function lastOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0)
}

function addDays(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount)
}

function monOfWeek(date: Date) {
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  return addDays(date, diff)
}

function fmtDisplay(value: string) {
  if (!value) return ''
  const [y, m, d] = value.split('-')
  return `${d}-${m}-${y}`
}

function parseDMY(raw: string) {
  const m = raw.trim().match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
  if (!m) return ''
  const d = Number(m[1])
  const month = Number(m[2])
  const y = Number(m[3])
  if (y < 2000 || y > 2099) return ''
  const date = new Date(y, month - 1, d)
  if (date.getFullYear() !== y || date.getMonth() !== month - 1 || date.getDate() !== d) return ''
  return formatLocalDate(date)
}

function isBefore(a: string, b: string) {
  return a.localeCompare(b) < 0
}

function clampValid(value: string, minDate?: string) {
  if (!value) return ''
  if (minDate && isBefore(value, minDate)) return ''
  return value
}

function getPresets() {
  const today = new Date()
  const yesterday = addDays(today, -1)
  const twoDaysAgo = addDays(today, -2)
  const thisMonday = monOfWeek(today)
  const lastMonday = addDays(thisMonday, -7)
  const lastSunday = addDays(thisMonday, -1)
  const thisMonth = startOfMonth(today)
  const lastMonth = addMonths(thisMonth, -1)

  return [
    { label: 'Hôm nay', start: today, end: today },
    { label: 'Hôm qua', start: yesterday, end: yesterday },
    { label: 'Hôm kia', start: twoDaysAgo, end: twoDaysAgo },
    { label: 'Tuần nay', start: thisMonday, end: today },
    { label: 'Tuần trước', start: lastMonday, end: lastSunday },
    { label: 'Tháng này', start: thisMonth, end: today },
    { label: 'Tháng trước', start: lastMonth, end: lastOfMonth(lastMonth) },
    { label: '3 tháng', start: startOfMonth(addMonths(today, -3)), end: today },
    { label: '6 tháng', start: startOfMonth(addMonths(today, -6)), end: today },
    { label: '9 tháng', start: startOfMonth(addMonths(today, -9)), end: today },
    { label: '12 tháng', start: startOfMonth(addMonths(today, -12)), end: today },
  ].map((p) => ({ label: p.label, start: formatLocalDate(p.start), end: formatLocalDate(p.end) }))
}

function monthGrid(year: number, month: number) {
  const first = new Date(year, month, 1)
  const startOffset = (first.getDay() + 6) % 7
  const start = addDays(first, -startOffset)
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
}

function TypedDateInput({
  value,
  minDate,
  onCommit,
}: {
  value: string
  minDate?: string
  onCommit: (v: string) => void
}) {
  const [text, setText] = useState(fmtDisplay(value))

  useEffect(() => setText(fmtDisplay(value)), [value])

  const commit = () => {
    if (!text.trim()) {
      onCommit('')
      return
    }
    const parsed = clampValid(parseDMY(text), minDate)
    if (parsed) onCommit(parsed)
    setText(fmtDisplay(parsed || value))
  }

  return (
    <input
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commit()
        }
      }}
      placeholder="dd-mm-yyyy"
      className="w-32 rounded border border-[#E0E0E0] px-2 py-1 text-xs focus:border-[#AD58A6] focus:outline-none"
    />
  )
}

function MiniCal({
  year,
  month,
  label,
  start,
  end,
  hover,
  picking,
  minDate,
  onDay,
  onHover,
  onPrev,
  onNext,
  onMonthYear,
}: {
  year: number
  month: number
  label: string
  start: string
  end: string
  hover: string
  picking: boolean
  minDate?: string
  onDay: (s: string) => void
  onHover: (s: string) => void
  onPrev?: () => void
  onNext?: () => void
  onMonthYear: (y: number, m: number) => void
}) {
  const days = monthGrid(year, month)
  const effEnd = picking && hover ? hover : end
  const lo = start && effEnd ? (start <= effEnd ? start : effEnd) : ''
  const hi = start && effEnd ? (start <= effEnd ? effEnd : start) : ''
  const yearRange = Array.from({ length: 11 }, (_, i) => year - 5 + i)

  return (
    <div className="w-72">
      <div className="mb-2 flex items-center justify-between gap-2">
        <button type="button" onClick={onPrev} className={`h-7 w-7 rounded text-sm ${onPrev ? 'hover:bg-[#F5F5F5]' : 'invisible'}`}>‹</button>
        <div className="flex items-center gap-1">
          <select value={month} onChange={(e) => onMonthYear(year, Number(e.target.value))} className="rounded border border-[#E0E0E0] px-1 py-1 text-xs">
            {VI_MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </select>
          <select value={year} onChange={(e) => onMonthYear(Number(e.target.value), month)} className="rounded border border-[#E0E0E0] px-1 py-1 text-xs">
            {yearRange.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <button type="button" onClick={onNext} className={`h-7 w-7 rounded text-sm ${onNext ? 'hover:bg-[#F5F5F5]' : 'invisible'}`}>›</button>
      </div>
      <p className="mb-1 text-xs font-semibold text-[#888888]">{label}</p>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-[#888888]">
        {WEEKDAYS.map((d) => <div key={d}>{d}</div>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {days.map((date) => {
          const s = formatLocalDate(date)
          const outside = date.getMonth() !== month
          const disabled = Boolean(minDate && isBefore(s, minDate))
          const isStart = s === start
          const isEnd = s === end
          const inRange = Boolean(lo && hi && s > lo && s < hi)
          const isToday = s === formatLocalDate(new Date())
          let className = 'h-8 rounded text-xs transition-colors '
          if (disabled) className += 'cursor-not-allowed text-gray-300'
          else if (isStart || isEnd) className += 'font-bold text-white'
          else if (inRange) className += 'bg-[#F4E8F3] text-gray-900'
          else if (isToday) className += 'border border-[#AD58A6] font-semibold text-black'
          else className += 'text-gray-800 hover:bg-[#F4E8F3]'
          if (outside) className += ' opacity-40'

          return (
            <button
              key={s}
              type="button"
              disabled={disabled}
              onMouseEnter={() => onHover(s)}
              onClick={() => onDay(s)}
              className={className}
              style={isStart || isEnd ? { backgroundColor: ACCENT } : undefined}
            >
              {date.getDate()}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function DateRangePickerPopup({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  label,
  minDate,
  maxWidth = 320,
  isLoading = false,
  className = '',
}: DateRangePickerPopupProps) {
  const [open, setOpen] = useState(false)
  const [iStart, setIStart] = useState(startDate)
  const [iEnd, setIEnd] = useState(endDate)
  const [picking, setPicking] = useState(false)
  const [hover, setHover] = useState('')
  const [popupLeft, setPopupLeft] = useState<number>()
  const initialDate = parseLocalDate(startDate || endDate) ?? new Date()
  const [leftYM, setLeftYM] = useState<[number, number]>([initialDate.getFullYear(), initialDate.getMonth()])
  const wrapRef = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const presets = useMemo(() => getPresets(), [])

  const rightDate = addMonths(new Date(leftYM[0], leftYM[1], 1), 1)
  const rightYM: [number, number] = [rightDate.getFullYear(), rightDate.getMonth()]

  useEffect(() => {
    if (!open) return
    setIStart(startDate)
    setIEnd(endDate)
    setPicking(false)
    setHover('')
  }, [open, startDate, endDate])

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false)
        setPicking(false)
      }
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  useEffect(() => {
    if (!open) return
    setPopupLeft(undefined)
    requestAnimationFrame(() => {
      const popup = popupRef.current?.getBoundingClientRect()
      const wrap = wrapRef.current?.getBoundingClientRect()
      if (!popup || !wrap) return
      let left = 0
      if (wrap.left + popup.width + 8 > window.innerWidth) left = window.innerWidth - 8 - popup.width - wrap.left
      if (wrap.left + left < 8) left = 8 - wrap.left
      setPopupLeft(left)
    })
  }, [open])

  const apply = () => {
    onStartDateChange(iStart)
    onEndDateChange(iEnd)
    setOpen(false)
    setPicking(false)
  }

  const clear = () => {
    setIStart('')
    setIEnd('')
    onStartDateChange('')
    onEndDateChange('')
    setOpen(false)
    setPicking(false)
  }

  const chooseDay = (s: string) => {
    if (!picking || !iStart) {
      setIStart(s)
      setIEnd('')
      setPicking(true)
      return
    }
    if (s < iStart) {
      setIEnd(iStart)
      setIStart(s)
    } else {
      setIEnd(s)
    }
    setPicking(false)
  }

  const setLeftNav = (y: number, m: number) => setLeftYM([y, m])
  const setRightNav = (y: number, m: number) => {
    const left = addMonths(new Date(y, m, 1), -1)
    setLeftYM([left.getFullYear(), left.getMonth()])
  }

  const triggerText = startDate || endDate
    ? `${fmtDisplay(startDate) || '...'} - ${fmtDisplay(endDate) || '...'}`
    : 'Chọn ngày'
  const rootStyle = maxWidth === undefined ? undefined : { maxWidth: typeof maxWidth === 'number' ? `${maxWidth}px` : maxWidth }

  return (
    <div ref={wrapRef} className={`relative min-w-[220px] ${className}`} style={rootStyle}>
      {label && <label className="mb-1 block text-xs font-medium text-[#888888]">{label}</label>}
      <button
        type="button"
        disabled={isLoading}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded border border-[#E0E0E0] bg-white px-3 py-2 text-left text-sm transition-colors hover:border-[#AD58A6] focus:border-[#AD58A6] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={startDate || endDate ? 'text-black' : 'text-[#888888]'}>{triggerText}</span>
        <span className="text-[#888888]">▾</span>
      </button>

      {open && (
        <div
          ref={popupRef}
          className="absolute top-full z-50 mt-2 flex gap-4 rounded-lg border border-[#E0E0E0] bg-white p-4 shadow-xl"
          style={{ left: popupLeft ?? 0, visibility: popupLeft === undefined ? 'hidden' : 'visible' }}
        >
          <div className="w-36 shrink-0 space-y-1 border-r border-[#E0E0E0] pr-3">
            {presets.map((preset) => {
              const active = startDate === preset.start && endDate === preset.end
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    onStartDateChange(preset.start)
                    onEndDateChange(preset.end)
                    setOpen(false)
                  }}
                  className={`block w-full rounded px-2 py-1.5 text-left text-xs ${active ? 'font-semibold text-white' : 'text-[#555555] hover:bg-[#F5F5F5]'}`}
                  style={active ? { backgroundColor: '#AD58A6' } : undefined}
                >
                  {preset.label}
                </button>
              )
            })}
          </div>

          <div>
            <div className="flex gap-4">
              <MiniCal
                year={leftYM[0]}
                month={leftYM[1]}
                label="Từ ngày"
                start={iStart}
                end={iEnd}
                hover={hover}
                picking={picking}
                minDate={minDate}
                onDay={chooseDay}
                onHover={setHover}
                onPrev={() => {
                  const d = addMonths(new Date(leftYM[0], leftYM[1], 1), -1)
                  setLeftYM([d.getFullYear(), d.getMonth()])
                }}
                onMonthYear={setLeftNav}
              />
              <MiniCal
                year={rightYM[0]}
                month={rightYM[1]}
                label="Đến ngày"
                start={iStart}
                end={iEnd}
                hover={hover}
                picking={picking}
                minDate={minDate}
                onDay={chooseDay}
                onHover={setHover}
                onNext={() => {
                  const d = addMonths(new Date(leftYM[0], leftYM[1], 1), 1)
                  setLeftYM([d.getFullYear(), d.getMonth()])
                }}
                onMonthYear={setRightNav}
              />
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-[#E0E0E0] pt-3">
              <div className="flex items-center gap-2">
                <TypedDateInput value={iStart} minDate={minDate} onCommit={setIStart} />
                <span className="text-xs text-[#888888]">-</span>
                <TypedDateInput value={iEnd} minDate={minDate} onCommit={setIEnd} />
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={clear} className="rounded border border-[#E0E0E0] px-3 py-1.5 text-xs font-medium hover:bg-[#F5F5F5]">Xóa</button>
                <button type="button" onClick={() => setOpen(false)} className="rounded border border-[#E0E0E0] px-3 py-1.5 text-xs font-medium hover:bg-[#F5F5F5]">Hủy</button>
                <button type="button" onClick={apply} className="rounded border border-[#AD58A6] bg-[#AD58A6] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">Áp dụng</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
