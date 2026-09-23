import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { db } from '@/lib/db'

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || 'digitide-taskflow-secret-key-2024-zai'
)
const COOKIE_NAME = 'taskflow_session'
const MAX_AGE = 60 * 60 * 24 * 7 // 7 days

export interface SessionUser {
  id: string
  employeeCode: string
  name: string
  email: string
  process: string
  designation: string
  role: string
  isFirstLogin: boolean
  managerName: string | null
  managerEmail: string | null
}

/** Create a signed session token for a user id */
export async function createSessionToken(userId: string): Promise<string> {
  return new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(SECRET)
}

/** Set the session cookie (server action / route handler context) */
export async function setSessionCookie(userId: string) {
  const token = await createSessionToken(userId)
  const store = await cookies()
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    path: '/',
    maxAge: MAX_AGE,
  })
}

export async function clearSessionCookie() {
  const store = await cookies()
  store.set(COOKIE_NAME, '', { httpOnly: true, path: '/', maxAge: 0 })
}

/** Get the currently authenticated user (full profile) or null */
export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const store = await cookies()
    const token = store.get(COOKIE_NAME)?.value
    if (!token) return null
    const { payload } = await jwtVerify(token, SECRET)
    const uid = payload.uid as string
    if (!uid) return null
    const user = await db.user.findUnique({ where: { id: uid } })
    if (!user || !user.isActive) return null
    return {
      id: user.id,
      employeeCode: user.employeeCode,
      name: user.name,
      email: user.email,
      process: user.process,
      designation: user.designation,
      role: user.role,
      isFirstLogin: user.isFirstLogin,
      managerName: user.managerName,
      managerEmail: user.managerEmail,
    }
  } catch {
    return null
  }
}

/** Validate password policy: min 8, upper, lower, number, special */
export function validatePassword(pw: string): string | null {
  if (!pw || pw.length < 8) return 'Password must be at least 8 characters long'
  if (!/[A-Z]/.test(pw)) return 'Password must contain at least one uppercase letter'
  if (!/[a-z]/.test(pw)) return 'Password must contain at least one lowercase letter'
  if (!/[0-9]/.test(pw)) return 'Password must contain at least one number'
  if (!/[^A-Za-z0-9]/.test(pw)) return 'Password must contain at least one special character'
  return null
}
