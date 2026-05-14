import { Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { LoadingSpinner } from '@/shared/components/LoadingSpinner'
import { RequireRole } from '@/features/auth/guard/RequireRole'
import { ROUTE_PERMISSIONS } from '@/shared/config/permissions'

const LandingPage        = lazy(() => import('@/features/home/LandingPage'))
const GuidePage          = lazy(() => import('@/features/home/GuidePage'))
const GuideCreate        = lazy(() => import('@/features/home/GuideCreate'))
const GuideReceiving     = lazy(() => import('@/features/home/GuideReceiving'))
const LoginPage          = lazy(() => import('@/features/auth/index'))
const BookingPage        = lazy(() => import('@/features/booking/index'))
const BookingConfirmationPage = lazy(() => import('@/features/booking/components/BookingConfirmation'))
const BookingDetailPublic = lazy(() => import('@/features/booking/components/BookingDetailPublic'))
const MyBookingsPage     = lazy(() => import('@/features/booking/MyBookings'))
const ReviewerPage       = lazy(() => import('@/features/warehouse/ReviewerPage'))
const WarehousesPage     = lazy(() => import('@/features/warehouse/WarehousesPage'))
const SuppliersPage      = lazy(() => import('@/features/supplier/SuppliersPage'))
const AccountsPage       = lazy(() => import('@/features/auth/AccountsPage'))
const ReportPage         = lazy(() => import('@/features/admin/ReportPage'))
const ViewAsPage         = lazy(() => import('@/features/admin/ViewAsPage'))
const ProductProcessPage = lazy(() => import('@/features/productProcess/ProductProcessPage'))

const Fallback = () => (
  <div className="min-h-screen flex items-center justify-center">
    <LoadingSpinner />
  </div>
)

function Guard({ path, children }: { path: string; children: React.ReactNode }) {
  const roles = ROUTE_PERMISSIONS[path] ?? []
  return <RequireRole roles={roles}>{children}</RequireRole>
}

export function AppRoutes() {
  return (
    <Suspense fallback={<Fallback />}>
      <Routes>
        {/* Public */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/guide" element={<GuidePage />} />
        <Route path="/guide/create" element={<GuideCreate />} />
        <Route path="/guide/receiving" element={<GuideReceiving />} />
        <Route path="/booking/:token" element={<BookingDetailPublic />} />

        {/* Supplier */}
        <Route path="/booking/new" element={
          <Guard path="/booking/new"><BookingPage /></Guard>
        } />
        <Route path="/booking/:token/confirmation" element={
          <Guard path="/booking/new"><BookingConfirmationPage /></Guard>
        } />
        <Route path="/my-bookings" element={
          <Guard path="/my-bookings"><MyBookingsPage /></Guard>
        } />

        {/* Staff & management — flat routes */}
        <Route path="/reviewbooking" element={
          <Guard path="/reviewbooking"><ReviewerPage /></Guard>
        } />
        <Route path="/report" element={
          <Guard path="/report"><ReportPage /></Guard>
        } />
        <Route path="/warehouses" element={
          <Guard path="/warehouses"><WarehousesPage /></Guard>
        } />
        <Route path="/suppliers" element={
          <Guard path="/suppliers"><SuppliersPage /></Guard>
        } />
        <Route path="/accounts" element={
          <Guard path="/accounts"><AccountsPage /></Guard>
        } />
        <Route path="/viewas" element={
          <Guard path="/viewas"><ViewAsPage /></Guard>
        } />
        <Route path="/product-process" element={
          <Guard path="/product-process"><ProductProcessPage /></Guard>
        } />

        {/* Legacy redirects */}
        <Route path="/reviewer" element={<Navigate to="/reviewbooking" replace />} />
        <Route path="/manager" element={<Navigate to="/reviewbooking" replace />} />
        <Route path="/manager/*" element={<Navigate to="/reviewbooking" replace />} />
        <Route path="/admin" element={<Navigate to="/accounts" replace />} />
        <Route path="/admin/*" element={<Navigate to="/accounts" replace />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
