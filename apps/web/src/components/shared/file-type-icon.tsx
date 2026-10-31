import {
  FileType,
  getFileType,
  type FileTypeProps,
} from "@/components/reui/file-type"
import { FileArchiveIcon } from "lucide-react"

/** 文件名优先识别格式，无扩展名时使用 MIME，供列表、预览与上传共用。 */
export function FileTypeIcon({
  file,
  size = "mini",
}: {
  file: { name: string; type: string }
  size?: FileTypeProps["size"]
}) {
  const type = getFileType(file.name)
  if (
    /\.(zip|rar|7z|tar|gz|bz2|xz|tgz|tbz2|zst)$/i.test(file.name) ||
    /^(application\/(zip|x-(tar|7z-compressed|rar-compressed|gzip|bzip2|xz)|vnd\.rar|gzip))$/i.test(
      file.type
    )
  ) {
    const sizes = {
      mini: "size-4.5",
      xs: "size-6",
      sm: "size-8",
      default: "size-10",
      lg: "size-12",
      xl: "size-14",
    }
    return (
      <FileArchiveIcon
        className={`${sizes[size ?? "mini"]} shrink-0 text-muted-foreground`}
        strokeWidth={1.5}
        aria-hidden="true"
      />
    )
  }
  return (
    <FileType
      type={type === "empty" ? getFileType(file.type) : type}
      size={size}
      aria-hidden="true"
    />
  )
}
