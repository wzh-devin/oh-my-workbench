import { lazy, Suspense, useEffect, useRef, useState } from "react"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  XIcon,
} from "lucide-react"
import { FileTypeIcon } from "@/components/shared/file-type-icon"
import { Alert, AlertTitle } from "@/components/reui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { formatSize, type Asset } from "@/features/workbench/model"
import { readAsset } from "@/features/workbench/store"
import { recordOpened } from "../store"
import { assetApi, getAssetContentURL } from "../api"
import { toast } from "sonner"
import { TextPreview } from "./text-preview"
import { ImagePreview } from "./image-preview"
const PdfPreview = lazy(() => import("./pdf-preview"))

/** 按类型选择有界预览；Office 经私有转换，上传内容不作为页面脚本执行。 */
export const previewKind = (asset: Pick<Asset, "type" | "name">) => {
  if (/\.(html?|svg)$/i.test(asset.name)) return "text"
  if (/\.(docx?|xlsx?|pptx?|odt|ods|odp)$/i.test(asset.name)) return "office"
  if (
    asset.type.startsWith("image/") ||
    /\.(png|jpe?g|gif|webp|avif|bmp)$/i.test(asset.name)
  )
    return "image"
  if (asset.type === "application/pdf" || /\.pdf$/i.test(asset.name))
    return "pdf"
  if (asset.type.startsWith("video/")) return "video"
  if (asset.type.startsWith("audio/")) return "audio"
  if (
    asset.type.startsWith("text/") ||
    /\.(txt|md|json|toml|ini|conf|env|go|rs|java|csv|tsv|log|ya?ml|xml|html?|css|[cm]?js|tsx?|py|sh|sql)$/i.test(
      asset.name
    )
  )
    return "text"
  return "unsupported"
}

type Preview = (
  | { status: "loading" }
  | { status: "ready"; url: string; text: string; truncated: boolean }
  | { status: "error"; message: string }
) & { id: string }

