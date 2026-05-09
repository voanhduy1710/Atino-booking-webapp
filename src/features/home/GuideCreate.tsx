import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { GuideTabs } from './GuideTabs'

export default function GuideCreate() {
  useEffect(() => {
    document.title = 'Hướng dẫn tạo đơn — Atino Booking'
  }, [])

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="border-b border-[#E0E0E0] px-6 py-4 flex items-center gap-4">
        <Link to="/" className="text-[#888888] hover:text-black transition-colors text-sm">
          ← Quay lại
        </Link>
        <img src="/Atino Logo.svg" alt="Atino" className="h-6 w-auto" />
      </div>

      <GuideTabs />

      <div className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold mb-2">Hướng dẫn tạo đơn đăng ký giao hàng</h1>
        <p className="text-[#888888] text-sm mb-8">
          Làm theo các bước dưới đây để đăng ký giao hàng thành công.
        </p>

        <div className="space-y-8">
          {[
            {
              step: 1,
              title: 'Đăng nhập tài khoản',
              desc: 'Sử dụng tên đăng nhập và mật khẩu được cấp. Nếu chưa có tài khoản, vui lòng đăng ký và chờ admin xác nhận.',
            },
            {
              step: 2,
              title: 'Chọn kho và điền thông tin nhà cung cấp',
              desc: 'Chọn kho hàng từ dropdown. Mã NCC và Tên NCC được tự động điền từ tài khoản của bạn.',
            },
            {
              step: 3,
              title: 'Nhập số lượng đơn hàng (PO)',
              desc: 'Nhập số lượng đơn hàng (1–99). Hệ thống sẽ tạo ra số hàng tương ứng trong bảng đơn hàng.',
            },
            {
              step: 4,
              title: 'Điền thông tin từng đơn hàng',
              desc: 'Cho mỗi hàng: nhập Mã sản phẩm — Mã quy trình, chọn Số lần giao, nhập Số kiện/thùng, tải lên ảnh phiếu giao. Nếu đây là lần giao đầu tiên (Số lần giao = 1), bắt buộc phải tải lên Hóa đơn VAT.',
            },
            {
              step: 5,
              title: 'Chọn khung giờ giao hàng',
              desc: 'Chọn một trong bốn khung giờ: 07:00–09:00, 09:00–11:00, 13:30–15:30, 15:30–17:00. Đơn hàng đăng ký trước 18:00 sẽ giao ngày N+1, từ 18:00 trở đi sẽ giao ngày N+2.',
            },
            {
              step: 6,
              title: 'Gửi đăng ký và lưu mã QR',
              desc: 'Nhấn "Đăng ký". Sau khi thành công, bạn sẽ nhận được mã booking và mã QR. Vui lòng lưu hoặc in mã QR để sử dụng khi giao hàng tại kho.',
            },
          ].map(({ step, title, desc }) => (
            <div key={step} className="flex gap-5">
              <div className="flex-shrink-0 w-9 h-9 rounded-full border-2 border-black flex items-center justify-center font-bold text-sm">
                {step}
              </div>
              <div>
                <h2 className="font-semibold mb-1">{title}</h2>
                <p className="text-[#888888] text-sm leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 pt-6 border-t border-[#E0E0E0]">
          <Link
            to="/login"
            className="btn-primary inline-flex"
            id="guide-go-to-login"
          >
            Đăng nhập để đăng ký giao hàng
          </Link>
        </div>
      </div>
    </div>
  )
}
