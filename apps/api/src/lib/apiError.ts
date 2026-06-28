import type { Response } from 'express'

export interface ApiErrorBody {
  error: string
  code: string
  statusCode: number
}

export function sendError(
  res: Response,
  statusCode: number,
  code: string,
  error: string,
): void {
  const body: ApiErrorBody = { error, code, statusCode }
  res.status(statusCode).json(body)
}

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'AppError'
  }
}
