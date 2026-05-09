import { Link, useLocation } from 'react-router-dom'

const TABS = [
  { path: '/guide/create',    label: '📝 Tạo đơn đăng ký' },
  { path: '/guide/receiving', label: '🏭 Quy trình nhận hàng' },
]

export function GuideTabs() {
  const { pathname } = useLocation()

  return (
    <div className="border-b border-[#E0E0E0] px-6 bg-white">
      <div className="max-w-3xl mx-auto flex">
        {TABS.map(({ path, label }) => {
          const active = pathname === path
          return (
            <Link
              key={path}
              to={path}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                active
                  ? 'border-black text-black'
                  : 'border-transparent text-[#888888] hover:text-black'
              }`}
            >
              {label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