/** 关闭、切换和重试均释放临时 URL，过期读取不会覆盖当前文件。 */
export function AssetPreview({
  asset,
  files,
  onChange,
  onClose,
  onDownload,
}: {
  asset: Asset
  files: Asset[]
  onChange: (id: string) => void
  onClose: () => void
  onDownload: (asset: Asset) => void
}) {
  const [attempt, setAttempt] = useState(0)
  const refresh = useRef<string | null>(null)
  const [preview, setPreview] = useState<Preview>({
    id: asset.id,
    status: "loading",
  })
  const kind = previewKind(asset)
  const unsupported = kind === "unsupported"
  const { id, name, origin, type } = asset
  const currentPreview =
    preview.id === id ? preview : { status: "loading" as const }
  const index = files.findIndex((file) => file.id === asset.id)
  useEffect(() => {
    const renew = refresh.current === id
    refresh.current = null
    let active = true
    let url: string | undefined
    const controller = new AbortController()
    const load = async () => {
      try {
        let text = "",
          truncated = false
        if (origin === "remote" && kind !== "unsupported") {
          if (kind === "office") {
            let result = await assetApi.preview(id, true, controller.signal)
            while (
              result.status === "queued" ||
              result.status === "rendering"
            ) {
              await new Promise<void>((resolve, reject) => {
                const abort = () => {
                  clearTimeout(timer)
                  reject(new DOMException("请求已取消", "AbortError"))
                }
                const timer = setTimeout(() => {
                  controller.signal.removeEventListener("abort", abort)
                  resolve()
                }, 2000)
                controller.signal.addEventListener("abort", abort, {
                  once: true,
                })
              })
              result = await assetApi.preview(id, false, controller.signal)
            }
            if (result.status !== "ready")
              throw new Error(result.error || "预览转换失败")
          }
          url = await getAssetContentURL(
            id,
            kind === "office" ? "preview" : undefined,
            controller.signal,
            renew
          )
          if (kind === "text") {
            const response = await fetch(url, {
              signal: controller.signal,
              credentials: "same-origin",
              referrerPolicy: "no-referrer",
              headers: { Range: "bytes=0-524287" },
            })
            if (!response.ok) throw new Error("读取文件内容失败")
            // 即使上游忽略 Range，也在浏览器侧限制读取并取消剩余传输。
            const reader = response.body?.getReader(),
              chunks: Uint8Array[] = []
            let bytes = 0
            if (reader)
              try {
                while (bytes < 512 * 1024) {
                  const next = await reader.read()
                  if (next.done) break
                  const chunk = next.value.subarray(0, 512 * 1024 - bytes)
                  chunks.push(chunk)
                  bytes += chunk.length
                }
              } finally {
                await reader.cancel()
              }
            const content = new Uint8Array(bytes)
            let offset = 0
            for (const chunk of chunks) {
              content.set(chunk, offset)
              offset += chunk.length
            }
            text = new TextDecoder().decode(content)
            truncated = asset.size > bytes
          }
        } else if (kind !== "unsupported") {
          const blob = await readAsset({ id, origin, type })
          if (kind === "text") {
            text = await blob.slice(0, 512 * 1024).text()
            truncated = blob.size > 512 * 1024
          } else url = URL.createObjectURL(blob)
        }
        if (!active) return
        if (!truncated && /\.json$/i.test(name))
          try {
            text = JSON.stringify(JSON.parse(text), null, 2)
          } catch {
            /* 无效 JSON 仍可阅读原文。 */
          }
        setPreview({ id, status: "ready", url: url ?? "", text, truncated })
        if (origin === "remote")
          void recordOpened(id).catch(() => {
            /* 最近访问写入失败不阻断阅读。 */
          })
      } catch (error) {
        if (!active || controller.signal.aborted) return
        const message = error instanceof Error ? error.message : "文件预览失败"
        setPreview({ id, status: "error", message })
        toast.error(message)
      }
    }
    void load()
    return () => {
      active = false
      controller.abort()
      if (url?.startsWith("blob:")) URL.revokeObjectURL(url)
    }
  }, [id, name, origin, type, kind, attempt, asset.size])
  const retryPreview = () => {
    refresh.current = id
    setPreview({ id, status: "loading" })
    setAttempt((value) => value + 1)
  }
  const mediaError = () => {
    const message = "无法预览此文件，请重试或下载"
    setPreview({ id, status: "error", message })
    toast.error(message, { id: `asset-preview:${id}` })
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        className={cn(
          "flex max-h-[calc(100dvh-2rem)] flex-col",
          unsupported ? "sm:max-w-lg" : "sm:max-w-5xl"
        )}
      >
        <DialogHeader>
          <div className="flex min-w-0 items-center gap-2">
            <FileTypeIcon file={asset} />
            <DialogTitle className="min-w-0 flex-1 truncate" title={asset.name}>
              {asset.name}
            </DialogTitle>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="下载预览文件"
              onClick={() => onDownload(asset)}
            >
              <DownloadIcon aria-hidden="true" />
            </Button>
            <DialogClose
              render={
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="关闭预览"
                />
              }
            >
              <XIcon aria-hidden="true" />
            </DialogClose>
          </div>
          <p className="text-xs text-muted-foreground">
            {formatSize(asset.size)}
          </p>
        </DialogHeader>
        <div
          className={cn(
            "flex min-h-0 flex-col gap-3 overflow-hidden",
            !unsupported && "h-[65dvh]"
          )}
        >
          {unsupported && (
            <div className="flex flex-col items-center gap-4 py-6">
              <FileTypeIcon file={asset} size="xl" />
              <p className="text-sm">此文件暂不支持预览</p>
              <Button type="button" size="sm" onClick={() => onDownload(asset)}>
                <DownloadIcon aria-hidden="true" />
                下载文件
              </Button>
            </div>
          )}
          {currentPreview.status === "loading" && !unsupported && (
            <div
              role="status"
              aria-label="正在读取预览"
              className="flex flex-col gap-3"
            >
              <Skeleton className="h-64 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          )}
          {currentPreview.status === "error" && (
            <Alert variant="destructive" role="alert">
              <AlertTitle>预览失败</AlertTitle>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={retryPreview}
              >
                重试预览
              </Button>
            </Alert>
          )}
          {currentPreview.status === "ready" && (
            <>
              {kind === "image" && (
                <ImagePreview
                  key={id}
                  url={currentPreview.url}
                  name={asset.name}
                  onError={mediaError}
                />
              )}
              {(kind === "pdf" || kind === "office") && (
                <Suspense fallback={<Skeleton className="h-64 w-full" />}>
                  <PdfPreview
                    key={id}
                    url={currentPreview.url}
                    onRetry={retryPreview}
                  />
                </Suspense>
              )}
              {kind === "video" && (
                <video
                  src={currentPreview.url}
                  controls
                  preload="metadata"
                  aria-label={asset.name}
                  className="max-h-[65dvh] w-full"
                  onError={mediaError}
                >
                  <track kind="captions" />
                </video>
              )}
              {kind === "audio" && (
                <audio
                  src={currentPreview.url}
                  controls
                  preload="metadata"
                  aria-label={asset.name}
                  className="w-full"
                  onError={mediaError}
                >
                  <track kind="captions" />
                </audio>
              )}
              {kind === "text" && (
                <>
                  <TextPreview
                    key={id}
                    name={name}
                    text={currentPreview.text}
                    onDownload={() => onDownload(asset)}
                  />
                  {currentPreview.truncated && (
                    <p className="text-xs text-muted-foreground">
                      仅显示前 512 KB，下载可查看完整内容。
                    </p>
                  )}
                </>
              )}
            </>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t pt-3">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={index <= 0}
            onClick={() => onChange(files[index - 1].id)}
          >
            <ChevronLeftIcon aria-hidden="true" />
            上一个
          </Button>
          <span className="text-xs text-muted-foreground tabular-nums">
            {index >= 0 ? index + 1 : 1} / {Math.max(files.length, 1)}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={index < 0 || index >= files.length - 1}
            onClick={() => onChange(files[index + 1].id)}
          >
            下一个
            <ChevronRightIcon aria-hidden="true" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
