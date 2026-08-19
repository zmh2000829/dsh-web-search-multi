/** Browser settings card for the multi-provider search plugin. */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'

const SETTINGS_PATH = '/web-search-multi/settings'

type Provider = 'searxng' | 'wikipedia' | 'tavily' | 'brave'

interface SearchConfig {
  provider: Provider
  requestTimeoutMs: number
  searxng: { baseURL: string; language: string; categories?: string | undefined; safeSearch: 0 | 1 | 2 }
  wikipedia: { language: string }
  tavily: { apiKeyEnv: string; searchDepth: 'basic' | 'advanced' | 'fast' | 'ultra-fast'; topic: 'general' | 'news' | 'finance' }
  brave: { apiKeyEnv: string; country?: string | undefined; searchLanguage?: string | undefined; safeSearch: 'off' | 'moderate' | 'strict' }
}

interface CredentialState {
  configured: boolean
  writable: boolean
}

interface SettingsSnapshot {
  config: SearchConfig
  credentials: { brave: CredentialState; tavily: CredentialState }
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
export const inject = ['slots']

/** Register one plugin-owned card in DSH's existing plugin settings page. */
export function apply(ctx: ClientContext): void {
  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    // DSH currently exposes a fixed Host namespace directory to external
    // cards. This unused card key is only a render anchor; all reads and
    // writes still go through this plugin's own same-origin route.
    key: 'ui-theme',
  }, MultiSearchSettingsCard))
}

/** Multi-provider form backed by the plugin's same-origin Host route. */
export function MultiSearchSettingsCard() {
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
      <button type="button" style={header} aria-expanded={open} aria-label={`${open ? '收起' : '展开'}设置: 多源网页搜索`} onClick={() => { setOpen(value => !value) }}>
        <span style={headText}>
          <span style={name}>多源网页搜索</span>
          <span style={description}>选择 SearXNG、Wikipedia、Tavily 或 Brave，并安全保存 API Key。</span>
        </span>
        {dirty || apiKey !== '' ? <span style={{ fontSize: 12, color: '#d28b26' }}>未保存</span> : null}
        <span aria-hidden="true" style={{ transform: open ? 'rotate(180deg)' : undefined }}>⌄</span>
      </button>
      {open ? (
        <div style={body}>
          {draft === undefined ? <p role="status">正在读取配置…</p> : <>
            <div>
              <SelectField first label="搜索提供方" value={draft.provider} onChange={value => { edit({ ...draft, provider: value as Provider }); setApiKey('') }}>
                <option value="searxng">SearXNG（免费、自托管）</option>
                <option value="wikipedia">Wikipedia（免费、百科）</option>
                <option value="tavily">Tavily（API、面向 AI）</option>
                <option value="brave">Brave Search（API、通用网页）</option>
              </SelectField>
              <TextField label="请求超时（毫秒）" type="number" value={String(draft.requestTimeoutMs)} onChange={value => { edit({ ...draft, requestTimeoutMs: Number(value) }) }} hint="范围 1000–55000，默认 25000。" />
            </div>
            <ProviderFields draft={draft} snapshot={snapshot} apiKey={apiKey} setApiKey={(value) => { setApiKey(value); setDirty(true); setTestResult(undefined); setError(undefined) }} edit={edit} />
          </>}
          <div style={footer}>
            <button type="button" style={{ ...button, ...(saving || testing || !valid(draft) ? disabledButton : {}) }} disabled={saving || testing || !valid(draft)} onClick={() => { void test() }}>{testing ? '测试中…' : '测试配置'}</button>
            {error === undefined && testResult === undefined ? <span style={statusText} /> : null}
            {error === undefined || testResult !== undefined ? null : <p role="alert" style={{ ...statusText, color: 'var(--dsw-alias-label-error)' }}>测试或保存失败：{error}</p>}
            {testResult === undefined ? null : <p role="status" style={{ ...statusText, color: 'var(--dsw-alias-label-success, #2f9e62)' }}>连接成功 · {testResult.resultCount} 条结果 · {testResult.durationMs} ms{testResult.firstTitle === undefined ? '' : ` · ${testResult.firstTitle}`}</p>}
            <button type="button" style={{ ...button, ...(!dirty || saving || testing ? disabledButton : {}) }} disabled={!dirty || saving || testing} onClick={() => { if (snapshot !== undefined) { setDraft(snapshot.config); setApiKey(''); setDirty(false); setTestResult(undefined); setError(undefined) } }}>放弃修改</button>
            <button type="button" style={{ ...primaryButton, ...(!dirty || saving || testing || !valid(draft) ? disabledButton : {}) }} disabled={!dirty || saving || testing || !valid(draft)} onClick={() => { void save() }}>{saving ? '保存中…' : '保存'}</button>
          </div>
        </div>
      ) : null}
    </li>
  )
}

