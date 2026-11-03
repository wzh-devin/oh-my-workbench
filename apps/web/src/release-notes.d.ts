import type { AppChangelog } from "../../../scripts/changelog.mjs"

declare global {
  const __APP_CHANGELOG__: AppChangelog
}
