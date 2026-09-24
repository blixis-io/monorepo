import {
  ConflictError,
  InfrastructureError,
  NotFoundError,
  type TransactionScope,
} from '@blixis/contracts'
import { DrizzleQueryError } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import type { Database } from './create-database.ts'
import {
  fromTransactionScope,
  type Transaction,
  toTransactionScope,
  withRetryableTransaction,
  withTransaction,
} from './transactions.ts'

/** Fake Drizzle database: records transaction configs and outcomes; `tx` is a plain object. */
function fakeDb(failures: unknown[] = []) {
  const log: { config: unknown; outcome: 'commit' | 'rollback' }[] = []
  const db = {
    async transaction(fn: (tx: Transaction) => Promise<unknown>, config: unknown) {
      const tx = { id: log.length } as unknown as Transaction
      const failure = failures.shift()
      try {
        const result = await fn(tx)
        if (failure !== undefined) throw failure
        log.push({ config, outcome: 'commit' })
        return result
      } catch (error) {
        log.push({ config, outcome: 'rollback' })
        throw error
      }
    },
  } as unknown as Database
  return { db, log }
}

const pgError = (code: string) =>
  new DrizzleQueryError('update ...', ['secret'], Object.assign(new Error(`pg ${code}`), { code }))

describe('withTransaction', () => {
  it('commits and returns the result with read committed by default', async () => {
    const { db, log } = fakeDb()
    expect(await withTransaction(db, async () => 42)).toBe(42)
    expect(log).toEqual([{ config: { isolationLevel: 'read committed' }, outcome: 'commit' }])
  })

  it('passes isolation level and access mode', async () => {
    const { db, log } = fakeDb()
    await withTransaction(db, async () => 1, {
      isolationLevel: 'serializable',
      accessMode: 'read only',
    })
    expect(log[0]?.config).toEqual({ isolationLevel: 'serializable', accessMode: 'read only' })
  })

  it('rolls back and rethrows application errors unchanged', async () => {
    const { db, log } = fakeDb()
    const notFound = new NotFoundError('missing')
    const plain = new TypeError('bug in domain code')
    await expect(withTransaction(db, () => Promise.reject(notFound))).rejects.toBe(notFound)
    await expect(withTransaction(db, () => Promise.reject(plain))).rejects.toBe(plain)
    expect(log.map((l) => l.outcome)).toEqual(['rollback', 'rollback'])
  })

  it('translates driver errors without leaking query params', async () => {
    const { db } = fakeDb()
    const error = await withTransaction(db, () => Promise.reject(pgError('23505'))).catch((e) => e)
    expect(error).toBeInstanceOf(ConflictError)
    expect(JSON.stringify([error.message, String(error.cause)])).not.toContain('secret')
  })
})

describe('withRetryableTransaction', () => {
  it('reruns after serialisation failures and deadlocks, then succeeds', async () => {
    const { db, log } = fakeDb([pgError('40001'), pgError('40P01')])
    let runs = 0
    expect(await withRetryableTransaction(db, async () => ++runs)).toBe(3)
    expect(log.map((l) => l.outcome)).toEqual(['rollback', 'rollback', 'commit'])
    expect(log[0]?.config).toEqual({ isolationLevel: 'serializable' })
  })

  it('gives up after the attempt limit with a retryable InfrastructureError', async () => {
    const { db, log } = fakeDb([pgError('40001'), pgError('40001')])
    const error = await withRetryableTransaction(db, async () => 1, { attempts: 2 }).catch((e) => e)
    expect(error).toBeInstanceOf(InfrastructureError)
    expect(error.retryable).toBe(true)
    expect(log).toHaveLength(2)
  })

  it('never retries lost connections or other errors', async () => {
    const lost = fakeDb([pgError('08006')])
    await expect(withRetryableTransaction(lost.db, async () => 1)).rejects.toBeInstanceOf(
      InfrastructureError,
    )
    expect(lost.log).toHaveLength(1)
    const unique = fakeDb([pgError('23505')])
    await expect(withRetryableTransaction(unique.db, async () => 1)).rejects.toBeInstanceOf(
      ConflictError,
    )
    expect(unique.log).toHaveLength(1)
  })
})

describe('TransactionScope bridge', () => {
  it('round-trips inside the transaction and returns a stable handle', async () => {
    const { db } = fakeDb()
    await withTransaction(db, async (tx) => {
      const scope = toTransactionScope(tx)
      expect(toTransactionScope(tx)).toBe(scope)
      expect(fromTransactionScope(scope)).toBe(tx)
    })
  })

  it('rejects forged handles and handles of ended transactions', async () => {
    expect(() => fromTransactionScope({} as TransactionScope)).toThrowError(
      /Unknown transaction scope/,
    )
    const { db } = fakeDb()
    const scope = await withTransaction(db, async (tx) => toTransactionScope(tx))
    expect(() => fromTransactionScope(scope)).toThrowError(/after its transaction ended/)
  })
})
