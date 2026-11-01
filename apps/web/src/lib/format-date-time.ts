const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
})

/** 时间字段统一保留年和秒，沿用本地时区；缺失或无效值显示占位。 */
export const formatDateTime = (value: unknown): string => {
  const date =
    value instanceof Date
      ? value
      : typeof value === "string" && value
        ? new Date(value)
        : null
  return date && Number.isFinite(date.getTime())
    ? dateTimeFormatter.format(date)
    : "—"
}
