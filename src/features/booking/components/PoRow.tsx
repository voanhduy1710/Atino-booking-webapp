import { useMemo, useRef } from 'react'
import type { UseFormRegister, FieldErrors, UseFormSetValue, UseFormWatch } from 'react-hook-form'
import type { BookingFormData } from '@/features/booking/schemas'
import { usePhotoUpload } from '@/features/booking/hooks/usePhotoUpload'
import { LoadingSpinner } from '@/shared/components/LoadingSpinner'
import type { ProductProcessCatalog } from '@/shared/types/domain'
import { DELIVERY_ROUNDS } from '@/shared/constants/booking'
import { MAX_FILES_PER_ATTACHMENT_TYPE } from '@/shared/constants/uploads'
import { ProductProcessCombobox } from './ProductProcessCombobox'

interface Props {
  index: number
  rowId: string
  register: UseFormRegister<BookingFormData>
  errors: FieldErrors<BookingFormData>
  sessionId: string
  supplierCode: string
  onCopy?: (attachmentNames: Record<string, string>) => void
  onRemove?: () => void
  setValue: UseFormSetValue<BookingFormData>
  watch: UseFormWatch<BookingFormData>
  productProcessOptions: ProductProcessCatalog[]
  attachmentNames: Record<string, string>
  onAttachmentName: (path: string, name: string) => void
}

const SIZE_FIELDS = [
  ['size_s_28', 'S/28'],
  ['size_m_29', 'M/29'],
  ['size_l_30', 'L/30'],
  ['size_xl_31', 'XL/31'],
  ['size_2xl_32', '2XL/32'],
  ['size_3xl_33', '3XL/33'],
] as const

function unique(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter(Boolean) as string[]))
}

function pathLabel(path: string, names: Record<string, string>): string {
  return names[path] ?? path.split('/').pop() ?? path
}

