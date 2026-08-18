/** Invariant companion for the package-owned provider registration. */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = 'dsh-web-search-multi'

/** Cordis companion plugin name. */
export const name = 'web-search-multi-invariant'
/** Service required before reserving package ownership. */
export const inject = ['invariants']

const install: InvariantInstaller = () => {}

/** Register the package's invariant companion. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
