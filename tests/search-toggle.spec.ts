import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { createScope } from '@deepseek-ai/dsh-scope'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { SettingsScope } from '@deepseek-ai/dsh-settings'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import type { PromptAssembly } from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { describe, expect, it, vi } from 'vitest'
import { SearchToggle, type SearchToggleSettings } from '../src/search-toggle.ts'

function setup() {
  let stored: SearchToggleSettings = { disabledSessions: {} }
  const settings = {
    get: () => stored,
    update: vi.fn(async (patch: SearchToggleSettings) => {
      stored = { disabledSessions: { ...stored.disabledSessions, ...patch.disabledSessions } }
    }),
  } as unknown as SettingsScope<SearchToggleSettings>
  return { settings, stored: () => stored }
}

function agent(id: string) {
  const disposeTools = vi.fn()
  const disposePrompt = vi.fn()
  let promptListener: ((assembly: PromptAssembly, context: object, next: () => Promise<PromptAssembly>) => Promise<PromptAssembly>) | undefined
  const restrict = vi.fn(() => disposeTools)
  const on = vi.fn((_name: string, listener: typeof promptListener) => {
    promptListener = listener
    return disposePrompt
  })
  return {
    value: { id, ctx: { tools: { restrict }, on } } as unknown as Agent,
    restrict, disposeTools, disposePrompt,
    promptListener: () => promptListener,
  }
}

describe('per-conversation search toggle', () => {
  it('defaults on, masks only the disabled agent, and restores its tools', async () => {
    const { settings, stored } = setup()
    const toggle = new SearchToggle(settings)
    const first = agent('session-first')
    const second = agent('session-second')
    expect(toggle.enabled(first.value.id)).toBe(true)
    toggle.sync(first.value)
    expect(first.restrict).not.toHaveBeenCalled()

    expect(await toggle.set(first.value.id, false, first.value)).toBe(false)
    expect(stored().disabledSessions).toEqual({ 'session-first': true })
    expect(first.restrict).toHaveBeenCalledWith({ deny: ['web_search'] })
    toggle.sync(second.value)
    expect(second.restrict).not.toHaveBeenCalled()

    const assembled = {
      sections: [{ name: 'tool:web_search', text: 'Use web_search' }, { name: 'persona', text: 'Agent' }],
      contexts: [], tools: [], variables: {},
    } satisfies PromptAssembly
    const filtered = await first.promptListener()?.(assembled, {}, async () => assembled)
    expect(filtered?.sections).toEqual([{ name: 'persona', text: 'Agent' }])

    expect(await toggle.set(first.value.id, true, first.value)).toBe(true)
    expect(first.disposeTools).toHaveBeenCalledOnce()
    expect(first.disposePrompt).toHaveBeenCalledOnce()
    expect(toggle.enabled(second.value.id)).toBe(true)
  })

  it('restores a disabled choice after a new runtime attaches', async () => {
    const { settings } = setup()
    await new SearchToggle(settings).set('session-persisted', false)
    const restarted = new SearchToggle(settings)
    const resumed = agent('session-persisted')
    restarted.sync(resumed.value)
    expect(resumed.restrict).toHaveBeenCalledOnce()
    restarted.detach(resumed.value)
    expect(resumed.disposeTools).toHaveBeenCalledOnce()
    expect(resumed.disposePrompt).toHaveBeenCalledOnce()
  })

  it('hides web_search from the real scoped tool and prompt registries', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt, {})
    await ctx.plugin(ToolRuntime)
    const key = { id: SessionId('session-real') } as Agent
    let scoped: ReturnType<typeof createScope> | undefined
    await ctx.plugin(Object.assign((inner: Context) => { scoped = createScope(inner, key) }, {
      inject: ['tools', 'systemPrompt'],
    }))
    if (scoped === undefined) throw new Error('agent scope was not created')
    Object.assign(key, { ctx: scoped.ctx })
    ctx.tools.register({
      name: 'web_search', description: 'Search', parameters: { type: 'object', properties: {} },
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value as string }] },
      execute: () => Promise.resolve('searched'),
    })
    ctx.systemPrompt.section({ name: 'tool:web_search', order: 110, text: 'Use web_search' })
    const { settings } = setup()
    const toggle = new SearchToggle(settings)
    await toggle.set(key.id, false, key)
    expect(ctx.tools.schemas(key).some(tool => tool.name === 'web_search')).toBe(false)
    const assembly = await ctx.systemPrompt.assemble({ scope: key })
    expect(assembly.sections.some(section => section.name === 'tool:web_search')).toBe(false)
    const result = await ctx.tools.execute({
      callId: ToolCallId('call-one'), name: 'web_search', arguments: {},
      signal: new AbortController().signal, agent: key,
    })
    expect(result.isError).toBe(true)
    await toggle.set(key.id, true, key)
    expect(ctx.tools.schemas(key).some(tool => tool.name === 'web_search')).toBe(true)
    expect((await ctx.systemPrompt.assemble({ scope: key })).sections.some(section => section.name === 'tool:web_search')).toBe(true)
    toggle.dispose()
  })
})