export function PoRow({ index, rowId, register, errors, sessionId, supplierCode, onCopy, onRemove, setValue, watch, productProcessOptions, attachmentNames, onAttachmentName }: Props) {
  const { files: slipFiles, upload: uploadSlip, remove: removeSlip, isUploading: slipUploading } = usePhotoUpload(sessionId, supplierCode)
  const { files: vatFiles, upload: uploadVat, remove: removeVat, isUploading: vatUploading } = usePhotoUpload(sessionId, supplierCode)

  const slipInputRef = useRef<HTMLInputElement>(null)
  const vatInputRef = useRef<HTMLInputElement>(null)

  const deliveryRound = watch(`items.${index}.delivery_round`)
  const isFinalRound = watch(`items.${index}.is_final_round`)
  const productCode = watch(`items.${index}.product_code`)
  const processCode = watch(`items.${index}.process_code`)
  const warehouseCode = watch(`items.${index}.warehouse_code`)
  const mau = watch(`items.${index}.mau`)
  const totalQuantity = Number(watch(`items.${index}.total_quantity`) ?? 0)
  const slipPaths = (watch(`items.${index}.slip_temp_paths`) as string[]) ?? []
  const vatPaths = (watch(`items.${index}.vat_temp_paths`) as string[]) ?? []

  const itemErrors = errors.items?.[index]
  const uploadPrefix = rowId.replace(/[^a-zA-Z0-9_-]/g, '')
  const selectedProductProcessId = productProcessOptions.find(
    (option) => option.product_name === productCode && option.order_code === processCode
  )?.id ?? ''

  const matchingProductRows = useMemo(
    () => productProcessOptions.filter((option) => option.product_name === productCode && option.order_code === processCode),
    [productProcessOptions, productCode, processCode]
  )
  const warehouseOptions = unique(matchingProductRows.map((option) => option.warehouse_code))
  const mauOptions = unique(matchingProductRows.filter((option) => !warehouseCode || option.warehouse_code === warehouseCode).map((option) => option.mau))

  const handleProductProcessChange = (id: string) => {
    const option = productProcessOptions.find((item) => item.id === id)
    setValue(`items.${index}.product_code`, option?.product_name ?? '', { shouldValidate: true })
    setValue(`items.${index}.process_code`, option?.order_code ?? '', { shouldValidate: true })
    setValue(`items.${index}.warehouse_code`, option?.warehouse_code ?? '', { shouldValidate: true })
    setValue(`items.${index}.mau`, option?.mau ?? '', { shouldValidate: true })
  }

  const recalcTotal = (field: (typeof SIZE_FIELDS)[number][0], nextValue: number | null) => {
    const total = SIZE_FIELDS.reduce((sum, [key]) => {
      if (key === field) return sum + (nextValue ?? 0)
      return sum + Number(watch(`items.${index}.${key}`) ?? 0)
    }, 0)
    setValue(`items.${index}.${field}`, nextValue, { shouldValidate: true })
    setValue(`items.${index}.total_quantity`, total, { shouldValidate: true })
    setValue(`items.${index}.quantity_booked`, Math.max(1, total), { shouldValidate: true })
  }

  const handleSlipUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files ?? [])
    const basePaths = slipPaths
    if (basePaths.length + newFiles.length > MAX_FILES_PER_ATTACHMENT_TYPE) {
      alert(`Tối đa ${MAX_FILES_PER_ATTACHMENT_TYPE} ảnh phiếu giao mỗi đơn hàng`)
      return
    }
    const accumulated: string[] = [...basePaths]
    for (const file of newFiles) {
      const path = await uploadSlip(file, `slip_${uploadPrefix}`)
      if (path) {
        accumulated.push(path)
        onAttachmentName(path, file.name)
      }
    }
    setValue(`items.${index}.slip_temp_paths`, accumulated, { shouldValidate: true })
    e.target.value = ''
  }

  const handleVatUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files ?? [])
    const basePaths = vatPaths
    if (basePaths.length + newFiles.length > MAX_FILES_PER_ATTACHMENT_TYPE) {
      alert(`Tối đa ${MAX_FILES_PER_ATTACHMENT_TYPE} hóa đơn VAT mỗi đơn hàng`)
      return
    }
    const accumulated: string[] = [...basePaths]
    for (const file of newFiles) {
      const path = await uploadVat(file, `vat_${uploadPrefix}`)
      if (path) {
        accumulated.push(path)
        onAttachmentName(path, file.name)
      }
    }
    setValue(`items.${index}.vat_temp_paths`, accumulated, { shouldValidate: true })
    e.target.value = ''
  }

  const handleRemoveSlip = (tempPath: string) => {
    removeSlip(tempPath)
    setValue(`items.${index}.slip_temp_paths`, slipPaths.filter((p) => p !== tempPath), { shouldValidate: true })
  }

  const handleRemoveVat = (tempPath: string) => {
    removeVat(tempPath)
    setValue(`items.${index}.vat_temp_paths`, vatPaths.filter((p) => p !== tempPath), { shouldValidate: true })
  }

  const handleCopy = () => {
    const names: Record<string, string> = {}
    for (const file of [...slipFiles, ...vatFiles]) {
      names[file.tempPath] = file.file.name
    }
    for (const path of [...slipPaths, ...vatPaths]) {
      names[path] = pathLabel(path, attachmentNames)
    }
    onCopy?.(names)
  }

  return (
    <tr className="border-b border-[#ecdbe8] align-top">
      <td className="table-cell !px-1 !py-2 text-center text-xs font-medium text-[#888888]">{index + 1}</td>

      <td className="table-cell !px-1 !py-2">
        <ProductProcessCombobox
          placeholder="Tên SP"
          selectedId={selectedProductProcessId}
          options={productProcessOptions}
          getLabel={(option) => option.product_name}
          onSelect={handleProductProcessChange}
          error={Boolean(itemErrors?.product_code)}
          inputClassName="!px-2 !py-1 text-xs"
        />
        {itemErrors?.product_code?.message && <p className="form-error mt-1">{itemErrors.product_code.message}</p>}
        <input type="hidden" {...register(`items.${index}.product_code`)} />
      </td>

      <td className="table-cell !px-1 !py-2">
        <ProductProcessCombobox
          placeholder="Mã đơn"
          selectedId={selectedProductProcessId}
          options={productProcessOptions}
          getLabel={(option) => option.order_code}
          onSelect={handleProductProcessChange}
          error={Boolean(itemErrors?.process_code)}
          inputClassName="!px-2 !py-1 text-xs"
        />
        {itemErrors?.process_code?.message && <p className="form-error mt-1">{itemErrors.process_code.message}</p>}
        <input type="hidden" {...register(`items.${index}.process_code`)} />
      </td>

      <td className="table-cell !px-1 !py-2">
        <select
          className={`input-field !px-1 !py-1 text-xs ${itemErrors?.warehouse_code ? 'input-field-error' : ''}`}
          value={warehouseCode ?? ''}
          onChange={(e) => {
            setValue(`items.${index}.warehouse_code`, e.target.value, { shouldValidate: true })
            setValue(`items.${index}.mau`, '', { shouldValidate: true })
          }}
        >
          <option value="">Chọn</option>
          {warehouseOptions.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <input type="hidden" {...register(`items.${index}.warehouse_code`)} />
      </td>

      <td className="table-cell !px-1 !py-2">
        <select
          className={`input-field !px-1 !py-1 text-xs ${itemErrors?.mau ? 'input-field-error' : ''}`}
          value={mau ?? ''}
          onChange={(e) => setValue(`items.${index}.mau`, e.target.value, { shouldValidate: true })}
        >
          <option value="">Chọn</option>
          {mauOptions.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <input type="hidden" {...register(`items.${index}.mau`)} />
      </td>

      <td className="table-cell !px-1 !py-2 text-right">
        <input readOnly value={totalQuantity} className={`input-field !px-1 !py-1 text-xs bg-[#F5F5F5] ${itemErrors?.total_quantity ? 'input-field-error' : ''}`} />
        <input type="hidden" {...register(`items.${index}.total_quantity`, { valueAsNumber: true })} />
        <input type="hidden" {...register(`items.${index}.quantity_booked`, { valueAsNumber: true })} />
        {itemErrors?.total_quantity?.message && <p className="form-error">{itemErrors.total_quantity.message}</p>}
      </td>

      {SIZE_FIELDS.map(([field, label]) => (
        <td key={field} className="table-cell !px-1 !py-2">
          <input
            type="number"
            min={0}
            aria-label={label}
            value={watch(`items.${index}.${field}`) ?? ''}
            onChange={(e) => {
              const value = e.target.value
              recalcTotal(field, value === '' ? null : Math.max(0, Number(value) || 0))
            }}
            className="number-input-clean input-field !px-1 !py-1 text-xs text-right"
          />
          <input type="hidden" {...register(`items.${index}.${field}`, { valueAsNumber: true })} />
        </td>
      ))}

      <td className="table-cell !px-1 !py-2">
        <select
          className="input-field !px-1 !py-1 text-xs"
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
          {DELIVERY_ROUNDS.map((n) => <option key={n} value={n}>{n}</option>)}
          <option value="final">Cuối</option>
        </select>
        <input type="hidden" {...register(`items.${index}.delivery_round`, { valueAsNumber: true })} />
        <input type="hidden" {...register(`items.${index}.is_final_round`)} />

        {deliveryRound === 1 && !isFinalRound && (
          <div className="mt-2">
            <label className="text-xs font-medium text-[#CC0000] block mb-1">Hóa đơn VAT *</label>
            <div className="space-y-1">
              <div className="flex flex-wrap gap-1">
                {vatPaths.filter((path) => !vatFiles.some((file) => file.tempPath === path)).map((path) => (
                  <div key={path} className="flex items-center gap-1 text-xs border border-[#ecdbe8] rounded px-1.5 py-0.5">
                    <span className="max-w-[60px] truncate">{pathLabel(path, attachmentNames)}</span>
                    <button type="button" onClick={() => handleRemoveVat(path)} className="text-[#888888] hover:text-black">×</button>
                  </div>
                ))}
                {vatFiles.map((f) => (
                  <div key={f.tempPath} className={`flex items-center gap-1 text-xs border rounded px-1.5 py-0.5 ${f.status === 'error' ? 'border-[#CC0000] text-[#CC0000]' : 'border-[#ecdbe8]'}`}>
                    {f.status === 'uploading' ? <LoadingSpinner size="sm" /> : <span className="max-w-[60px] truncate">{f.file.name}</span>}
                    <button type="button" onClick={() => handleRemoveVat(f.tempPath)} className="text-[#888888] hover:text-black">×</button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => vatInputRef.current?.click()} disabled={vatFiles.filter((f) => f.status !== 'error').length >= MAX_FILES_PER_ATTACHMENT_TYPE} className="flex items-center gap-1 text-xs border border-dashed border-[#ecdbe8] hover:border-[#80417A] disabled:opacity-40 rounded px-2 py-1 transition-colors">
                {vatUploading ? <LoadingSpinner size="sm" /> : '+'}
                Thêm VAT
              </button>
            </div>
            <input ref={vatInputRef} type="file" accept=".jpg,.jpeg,.png,.pdf" multiple className="hidden" onChange={handleVatUpload} />
            {(itemErrors?.vat_temp_paths as any)?.message && <p className="form-error">{(itemErrors?.vat_temp_paths as any).message}</p>}
          </div>
        )}
      </td>

      <td className="table-cell !px-1 !py-2">
        <div className="space-y-1">
          <div className="flex flex-wrap gap-1">
            {slipPaths.filter((path) => !slipFiles.some((file) => file.tempPath === path)).map((path) => (
              <div key={path} className="flex items-center gap-1 text-xs border border-[#ecdbe8] rounded px-1.5 py-0.5">
                <span className="max-w-[60px] truncate">{pathLabel(path, attachmentNames)}</span>
                <button type="button" onClick={() => handleRemoveSlip(path)} className="text-[#888888] hover:text-black">×</button>
              </div>
            ))}
            {slipFiles.map((f) => (
              <div key={f.tempPath} className={`flex items-center gap-1 text-xs border rounded px-1.5 py-0.5 ${f.status === 'error' ? 'border-[#CC0000] text-[#CC0000]' : 'border-[#ecdbe8]'}`}>
                {f.status === 'uploading' ? <LoadingSpinner size="sm" /> : <span className="max-w-[60px] truncate">{f.file.name}</span>}
                <button type="button" onClick={() => handleRemoveSlip(f.tempPath)} className="text-[#888888] hover:text-black">×</button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => slipInputRef.current?.click()} disabled={slipFiles.filter((f) => f.status !== 'error').length >= MAX_FILES_PER_ATTACHMENT_TYPE} className="flex items-center gap-1 text-[11px] border border-dashed border-[#ecdbe8] hover:border-[#80417A] disabled:opacity-40 rounded px-1.5 py-1 transition-colors">
            {slipUploading ? <LoadingSpinner size="sm" /> : '+'}
            Thêm Ảnh
          </button>
          <input ref={slipInputRef} type="file" accept=".jpg,.jpeg,.png,.pdf" multiple className="hidden" onChange={handleSlipUpload} />
        </div>
        {itemErrors?.slip_temp_paths?.message && <p className="form-error">{itemErrors.slip_temp_paths.message as string}</p>}
      </td>

      <td className="table-cell !px-1 !py-2">
        <div className="flex items-center justify-center gap-1">
          <button type="button" onClick={handleCopy} className="h-7 whitespace-nowrap rounded border border-[#d5c0d5] px-1.5 text-xs text-[#514253] hover:border-[#80417A] hover:text-[#80417A] transition-colors" aria-label="Copy dòng" title="Copy dòng">
            Copy dòng
          </button>
          {onRemove && (
          <button type="button" onClick={onRemove} className="!m-0 !inline !h-auto !w-auto appearance-none !rounded-none !border-0 !bg-transparent !p-0 text-lg leading-none text-[#888888] !shadow-none hover:text-[#CC0000] transition-colors" aria-label="Xóa hàng" title="Xóa hàng">
            ×
          </button>
          )}
        </div>
      </td>
    </tr>
  )
}
