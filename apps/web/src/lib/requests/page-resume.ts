/** 短暂切到开发者工具不刷新；离开页面至少30秒再恢复时，合并焦点和可见性事件。 */
export const onPageResume = (refresh: () => void) => {
  let leftAt: number | null = null
  const leave = () => {
    leftAt ??= Date.now()
  }
  const resume = () => {
    if (document.visibilityState !== "visible" || leftAt === null) return
    const elapsed = Date.now() - leftAt
    leftAt = null
    if (elapsed >= 30_000) refresh()
  }
  const visibility = () => {
    if (document.visibilityState === "hidden") leave()
    else resume()
  }
  window.addEventListener("blur", leave)
  window.addEventListener("focus", resume)
  document.addEventListener("visibilitychange", visibility)
  return () => {
    window.removeEventListener("blur", leave)
    window.removeEventListener("focus", resume)
    document.removeEventListener("visibilitychange", visibility)
  }
}
