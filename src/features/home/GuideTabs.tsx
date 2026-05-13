import { Link, useLocation } from 'react-router-dom'

const TABS = [
  { path: '/guide/create',    label: 'Quy trình đăng ký' },
  { path: '/guide/receiving', label: 'Quy trình nhận hàng' },
]

export function GuideTabs() {
  const { pathname } = useLocation()

  return (
    <div className="border-b border-[#E3B2E2] px-6 bg-[#E3B2E2] flex items-center gap-4 h-14">
      {/* Back + logo */}
      <Link to="/" className="text-black font-bold hover:text-white transition-colors text-sm flex-shrink-0">
        ← Quay lại
      </Link>
      <img src="/Atino Logo.svg" alt="Atino" className="h-6 w-auto flex-shrink-0" />

      {/* Tabs — same row */}
      {TABS.map(({ path, label }) => {
        const active = pathname === path
        return (
          <Link
            key={path}
            to={path}
            className={`px-3 py-1 text-sm font-medium rounded transition-colors whitespace-nowrap ${
              active
                ? 'bg-[#AD58A6] text-white font-bold'
                : 'text-black font-bold hover:bg-[#D69AD4]'
            }`}
          >
            {label}
          </Link>
        )
      })}
    </div>
  )
}
