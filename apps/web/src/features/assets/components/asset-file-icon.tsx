import {
  FileType,
  getFileType,
  type FileTypeProps,
} from "@/components/reui/file-type"
import type { Asset } from "@/features/workbench/model"

/** 文件名优先识别格式，无扩展名时使用 MIME，供列表、预览与上传共用。 */
export function AssetFileIcon({
  file,
  size = "mini",
}: {
  file: Pick<Asset, "name" | "type">
  size?: FileTypeProps["size"]
}) {
  const type = getFileType(file.name)
  return (
    <FileType
      type={type === "empty" ? getFileType(file.type) : type}
      size={size}
      aria-hidden="true"
    />
  )
}
