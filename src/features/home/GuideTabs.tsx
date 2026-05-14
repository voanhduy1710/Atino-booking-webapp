import { Link, useLocation } from 'react-router-dom'

const TABS = [
  { path: '/guide/create', label: 'Quy trình đăng ký' },
  { path: '/guide/receiving', label: 'Quy trình nhận hàng' },
]

export function GuideTabs() {
  const { pathname } = useLocation()

  return (
    <div className="border-b border-[#d5c0d5] px-6 bg-white flex items-center gap-4 h-14 shadow-sm">
      {/* Back + logo */}
      <Link to="/" className="text-[#514253] font-bold hover:text-[#bf2ef0] transition-colors text-sm flex-shrink-0">
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
            className={`px-3 py-1 text-sm font-medium rounded transition-colors whitespace-nowrap ${active
                ? 'bg-[#bf2ef0] text-white font-bold'
                : 'text-[#514253] font-bold hover:bg-[#f1ebf4] hover:text-[#bf2ef0]'
              }`}
          >
            {label}
          </Link>
        )
      })}
    </div>
  )
}
