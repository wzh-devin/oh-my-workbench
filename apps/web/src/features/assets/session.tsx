import { useLayoutEffect } from "react"
import { useAuth } from "@/features/auth/auth-context"
import { setAssetUser } from "./store"
import { setUploadUser } from "./upload-queue"

/** 登录态切换时同步清除资产快照和上传 Worker，避免跨账户内容泄漏。 */
export function AssetSession() {
  const { user, refresh } = useAuth(),
    userId = user?.id ?? null
  useLayoutEffect(() => {
    setAssetUser(userId, refresh)
    setUploadUser(userId)
    return () => {
      setAssetUser(null)
      setUploadUser(null)
    }
  }, [userId, refresh])
  return null
}
