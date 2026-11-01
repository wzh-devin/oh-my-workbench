/** 和上传副本命名一致：点文件不拆后缀，常见压缩包保留复合后缀。 */
export const fileNameParts = (name: string) => {
  const compound = [".tar.gz", ".tar.bz2", ".tar.xz", ".tar.zst"].find(
    (suffix) =>
      name.length > suffix.length && name.toLowerCase().endsWith(suffix)
  )
  const dot = compound ? name.length - compound.length : name.lastIndexOf(".")
  return dot > 0
    ? { stem: name.slice(0, dot), extension: name.slice(dot) }
    : { stem: name, extension: "" }
}
