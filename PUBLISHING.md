# Publishing

1. Update `version` in `package.json`, `package-lock.json`, `src/http.ts`, and `CHANGELOG.md` together.
2. Run `npm ci && npm run check` on a clean checkout.
3. Review `npm pack --dry-run` and confirm that no credentials or local configuration are included.
4. For the first release, publish once with `npm publish --access public --provenance`, then configure this repository as the package's npm trusted publisher.
5. Create an annotated tag such as `v0.2.0` from the tested commit and publish a GitHub Release. Later releases are published by `.github/workflows/publish.yml` through npm trusted publishing and do not require a local OTP or long-lived npm token.

GitHub users can install a release tag with:

```sh
dsh plugin --profile web add github:zmh2000829/dsh-web-search-multi#v0.2.0
```
