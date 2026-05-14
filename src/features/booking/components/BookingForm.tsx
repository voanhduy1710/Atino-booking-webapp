import { useEffect, useMemo, useState } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router-dom'
import { Navbar } from '@/shared/components/Navbar'
import { Button } from '@/shared/components/Button'
import { Select } from '@/shared/components/Select'
import { LoadingSpinner } from '@/shared/components/LoadingSpinner'
import { bookingFormSchema, type BookingFormData } from '@/features/booking/schemas'
import { useActiveSupplierAccounts, useWarehouses, useSupplierInfo } from '@/features/booking/hooks/useBookingData'
import { PoRow } from './PoRow'
import { TIME_SLOT_LABELS, STANDARD_DELIVERY_NOTE, type TimeSlot } from '@/shared/types/domain'
import { computeDeliveryDatePreview, formatDateDisplay } from '@/shared/lib/dateUtils'
import { getCurrentUser, getToken } from '@/shared/lib/auth'
import { SUPPLIER_TABS } from '@/shared/constants/supplierTabs'
import { ROLE_TABS } from '@/shared/config/navTabs'

// Re-export for any legacy imports
export { SUPPLIER_TABS }

const SESSION_ID = crypto.randomUUID()
// In production: nginx proxies /api/* → Express (same origin)
// In local dev:  set VITE_API_URL=http://localhost:3001
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? ''


