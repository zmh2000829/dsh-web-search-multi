/** Per-conversation web_search availability backed by DSH settings. */

import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SettingsScope } from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-system-prompt'
import z from '@deepseek-ai/schemastery'

/** Settings namespace for conversation-specific search choices. */
export const SEARCH_TOGGLE_NAMESPACE = 'web-search-multi-conversations'

/** Only explicit disabled entries override the default-on behavior. */
export interface SearchToggleSettings {
  disabledSessions: Record<string, boolean>
}

/** Persisted toggle settings schema. */
export const SearchToggleSettings: z<SearchToggleSettings> = z.object({
  disabledSessions: z.dict(z.boolean()).default({}),
})

interface Restriction {
  agent: Agent
  dispose: () => void
}

/** Keep live agent tool views aligned with each session's persisted choice. */
export class SearchToggle {
  private readonly restrictions = new Map<string, Restriction>()

  constructor(private readonly settings: SettingsScope<SearchToggleSettings>) {}

  /** Whether one conversation may use web_search. */
  enabled(sessionId: string): boolean {
    return this.settings.get().disabledSessions[sessionId] !== true
  }

  /** Persist one choice before exposing it to the browser. */
  async set(sessionId: string, enabled: boolean, agent?: Agent): Promise<boolean> {
    await this.settings.update({ disabledSessions: { [sessionId]: !enabled } })
    if (agent !== undefined) this.sync(agent)
    return this.enabled(sessionId)
  }

  /** Apply or lift the search restriction for one live agent. */
  sync(agent: Agent): void {
    const old = this.restrictions.get(agent.id)
    if (old !== undefined && (old.agent !== agent || this.enabled(agent.id))) {
      old.dispose()
      this.restrictions.delete(agent.id)
    }
    if (!this.enabled(agent.id) && !this.restrictions.has(agent.id)) {
      const disposeTools = agent.ctx.tools.restrict({ deny: ['web_search'] })
      let disposePrompt: () => void
      try {
        disposePrompt = agent.ctx.on('system-prompt/assemble', async (_assembly, _context, next) => {
          const assembled = await next()
          return {
            ...assembled,
            sections: assembled.sections.filter(section => section.name !== 'tool:web_search'),
          }
        })
      } catch (error: unknown) {
        disposeTools()
        throw error
      }
      this.restrictions.set(agent.id, {
        agent,
        dispose: () => { disposePrompt(); disposeTools() },
      })
    }
  }

  /** Release the exact agent's restriction without touching a replacement. */
  detach(agent: Agent): void {
    const old = this.restrictions.get(agent.id)
    if (old?.agent !== agent) return
    old.dispose()
    this.restrictions.delete(agent.id)
  }

  /** Release every restriction when the plugin unloads. */
  dispose(): void {
    for (const { dispose } of this.restrictions.values()) dispose()
    this.restrictions.clear()
  }
}
