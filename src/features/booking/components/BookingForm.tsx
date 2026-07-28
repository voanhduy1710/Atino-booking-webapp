import { useEffect, useMemo, useState } from "react";
import { Controller, useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Navbar } from "@/shared/components/Navbar";
import { Button } from "@/shared/components/Button";
import { Select } from "@/shared/components/Select";
import { LoadingSpinner } from "@/shared/components/LoadingSpinner";
import { SingleDatePickerPopup } from "@/shared/components/filters";
import {
  bookingFormSchema,
  type BookingFormData,
} from "@/features/booking/schemas";
import {
  useActiveSupplierAccounts,
  useWarehouses,
  useSupplierInfo,
} from "@/features/booking/hooks/useBookingData";
import { PoRow } from "./PoRow";
import {
  BOOKING_TIME_SLOTS,
  TIME_SLOT_LABELS,
  STANDARD_DELIVERY_NOTE,
} from "@/shared/types/domain";
import {
  formatDateDisplay,
  getDeliveryDateWindow,
} from "@/shared/lib/dateUtils";
import { getCurrentUser } from "@/shared/lib/auth";
import { SUPPLIER_TABS } from "@/shared/constants/supplierTabs";
import { ROLE_TABS } from "@/shared/config/navTabs";
import { pageMainClass } from "@/shared/config/pageLayout";
import {
  MAX_BOOKING_ITEMS,
  MAX_DAILY_TOTAL_QUANTITY,
} from "@/shared/constants/booking";
import { TEXT_SIZE } from "@/shared/constants/textSizes";
import { getJson, postJson } from "@/shared/lib/apiClient";
import {
  fetchProductProcessCatalog,
  PRODUCT_PROCESS_CATALOG_QUERY_KEY,
} from "@/features/productProcess/api";

// Re-export for any legacy imports
export { SUPPLIER_TABS };

const DEFAULT_WAREHOUSE_NAME = "Tân Hoàng Long";

const emptyItem = {
  product_code: "",
  process_code: "",
  warehouse_code: "",
  mau: "",
  delivery_round: 1,
  is_final_round: false,
  quantity_booked: 1,
  total_quantity: 0,
  size_s_28: null,
  size_m_29: null,
  size_l_30: null,
  size_xl_31: null,
  size_2xl_32: null,
  size_3xl_33: null,
  size_4xl_34: null,
  vat_temp_paths: [],
  slip_temp_paths: [],
};

type DeliveryCapacity = {
  delivery_date: string;
  used_quantity: number;
  max_quantity: number;
  remaining_quantity: number;
};

type DeliveryCapacityWindow = {
  min_iso: string;
  max_iso: string;
  unavailable_dates: string[];
  max_quantity: number;
};

function bookingItemTotal(
  item: Partial<BookingFormData["items"][number]>,
): number {
  return Number(item.total_quantity ?? item.quantity_booked ?? 0);
}

function maxISODate(...dates: Array<string | undefined>): string {
  return (
    dates
      .filter((date): date is string => Boolean(date))
      .sort()
      .at(-1) ?? ""
  );
}

