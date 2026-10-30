import { useEffect, useState } from "react"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  XIcon,
} from "lucide-react"
import { FileTypeIcon } from "@/components/shared/file-type-icon"
import { Alert, AlertDescription, AlertTitle } from "@/components/reui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { formatSize, type Asset } from "@/features/workbench/model"
import { readAsset } from "@/features/workbench/store"
import { recordOpened } from "../asset-store"

/** 仅使用浏览器原生媒体查看器或纯文本，上传内容不会作为页面脚本执行。 */
export const previewKind = (asset: Pick<Asset, "type" | "name">) => {
  if (
    asset.type.startsWith("image/") ||
    /\.(png|jpe?g|gif|webp|avif|svg|bmp)$/i.test(asset.name)
  )
    return "image"
  if (asset.type === "application/pdf" || /\.pdf$/i.test(asset.name))
    return "pdf"
  if (asset.type.startsWith("video/")) return "video"
  if (asset.type.startsWith("audio/")) return "audio"
  if (
    asset.type.startsWith("text/") ||
    /\.(txt|md|json|csv|tsv|log|ya?ml|xml|html?|css|[cm]?js|tsx?|py|sh|sql)$/i.test(
      asset.name
    )
  )
    return "text"
  return "unsupported"
}

type Preview =
  | { status: "loading" }
  | { status: "ready"; url: string; text: string; truncated: boolean }
  | { status: "error"; message: string }

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
  const [preview, setPreview] = useState<Preview>({ status: "loading" })
  const format = previewKind(asset)
  const kind =
    format === "pdf" && navigator.pdfViewerEnabled === false
      ? "unsupported"
      : format
  const { id, name, origin, type } = asset
  const index = files.findIndex((file) => file.id === asset.id)
  useEffect(() => {
    let active = true
    let url: string | undefined
    const load = async () => {
      try {
        if (kind === "unsupported") {
          if (active)
            setPreview({ status: "ready", url: "", text: "", truncated: false })
          recordOpened(id)
          return
        }
        const blob = await readAsset({ id, origin, type })
        if (!active) return
        let text = kind === "text" ? await blob.slice(0, 512 * 1024).text() : ""
        if (!active) return
        const truncated = kind === "text" && blob.size > 512 * 1024
        if (!truncated && /\.json$/i.test(name)) {
          try {
            text = JSON.stringify(JSON.parse(text), null, 2)
          } catch {
            /* 保留原始内容以便查看无效 JSON。 */
          }
        }
        // 原生 PDF 查看器需要独立文档；固定 MIME 防止伪装为 PDF 的 HTML 被执行。
        url =
          kind === "text"
            ? ""
            : URL.createObjectURL(
                kind === "pdf"
                  ? new Blob([blob], { type: "application/pdf" })
                  : blob
              )
        setPreview({ status: "ready", url, text, truncated })
        recordOpened(id)
      } catch (error) {
        if (active)
          setPreview({
            status: "error",
            message: error instanceof Error ? error.message : "文件预览失败。",
          })
      }
    }
    void load()
    return () => {
      active = false
      if (url) URL.revokeObjectURL(url)
    }
    // 文件内容以 id 索引；收藏、访问时间和重命名不会触发重复读取。
  }, [id, name, origin, type, kind, attempt])
  const mediaError = () =>
    setPreview({ status: "error", message: "无法预览此文件，请重试或下载。" })
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
        className="flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-5xl"
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
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
          {preview.status === "loading" && (
            <div
              role="status"
              aria-label="正在读取预览"
              className="flex flex-col gap-3"
            >
              <Skeleton className="h-64 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          )}
          {preview.status === "error" && (
            <Alert variant="destructive" role="alert">
              <AlertTitle>预览失败</AlertTitle>
              <AlertDescription>{preview.message}</AlertDescription>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setPreview({ status: "loading" })
                  setAttempt((value) => value + 1)
                }}
              >
                重试预览
              </Button>
            </Alert>
          )}
          {preview.status === "ready" && (
            <>
              {kind === "image" && (
                <img
                  src={preview.url}
                  alt={asset.name}
                  className="min-h-0 w-full object-contain"
                  onError={mediaError}
                />
              )}
              {kind === "pdf" && (
                <object
                  data={preview.url}
                  type="application/pdf"
                  title={`PDF：${asset.name}`}
                  className="h-[65dvh] w-full border-0"
                  onError={mediaError}
                >
                  <p className="text-sm">无法预览此 PDF 文件</p>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => onDownload(asset)}
                  >
                    下载文件
                  </Button>
                </object>
              )}
              {kind === "video" && (
                <video
                  src={preview.url}
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
                  src={preview.url}
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
                  <pre className="min-h-64 overflow-auto bg-muted/40 p-4 text-sm break-words whitespace-pre-wrap">
                    {preview.text || "（空文件）"}
                  </pre>
                  {preview.truncated && (
                    <p className="text-xs text-muted-foreground">
                      仅显示前 512 KB，下载可查看完整内容。
                    </p>
                  )}
                </>
              )}
              {kind === "unsupported" && (
                <div className="flex min-h-64 flex-col items-center justify-center gap-4">
                  <FileTypeIcon file={asset} size="xl" />
                  <p className="text-sm">此文件暂不支持预览</p>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => onDownload(asset)}
                  >
                    <DownloadIcon aria-hidden="true" />
                    下载文件
                  </Button>
                </div>
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
