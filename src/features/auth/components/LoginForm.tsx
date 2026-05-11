import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Input } from '@/shared/components/Input'
import { Button } from '@/shared/components/Button'
import { loginApi } from '@/features/auth/services/auth.service'
import { saveToken, decodeToken } from '@/shared/lib/auth'

const schema = z.object({
  username: z.string().min(1, 'Vui lòng nhập tên đăng nhập'),
  password: z.string().min(1, 'Vui lòng nhập mật khẩu'),
})

type FormData = z.infer<typeof schema>

const roleRouteMap: Record<string, string> = {
  supplier: '/my-bookings',
  warehouse_reviewer: '/reviewer',
  warehouse_receiver: '/receiver',
  manager: '/manager',
  admin: '/admin',
}

export function LoginForm() {
  const navigate = useNavigate()
  const [serverError, setServerError] = useState<string | null>(null)
  const [showPw, setShowPw] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  const onSubmit = async (data: FormData) => {
    setServerError(null)
    try {
      const res = await loginApi(data.username, data.password)
      saveToken(res.token)
      const decoded = decodeToken(res.token)
      const redirect = decoded ? (roleRouteMap[decoded.role] ?? '/') : '/'
      navigate(redirect, { replace: true })
    } catch (err) {
      setServerError((err as Error).message)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <Input
        label="Tên đăng nhập"
        id="login-username"
        type="text"
        autoComplete="username"
        placeholder="Nhập tên đăng nhập"
        error={errors.username?.message}
        {...register('username')}
      />

      <div className="relative">
        <Input
          label="Mật khẩu"
          id="login-password"
          type={showPw ? 'text' : 'password'}
          autoComplete="current-password"
          placeholder="Nhập mật khẩu"
          error={errors.password?.message}
          {...register('password')}
        />
        <button
          type="button"
          onClick={() => setShowPw((v) => !v)}
          className="absolute right-3 top-8 text-[#888888] hover:text-black transition-colors"
          tabIndex={-1}
          aria-label={showPw ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
        >
          {showPw ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
              <line x1="1" y1="1" x2="23" y2="23"/>
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          )}
        </button>
      </div>

      {serverError && (
        <p className="text-sm text-[#CC0000] border border-[#CC0000] rounded px-3 py-2">
          {serverError}
        </p>
      )}

      <Button
        type="submit"
        fullWidth
        loading={isSubmitting}
        id="login-submit"
      >
        Đăng nhập
      </Button>
    </form>
  )
}
