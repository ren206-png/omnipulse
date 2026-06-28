export enum Platform {
  FACEBOOK = 'FACEBOOK',
  INSTAGRAM = 'INSTAGRAM',
  TIKTOK = 'TIKTOK',
  X = 'X',
  GOOGLE = 'GOOGLE',
}

export enum Role {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
}

export enum PostStatus {
  DRAFT = 'DRAFT',
  SCHEDULED = 'SCHEDULED',
  PUBLISHED = 'PUBLISHED',
  FAILED = 'FAILED',
}

export interface ApiError {
  error: string
  code: string
  statusCode: number
}

export interface AuthUser {
  id: string
  email: string
  role: Role
}

export interface JwtPayload {
  id: string
  email: string
  role: Role
}
