import type { NextFunction, Request, Response } from 'express'
import { verifyJWT, type JWTPayload } from './jwt.js'
import { isSessionActive } from './sessionStore.js'
import type { AppRole } from '../config/capabilities.js'

export interface AuthedRequest extends Request {
  user: JWTPayload
}

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) return null
  return header.slice('Bearer '.length).trim()
}

function cookieToken(req: Request): string | null {
  const cookieHeader = req.headers.cookie
  if (!cookieHeader) return null
  for (const cookie of cookieHeader.split(';')) {
    const [name, ...valueParts] = cookie.trim().split('=')
    if (name === 'atino_session') return decodeURIComponent(valueParts.join('='))
  }
  return null
}

export function authenticatedUser(req: Request): JWTPayload | null {
  const token = bearerToken(req) ?? cookieToken(req)
  return token ? verifyJWT(token) : null
}

export function requireAuth(roles?: AppRole[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = authenticatedUser(req)
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    try {
      if (!await isSessionActive(user)) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }
    } catch (error) {
      next(error)
      return
    }
    if (roles && !roles.includes(user.role)) {
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