export function BookingForm() {
  const navigate = useNavigate()
  const user = getCurrentUser()
  const isAdmin = user?.role === 'admin'
  const [adminSupplierAccountId, setAdminSupplierAccountId] = useState('')
  const { data: warehouses = [], isLoading: warehousesLoading } = useWarehouses()
  const { data: supplier } = useSupplierInfo()
  const { data: supplierAccounts = [], isLoading: supplierAccountsLoading } = useActiveSupplierAccounts(isAdmin)
  const selectedAdminSupplierAccount = useMemo(
    () => supplierAccounts.find((account) => account.id === adminSupplierAccountId) ?? null,
    [adminSupplierAccountId, supplierAccounts]
  )
  const effectiveSupplier = isAdmin
    ? selectedAdminSupplierAccount
      ? { code: selectedAdminSupplierAccount.supplier_code, name: selectedAdminSupplierAccount.supplier_name }
      : null
    : supplier
  const navTabs = isAdmin ? (ROLE_TABS.admin ?? []) : SUPPLIER_TABS

  const deliveryDatePreview = formatDateDisplay(computeDeliveryDatePreview())

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<BookingFormData>({
    resolver: zodResolver(bookingFormSchema),
    defaultValues: {
      warehouse_id: '',
      time_slot: undefined,
      ghi_chu: '',
      items: [
        {
          product_code: '',
          process_code: '',
          delivery_round: 1,
          is_final_round: false,
          quantity_booked: 1,
          vat_temp_paths: [],
          slip_temp_paths: [],
        },
      ],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'items' })

  const poCount = watch('items').length

  useEffect(() => {
    document.title = 'Đăng ký giao hàng — Atino Booking'
  }, [])

  const handlePoCountChange = (newCount: number) => {
    const clamped = Math.max(1, Math.min(99, newCount))
    const current = fields.length
    if (clamped > current) {
      for (let i = current; i < clamped; i++) {
        append({
          product_code: '',
          process_code: '',
          delivery_round: 1,
          is_final_round: false,
          quantity_booked: 1,
          vat_temp_paths: [],
          slip_temp_paths: [],
        })
      }
    } else if (clamped < current) {
      for (let i = current - 1; i >= clamped; i--) {
        remove(i)
      }
    }
  }

  const onSubmit = async (data: BookingFormData) => {
    const token = getToken()
    if (!token) return
    if (isAdmin && !adminSupplierAccountId) {
      alert('Vui lòng chọn tài khoản nhà cung cấp')
      return
    }

    try {
      const res = await fetch(`${API_BASE}/api/booking/finalize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          warehouse_id: data.warehouse_id,
          time_slot: data.time_slot,
          ghi_chu: data.ghi_chu || null,
          delivery_note: STANDARD_DELIVERY_NOTE,
          session_id: SESSION_ID,
          ...(isAdmin ? { supplier_account_id: adminSupplierAccountId } : {}),
          items: data.items,
        }),
      })

      const result = await res.json()

      if (!res.ok) {
        throw new Error((result as { error?: string }).error ?? 'Có lỗi xảy ra')
      }

      const { booking_token } = result as { booking_token: string }
      navigate(`/booking/${booking_token}/confirmation`, {
        state: result,
      })
    } catch (err) {
      alert((err as Error).message)
    }
  }

  if (warehousesLoading || (isAdmin && supplierAccountsLoading)) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar tabs={navTabs} activeTab="new-booking" />
        <div className="flex-1 flex items-center justify-center">
          <LoadingSpinner size="lg" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#fdf8ff]">
      <Navbar tabs={navTabs} activeTab="new-booking" />

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-6">
        <h1 className="text-xl font-bold tracking-wider uppercase text-center mb-4">
          ĐƠN ĐĂNG KÝ — GIAO THEO ĐƠN HÀNG
        </h1>

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          {/* Section I */}
          <div className="bg-white border border-[#ecdbe8] rounded-lg mb-4">
            <div className="px-6 py-4 border-b border-[#ecdbe8]">
              <h2 className="section-header !border-0 !pb-0 !mb-0">
                I. THÔNG TIN NHÀ CUNG CẤP
              </h2>
            </div>

            <div className="px-6 py-5 space-y-4">
              {isAdmin && (
                <div className="grid grid-cols-3 gap-4 items-start">
                  <label className="form-label col-span-1 pt-2">
                    Tài khoản NCC <span className="text-[#CC0000]">*</span>
                  </label>
                  <div className="col-span-2">
                    <Select
                      value={adminSupplierAccountId}
                      onChange={(e) => setAdminSupplierAccountId(e.target.value)}
                      placeholder="— Chọn tài khoản NCC —"
                    >
                      {supplierAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.full_name} — {account.supplier_code} — {account.supplier_name}
                        </option>
                      ))}
                    </Select>
                    {supplierAccounts.length === 0 && (
                      <p className="form-error mt-1">Chưa có tài khoản NCC active để tạo booking</p>
                    )}
                  </div>
                </div>
              )}

              {/* Cửa hàng */}
              <div className="grid grid-cols-3 gap-4 items-start">
                <label className="form-label col-span-1 pt-2">
                  Cửa hàng <span className="text-[#CC0000]">*</span>
                </label>
                <div className="col-span-2">
                  <Select
                    placeholder="— Chọn kho —"
                    error={errors.warehouse_id?.message}
                    {...register('warehouse_id')}
                  >
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              {/* Mã NCC */}
              <div className="grid grid-cols-3 gap-4 items-center">
                <label className="form-label col-span-1">Mã NCC</label>
                <div className="col-span-2">
                  <input
                    readOnly
                    value={effectiveSupplier?.code ?? ''}
                    className="input-field bg-[#F5F5F5] cursor-not-allowed"
                    placeholder="—"
                  />
                </div>
              </div>

              {/* Tên NCC */}
              <div className="grid grid-cols-3 gap-4 items-center">
                <label className="form-label col-span-1">Tên NCC</label>
                <div className="col-span-2">
                  <input
                    readOnly
                    value={effectiveSupplier?.name ?? ''}
                    className="input-field bg-[#F5F5F5] cursor-not-allowed"
                    placeholder="—"
                  />
                </div>
              </div>

              {/* Ngày giao hàng */}
              <div className="grid grid-cols-3 gap-4 items-center">
                <label className="form-label col-span-1">Ngày đăng ký giao hàng</label>
                <div className="col-span-2">
                  <div className="flex items-center gap-3">
                    <input
                      readOnly
                      value={deliveryDatePreview}
                      className="input-field bg-[#F5F5F5] cursor-not-allowed w-40"
                    />
                    <span className="text-xs text-[#888888]">
                      (Trước 18h → N+1, từ 18h → N+2)
                    </span>
                  </div>
                </div>
              </div>

              {/* Số lượng đơn hàng */}
              <div className="grid grid-cols-3 gap-4 items-center">
                <label className="form-label col-span-1">
                  Số lượng đơn hàng <span className="text-[#CC0000]">*</span>
                </label>
                <div className="col-span-2">
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={poCount}
                    onChange={(e) => handlePoCountChange(Number(e.target.value))}
                    className="input-field w-28"
                  />
                </div>
              </div>

              {/* PO Table */}
              <div>
                <div className="overflow-x-auto border border-[#ecdbe8] rounded">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[#F5F5F5]">
                        <th className="table-header w-10">STT</th>
                        <th className="table-header">Mã SP — Mã QT</th>
                        <th className="table-header w-32">Số lần giao</th>
                        <th className="table-header w-28">Kiện/thùng</th>
                        <th className="table-header">Ảnh phiếu giao</th>
                        <th className="table-header w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {fields.map((field, index) => (
                        <PoRow
                          key={field.id}
                          index={index}
                          rowId={field.id}
                          register={register}
                          errors={errors}
                          sessionId={SESSION_ID}
                          supplierCode={effectiveSupplier?.code ?? 'NCC'}
                          onRemove={fields.length > 1 ? () => remove(index) : undefined}
                          setValue={setValue}
                          watch={watch}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
                {errors.items?.root?.message && (
                  <p className="form-error mt-1">{errors.items.root.message}</p>
                )}
              </div>
            </div>
          </div>

          {/* Section II */}
          <div className="bg-white border border-[#ecdbe8] rounded-lg mb-6">
            <div className="px-6 py-4 border-b border-[#ecdbe8]">
              <h2 className="section-header !border-0 !pb-0 !mb-0">
                II. THÔNG TIN VẬN CHUYỂN
              </h2>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Khung giờ */}
              <div>
                <label className="form-label">
                  Khung giờ giao hàng <span className="text-[#CC0000]">*</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
                  {(Object.entries(TIME_SLOT_LABELS) as [TimeSlot, string][]).map(
                    ([slot, label]) => (
                      <label
                        key={slot}
                        className={`flex items-center justify-center gap-2 border rounded p-3 cursor-pointer text-sm font-medium transition-colors ${watch('time_slot') === slot
                            ? 'bg-[#80417A] text-white border-[#80417A]'
                            : 'border-[#ecdbe8] hover:border-[#80417A]'
                          }`}
                      >
                        <input
                          type="radio"
                          value={slot}
                          className="sr-only"
                          {...register('time_slot')}
                        />
                        {label}
                      </label>
                    )
                  )}
                </div>
                {errors.time_slot?.message && (
                  <p className="form-error mt-1">{errors.time_slot.message}</p>
                )}
              </div>

              {/* Ghi chú */}
              <div>
                <label htmlFor="ghi-chu" className="form-label">Ghi chú</label>
                <textarea
                  id="ghi-chu"
                  rows={3}
                  maxLength={500}
                  className="input-field resize-none"
                  placeholder="Ghi chú đặc biệt về lần giao hàng này (tuỳ chọn)..."
                  {...register('ghi_chu')}
                />
                {errors.ghi_chu?.message && (
                  <p className="form-error">{errors.ghi_chu.message}</p>
                )}
              </div>

              {/* Atino notice */}
              <div>
                <label className="form-label">Ghi chú giao hàng (Atino)</label>
                <div className="p-3 bg-[#F5F5F5] border border-[#ecdbe8] rounded text-sm text-[#888888] leading-relaxed">
                  {STANDARD_DELIVERY_NOTE}
                </div>
              </div>
            </div>
          </div>

          {/* Submit */}
          <Button
            type="submit"
            fullWidth
            loading={isSubmitting}
            disabled={isAdmin && !adminSupplierAccountId}
            id="booking-submit"
            className="text-base py-4"
          >
            Đăng ký
          </Button>
        </form>
      </main>
    </div>
  )
}
