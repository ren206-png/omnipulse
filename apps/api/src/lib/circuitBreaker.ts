/**
 * Simple circuit breaker for external API calls.
 *
 * States: CLOSED (normal) → OPEN (failing) → HALF_OPEN (testing recovery)
 *
 * Usage:
 *   const breaker = new CircuitBreaker('x-api', { failureThreshold: 5, timeout: 60_000 })
 *   const result = await breaker.call(() => fetch('https://api.twitter.com/...'))
 */
import { logger } from './logger.js'

type BreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN'

export interface CircuitBreakerOptions {
  /** Number of consecutive failures before opening the circuit. Default: 5 */
  failureThreshold?: number
  /** Ms to wait in OPEN state before trying HALF_OPEN. Default: 60_000 */
  timeout?: number
  /** Name used in log messages */
  name: string
}

export class CircuitBreakerOpenError extends Error {
  constructor(name: string) {
    super(`Circuit breaker '${name}' is OPEN — call refused`)
    this.name = 'CircuitBreakerOpenError'
  }
}

export class CircuitBreaker {
  private state: BreakerState = 'CLOSED'
  private failures = 0
  private nextAttemptAt = 0
  private readonly name: string
  private readonly failureThreshold: number
  private readonly timeout: number

  constructor(opts: CircuitBreakerOptions) {
    this.name = opts.name
    this.failureThreshold = opts.failureThreshold ?? 5
    this.timeout = opts.timeout ?? 60_000
  }

  get isOpen(): boolean { return this.state === 'OPEN' }
  get isClosed(): boolean { return this.state === 'CLOSED' }

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttemptAt) {
        throw new CircuitBreakerOpenError(this.name)
      }
      // Transition to HALF_OPEN — allow one probe call
      this.state = 'HALF_OPEN'
      logger.info({ breaker: this.name }, '[CircuitBreaker] Transitioning to HALF_OPEN — probing')
    }

    try {
      const result = await fn()
      this.onSuccess()
      return result
    } catch (err) {
      this.onFailure(err)
      throw err
    }
  }

  private onSuccess(): void {
    if (this.state !== 'CLOSED') {
      logger.info({ breaker: this.name, previousState: this.state }, '[CircuitBreaker] Recovered — CLOSED')
    }
    this.failures = 0
    this.state = 'CLOSED'
  }

  private onFailure(err: unknown): void {
    this.failures++
    if (this.state === 'HALF_OPEN' || this.failures >= this.failureThreshold) {
      this.state = 'OPEN'
      this.nextAttemptAt = Date.now() + this.timeout
      logger.error(
        { breaker: this.name, failures: this.failures, nextAttemptAt: new Date(this.nextAttemptAt).toISOString(), err },
        '[CircuitBreaker] OPEN — too many failures',
      )
    } else {
      logger.warn(
        { breaker: this.name, failures: this.failures, threshold: this.failureThreshold },
        '[CircuitBreaker] Failure recorded',
      )
    }
  }

  /** Force-reset the breaker (useful for testing or manual operator action) */
  reset(): void {
    this.state = 'CLOSED'
    this.failures = 0
    this.nextAttemptAt = 0
    logger.info({ breaker: this.name }, '[CircuitBreaker] Manually reset to CLOSED')
  }

  toJSON() {
    return {
      name: this.name,
      state: this.state,
      failures: this.failures,
      nextAttemptAt: this.state === 'OPEN' ? new Date(this.nextAttemptAt).toISOString() : null,
    }
  }
}

// ── Registry: one breaker per external service ────────────────────────────────
// Centralised so the health endpoint and monitoring worker can inspect them all.

const registry = new Map<string, CircuitBreaker>()

export function getBreaker(name: string, opts?: Partial<CircuitBreakerOptions>): CircuitBreaker {
  if (!registry.has(name)) {
    registry.set(name, new CircuitBreaker({ name, ...opts }))
  }
  return registry.get(name)!
}

export function getAllBreakers(): CircuitBreaker[] {
  return [...registry.values()]
}
