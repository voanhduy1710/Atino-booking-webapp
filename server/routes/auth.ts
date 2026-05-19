import { Router } from 'express'
import { getSupabase } from '../lib/supabase.js'

const router = Router()

interface StaffUser {
  username: string
  password_hash: string
  role: string
  allowedRoutes?: string[]
}

function getStaffUsers(): StaffUser[] {
  const raw = process.env.STAFF_USERS ?? process.env.VITE_STAFF_USERS
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as StaffUser[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

router.post('/login', async (req, res, next) => {
  try {
    const username = String(req.body?.username ?? '').trim()
    const passwordHash = String(req.body?.password_hash ?? '').trim()
    if (!username || !passwordHash) {
      res.status(400).json({ error: 'Vui lòng nhập tên đăng nhập và mật khẩu' })
      return
    }

    const staffUser = getStaffUsers().find((user) => user.username === username)
    if (staffUser) {
      if (staffUser.password_hash !== passwordHash) {
        res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' })
        return
      }
      res.json({
        session: {
          username: staffUser.username,
          role: staffUser.role,
          allowedRoutes: staffUser.allowedRoutes ?? [],
        },
        role: staffUser.role,
      })
      return
    }

    const supabase = getSupabase()
    const { data, error } = await supabase.rpc('login_supplier', {
      p_username: username,
      p_password_hash: passwordHash,
    } as never)
    if (error) throw error
    if (!data) {
      res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' })
      return
    }

    const account = data as { id: string; username: string; status: string; supplier_id: string | null }
    if (account.status === 'pending') {
      res.status(403).json({ error: 'Tài khoản đang chờ admin xác nhận' })
      return
    }
    if (account.status === 'rejected') {
      res.status(403).json({ error: 'Tài khoản đã bị từ chối' })
      return
    }

    res.json({
      session: {
        username: account.username,
        role: 'supplier',
        supplier_id: account.supplier_id ?? undefined,
        supplier_account_id: account.id,
      },
      role: 'supplier',
    })
  } catch (err) {
    next(err)
  }
})

router.post('/register-supplier', async (req, res, next) => {
  try {
    const fullName = String(req.body?.full_name ?? '').trim()
    const username = String(req.body?.username ?? '').trim()
    const passwordHash = String(req.body?.password_hash ?? '').trim()
    const password = String(req.body?.password ?? '').trim()
    if (!fullName || !username || !passwordHash || !password) {
      res.status(400).json({ error: 'Vui lòng điền đầy đủ thông tin' })
      return
    }

    const supabase = getSupabase()
    const { data, error } = await supabase.rpc('register_supplier', {
      p_username: username,
      p_password_hash: passwordHash,
      p_full_name: fullName,
      p_password: password,
    } as never)
    if (error) throw error

    const result = data as { error?: string; success?: boolean } | null
    if (result?.error) {
      const map: Record<string, string> = {
        'Ten dang nhap da ton tai': 'Tên đăng nhập đã tồn tại',
        'Vui long dien day du thong tin': 'Vui lòng điền đầy đủ thông tin',
        'Loi he thong': 'Lỗi hệ thống, vui lòng thử lại',
      }
      res.status(400).json({ error: map[result.error] ?? result.error })
      return
    }

    res.json({ message: 'Đăng ký thành công. Vui lòng chờ admin xác nhận.' })
  } catch (err) {
    next(err)
  }
})

export default router
