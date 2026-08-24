/** Browser settings card for the multi-provider search plugin. */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type { PropsLocale, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { en, zh, type WebSearchMultiLocaleKey } from './locales.ts'

const SETTINGS_PATH = '/web-search-multi/settings'
const LOCALE_NAMESPACE = 'web-search-multi'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Copy for the multi-provider web-search settings card. */
    'web-search-multi': WebSearchMultiLocaleKey
  }
}

type Provider = 'searxng' | 'wikipedia' | 'tavily' | 'brave' | 'gemini'

interface SearchConfig {
  provider: Provider
  requestTimeoutMs: number
  searxng: { baseURL: string; language: string; categories?: string | undefined; safeSearch: 0 | 1 | 2 }
  wikipedia: { language: string }
  tavily: { apiKeyEnv: string; searchDepth: 'basic' | 'advanced' | 'fast' | 'ultra-fast'; topic: 'general' | 'news' | 'finance' }
  gemini: { apiKeyEnv: string; model: string }
  brave: { apiKeyEnv: string; country?: string | undefined; searchLanguage?: string | undefined; safeSearch: 'off' | 'moderate' | 'strict' }
}

interface CredentialState {
  configured: boolean
  writable: boolean
}

interface SettingsSnapshot {
  config: SearchConfig
  credentials: { brave: CredentialState; tavily: CredentialState; gemini: CredentialState }
}

interface SettingsTestResult {
  provider: Provider
  resultCount: number
  durationMs: number
  firstTitle?: string | undefined
}

