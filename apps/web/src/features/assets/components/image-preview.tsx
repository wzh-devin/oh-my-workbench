import { useLayoutEffect, useState } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { PreviewToolbar } from "./preview-toolbar"
import { usePreviewViewport } from "./use-preview-viewport"

/** 默认适应窗口，放大后原生滚动；切换文件由父级key重置比例。 */
export function ImagePreview({
  url,
  name,
  onError,
}: {
  url: string
  name: string
  onError: () => void
}) {
  const [natural, setNatural] = useState({ width: 0, height: 0 })
  const [zoom, setZoom] = useState<number | null>(null)
  const { viewport, size, rememberCenter, restoreCenter } = usePreviewViewport()
  const fit =
    natural.width && size.width
      ? Math.min(
          1,
          Math.max(1, size.width - 32) / natural.width,
          Math.max(1, size.height - 32) / natural.height
        )
      : 1
  const scale = zoom ?? fit,
    width = natural.width * scale,
    height = natural.height * scale
  useLayoutEffect(restoreCenter, [width, height, restoreCenter])
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <PreviewToolbar
        scale={scale}
        disabled={!natural.width}
        onScaleChange={(value) => {
          rememberCenter()
          setZoom(value)
        }}
        onFit={() => {
          rememberCenter()
          setZoom(null)
        }}
      />
      <div
        ref={viewport}
        className="min-h-0 flex-1 overflow-auto bg-muted/40"
        aria-label="图片阅读区"
        tabIndex={0}
      >
        <div className="flex min-h-full w-max min-w-full p-4">
          {!natural.width && <Skeleton className="m-auto h-64 w-64" />}
          <img
            src={url}
            alt={name}
            className="m-auto max-w-none shrink-0 object-contain"
            style={{
              width: width || undefined,
              height: height || undefined,
              display: natural.width ? undefined : "none",
            }}
            onLoad={(event) =>
              setNatural({
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              })
            }
            onError={onError}
          />
        </div>
      </div>
    </div>
  )
}
