import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { GuideTabs } from './GuideTabs'

export default function GuideReceiving() {
  useEffect(() => {
    document.title = 'Quy trình giao nhận hàng — Atino Booking'
  }, [])

  return (
    <div className="min-h-screen bg-white">
      <div className="border-b border-[#E0E0E0] px-6 py-4 flex items-center gap-4">
        <Link to="/" className="text-[#888888] hover:text-black transition-colors text-sm">
          ← Quay lại
        </Link>
        <img src="/Atino Logo.svg" alt="Atino" className="h-6 w-auto" />
      </div>

      <GuideTabs />

      <div className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold mb-2">Quy trình giao nhận hàng</h1>
        <p className="text-[#888888] text-sm mb-8">
          Quy trình chuẩn khi giao hàng đến kho Atino.
        </p>

        <div className="space-y-8">
          {[
            {
              step: 1,
              title: 'Đăng ký trước khi đến',
              desc: 'Nhà cung cấp phải hoàn thành đăng ký giao hàng trên hệ thống. Đơn hàng cần được xác nhận bởi nhân viên kho trước khi đến giao.',
            },
            {
              step: 2,
              title: 'Đến kho đúng khung giờ đã đăng ký',
              desc: 'Xuất trình mã QR hoặc mã booking cho nhân viên kho tại cổng. Hàng hóa phải đúng chủng loại và số lượng đã đăng ký.',
            },
            {
              step: 3,
              title: 'Nhân viên kho xác nhận nhận hàng',
              desc: 'Nhân viên sẽ kiểm tra, đếm số lượng thực nhận và xác nhận trên hệ thống. Nếu có chênh lệch, sẽ được ghi nhận và xử lý theo chính sách của Atino.',
            },
          ].map(({ step, title, desc }) => (
            <div key={step} className="flex gap-5">
              <div className="flex-shrink-0 w-9 h-9 rounded-full bg-black text-white flex items-center justify-center font-bold text-sm">
                {step}
              </div>
              <div>
                <h2 className="font-semibold mb-1">{title}</h2>
                <p className="text-[#888888] text-sm leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 p-4 border border-[#E0E0E0] rounded-lg bg-[#F5F5F5]">
          <p className="text-sm text-[#888888]">
            <strong className="text-black">Lưu ý:</strong> Hàng giao thiếu hoặc không đúng chủng loại sẽ bị trả về.
            Vui lòng đến đúng khung giờ đã chọn. Trễ giờ có thể bị từ chối nhận hàng.
          </p>
        </div>
      </div>
    </div>
  )
}
