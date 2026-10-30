import { z } from "zod"
import { mailRequest } from "./api"

/** Browser subscription keys stay in the platform; only the authenticated API receives them. */
export const pushSupported = () =>
  window.isSecureContext &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window

const registration = () =>
  navigator.serviceWorker.register("/mail-worker.js", { scope: "/" })
const subscribe = async (subscription: PushSubscription) => {
  await mailRequest(
    "/push/subscriptions",
    "POST",
    z.null(),
    undefined,
    subscription.toJSON()
  )
}
export async function enableMailPush() {
  if (!pushSupported())
    throw new Error("当前浏览器不支持系统通知，请使用 HTTPS")
  if ((await Notification.requestPermission()) !== "granted")
    throw new Error("请在浏览器设置中允许通知")
  const config = await mailRequest(
    "/push/config",
    "GET",
    z.object({ publicKey: z.string() })
  )
  if (!config.publicKey) throw new Error("系统通知未配置，请设置 Web Push 密钥")
  await registration()
  const worker = await navigator.serviceWorker.ready
  let subscription = await worker.pushManager.getSubscription()
  if (!subscription) {
    const bytes = Uint8Array.from(
      atob(config.publicKey.replace(/-/g, "+").replace(/_/g, "/")),
      (char) => char.charCodeAt(0)
    )
    subscription = await worker.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: bytes,
    })
  }
  await subscribe(subscription)
}
export async function restoreMailPush(signal: AbortSignal) {
  if (!pushSupported() || Notification.permission !== "granted") return
  const worker = await navigator.serviceWorker.getRegistration("/")
  const subscription = await worker?.pushManager.getSubscription()
  if (subscription && !signal.aborted)
    await mailRequest(
      "/push/subscriptions",
      "POST",
      z.null(),
      signal,
      subscription.toJSON()
    )
}
export async function disableMailPush() {
  if (!pushSupported()) return
  const worker = await navigator.serviceWorker.getRegistration("/")
  const subscription = await worker?.pushManager.getSubscription()
  if (!subscription) return
  // Revoke the server binding before logout removes the authenticated cookie.
  await mailRequest("/push/subscriptions", "DELETE", z.null(), undefined, {
    endpoint: subscription.endpoint,
  })
  await subscription.unsubscribe()
}
