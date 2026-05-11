import ReactDatePicker, { registerLocale } from 'react-datepicker'
import { vi } from 'date-fns/locale'
import 'react-datepicker/dist/react-datepicker.css'

const customVi = {
  ...vi,
  localize: {
    ...vi.localize,
    day: (n: number) => ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][n],
    month: (n: number) => `Tháng ${n + 1}`,
  },
}
registerLocale('vi', customVi as any)

function parseLocalDate(dateStr: string): Date | null {
  if (!dateStr) return null
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function formatLocalDate(date: Date | null): string {
  if (!date) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

interface FilterDatePickerProps {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  minDate?: string
  maxDate?: string
  isClearable?: boolean
  className?: string
  wrapperClassName?: string
}

export function FilterDatePicker({
  value,
  onChange,
  placeholder,
  minDate,
  maxDate,
  isClearable = true,
  className = '',
  wrapperClassName = '',
}: FilterDatePickerProps) {
  return (
    <ReactDatePicker
      selected={parseLocalDate(value)}
      onChange={(date) => onChange(formatLocalDate(date))}
      dateFormat="dd-MM-yyyy"
      locale="vi"
      placeholderText={placeholder}
      minDate={minDate ? parseLocalDate(minDate) ?? undefined : undefined}
      maxDate={maxDate ? parseLocalDate(maxDate) ?? undefined : undefined}
      isClearable={isClearable}
      showMonthDropdown
      showYearDropdown
      dropdownMode="select"
      wrapperClassName={`inline-block ${wrapperClassName}`}
      className={`border border-[#E0E0E0] rounded px-2 py-1 text-xs w-28 focus:outline-none focus:border-black ${className}`}
      popperPlacement="bottom-start"
    />
  )
}
