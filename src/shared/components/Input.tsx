import { forwardRef } from 'react'
import type { InputHTMLAttributes } from 'react'

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  helperText?: string
  required?: boolean
}

export const Input = forwardRef<HTMLInputElement, Props>(
  ({ label, error, helperText, required, className = '', id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="form-label">
            {label}
            {required && <span className="text-[#CC0000] ml-0.5">*</span>}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`input-field ${error ? 'input-field-error' : ''} ${className}`}
          {...props}
        />
        {error && <p className="form-error">{error}</p>}
        {!error && helperText && <p className="text-xs text-[#888888] mt-1">{helperText}</p>}
      </div>
    )
  }
)

Input.displayName = 'Input'