function ProviderFields(props: { draft: SearchConfig; snapshot?: SettingsSnapshot | undefined; apiKey: string; setApiKey: (value: string) => void; edit: (next: SearchConfig) => void }) {
  const { draft } = props
  if (draft.provider === 'searxng') return <>
    <p style={notice}><strong>SearXNG 不会由插件自动启动。</strong><br />首次使用请在插件目录运行 <code>docker compose -f deploy/searxng/compose.yml up -d</code>，然后点击下方“测试配置”。</p>
    <TextField label="SearXNG 地址" value={draft.searxng.baseURL} onChange={baseURL => { props.edit({ ...draft, searxng: { ...draft.searxng, baseURL } }) }} hint="必须开启 JSON 输出，例如 http://127.0.0.1:8080。" />
    <TextField label="语言" value={draft.searxng.language} onChange={language => { props.edit({ ...draft, searxng: { ...draft.searxng, language } }) }} hint="all、zh-CN、en 等。" />
    <TextField label="分类（可选）" value={draft.searxng.categories ?? ''} onChange={categories => { props.edit({ ...draft, searxng: { ...draft.searxng, ...(categories === '' ? { categories: undefined } : { categories }) } }) }} hint="逗号分隔，例如 general,news。" />
    <SelectField label="安全搜索" value={String(draft.searxng.safeSearch)} onChange={value => { props.edit({ ...draft, searxng: { ...draft.searxng, safeSearch: Number(value) as 0 | 1 | 2 } }) }}><option value="0">关闭</option><option value="1">中等</option><option value="2">严格</option></SelectField>
  </>
  if (draft.provider === 'wikipedia') return <>
    <TextField label="Wikipedia 语言" value={draft.wikipedia.language} onChange={language => { props.edit({ ...draft, wikipedia: { language } }) }} hint="语言子域，例如 zh、en、ja。" />
  </>
  const credential = props.snapshot?.credentials[draft.provider]
  return <>
    <PasswordField provider={draft.provider} value={props.apiKey} state={credential} onChange={props.setApiKey} />
    {draft.provider === 'tavily' ? <>
      <SelectField label="搜索深度" value={draft.tavily.searchDepth} onChange={searchDepth => { props.edit({ ...draft, tavily: { ...draft.tavily, searchDepth: searchDepth as SearchConfig['tavily']['searchDepth'] } }) }}><option value="basic">Basic</option><option value="advanced">Advanced</option><option value="fast">Fast</option><option value="ultra-fast">Ultra fast</option></SelectField>
      <SelectField label="主题" value={draft.tavily.topic} onChange={topic => { props.edit({ ...draft, tavily: { ...draft.tavily, topic: topic as SearchConfig['tavily']['topic'] } }) }}><option value="general">General</option><option value="news">News</option><option value="finance">Finance</option></SelectField>
    </> : <>
      <TextField label="国家（可选）" value={draft.brave.country ?? ''} onChange={country => { props.edit({ ...draft, brave: { ...draft.brave, ...(country === '' ? { country: undefined } : { country }) } }) }} hint="例如 US、CN。" />
      <TextField label="搜索语言（可选）" value={draft.brave.searchLanguage ?? ''} onChange={searchLanguage => { props.edit({ ...draft, brave: { ...draft.brave, ...(searchLanguage === '' ? { searchLanguage: undefined } : { searchLanguage }) } }) }} hint="例如 en、zh-hans。" />
      <SelectField label="安全搜索" value={draft.brave.safeSearch} onChange={safeSearch => { props.edit({ ...draft, brave: { ...draft.brave, safeSearch: safeSearch as SearchConfig['brave']['safeSearch'] } }) }}><option value="off">关闭</option><option value="moderate">中等</option><option value="strict">严格</option></SelectField>
    </>}
  </>
}

function TextField(props: { label: string; value: string; onChange: (value: string) => void; hint?: string; type?: 'text' | 'number'; first?: boolean }) {
  return <label style={field(props.first)}><span style={label}>{props.label}</span><input style={input} type={props.type ?? 'text'} value={props.value} onChange={event => { props.onChange(event.target.value) }} />{props.hint === undefined ? null : <span style={hint}>{props.hint}</span>}</label>
}

function SelectField(props: { label: string; value: string; onChange: (value: string) => void; children: ReactNode; first?: boolean }) {
  return <label style={field(props.first)}><span style={label}>{props.label}</span><select style={input} value={props.value} onChange={event => { props.onChange(event.target.value) }}>{props.children}</select></label>
}

function PasswordField(props: { provider: 'brave' | 'tavily'; value: string; state?: CredentialState | undefined; onChange: (value: string) => void }) {
  const reference = props.provider === 'brave' ? 'BRAVE_SEARCH_API_KEY' : 'TAVILY_API_KEY'
  const configured = props.state?.configured === true
  const writable = props.state?.writable !== false
  return <label style={field()}><span style={fieldHead}><span style={label}>API Key</span><span style={{ borderRadius: 999, padding: '1px 8px', fontSize: 11, lineHeight: '17px', color: 'var(--dsw-alias-label-tertiary)' }}>{configured ? '已配置' : '未配置'}</span></span><input style={input} type="password" autoComplete="off" value={props.value} disabled={!writable} onChange={event => { props.onChange(event.target.value) }} /><span style={hint}>{writable ? `保存到 DSH 凭据 ${reference}；留空保持不变。` : '当前由启动环境提供，Web 中不可覆盖。'}</span></label>
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
