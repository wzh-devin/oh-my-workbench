// 增量计算完整 SHA-256，始终只读取 4 MiB，不将整份大文件载入内存。
import { createSHA256 } from "hash-wasm"

self.onmessage = async (event: MessageEvent<File>) => {
  try {
    const file = event.data,
      hash = await createSHA256()
    hash.init()
    for (let offset = 0; offset < file.size; offset += 4 << 20) {
      hash.update(
        new Uint8Array(
          await file.slice(offset, offset + (4 << 20)).arrayBuffer()
        )
      )
      self.postMessage({
        progress: Math.min(1, (offset + (4 << 20)) / file.size),
      })
    }
    self.postMessage({ hash: hash.digest("hex") })
  } catch {
    self.postMessage({ error: "计算文件指纹失败，请重新选择文件" })
  }
}
