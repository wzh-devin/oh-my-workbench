import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { toast } from "sonner"
import {
  getDocument,
  GlobalWorkerOptions,
  TextLayer,
  type PDFDocumentProxy,
} from "pdfjs-dist"
import "pdfjs-dist/web/pdf_viewer.css"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { PreviewAction, PreviewToolbar } from "./preview-toolbar"
import { usePreviewViewport } from "./use-preview-viewport"

GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString()

/** 每次只渲染一页，文本层支持选择；切换与关闭取消解析和绘制。 */
export default function PdfPreview({ url }: { url: string }) {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null),
    [page, setPage] = useState(1),
    [zoom, setZoom] = useState<number | "width" | null>("width")
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 })
  const { viewport, size, rememberCenter, restoreCenter } = usePreviewViewport()
  const ratio = Math.min(window.devicePixelRatio || 1, 2)
  const maxScale = pageSize.width
    ? Math.min(
        4,
        Math.sqrt(20_000_000 / (pageSize.width * pageSize.height * ratio ** 2))
      )
    : 4
  const fit =
    pageSize.width && size.width
      ? Math.min(
          1,
          Math.max(1, size.width - 32) / pageSize.width,
          Math.max(1, size.height - 32) / pageSize.height
        )
      : 1
  const fitWidth =
    pageSize.width && size.width
      ? Math.min(1, Math.max(1, size.width - 32) / pageSize.width)
      : 1
  const scale = Math.min(zoom === "width" ? fitWidth : (zoom ?? fit), maxScale),
    width = pageSize.width * scale,
    height = pageSize.height * scale
  useLayoutEffect(restoreCenter, [width, height, restoreCenter])
  const [loading, setLoading] = useState(true),
    [failed, setFailed] = useState(false),
    [attempt, setAttempt] = useState(0)
  const canvas = useRef<HTMLCanvasElement>(null),
    text = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const task = getDocument({
      url,
      withCredentials: true,
      disableAutoFetch: true,
      disableStream: true,
      enableXfa: false,
    })
    let active = true
    void task.promise
      .then((value) => {
        if (active) {
          setDocument(value)
          setPage(1)
          setFailed(false)
        }
      })
      .catch(() => {
        if (active) {
          setFailed(true)
          setLoading(false)
          toast.error("PDF 读取失败，请重试或下载")
        }
      })
    return () => {
      active = false
      void task.destroy()
    }
  }, [url, attempt])
  useEffect(() => {
    if (!document || !canvas.current || !text.current) return
    let active = true,
      render:
        | ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]>
        | undefined,
      layer: TextLayer | undefined
    setLoading(true)
    void document
      .getPage(page)
      .then(async (pdfPage) => {
        if (!active || !canvas.current || !text.current) return
        const original = pdfPage.getViewport({ scale: 1 })
        if (
          original.width !== pageSize.width ||
          original.height !== pageSize.height
        ) {
          setPageSize({ width: original.width, height: original.height })
          return
        }
        const viewport = pdfPage.getViewport({ scale }),
          ratio = Math.min(window.devicePixelRatio || 1, 2)
        // 控制异常页面的画布像素，避免浏览器分配无界内存。
        if (viewport.width * viewport.height * ratio ** 2 > 20_000_000)
          throw new Error("页面尺寸超过预览限制")
        canvas.current.width = Math.ceil(viewport.width * ratio)
        canvas.current.height = Math.ceil(viewport.height * ratio)
        canvas.current.style.width = `${viewport.width}px`
        canvas.current.style.height = `${viewport.height}px`
        text.current.replaceChildren()
        text.current.style.setProperty("--scale-factor", String(scale))
        text.current.style.width = `${viewport.width}px`
        text.current.style.height = `${viewport.height}px`
        render = pdfPage.render({
          canvas: canvas.current,
          viewport,
          transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
        })
        layer = new TextLayer({
          textContentSource: pdfPage.streamTextContent(),
          container: text.current,
          viewport,
        })
        await Promise.all([render.promise, layer.render()])
        if (active) setLoading(false)
      })
      .catch(() => {
        if (active) {
          setFailed(true)
          setLoading(false)
          toast.error("PDF 页面渲染失败，请重试或下载")
        }
      })
    return () => {
      active = false
      render?.cancel()
      layer?.cancel()
    }
  }, [document, page, scale, pageSize.width, pageSize.height])
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <PreviewToolbar
        scale={scale}
        maxScale={maxScale}
        disabled={!document || failed}
        onScaleChange={(value) => {
          rememberCenter()
          setZoom(value)
        }}
        onFit={() => {
          rememberCenter()
          setZoom(null)
        }}
        onFitWidth={() => {
          rememberCenter()
          setZoom("width")
        }}
      >
        <div
          role="group"
          aria-label="PDF页面导航"
          className="flex items-center gap-1"
        >
          <PreviewAction
            label="上一页"
            icon={ChevronLeftIcon}
            disabled={page <= 1 || loading}
            onClick={() => setPage((value) => value - 1)}
          />
          <Input
            key={page}
            type="text"
            inputMode="numeric"
            defaultValue={page}
            aria-label="PDF页码"
            placeholder="页码"
            disabled={!document || loading}
            className="w-14 text-center tabular-nums"
            onFocus={(event) => event.currentTarget.select()}
            onBlur={(event) => {
              const value = event.currentTarget.value.trim()
              const next = Number(value)
              const valid =
                /^\d+$/.test(value) &&
                Number.isSafeInteger(next) &&
                next >= 1 &&
                document &&
                next <= document.numPages
              event.currentTarget.value = String(valid ? next : page)
              if (valid) setPage(next)
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur()
            }}
          />
          <span className="self-center px-1 text-xs text-muted-foreground tabular-nums">
            / {document?.numPages ?? "—"}
          </span>
          <PreviewAction
            label="下一页"
            icon={ChevronRightIcon}
            disabled={!document || page >= document.numPages || loading}
            onClick={() => setPage((value) => value + 1)}
          />
        </div>
      </PreviewToolbar>
      {failed && (
        <Button
          type="button"
          size="sm"
          onClick={() => {
            setFailed(false)
            setAttempt((value) => value + 1)
          }}
        >
          重试
        </Button>
      )}
      <div
        ref={viewport}
        className="min-h-0 flex-1 overflow-auto bg-muted/40"
        aria-label="PDF阅读区"
        aria-busy={loading}
        tabIndex={0}
      >
        {loading && !pageSize.width && <Skeleton className="h-64 w-full" />}
        <div className="flex min-h-full w-max min-w-full p-4">
          <div
            className="relative m-auto shrink-0 bg-background"
            style={{ width: width || undefined, height: height || undefined }}
          >
            {loading && <Skeleton className="absolute inset-0" />}
            <canvas
              className={loading ? "opacity-0" : undefined}
              ref={canvas}
              aria-label={`PDF 第 ${page} 页`}
            />
            <div
              ref={text}
              className="textLayer"
              style={{ opacity: loading ? 0 : 1 }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
