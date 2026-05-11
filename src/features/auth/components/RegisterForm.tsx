import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Input } from '@/shared/components/Input'
import { Button } from '@/shared/components/Button'
import { registerSupplierApi } from '@/features/auth/services/auth.service'

// Usernames reserved for internal staff accounts — cannot be registered by suppliers
const RESERVED_USERNAMES = ['voanhduy1710', 'lethientinh', 'lethiendung', 'lethihong']

const schema = z
  .object({
    full_name: z.string().min(2, 'Vui lòng nhập họ và tên (tối thiểu 2 ký tự)'),
    username: z
      .string()
      .min(3, 'Tên đăng nhập tối thiểu 3 ký tự')
      .max(50, 'Tên đăng nhập tối đa 50 ký tự')
      .regex(/^[a-z0-9_]+$/, 'Chỉ dùng chữ thường, số và dấu gạch dưới')
      .refine(
        (v) => !RESERVED_USERNAMES.includes(v),
        'Tên đăng nhập này không được phép sử dụng'
      ),
    password: z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự'),
    confirm_password: z.string(),
  })
  .refine((d) => d.password === d.confirm_password, {
    message: 'Mật khẩu xác nhận không khớp',
    path: ['confirm_password'],
  })

type FormData = z.infer<typeof schema>

interface Props {
  onSuccess?: () => void
}

export function RegisterForm({ onSuccess }: Props) {
  const [serverError, setServerError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  const onSubmit = async (data: FormData) => {
    setServerError(null)
    try {
      await registerSupplierApi({
        full_name: data.full_name,
        username: data.username,
        password: data.password,
      })
      setSuccess(true)
      reset()
      onSuccess?.()
    } catch (err) {
      setServerError((err as Error).message)
    }
  }

  if (success) {
    return (
      <div className="text-center py-6 space-y-3">
        <div className="text-3xl">✓</div>
        <p className="font-semibold">Đăng ký thành công!</p>
        <p className="text-sm text-[#888888]">
          Tài khoản cần được admin xác nhận trước khi sử dụng.
          <br />
          Vui lòng chờ thông báo từ Atino.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <Input
        label="Họ và tên"
        id="reg-fullname"
        type="text"
        placeholder="Nguyễn Văn A"
        required
        error={errors.full_name?.message}
        {...register('full_name')}
      />

      <Input
        label="Tên đăng nhập"
        id="reg-username"
        type="text"
        autoComplete="username"
        placeholder="vd: nguyen_van_a"
        required
        error={errors.username?.message}
        {...register('username')}
      />

      <div className="relative">
        <Input
          label="Mật khẩu"
          id="reg-password"
          type={showPw ? 'text' : 'password'}
          autoComplete="new-password"
          placeholder="Tối thiểu 6 ký tự"
          required
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

      <div className="relative">
        <Input
          label="Xác nhận mật khẩu"
          id="reg-confirm-password"
          type={showConfirm ? 'text' : 'password'}
          autoComplete="new-password"
          placeholder="Nhập lại mật khẩu"
          required
          error={errors.confirm_password?.message}
          {...register('confirm_password')}
        />
        <button
          type="button"
          onClick={() => setShowConfirm((v) => !v)}
          className="absolute right-3 top-8 text-[#888888] hover:text-black transition-colors"
          tabIndex={-1}
          aria-label={showConfirm ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
        >
          {showConfirm ? '🙈' : '👁'}
        </button>
      </div>

      {serverError && (
        <p className="text-sm text-[#CC0000] border border-[#CC0000] rounded px-3 py-2">
          {serverError}
        </p>
      )}

      <p className="text-xs text-[#888888]">
        Tài khoản cần được admin xác nhận trước khi sử dụng.
      </p>

      <Button
        type="submit"
        fullWidth
        loading={isSubmitting}
        id="register-submit"
      >
        Gửi đăng ký
      </Button>
    </form>
  )
}
