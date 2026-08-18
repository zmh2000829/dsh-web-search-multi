import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchJson } from '../src/http.ts'

afterEach(() => vi.unstubAllGlobals())

describe('fetchJson', () => {
  it('reports the caller cancellation as WEB_ABORTED', async () => {
    vi.stubGlobal('fetch', abortingFetch())
    const controller = new AbortController()
    const pending = fetchJson('Test', 'https://example.com', { method: 'GET' }, { signal: controller.signal })
    controller.abort()
    await expect(pending).rejects.toMatchObject({ code: 'WEB_ABORTED' })
  })

  it('ends a stalled request at the configured internal timeout', async () => {
    vi.stubGlobal('fetch', abortingFetch())
    await expect(fetchJson('Test', 'https://example.com', { method: 'GET' }, { timeoutMs: 5 }))
      .rejects.toThrow('timed out after 5ms')
  })
})

function abortingFetch(): typeof fetch {
  return vi.fn(async (_input: string | URL | Request, init?: RequestInit) => await new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
  }))
}
