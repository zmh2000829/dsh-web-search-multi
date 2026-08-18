# dsh-web-search-multi

[English](README.md) | 中文

这是一个可配置的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web Search 插件。面向模型的 `web_search` 工具保持不变，插件根据配置选择一个外部搜索后端。

## 提供方

| 提供方 | 通用网页 | API key | 费用特征 | 主要限制 |
|---|---:|---:|---|---|
| [`searxng`](https://docs.searxng.org/admin/installation-docker.html) | 是 | 否 | 自托管时免费 | 需要自行维护实例及上游引擎 |
| [`wikipedia`](https://www.mediawiki.org/wiki/API:Search) | 否 | 否 | 免费的 Wikimedia 公共 API | 只覆盖百科知识 |
| [`tavily`](https://docs.tavily.com/documentation/api-reference/endpoint/search) | 是 | 是 | 每月免费额度，用完后付费 | 需要账户并受额度限制 |
| [`brave`](https://api-dashboard.search.brave.com/documentation) | 是 | 是 | 每月赠送额度，用完后付费 | 需要订阅设置并受额度限制 |

价格和额度可能变化，部署前应检查提供方的当前条款。插件只把查询发送给选中的提供方，不会隐式回退或同时请求多个来源。

## 环境要求

- `dsh` `0.1.0-rc.7` 或兼容的新版本
- Node.js `^22.19` 或 `>=24`
- 开启 JSON 输出的 SearXNG 实例，或所选 API 提供方的凭据

## 安装

从当前源码目录安装：

```sh
npm install
npm run check
dsh plugin --profile web add link:$PWD
```

从 GitHub 安装：

```sh
dsh plugin --profile web add github:zmh2000829/dsh-web-search-multi
```

通过 Git 源安装时，pnpm 第一次可能阻止包的 `prepare` 构建。按照 `dsh` 输出的 `allowBuilds` 提示完成授权，然后重新执行安装命令。

该包是 DSH 组合包。安装会加入 `cordis.patch.yml`，选择稳定的 provider id `configurable-search`，并默认使用 `http://127.0.0.1:8080` 上的 SearXNG。

## 免费的本地 SearXNG

仓库包含只绑定本机回环地址并开启 JSON 输出的 Compose 部署：

```sh
docker compose -f deploy/searxng/compose.yml up -d
curl -fsS -X POST http://127.0.0.1:8080/search \
  -d 'q=DeepSeek&format=json'
```

不要直接把此配置暴露到公网；公网部署必须增加认证、限流、独立密钥和 SearXNG 部署文档要求的其他保护。

## 配置

编辑 `$DSH_HOME/profiles/web/cordis.patch.yml`，默认 home 为 `~/.dsh`。profile patch 会替换目标的完整 `config`，因此应保留所选示例中的全部必要配置键。

所有提供方都支持顶层 `requestTimeoutMs`，范围为 `1000` 至 `55000`；默认值是 `25000`，早于 Harness 工具总超时结束。

`examples/` 包含可直接使用的同款配置；执行 `dsh --profile web --patch examples/wikipedia.patch.yml` 可以临时覆盖当前选择。

### SearXNG

```yaml
- id: web-search-multi
  config:
    provider: searxng
    searxng:
      baseURL: http://127.0.0.1:8080
      language: all
      safeSearch: 1
```

设置 `SEARXNG_BASE_URL` 后可以省略 `baseURL`。可选的 `categories` 会作为逗号分隔的 SearXNG 分类传入。

### Wikipedia

```yaml
- id: web-search-multi
  config:
    provider: wikipedia
    wikipedia:
      language: zh
```

该模式调用 `https://<language>.wikipedia.org/w/api.php`，适合稳定的参考知识，不适合时效性或通用网页检索。

### Tavily

```sh
export TAVILY_API_KEY='tvly-...'
```

```yaml
- id: web-search-multi
  config:
    provider: tavily
    tavily:
      apiKeyEnv: TAVILY_API_KEY
      searchDepth: basic
      topic: general
```

`basic` 比 `advanced` 消耗更少额度。插件不会请求生成式答案或网页原文。

### Brave Search

```sh
export BRAVE_SEARCH_API_KEY='...'
```

```yaml
- id: web-search-multi
  config:
    provider: brave
    brave:
      apiKeyEnv: BRAVE_SEARCH_API_KEY
      country: US
      searchLanguage: en
      safeSearch: moderate
```

`apiKeyEnv` 是 DSH 凭据引用，不是明文密钥。对应值可来自继承的环境变量、`$DSH_HOME/.credentials.yaml` 或 DSH 提供方设置界面。插件每次搜索都会重新解析，因此轮换密钥无需重启 DSH。

## 开启与关闭

安装组合包后默认开启。保留安装但关闭插件：

```yaml
- id: web
  config:
    searchProvider: deepseek-official

- id: web-search-multi
  disabled: true
```

删除这两个覆盖项即可重新开启。卸载前先删除 profile 中指向 `web-search-multi` 的配置，再执行：

```sh
dsh plugin --profile web remove dsh-web-search-multi
```

## 验证

```sh
npm run check
dsh --profile web --dump-config | grep -E 'configurable-search|web-search-multi'
dsh web
```

测试通过 mock 覆盖全部付费 API 请求，并验证认证、凭据轮换、请求数量限制、取消、内部超时、响应校验、结果映射和缺少密钥的失败行为。SearXNG 与 Wikipedia 还可以在无凭据条件下进行真实请求验证。

## 安全与隐私

- 查询会离开本机，并受所选提供方隐私政策约束。
- 插件拒绝重定向，防止配置或固定端点把查询静默转发到其他位置。
- 外部 JSON 在进入 DSH 前会经过校验。
- API key 只通过提供方规定的认证 header 发送，不会出现在 URL 或结果中。
- API key 始终由 DSH 凭据存储管理，并在每次搜索时解析一次。
- 插件只实现搜索，不会开启任意 URL 抓取。

## 与 AnySearch DSH 的区别

[`anysearch-dsh`](https://github.com/anysearch-team/anysearch-dsh) 对接单一托管服务，并增加了该服务专属的能力发现与批量搜索工具。本插件保持 DSH 原生 `web_search` 界面，让使用者在自托管、免密钥与 API 后端之间选择。项目吸收了它成熟的按请求解析 DSH 凭据、有界 HTTP 请求、包内容检查、Node.js CI 矩阵及密钥扫描做法，但不会给模型上下文增加提供方专属工具。

## 开发

```sh
npm install
npm run typecheck
npm test
npm run build
npm run check:package
```

ESM TypeScript 源码位于 `src/`，发布产物生成到 `lib/`。CI 使用 Node.js 22.19 与 24 执行完整检查，并扫描完整 Git 历史中的密钥。

## 许可证

MIT
