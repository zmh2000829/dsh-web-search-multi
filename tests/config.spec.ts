import { describe, expect, it } from 'vitest'
import { createBackend } from '../src/index.ts'

describe('createBackend', () => {
  it('selects each configured backend', () => {
    const noEnvironment = () => undefined
    const noCredential = async () => undefined
    expect(createBackend({ provider: 'searxng', searxng: { baseURL: 'http://127.0.0.1:8080' } }, noEnvironment, noCredential).kind).toBe('searxng')
    expect(createBackend({ provider: 'brave' }, noEnvironment, noCredential).kind).toBe('brave')
    expect(createBackend({ provider: 'tavily' }, noEnvironment, noCredential).kind).toBe('tavily')
    expect(createBackend({ provider: 'gemini' }, noEnvironment, noCredential).kind).toBe('gemini')
    expect(createBackend({ provider: 'wikipedia', wikipedia: { language: 'zh' } }, noEnvironment, noCredential).kind).toBe('wikipedia')
  })

  it('uses keyless Wikipedia for an unconfigured first run', () => {
    expect(createBackend({}, () => undefined, async () => undefined).kind).toBe('wikipedia')
  })

  it('rejects unusable endpoints, credential references, and timeouts', () => {
    const noEnvironment = () => undefined
    const noCredential = async () => undefined
    expect(() => createBackend({ provider: 'searxng', searxng: { baseURL: 'file:///tmp/search' } }, noEnvironment, noCredential)).toThrow('absolute HTTP(S) URL')
    expect(() => createBackend({ provider: 'brave', brave: { apiKeyEnv: 'bad-name' } }, noEnvironment, noCredential)).toThrow('valid DSH credential reference')
    expect(() => createBackend({ provider: 'wikipedia', wikipedia: { language: '../en' } }, noEnvironment, noCredential)).toThrow('language subdomain')
    expect(() => createBackend({ provider: 'gemini', gemini: { model: '../gemini' } }, noEnvironment, noCredential)).toThrow('model id')
    expect(() => createBackend({ provider: 'wikipedia', requestTimeoutMs: 999 }, noEnvironment, noCredential)).toThrow('requestTimeoutMs')
  })
})
