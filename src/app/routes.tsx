import { Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { LoadingSpinner } from '@/shared/components/LoadingSpinner'
import { RequireRole } from '@/features/auth/guard/RequireRole'

const LandingPage = lazy(() => import('@/features/home/LandingPage'))
const GuidePage = lazy(() => import('@/features/home/GuidePage'))
const GuideCreate = lazy(() => import('@/features/home/GuideCreate'))
const GuideReceiving = lazy(() => import('@/features/home/GuideReceiving'))
const LoginPage = lazy(() => import('@/features/auth/index'))
const BookingPage = lazy(() => import('@/features/booking/index'))
const BookingConfirmationPage = lazy(() => import('@/features/booking/components/BookingConfirmation'))
const BookingDetailPublic = lazy(() => import('@/features/booking/components/BookingDetailPublic'))
const MyBookingsPage = lazy(() => import('@/features/booking/MyBookings'))
const ReviewerPage = lazy(() => import('@/features/warehouse/reviewer/index'))
const ReceiverPage = lazy(() => import('@/features/warehouse/receiver/index'))
const ManagerPage = lazy(() => import('@/features/manager/index'))
const AdminPage = lazy(() => import('@/features/admin/index'))

const Fallback = () => (
  <div className="min-h-screen flex items-center justify-center">
    <LoadingSpinner />
  </div>
)

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
        <Route
          path="/booking/new"
          element={
            <RequireRole roles={['supplier']}>
              <BookingPage />
            </RequireRole>
          }
        />
        <Route
          path="/booking/:token/confirmation"
          element={
            <RequireRole roles={['supplier']}>
              <BookingConfirmationPage />
            </RequireRole>
          }
        />
        <Route
          path="/my-bookings"
          element={
            <RequireRole roles={['supplier']}>
              <MyBookingsPage />
            </RequireRole>
          }
        />

        {/* Staff — Reviewer */}
        <Route
          path="/reviewer"
          element={
            <RequireRole roles={['warehouse_reviewer', 'warehouse_receiver', 'admin']}>
              <ReviewerPage />
            </RequireRole>
          }
        />
        <Route
          path="/receiver"
          element={
            <RequireRole roles={['warehouse_receiver', 'admin']}>
              <ReceiverPage />
            </RequireRole>
          }
        />

        {/* Manager — default redirect + sub-paths */}
        <Route path="/manager" element={<Navigate to="/manager/reviewer" replace />} />
        <Route
          path="/manager/:tab"
          element={
            <RequireRole roles={['manager', 'admin']}>
              <ManagerPage />
            </RequireRole>
          }
        />

        {/* Admin — default redirect + sub-paths */}
        <Route path="/admin" element={<Navigate to="/admin/accounts" replace />} />
        <Route
          path="/admin/:tab"
          element={
            <RequireRole roles={['admin', 'manager']}>
              <AdminPage />
            </RequireRole>
          }
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
