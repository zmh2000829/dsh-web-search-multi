# Security policy

## Supported version

Security fixes are applied to the latest published version. This pre-1.0 plugin supports DSH 0.1.1-rc.2 exactly.

## Reporting a vulnerability

Do not open a public issue for credentials exposure, request forgery, or another exploitable vulnerability. Use GitHub's **Security → Report a vulnerability** form in this repository. Include the affected plugin version, DSH version, provider, reproduction steps, and impact. Remove API keys, tokens, and private URLs from logs and screenshots.

You should receive an acknowledgement within seven days. A fix and disclosure timeline will be coordinated after the report is reproduced.

## Deployment notes

The bundled SearXNG Compose file binds to `127.0.0.1`. Do not expose it publicly without authentication, rate limiting, a unique secret, and the protections required by the SearXNG deployment guide. Queries and explicit URLs are sent only to the provider selected in plugin settings.
