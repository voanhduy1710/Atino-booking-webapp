import ReactDatePicker, { registerLocale } from 'react-datepicker'
import { vi } from 'date-fns/locale'
import { formatLocalDate, parseLocalDate } from '@/shared/components/filters/filterDateUtils'
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

interface FilterDatePickerProps {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  minDate?: string
  maxDate?: string
  excludeDates?: string[]
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
  excludeDates = [],
  isClearable = true,
  className = '',
  wrapperClassName = '',
}: FilterDatePickerProps) {
  return (
    <ReactDatePicker
      selected={parseLocalDate(value)}
      onChange={(date: Date | null) => onChange(formatLocalDate(date))}
      dateFormat="dd-MM-yyyy"
      locale="vi"
      placeholderText={placeholder}
      minDate={minDate ? parseLocalDate(minDate) ?? undefined : undefined}
      maxDate={maxDate ? parseLocalDate(maxDate) ?? undefined : undefined}
      excludeDates={excludeDates.map((date) => parseLocalDate(date)).filter((date): date is Date => Boolean(date))}
      isClearable={isClearable}
      showMonthDropdown
      showYearDropdown
      dropdownMode="select"
      wrapperClassName={`inline-block ${wrapperClassName}`}
      className={`border border-[#ecdbe8] rounded px-2 py-1 text-xs w-28 focus:outline-none focus:border-[#80417A] ${className}`}
      popperPlacement="bottom-start"
    />
  )
}
