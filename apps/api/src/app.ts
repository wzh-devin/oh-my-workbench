import { resolve } from "node:path"

import { serveStatic } from "@hono/node-server/serve-static"
import { Hono } from "hono"

/**
 * 创建可独立测试的 API；生产环境同源提供前端资源和页面回退。
 * @param webRoot 已构建的前端目录；开发环境省略。
 * @return 无监听副作用的 Hono 应用。
 */
export const createApp = (webRoot?: string) => {
  const app = new Hono()

  app.get("/api/health", (c) => c.json({ ok: true }))
  app.all("/api", (c) => c.notFound())
  app.all("/api/*", (c) => c.notFound())

  if (webRoot) {
    const serveIndex = serveStatic({ path: resolve(webRoot, "index.html") })
    app.use("*", serveStatic({ root: webRoot }))
    app.get("*", async (c, next) => {
      if (c.req.path.startsWith("/assets/") || /\.[^/]+$/.test(c.req.path)) {
        return c.notFound()
      }
      return (await serveIndex(c, next)) ?? c.res
    })
  }

  app.notFound((c) => c.json({ error: "Not found" }, 404))
  app.onError((error, c) => {
    console.error(error)
    return c.json({ error: "Internal server error" }, 500)
  })

  return app
}
