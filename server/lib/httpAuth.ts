import type { NextFunction, Request, Response } from 'express'
import { verifyJWT, type JWTPayload } from './jwt.js'

export type StaffRole = 'admin' | 'warehouse_reviewer' | 'warehouse_receiver' | 'manager'
export type AppRole = StaffRole | 'supplier'

export interface AuthedRequest extends Request {
  user: JWTPayload
}

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) return null
  return header.slice('Bearer '.length).trim()
}

export function requireAuth(roles?: AppRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const token = bearerToken(req)
    const user = token ? verifyJWT(token) : null
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    if (roles && !roles.includes(user.role as AppRole)) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }
    ;(req as AuthedRequest).user = user
    next()
  }
}

export function usernameOf(user: JWTPayload): string {
  return user.username ?? user.sub ?? ''
}
