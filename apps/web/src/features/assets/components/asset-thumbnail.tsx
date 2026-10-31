import { useState } from "react"
import { FileTypeIcon } from "@/components/shared/file-type-icon"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { assetThumbnailURL } from "../api"
import type { AssetEntry } from "../asset-rules"

/** 缩略图按可见区域加载；生成失败或图片读取失败时保留可操作的文件图标。 */
export function AssetThumbnail({
  entry,
  large = false,
}: {
  entry: AssetEntry & { kind: "file" }
  large?: boolean
}) {
  const [failedVersion, setFailedVersion] = useState<string>()
  const [loadedVersion, setLoadedVersion] = useState<string>()
  const version =
    entry.thumbnail?.status === "ready" ? entry.thumbnail.version : undefined
  const available = version && version !== failedVersion
  return (
    <span
      className={
        large
          ? "relative flex h-28 w-full max-w-44 items-center justify-center"
          : "relative inline-flex size-5 shrink-0 items-center justify-center"
      }
    >
      {!available ? (
        <FileTypeIcon file={entry} size={large ? "xl" : "mini"} />
      ) : (
        <>
          {loadedVersion !== version && (
            <Skeleton
              className="absolute inset-0 size-full"
              aria-label="正在加载缩略图"
            />
          )}
          <img
            key={version}
            src={assetThumbnailURL(entry.id, version)}
            alt=""
            loading="lazy"
            decoding="async"
            width={large ? 176 : 20}
            height={large ? 112 : 20}
            className={cn(
              "h-auto max-h-full w-auto max-w-full object-contain",
              large && "border border-border",
              loadedVersion !== version && "opacity-0"
            )}
            onLoad={() => setLoadedVersion(version)}
            onError={() => setFailedVersion(version)}
          />
        </>
      )}
    </span>
  )
}
