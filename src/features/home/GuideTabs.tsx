import { Link, useLocation } from 'react-router-dom'

const TABS = [
  { path: '/guide/create',    label: 'Quy trình đăng ký' },
  { path: '/guide/receiving', label: 'Quy trình nhận hàng' },
]

export function GuideTabs() {
  const { pathname } = useLocation()

  return (
    <div className="border-b border-[#E0E0E0] px-6 bg-white flex items-center gap-4 h-14">
      {/* Back + logo */}
      <Link to="/" className="text-[#888888] hover:text-black transition-colors text-sm flex-shrink-0">
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
                ? 'bg-black text-white'
                : 'text-[#888888] hover:text-black'
            }`}
          >
            {label}
          </Link>
        )
      })}
    </div>
  )
}
