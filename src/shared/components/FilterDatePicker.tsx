interface FilterDatePickerProps {
  value: string
  onChange: (value: string) => void
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
  const excluded = new Set(excludeDates)
  return (
    <div className={`flex items-center gap-1 ${wrapperClassName}`}>
      <input
        type="date"
        value={value}
        min={minDate}
        max={maxDate}
        aria-label={placeholder ?? 'Chọn ngày'}
        onChange={(event) => {
          const next = event.target.value
          if (!excluded.has(next)) onChange(next)
        }}
        className={`min-h-11 rounded border border-[#ecdbe8] px-2 text-sm focus:border-[#80417A] focus:outline-none ${className}`}
      />
      {isClearable && value && (
        <button type="button" onClick={() => onChange('')} className="min-h-11 min-w-11 text-[#888888]" aria-label="Xóa ngày">×</button>
      )}
    </div>
  )
}
