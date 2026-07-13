import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// RFC 5322-inspired structural check: local@domain.tld, no consecutive dots, length limits
export function isValidEmail(email: string): boolean {
  if (typeof email !== 'string') return false
  if (email.length > 254) return false
  const re = /^[^\s@"(),:<>[\]]+@[^\s@]+\.[^\s@]{2,}$/
  if (!re.test(email)) return false
  const [local, domain] = email.split('@')
  return local.length <= 64 && !email.includes('..')
}
