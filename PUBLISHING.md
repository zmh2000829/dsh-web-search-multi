# Publishing

1. Update `version` in `package.json`, `package-lock.json`, `src/http.ts`, and `CHANGELOG.md` together.
2. Run `npm ci && npm run check` on a clean checkout.
3. Review `npm pack --dry-run` and confirm that no credentials or local configuration are included.
4. Publish with `npm publish --access public` using an authenticated npm account. The GitHub trusted publisher is not configured yet; the `v0.2.0` Release workflow failed with npm E404.
5. Create an annotated tag such as `v0.2.1` from the tested commit. Configure this repository's `.github/workflows/publish.yml` as an npm trusted publisher before publishing a GitHub Release; otherwise the release-triggered npm job will fail. Once configured, let that workflow publish future versions instead of running `npm publish` locally.

GitHub users can install a release tag with:

```sh
dsh plugin --profile web add github:zmh2000829/dsh-web-search-multi#v0.2.1
```
