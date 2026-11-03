import { randomBytes, randomUUID } from "node:crypto"
import { mkdir, open, readFile, stat } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

// Create exclusively: reruns must never replace the only key for existing notes.
const target = process.argv[2]
  ? resolve(process.argv[2])
  : fileURLToPath(new URL("../.secrets/notes-keys.json", import.meta.url))

try {
  await mkdir(dirname(target), { recursive: true, mode: 0o700 })
  const active = randomUUID()
  const keyring = {
    active,
    keys: { [active]: randomBytes(32).toString("base64") },
  }
  try {
    const file = await open(target, "wx", 0o600)
    try {
      await file.writeFile(JSON.stringify(keyring) + "\n")
      await file.sync()
    } finally {
      await file.close()
    }
    process.stdout.write("记事本独立密钥已创建，请单独备份并重启 API。\n")
  } catch (error) {
    if (error.code !== "EEXIST") throw error
    const info = await stat(target)
    if (!info.isFile() || info.size > 16384)
      throw new Error("existing_key_invalid", { cause: error })
    const existing = JSON.parse(await readFile(target, "utf8"))
    if (
      typeof existing?.active !== "string" ||
      !/^[a-zA-Z0-9-]{1,64}$/.test(existing.active) ||
      !existing.keys ||
      typeof existing.keys !== "object" ||
      Array.isArray(existing.keys) ||
      !Object.hasOwn(existing.keys, existing.active) ||
      Object.keys(existing.keys).length > 16 ||
      Object.entries(existing.keys).some(
        ([id, value]) =>
          !/^[a-zA-Z0-9-]{1,64}$/.test(id) ||
          typeof value !== "string" ||
          !/^[A-Za-z0-9+/]{43}=$/.test(value) ||
          Buffer.from(value, "base64").length !== 32
      )
    ) {
      throw new Error("existing_key_invalid", { cause: error })
    }
    process.stdout.write("记事本独立密钥已存在，未作修改。\n")
  }
} catch {
  process.stderr.write(
    "无法初始化记事本密钥：请检查目标文件、权限与已有备份；原文件不会被覆盖。\n"
  )
  process.exitCode = 1
}
