import { useEffect, useState } from "react"
import { todayDate } from "./task-rules"

/** 页面跨午夜或从后台恢复时刷新日期，不批量改写任务。 */
export function useToday() {
  const [today, setToday] = useState("")
  useEffect(() => {
    const refresh = () => setToday(todayDate())
    refresh()
    const timer = window.setInterval(refresh, 60000)
    window.addEventListener("focus", refresh)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener("focus", refresh)
    }
  }, [])
  return today
}
