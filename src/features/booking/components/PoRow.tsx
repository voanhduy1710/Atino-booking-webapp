import { useRef } from 'react'
import type { UseFormRegister, FieldErrors, UseFormSetValue, UseFormWatch } from 'react-hook-form'
import type { BookingFormData } from '@/features/booking/schemas'
import { usePhotoUpload } from '@/features/booking/hooks/usePhotoUpload'
import { LoadingSpinner } from '@/shared/components/LoadingSpinner'

interface Props {
  index: number
  register: UseFormRegister<BookingFormData>
  errors: FieldErrors<BookingFormData>
  sessionId: string
  supplierCode: string
  onRemove?: () => void
  setValue: UseFormSetValue<BookingFormData>
  watch: UseFormWatch<BookingFormData>
}

const DELIVERY_ROUND_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

export function PoRow({ index, register, errors, sessionId, supplierCode, onRemove, setValue, watch }: Props) {
  const { files: slipFiles, upload: uploadSlip, remove: removeSlip, isUploading: slipUploading } = usePhotoUpload(sessionId, supplierCode)
  const { files: vatFiles, upload: uploadVat, remove: removeVat, isUploading: vatUploading } = usePhotoUpload(sessionId, supplierCode)

  const slipInputRef = useRef<HTMLInputElement>(null)
  const vatInputRef = useRef<HTMLInputElement>(null)

  const deliveryRound = watch(`items.${index}.delivery_round`)
  const isFinalRound = watch(`items.${index}.is_final_round`)

  const itemErrors = errors.items?.[index]

  const handleSlipUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files ?? [])
    const basePaths = (watch(`items.${index}.slip_temp_paths`) as string[]) ?? []
    if (basePaths.length + newFiles.length > 10) {
      alert('Tối đa 10 ảnh phiếu giao mỗi đơn hàng')
      return
    }
    // Accumulate paths locally — do NOT read watch() inside the loop
    // (watch returns a stale snapshot; reading it per-iteration causes overwrites)
    const accumulated: string[] = [...basePaths]
    for (const file of newFiles) {
      const path = await uploadSlip(file, `slip_${index}`)
      if (path) accumulated.push(path)
    }
    console.log(`[PoRow ${index}] slip accumulated:`, accumulated)
    setValue(`items.${index}.slip_temp_paths`, accumulated, { shouldValidate: true })
    e.target.value = ''
  }

  const handleVatUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files ?? [])
    const basePaths = (watch(`items.${index}.vat_temp_paths`) as string[]) ?? []
    if (basePaths.length + newFiles.length > 10) {
      alert('Tối đa 10 hóa đơn VAT mỗi đơn hàng')
      return
    }
    // Accumulate paths locally — same fix as handleSlipUpload
    const accumulated: string[] = [...basePaths]
    for (const file of newFiles) {
      const path = await uploadVat(file, `vat_${index}`)
      if (path) accumulated.push(path)
    }
    console.log(`[PoRow ${index}] vat accumulated:`, accumulated)
    setValue(`items.${index}.vat_temp_paths`, accumulated, { shouldValidate: true })
    e.target.value = ''
  }

  const handleRemoveSlip = (tempPath: string) => {
    removeSlip(tempPath)
    const currentPaths = (watch(`items.${index}.slip_temp_paths`) as string[]) ?? []
    setValue(
      `items.${index}.slip_temp_paths`,
      currentPaths.filter((p) => p !== tempPath),
      { shouldValidate: true }
    )
  }

  const handleRemoveVat = (tempPath: string) => {
    removeVat(tempPath)
    const currentPaths = (watch(`items.${index}.vat_temp_paths`) as string[]) ?? []
    setValue(
      `items.${index}.vat_temp_paths`,
      currentPaths.filter((p) => p !== tempPath),
      { shouldValidate: true }
    )
  }

  return (
    <tr className="border-b border-[#E0E0E0] align-top">
      {/* STT */}
      <td className="table-cell text-center font-medium text-[#888888]">{index + 1}</td>

      {/* Mã SP / Mã QT */}
      <td className="table-cell">
        <div className="space-y-1">
          <input
            className={`input-field text-sm ${itemErrors?.product_code ? 'input-field-error' : ''}`}
            placeholder="Mã sản phẩm"
            {...register(`items.${index}.product_code`)}
          />
          <input
            className={`input-field text-sm ${itemErrors?.process_code ? 'input-field-error' : ''}`}
            placeholder="Mã quy trình"
            {...register(`items.${index}.process_code`)}
          />
          {itemErrors?.product_code?.message && (
            <p className="form-error">{itemErrors.product_code.message}</p>
          )}
        </div>
      </td>

      {/* Số lần giao */}
      <td className="table-cell">
        <div className="space-y-1">
          <select
            className="input-field text-sm"
            value={isFinalRound ? 'final' : deliveryRound}
            onChange={(e) => {
              if (e.target.value === 'final') {
                setValue(`items.${index}.is_final_round`, true, { shouldValidate: true })
              } else {
                setValue(`items.${index}.is_final_round`, false)
                setValue(`items.${index}.delivery_round`, Number(e.target.value), { shouldValidate: true })
              }
            }}
          >
            {DELIVERY_ROUND_OPTIONS.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
            <option value="final">Cuối</option>
          </select>
          {/* Hidden field for form registration */}
          <input type="hidden" {...register(`items.${index}.delivery_round`, { valueAsNumber: true })} />
          <input type="hidden" {...register(`items.${index}.is_final_round`)} />
        </div>

        {/* VAT invoice — only on round 1 */}
        {deliveryRound === 1 && !isFinalRound && (
          <div className="mt-2">
            <label className="text-xs font-medium text-[#CC0000] block mb-1">Hóa đơn VAT *</label>
            <div className="space-y-1">
              <div className="flex flex-wrap gap-1">
                {vatFiles.map((f) => (
                  <div
                    key={f.tempPath}
                    className={`flex items-center gap-1 text-xs border rounded px-1.5 py-0.5 ${
                      f.status === 'error' ? 'border-[#CC0000] text-[#CC0000]' : 'border-[#E0E0E0]'
                    }`}
                  >
                    {f.status === 'uploading' ? (
                      <LoadingSpinner size="sm" />
                    ) : (
                      <span className="max-w-[60px] truncate">{f.file.name}</span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemoveVat(f.tempPath)}
                      className="text-[#888888] hover:text-black"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => vatInputRef.current?.click()}
                disabled={vatFiles.filter((f) => f.status !== 'error').length >= 10}
                className="flex items-center gap-1 text-xs border border-dashed border-[#E0E0E0] hover:border-black disabled:opacity-40 rounded px-2 py-1 transition-colors"
              >
                {vatUploading ? <LoadingSpinner size="sm" /> : '+'}
                Thêm VAT
              </button>
            </div>
            <input
              ref={vatInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.pdf"
              multiple
              className="hidden"
              onChange={handleVatUpload}
            />
            {(itemErrors?.vat_temp_paths as any)?.message && (
              <p className="form-error">{(itemErrors?.vat_temp_paths as any).message}</p>
            )}
          </div>
        )}
      </td>

      {/* Số kiện/thùng */}
      <td className="table-cell">
        <input
          type="number"
          min={1}
          className={`input-field text-sm w-20 ${itemErrors?.quantity_booked ? 'input-field-error' : ''}`}
          {...register(`items.${index}.quantity_booked`, { valueAsNumber: true })}
        />
        {itemErrors?.quantity_booked?.message && (
          <p className="form-error">{itemErrors.quantity_booked.message}</p>
        )}
      </td>

      {/* Ảnh phiếu giao */}
      <td className="table-cell">
        <div className="space-y-1">
          <div className="flex flex-wrap gap-1">
            {slipFiles.map((f) => (
              <div
                key={f.tempPath}
                className={`flex items-center gap-1 text-xs border rounded px-1.5 py-0.5 ${
                  f.status === 'error' ? 'border-[#CC0000] text-[#CC0000]' : 'border-[#E0E0E0]'
                }`}
              >
                {f.status === 'uploading' ? (
                  <LoadingSpinner size="sm" />
                ) : (
                  <span className="max-w-[60px] truncate">{f.file.name}</span>
                )}
                <button
                  type="button"
                  onClick={() => handleRemoveSlip(f.tempPath)}
                  className="text-[#888888] hover:text-black"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => slipInputRef.current?.click()}
            disabled={slipFiles.filter((f) => f.status !== 'error').length >= 10}
            className="flex items-center gap-1 text-xs border border-dashed border-[#E0E0E0] hover:border-black disabled:opacity-40 rounded px-2 py-1 transition-colors"
          >
            {slipUploading ? <LoadingSpinner size="sm" /> : '+'}
            Thêm ảnh
          </button>
          <input
            ref={slipInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.pdf"
            multiple
            className="hidden"
            onChange={handleSlipUpload}
          />
        </div>
        {itemErrors?.slip_temp_paths?.message && (
          <p className="form-error">{itemErrors.slip_temp_paths.message as string}</p>
        )}
      </td>

      {/* Remove row */}
      <td className="table-cell">
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-[#888888] hover:text-[#CC0000] transition-colors text-lg"
            aria-label="Xóa hàng"
          >
            ×
          </button>
        )}
      </td>
    </tr>
  )
}
