/** 同账号并发读取共用结果；写入失效或身份切换必须立即读取新快照。 */
export const coalesceRead = (
  owner: () => number,
  read: (invalidate: boolean) => Promise<void>,
  cancel?: () => void
) => {
  let pending: { owner: number; promise: Promise<void> } | undefined
  return (invalidate = false): Promise<void> => {
    const identity = owner()
    if (!invalidate && pending?.owner === identity) return pending.promise
    if (invalidate) cancel?.()
    const request = { owner: identity, promise: Promise.resolve() }
    pending = request
    request.promise = read(invalidate).finally(() => {
      if (pending === request) pending = undefined
    })
    return request.promise
  }
}
