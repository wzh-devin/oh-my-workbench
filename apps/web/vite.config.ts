import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { buildChangelog } from "../../scripts/changelog.mjs"

const changelog = new URL("../../CHANGELOG.md", import.meta.url)

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_CHANGELOG__: JSON.stringify(
      buildChangelog(readFileSync(changelog, "utf8"), process.env.APP_VERSION)
    ),
  },
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    port: 3000,
    strictPort: true,
    proxy: {
      "/api": {
        target: process.env.API_PROXY_TARGET ?? "http://127.0.0.1:11990",
        changeOrigin: false,
      },
    },
  },
})
