export type ResourceModule = "todos" | "mail" | "assets"
/** 成功写入和服务端事件只失效相关资源，页面自行决定是否重读。 */
export const notifyResourceChange = (module: ResourceModule) =>
  window.dispatchEvent(new CustomEvent("workbench:changed", { detail: module }))
/** 监听需要的资源，多个事件合并，卸载时清除待执行刷新。 */
export const onResourceChange = (
  modules: ResourceModule[],
  refresh: () => void
) => {
  let timer: ReturnType<typeof setTimeout> | undefined
  const changed = (event: Event) => {
    if (modules.includes((event as CustomEvent<ResourceModule>).detail)) {
      clearTimeout(timer)
      timer = setTimeout(refresh, 100)
    }
  }
  window.addEventListener("workbench:changed", changed)
  return () => {
    clearTimeout(timer)
    window.removeEventListener("workbench:changed", changed)
  }
}

/** 重复点击当前模块菜单也刷新列表；详情参数变化不会触发整页列表重读。 */
export const requestListRefresh = (module: string) =>
  window.dispatchEvent(
    new CustomEvent("workbench:navigate", { detail: module })
  )
export const onListRefresh = (module: string, refresh: () => void) => {
  const changed = (event: Event) => {
    if ((event as CustomEvent<string>).detail === module) refresh()
  }
  window.addEventListener("workbench:navigate", changed)
  return () => window.removeEventListener("workbench:navigate", changed)
}

const activeResources = new Set<ResourceModule>()
/** 仅挂载的业务页面刷新对应配置，后台任务通过失效通知更新摘要。 */
export const activateResource = (module: ResourceModule) => {
  activeResources.add(module)
  return () => {
    activeResources.delete(module)
  }
}
export const resourceIsActive = (module: ResourceModule) =>
  activeResources.has(module)