export function BookingForm() {
  const [sessionId] = useState(() => crypto.randomUUID());
  const navigate = useNavigate();
  const user = getCurrentUser();
  const isAdmin = user?.role === "admin";
  const [adminSupplierAccountId, setAdminSupplierAccountId] = useState("");
  const [attachmentNames, setAttachmentNames] = useState<
    Record<string, string>
  >({});
  const { data: warehouses = [], isLoading: warehousesLoading } =
    useWarehouses();
  const { data: supplier } = useSupplierInfo();
  const { data: supplierAccounts = [], isLoading: supplierAccountsLoading } =
    useActiveSupplierAccounts(isAdmin);
  const { data: productProcessOptions = [], isLoading: productProcessLoading } =
    useQuery({
      queryKey: PRODUCT_PROCESS_CATALOG_QUERY_KEY,
      queryFn: fetchProductProcessCatalog,
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    });
  const selectedAdminSupplierAccount = useMemo(
    () =>
      supplierAccounts.find(
        (account) => account.id === adminSupplierAccountId,
      ) ?? null,
    [adminSupplierAccountId, supplierAccounts],
  );
  const effectiveSupplier = isAdmin
    ? selectedAdminSupplierAccount
      ? {
          code: selectedAdminSupplierAccount.supplier_code,
          name: selectedAdminSupplierAccount.supplier_name,
        }
      : null
    : supplier;
  const navTabs = isAdmin ? (ROLE_TABS.admin ?? []) : SUPPLIER_TABS;

  const deliveryWindow = useMemo(() => getDeliveryDateWindow(), []);

  const {
    register,
    control,
    handleSubmit,
    watch,
    getValues,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<BookingFormData>({
    resolver: zodResolver(bookingFormSchema),
    defaultValues: {
      warehouse_id: "",
      delivery_date: deliveryWindow.minISO,
      time_slot: undefined,
      ghi_chu: "",
      items: [emptyItem],
    },
  });

  const { fields, append, insert, remove } = useFieldArray({
    control,
    name: "items",
  });

  const poCount = watch("items").length;
  const selectedDeliveryDate = watch("delivery_date");
  const watchedItems = watch("items");
  const requestedTotal = useMemo(
    () =>
      (watchedItems ?? []).reduce(
        (sum, item) => sum + bookingItemTotal(item),
        0,
      ),
    [watchedItems],
  );
  const { data: deliveryCapacity, isLoading: deliveryCapacityLoading } =
    useQuery({
      queryKey: ["booking-delivery-capacity", selectedDeliveryDate],
      queryFn: () =>
        getJson<DeliveryCapacity>(
          `/api/booking/finalize/capacity?delivery_date=${encodeURIComponent(selectedDeliveryDate)}`,
        ),
      enabled: Boolean(user && selectedDeliveryDate),
      refetchInterval: 30_000,
      staleTime: 0,
    });
  const { data: deliveryCapacityWindow } = useQuery({
    queryKey: [
      "booking-delivery-capacity-window",
      requestedTotal,
      selectedDeliveryDate,
    ],
    queryFn: () =>
      getJson<DeliveryCapacityWindow>(
        `/api/booking/finalize/capacity-window?requested_total=${encodeURIComponent(requestedTotal)}&delivery_date=${encodeURIComponent(selectedDeliveryDate)}`,
      ),
    enabled: Boolean(user),
    placeholderData: (previous) => previous,
    refetchInterval: 30_000,
    staleTime: 0,
  });
  const allowedMinISO =
    deliveryCapacityWindow?.min_iso ?? deliveryWindow.minISO;
  const allowedMaxISO = maxISODate(
    deliveryWindow.maxISO,
    deliveryCapacityWindow?.max_iso,
    selectedDeliveryDate,
  );
  const usedDeliveryQuantity = deliveryCapacity?.used_quantity ?? 0;
  const maxDeliveryQuantity =
    deliveryCapacity?.max_quantity ?? MAX_DAILY_TOTAL_QUANTITY;
  const exceedsDeliveryCapacity = Boolean(
    deliveryCapacity &&
    usedDeliveryQuantity + requestedTotal > maxDeliveryQuantity,
  );

  useEffect(() => {
    document.title = "Đăng ký giao hàng — Atino Booking";
  }, []);

  useEffect(() => {
    const current = watch("warehouse_id");
    if (current || warehouses.length === 0) return;
    const defaultWarehouse = warehouses.find(
      (warehouse) =>
        warehouse.name.trim().toLowerCase() ===
        DEFAULT_WAREHOUSE_NAME.toLowerCase(),
    );
    if (defaultWarehouse)
      setValue("warehouse_id", defaultWarehouse.id, { shouldValidate: true });
  }, [warehouses, setValue, watch]);

  const handlePoCountChange = (newCount: number) => {
    const clamped = Math.max(1, Math.min(MAX_BOOKING_ITEMS, newCount));
    const current = fields.length;
    if (clamped > current) {
      for (let i = current; i < clamped; i++) {
        append({ ...emptyItem });
      }
    } else if (clamped < current) {
      for (let i = current - 1; i >= clamped; i--) {
        remove(i);
      }
    }
  };

  const copyRow = (
    index: number,
    copiedAttachmentNames: Record<string, string> = {},
  ) => {
    if (fields.length >= MAX_BOOKING_ITEMS) return;
    setAttachmentNames((current) => ({ ...current, ...copiedAttachmentNames }));
    const source = getValues(`items.${index}`);
    insert(index + 1, {
      ...source,
      vat_temp_paths: [...(source.vat_temp_paths ?? [])],
      slip_temp_paths: [...(source.slip_temp_paths ?? [])],
    });
  };

  const rememberAttachmentName = (path: string, name: string) => {
    setAttachmentNames((current) => ({ ...current, [path]: name }));
  };

  const onSubmit = async (data: BookingFormData) => {
    const deliveryDate = getValues("delivery_date") || data.delivery_date;
    if (!user) return;
    if (isAdmin && !adminSupplierAccountId) {
      alert("Vui lòng chọn tài khoản nhà cung cấp");
      return;
    }
    if (exceedsDeliveryCapacity) {
      alert(
        "Ngày này đã vượt quá tối đa số lượng quy định. Vui lòng chọn ngày khác.",
      );
      return;
    }

    try {
      const result = await postJson<{ booking_token: string }>(
        "/api/booking/finalize",
        {
          warehouse_id: data.warehouse_id,
          delivery_date: deliveryDate,
          time_slot: data.time_slot,
          ghi_chu: data.ghi_chu || null,
          delivery_note: STANDARD_DELIVERY_NOTE,
          session_id: sessionId,
          ...(isAdmin ? { supplier_account_id: adminSupplierAccountId } : {}),
          items: data.items,
        },
      );

      const { booking_token } = result;
      navigate(`/booking/${booking_token}/confirmation`, {
        state: result,
      });
    } catch (err) {
      alert((err as Error).message);
    }
  };

  if (
    warehousesLoading ||
    productProcessLoading ||
    (isAdmin && supplierAccountsLoading)
  ) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar tabs={navTabs} activeTab="new-booking" />
        <div className="flex-1 flex items-center justify-center">
          <LoadingSpinner size="lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#fdf8ff]">
      <Navbar tabs={navTabs} activeTab="new-booking" />

      <main className={pageMainClass("bookingNew")}>
        <h1
          className={`${TEXT_SIZE.pageHeading} mb-4 text-center font-bold uppercase tracking-wider`}
        >
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
                <div className="grid grid-cols-1 gap-4 items-start sm:grid-cols-3">
                  <label className="form-label col-span-1 pt-2">
                    Tài khoản NCC <span className="text-[#CC0000]">*</span>
                  </label>
                  <div className="col-span-2">
                    <Select
                      value={adminSupplierAccountId}
                      onChange={(e) =>
                        setAdminSupplierAccountId(e.target.value)
                      }
                      placeholder="— Chọn tài khoản NCC —"
                    >
                      {supplierAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.full_name} — {account.supplier_code} —{" "}
                          {account.supplier_name}
                        </option>
                      ))}
                    </Select>
                    {supplierAccounts.length === 0 && (
                      <p className="form-error mt-1">
                        Chưa có tài khoản NCC active để tạo booking
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Cửa hàng */}
              <div className="grid grid-cols-1 gap-4 items-start sm:grid-cols-3">
                <label className="form-label col-span-1 pt-2">
                  Cửa hàng <span className="text-[#CC0000]">*</span>
                </label>
                <div className="col-span-2">
                  <Select
                    placeholder="— Chọn kho —"
                    error={errors.warehouse_id?.message}
                    {...register("warehouse_id")}
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
              <div className="grid grid-cols-1 gap-4 items-center sm:grid-cols-3">
                <label className="form-label col-span-1">Mã NCC</label>
                <div className="col-span-2">
                  <input
                    readOnly
                    value={effectiveSupplier?.code ?? ""}
                    className="input-field bg-[#F5F5F5] cursor-not-allowed"
                    placeholder="—"
                  />
                </div>
              </div>

              {/* Tên NCC */}
              <div className="grid grid-cols-1 gap-4 items-center sm:grid-cols-3">
                <label className="form-label col-span-1">Tên NCC</label>
                <div className="col-span-2">
                  <input
                    readOnly
                    value={effectiveSupplier?.name ?? ""}
                    className="input-field bg-[#F5F5F5] cursor-not-allowed"
                    placeholder="—"
                  />
                </div>
              </div>

              {/* Ngày giao hàng */}
              <div className="grid grid-cols-1 gap-4 items-center sm:grid-cols-3">
                <label className="form-label col-span-1">
                  Ngày đăng ký giao hàng
                </label>
                <div className="col-span-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Controller
                        control={control}
                        name="delivery_date"
                        render={({ field }) => (
                          <SingleDatePickerPopup
                            value={field.value}
                            onChange={(value) => field.onChange(value)}
                            minDate={allowedMinISO}
                            maxDate={allowedMaxISO}
                            isClearable={false}
                            maxWidth={undefined}
                            className="w-64"
                          />
                        )}
                      />
                      <span className="text-xs text-[#888888] whitespace-nowrap">
                        Cho phép {formatDateDisplay(allowedMinISO)} -{" "}
                        {formatDateDisplay(allowedMaxISO)}
                      </span>
                    </div>
                    <span className="text-xs whitespace-nowrap text-[#CC0000]">
                      Tổng số lượng đã được đặt giao ngày này:{" "}
                      {deliveryCapacityLoading
                        ? "đang tải..."
                        : usedDeliveryQuantity.toLocaleString("vi-VN")}{" "}
                      / {maxDeliveryQuantity.toLocaleString("vi-VN")}
                    </span>
                  </div>
                  {exceedsDeliveryCapacity && (
                    <p className="form-error mt-1">
                      Ngày này đã vượt quá tối đa số lượng quy định. Vui lòng
                      chọn ngày khác.
                    </p>
                  )}
                  {errors.delivery_date?.message && (
                    <p className="form-error mt-1">
                      {errors.delivery_date.message}
                    </p>
                  )}
                </div>
              </div>

              {/* Số lượng đơn hàng */}
              <div className="grid grid-cols-1 gap-4 items-center sm:grid-cols-3">
                <label className="form-label col-span-1">
                  Số lượng đơn hàng <span className="text-[#CC0000]">*</span>
                </label>
                <div className="col-span-2">
                  <input
                    type="number"
                    min={1}
                    max={MAX_BOOKING_ITEMS}
                    value={poCount}
                    onChange={(e) =>
                      handlePoCountChange(Number(e.target.value))
                    }
                    className="input-field w-28"
                  />
                </div>
              </div>

              {/* PO Table */}
              <div>
                <div className="sm:overflow-x-auto sm:border sm:border-[#ecdbe8] sm:rounded">
                  <table className="po-table w-full text-sm sm:min-w-[1100px] sm:table-fixed">
                    <thead>
                      <tr className="bg-[#F5F5F5]">
                        <th className="table-header !px-1 !py-2 w-[3%]">STT</th>
                        <th className="table-header !px-1 !py-2 w-[6%]">
                          Tên SP
                        </th>
                        <th className="table-header !px-1 !py-2 w-[6%]">
                          Mã đơn
                        </th>
                        <th className="table-header !px-1 !py-2 w-[11%]">
                          Mã kho
                        </th>
                        <th className="table-header !px-1 !py-2 w-[7%]">Màu</th>
                        <th className="table-header !px-1 !py-2 w-[7%]">
                          Tổng SL
                        </th>
                        <th className="table-header !px-1 !py-2 text-center w-[6%]">
                          S/28
                        </th>
                        <th className="table-header !px-1 !py-2 text-center w-[6%]">
                          M/29
                        </th>
                        <th className="table-header !px-1 !py-2 text-center w-[6%]">
                          L/30
                        </th>
                        <th className="table-header !px-1 !py-2 text-center w-[6%]">
                          XL/31
                        </th>
                        <th className="table-header !px-1 !py-2 text-center w-[6%]">
                          2XL/32
                        </th>
                        <th className="table-header !px-1 !py-2 text-center w-[6%]">
                          3XL/33
                        </th>
                        <th className="table-header !px-1 !py-2 text-center w-[6%]">
                          4XL/34
                        </th>
                        <th className="table-header !px-1 !py-2 w-[8%]">
                          Lần giao
                        </th>
                        <th className="table-header !px-1 !py-2 w-[9%]">
                          Ảnh phiếu giao
                        </th>
                        <th className="table-header !px-1 !py-2 w-[7%]"></th>
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
                          sessionId={sessionId}
                          supplierCode={effectiveSupplier?.code ?? "NCC"}
                          onCopy={(copiedAttachmentNames) =>
                            copyRow(index, copiedAttachmentNames)
                          }
                          onRemove={
                            fields.length > 1 ? () => remove(index) : undefined
                          }
                          setValue={setValue}
                          watch={watch}
                          productProcessOptions={productProcessOptions}
                          attachmentNames={attachmentNames}
                          onAttachmentName={rememberAttachmentName}
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                  {BOOKING_TIME_SLOTS.map((slot) => (
                    <label
                      key={slot}
                      className={`flex items-center justify-center gap-2 border rounded p-3 cursor-pointer text-sm font-medium transition-colors ${
                        watch("time_slot") === slot
                          ? "bg-[#80417A] text-white border-[#80417A]"
                          : "border-[#ecdbe8] hover:border-[#80417A]"
                      }`}
                    >
                      <input
                        type="radio"
                        value={slot}
                        className="sr-only"
                        {...register("time_slot")}
                      />
                      {TIME_SLOT_LABELS[slot]}
                    </label>
                  ))}
                </div>
                {errors.time_slot?.message && (
                  <p className="form-error mt-1">{errors.time_slot.message}</p>
                )}
              </div>

              {/* Ghi chú */}
              <div>
                <label htmlFor="ghi-chu" className="form-label">
                  Ghi chú
                </label>
                <textarea
                  id="ghi-chu"
                  rows={3}
                  maxLength={500}
                  className="input-field resize-none"
                  placeholder="Ghi chú đặc biệt về lần giao hàng này (tuỳ chọn)..."
                  {...register("ghi_chu")}
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
            disabled={
              (isAdmin && !adminSupplierAccountId) || exceedsDeliveryCapacity
            }
            id="booking-submit"
            className="text-base py-4"
          >
            Đăng ký
          </Button>
        </form>
      </main>
    </div>
  );
}
