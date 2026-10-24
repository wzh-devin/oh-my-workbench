import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { serve } from "@hono/node-server"

import { createApp } from "./app.ts"

const production = process.env.NODE_ENV === "production"
const port = Number(process.env.PORT ?? (production ? 3000 : 8787))
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535")
}

const webRoot = fileURLToPath(new URL("../../web/dist/", import.meta.url))
if (production && !existsSync(`${webRoot}/index.html`)) {
  throw new Error("Frontend build missing. Run pnpm build before pnpm start.")
}

const app = createApp(production ? webRoot : undefined)
const server = serve(
  { fetch: app.fetch, port, hostname: production ? "0.0.0.0" : "127.0.0.1" },
  () => {
    console.log(`Hono listening on http://127.0.0.1:${port}`)
  }
)

// 退出时停止接收请求，避免遗留监听端口和中断正在响应的连接。
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.close((error) => process.exit(error ? 1 : 0))
  })
}
