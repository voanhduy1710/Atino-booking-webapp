import { forwardRef } from 'react'
import type { SelectHTMLAttributes } from 'react'

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  helperText?: string
  placeholder?: string
}

export const Select = forwardRef<HTMLSelectElement, Props>(
  ({ label, error, helperText, placeholder, children, className = '', id, ...props }, ref) => {
    const selectId = id ?? label?.toLowerCase().replace(/\s+/g, '-')

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={selectId} className="form-label">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          className={`input-field ${error ? 'input-field-error' : ''} ${className}`}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {children}
        </select>
        {error && <p className="form-error">{error}</p>}
        {!error && helperText && <p className="text-xs text-[#888888] mt-1">{helperText}</p>}
      </div>
    )
  }
)

Select.displayName = 'Select'
