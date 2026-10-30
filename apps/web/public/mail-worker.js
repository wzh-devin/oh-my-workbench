/* Receives Web Push while pages are closed; never caches mail or authenticated responses. */
self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim())
)
self.addEventListener("push", (event) => {
  if (!event.data) return
  let payload
  try {
    payload = event.data.json()
  } catch {
    return
  }
  if (!/^[1-9]\d*$/.test(payload.id) || typeof payload.url !== "string") return
  const destination = new URL(payload.url, self.location.origin)
  if (
    destination.origin !== self.location.origin ||
    destination.pathname !== "/mail"
  )
    return
  event.waitUntil(
    self.registration.showNotification("收到新邮件", {
      body: "打开工作台查看",
      tag: `mail:${payload.id}`,
      data: { url: destination.href },
    })
  )
})
self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const destination = new URL(
    event.notification.data?.url ?? "/mail",
    self.location.origin
  )
  if (
    destination.origin !== self.location.origin ||
    destination.pathname !== "/mail"
  )
    return
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      })
      const existing = windows.find(
        (client) => new URL(client.url).origin === self.location.origin
      )
      if (existing) {
        await existing.navigate(destination.href)
        await existing.focus()
      } else await self.clients.openWindow(destination.href)
    })()
  )
})