const card: CSSProperties = { listStyle: 'none', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 12, background: 'var(--dsw-alias-bg-layer-3)' }
const header: CSSProperties = { width: '100%', appearance: 'none', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', border: 0, borderRadius: 12, background: 'none', color: 'inherit', cursor: 'pointer', textAlign: 'left', font: 'inherit' }
const headText: CSSProperties = { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }
const name: CSSProperties = { fontSize: 15, fontWeight: 600, lineHeight: 1.4, color: 'var(--dsw-alias-label-primary)' }
const description: CSSProperties = { fontSize: 13, lineHeight: 1.5, color: 'var(--dsw-alias-label-tertiary)' }
const body: CSSProperties = { borderTop: '1px solid var(--dsw-alias-border-l2)', margin: '0 16px', paddingBottom: 8 }
const field = (first = false): CSSProperties => ({ display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 0', ...first ? {} : { borderTop: '1px solid var(--dsw-alias-border-l2)' } })
const fieldHead: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 }
const input: CSSProperties = { boxSizing: 'border-box', width: '100%', height: 34, padding: '0 12px', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, background: 'var(--dsw-alias-bg-layer-3)', color: 'var(--dsw-alias-label-primary)', font: 'inherit', fontSize: 13, lineHeight: 1.5 }
const label: CSSProperties = { flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500, lineHeight: 1.5, color: 'var(--dsw-alias-label-primary)' }
const hint: CSSProperties = { margin: 0, color: 'var(--dsw-alias-label-tertiary)', fontSize: 12, fontWeight: 400, lineHeight: 1.5 }
const footer: CSSProperties = { display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', gap: 8, padding: '12px 0 4px', borderTop: '1px solid var(--dsw-alias-border-l2)' }
const button: CSSProperties = { appearance: 'none', padding: '5px 14px', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, background: 'none', color: 'var(--dsw-alias-label-secondary)', cursor: 'pointer', font: 'inherit', fontSize: 13, lineHeight: 1.5 }
const primaryButton: CSSProperties = { ...button, background: 'var(--dsw-alias-label-primary)', color: 'var(--dsw-alias-bg-layer-3)', borderColor: 'transparent' }
const disabledButton: CSSProperties = { opacity: 0.4, cursor: 'default' }
const statusText: CSSProperties = { flex: 1, minWidth: 150, margin: 0, fontSize: 12, lineHeight: 1.5 }
const notice: CSSProperties = { margin: '12px 0 0', padding: '10px 12px', borderRadius: 8, background: 'var(--dsw-alias-bg-module-platform)', color: 'var(--dsw-alias-label-secondary)', fontSize: 12, lineHeight: 1.6 }

/** Client runtime dependencies. */
export const inject = ['slots', 'locale']

/** Register one plugin-owned card in DSH's existing plugin settings page. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(LOCALE_NAMESPACE, { zh, en }), 'web-search-multi: dictionaries')
  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    key: 'web-search-multi',
    locale: LOCALE_NAMESPACE,
  }, MultiSearchSettingsCard))
}

/** Multi-provider form backed by the plugin's same-origin Host route. */
export function MultiSearchSettingsCard({ t }: PropsLocale<typeof LOCALE_NAMESPACE>) {
  const [open, setOpen] = useState(false)
  const [snapshot, setSnapshot] = useState<SettingsSnapshot>()
  const [draft, setDraft] = useState<SearchConfig>()
  const [apiKey, setApiKey] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<SettingsTestResult>()
  const [error, setError] = useState<string>()

  const load = async () => {
    try {
      const next = await requestSettings()
      setSnapshot(next)
      setDraft(next.config)
      setApiKey('')
      setDirty(false)
      setTestResult(undefined)
      setError(undefined)
    } catch (failure: unknown) {
      setError(failure instanceof Error ? failure.message : String(failure))
    }
  }
  useEffect(() => { void load() }, [])

  const edit = (next: SearchConfig) => {
    setDraft(next)
    setDirty(true)
    setTestResult(undefined)
    setError(undefined)
  }
  const save = async () => {
    if (draft === undefined) return
    setSaving(true)
    setError(undefined)
    try {
      const next = await requestSettings({ config: draft, ...(apiKey === '' ? {} : { apiKey }) })
      setSnapshot(next)
      setDraft(next.config)
      setApiKey('')
      setDirty(false)
      setTestResult(undefined)
    } catch (failure: unknown) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setSaving(false)
    }
  }
  const test = async () => {
    if (draft === undefined) return
    setTesting(true)
    setTestResult(undefined)
    setError(undefined)
    try {
      setTestResult(await testSettings({ config: draft, ...(apiKey === '' ? {} : { apiKey }) }))
    } catch (failure: unknown) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setTesting(false)
    }
  }

  return (
    <li style={card}>
      <button type="button" style={header} aria-expanded={open} aria-label={t(open ? 'card.collapse' : 'card.expand')} onClick={() => { setOpen(value => !value) }}>
        <span style={headText}>
          <span style={name}>{t('card.name')}</span>
          <span style={description}>{t('card.description')}</span>
        </span>
        {dirty || apiKey !== '' ? <span style={{ fontSize: 12, color: '#d28b26' }}>{t('status.unsaved')}</span> : null}
        <span aria-hidden="true" style={{ transform: open ? 'rotate(180deg)' : undefined }}>⌄</span>
      </button>
      {open ? (
        <div style={body}>
          {draft === undefined ? <p role="status">{t('status.loading')}</p> : <>
            <div>
              <SelectField first label={t('field.provider')} value={draft.provider} onChange={value => { edit({ ...draft, provider: value as Provider }); setApiKey('') }}>
                <option value="searxng">{t('provider.searxng')}</option>
                <option value="wikipedia">{t('provider.wikipedia')}</option>
                <option value="tavily">{t('provider.tavily')}</option>
                <option value="brave">{t('provider.brave')}</option>
                <option value="gemini">{t('provider.gemini')}</option>
              </SelectField>
              <TextField label={t('field.timeout')} type="number" value={String(draft.requestTimeoutMs)} onChange={value => { edit({ ...draft, requestTimeoutMs: Number(value) }) }} hint={t('field.timeoutHint')} />
            </div>
            <ProviderFields t={t} draft={draft} snapshot={snapshot} apiKey={apiKey} setApiKey={(value) => { setApiKey(value); setDirty(true); setTestResult(undefined); setError(undefined) }} edit={edit} />
          </>}
          <div style={footer}>
            <button type="button" style={{ ...button, ...(saving || testing || !valid(draft) ? disabledButton : {}) }} disabled={saving || testing || !valid(draft)} onClick={() => { void test() }}>{t(testing ? 'action.testing' : 'action.test')}</button>
            {error === undefined && testResult === undefined ? <span style={statusText} /> : null}
            {error === undefined || testResult !== undefined ? null : <p role="alert" style={{ ...statusText, color: 'var(--dsw-alias-label-error)' }}>{t('status.failure')}{error}</p>}
            {testResult === undefined ? null : <p role="status" style={{ ...statusText, color: 'var(--dsw-alias-label-success, #2f9e62)' }}>{t('status.success', { count: testResult.resultCount, duration: testResult.durationMs })}{testResult.firstTitle === undefined ? '' : ` · ${testResult.firstTitle}`}</p>}
            <button type="button" style={{ ...button, ...(!dirty || saving || testing ? disabledButton : {}) }} disabled={!dirty || saving || testing} onClick={() => { if (snapshot !== undefined) { setDraft(snapshot.config); setApiKey(''); setDirty(false); setTestResult(undefined); setError(undefined) } }}>{t('action.discard')}</button>
            <button type="button" style={{ ...primaryButton, ...(!dirty || saving || testing || !valid(draft) ? disabledButton : {}) }} disabled={!dirty || saving || testing || !valid(draft)} onClick={() => { void save() }}>{t(saving ? 'action.saving' : 'action.save')}</button>
          </div>
        </div>
      ) : null}
    </li>
  )
}

function ProviderFields(props: { t: TranslateNS<typeof LOCALE_NAMESPACE>; draft: SearchConfig; snapshot?: SettingsSnapshot | undefined; apiKey: string; setApiKey: (value: string) => void; edit: (next: SearchConfig) => void }) {
  const { draft } = props
  if (draft.provider === 'searxng') return <>
    <p style={notice}><strong>{props.t('searxng.noticeTitle')}</strong><br />{props.t('searxng.noticeBody')}</p>
    <TextField label={props.t('searxng.url')} value={draft.searxng.baseURL} onChange={baseURL => { props.edit({ ...draft, searxng: { ...draft.searxng, baseURL } }) }} hint={props.t('searxng.urlHint')} />
    <TextField label={props.t('searxng.language')} value={draft.searxng.language} onChange={language => { props.edit({ ...draft, searxng: { ...draft.searxng, language } }) }} hint={props.t('searxng.languageHint')} />
    <TextField label={props.t('searxng.categories')} value={draft.searxng.categories ?? ''} onChange={categories => { props.edit({ ...draft, searxng: { ...draft.searxng, ...(categories === '' ? { categories: undefined } : { categories }) } }) }} hint={props.t('searxng.categoriesHint')} />
    <SelectField label={props.t('field.safeSearch')} value={String(draft.searxng.safeSearch)} onChange={value => { props.edit({ ...draft, searxng: { ...draft.searxng, safeSearch: Number(value) as 0 | 1 | 2 } }) }}><option value="0">{props.t('safeSearch.off')}</option><option value="1">{props.t('safeSearch.moderate')}</option><option value="2">{props.t('safeSearch.strict')}</option></SelectField>
  </>
  if (draft.provider === 'wikipedia') return <>
    <TextField label={props.t('wikipedia.language')} value={draft.wikipedia.language} onChange={language => { props.edit({ ...draft, wikipedia: { language } }) }} hint={props.t('wikipedia.languageHint')} />
  </>
  const credential = props.snapshot?.credentials[draft.provider]
  if (draft.provider === 'gemini') return <>
    <p style={notice}><strong>{props.t('gemini.noticeTitle')}</strong><br />{props.t('gemini.noticeBody')}</p>
    <PasswordField t={props.t} provider="gemini" value={props.apiKey} state={credential} onChange={props.setApiKey} />
    <TextField label={props.t('gemini.model')} value={draft.gemini.model} onChange={model => { props.edit({ ...draft, gemini: { ...draft.gemini, model } }) }} hint={props.t('gemini.modelHint')} />
  </>
  return <>
    <PasswordField t={props.t} provider={draft.provider} value={props.apiKey} state={credential} onChange={props.setApiKey} />
    {draft.provider === 'tavily' ? <>
      <SelectField label={props.t('tavily.depth')} value={draft.tavily.searchDepth} onChange={searchDepth => { props.edit({ ...draft, tavily: { ...draft.tavily, searchDepth: searchDepth as SearchConfig['tavily']['searchDepth'] } }) }}><option value="basic">Basic</option><option value="advanced">Advanced</option><option value="fast">Fast</option><option value="ultra-fast">Ultra fast</option></SelectField>
      <SelectField label={props.t('tavily.topic')} value={draft.tavily.topic} onChange={topic => { props.edit({ ...draft, tavily: { ...draft.tavily, topic: topic as SearchConfig['tavily']['topic'] } }) }}><option value="general">General</option><option value="news">News</option><option value="finance">Finance</option></SelectField>
    </> : <>
      <TextField label={props.t('brave.country')} value={draft.brave.country ?? ''} onChange={country => { props.edit({ ...draft, brave: { ...draft.brave, ...(country === '' ? { country: undefined } : { country }) } }) }} hint={props.t('brave.countryHint')} />
      <TextField label={props.t('brave.language')} value={draft.brave.searchLanguage ?? ''} onChange={searchLanguage => { props.edit({ ...draft, brave: { ...draft.brave, ...(searchLanguage === '' ? { searchLanguage: undefined } : { searchLanguage }) } }) }} hint={props.t('brave.languageHint')} />
      <SelectField label={props.t('field.safeSearch')} value={draft.brave.safeSearch} onChange={safeSearch => { props.edit({ ...draft, brave: { ...draft.brave, safeSearch: safeSearch as SearchConfig['brave']['safeSearch'] } }) }}><option value="off">{props.t('safeSearch.off')}</option><option value="moderate">{props.t('safeSearch.moderate')}</option><option value="strict">{props.t('safeSearch.strict')}</option></SelectField>
    </>}
  </>
}

function TextField(props: { label: string; value: string; onChange: (value: string) => void; hint?: string; type?: 'text' | 'number'; first?: boolean }) {
  return <label style={field(props.first)}><span style={label}>{props.label}</span><input style={input} type={props.type ?? 'text'} value={props.value} onChange={event => { props.onChange(event.target.value) }} />{props.hint === undefined ? null : <span style={hint}>{props.hint}</span>}</label>
}

function SelectField(props: { label: string; value: string; onChange: (value: string) => void; children: ReactNode; first?: boolean }) {
  return <label style={field(props.first)}><span style={label}>{props.label}</span><select style={input} value={props.value} onChange={event => { props.onChange(event.target.value) }}>{props.children}</select></label>
}

function PasswordField(props: { t: TranslateNS<typeof LOCALE_NAMESPACE>; provider: 'brave' | 'tavily' | 'gemini'; value: string; state?: CredentialState | undefined; onChange: (value: string) => void }) {
  const reference = props.provider === 'brave' ? 'BRAVE_SEARCH_API_KEY' : props.provider === 'tavily' ? 'TAVILY_API_KEY' : 'GEMINI_API_KEY'
  const configured = props.state?.configured === true
  const writable = props.state?.writable !== false
  return <label style={field()}><span style={fieldHead}><span style={label}>API Key</span><span style={{ borderRadius: 999, padding: '1px 8px', fontSize: 11, lineHeight: '17px', color: 'var(--dsw-alias-label-tertiary)' }}>{props.t(configured ? 'credential.configured' : 'credential.missing')}</span></span><input style={input} type="password" autoComplete="off" value={props.value} disabled={!writable} onChange={event => { props.onChange(event.target.value) }} /><span style={hint}>{writable ? props.t('credential.writableHint', { reference }) : props.t('credential.readonlyHint')}</span></label>
}

function valid(config: SearchConfig | undefined): boolean {
  if (config === undefined || !Number.isInteger(config.requestTimeoutMs) || config.requestTimeoutMs < 1_000 || config.requestTimeoutMs > 55_000) return false
  if (config.provider === 'searxng') {
    try {
      const url = new URL(config.searxng.baseURL)
      return (url.protocol === 'http:' || url.protocol === 'https:') && config.searxng.language.trim() !== ''
    } catch {
      return false
    }
  }
  if (config.provider === 'gemini') return /^[a-z0-9][a-z0-9._-]{0,99}$/.test(config.gemini.model)
  return config.provider !== 'wikipedia' || /^[a-z][a-z0-9-]{0,19}$/.test(config.wikipedia.language)
}

async function requestSettings(input?: { config: SearchConfig; apiKey?: string }): Promise<SettingsSnapshot> {
  return request<SettingsSnapshot>(input === undefined ? 'GET' : 'PUT', input)
}

async function testSettings(input: { config: SearchConfig; apiKey?: string }): Promise<SettingsTestResult> {
  return request<SettingsTestResult>('POST', input)
}

async function request<T>(method: 'GET' | 'POST' | 'PUT', input?: { config: SearchConfig; apiKey?: string }): Promise<T> {
  const response = await fetch(SETTINGS_PATH, input === undefined ? { method } : {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  const value = await response.json() as T | { error?: unknown }
  if (!response.ok) {
    const message = typeof value === 'object' && value !== null && 'error' in value && typeof value.error === 'string'
      ? value.error
      : `HTTP ${String(response.status)}`
    throw new Error(message)
  }
  return value as T
}
