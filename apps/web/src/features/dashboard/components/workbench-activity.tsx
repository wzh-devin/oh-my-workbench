import { activeAssets } from "@/features/assets/asset-rules"
import { Bar, BarChart, XAxis, YAxis } from "recharts"
import { Card, CardContent } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { EmptyState } from "@/features/workbench/components"
import type { Workbench } from "@/features/workbench/model"
import { SectionHeader } from "./section-header"

const CONFIG = {
  todos: { label: "新增待办", color: "var(--chart-1)" },
  mail: { label: "收到邮件", color: "var(--chart-2)" },
  assets: { label: "上传文件", color: "var(--chart-3)" },
} satisfies ChartConfig
const dayFormat = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "Asia/Shanghai",
})

/** 按最新记录所在日期回看七天，图中的数量完全来自工作台记录。 */
export const workbenchActivity = (data: Workbench) => {
  const assets = activeAssets(data)
  const timestamps = [
    ...Object.keys(data.todoSummary?.daily ?? {}).map(
      (day) => `${day}T12:00:00+08:00`
    ),
    ...Object.keys(data.mailSummary?.daily ?? {}).map(
      (day) => `${day}T12:00:00+08:00`
    ),
    ...Object.keys(data.assetSummary?.daily ?? {}).map(
      (day) => `${day}T12:00:00+08:00`
    ),
    ...data.todos.map((record) => record.createdAt),
    ...data.messages.map((record) => record.receivedAt),
    ...assets.map((record) => record.createdAt),
  ]
  if (data.mailSummary?.latestReceivedAt)
    timestamps.push(data.mailSummary.latestReceivedAt)
  const latest = timestamps.length
    ? Math.max(...timestamps.map((value) => new Date(value).getTime()))
    : Date.parse("2026-10-25T12:00:00+08:00")
  const reference = new Date(
    `${dayFormat.format(new Date(latest))}T12:00:00+08:00`
  )
  return Array.from({ length: 7 }, (_, index) => {
    const day = dayFormat.format(
      new Date(reference.getTime() - (6 - index) * 86400000)
    )
    return {
      day: day.slice(5).replace("-", "/"),
      todos:
        data.todoSummary?.daily[day] ??
        data.todos.filter(
          (record) => dayFormat.format(new Date(record.createdAt)) === day
        ).length,
      mail:
        data.mailSummary?.daily[day] ??
        data.messages.filter(
          (record) => dayFormat.format(new Date(record.receivedAt)) === day
        ).length,
      assets:
        data.assetSummary?.daily[day] ??
        assets.filter(
          (record) => dayFormat.format(new Date(record.createdAt)) === day
        ).length,
    }
  })
}

export function WorkbenchActivity({
  data,
  onEmpty,
}: {
  data: Workbench
  onEmpty: () => void
}) {
  const records = workbenchActivity(data)
  return (
    <Card className="min-w-0 gap-0 py-0 lg:col-span-2">
      <SectionHeader title="工作台活动" description={null}>
        <span className="text-xs text-muted-foreground">
          {records[0].day} — {records[records.length - 1].day}
        </span>
      </SectionHeader>
      <CardContent className="flex flex-col gap-3 py-4">
        {(data.todoSummary?.total ?? data.todos.length) +
        (data.mailSummary?.total ?? data.messages.length) +
        (data.assetSummary?.total ?? activeAssets(data).length) ? (
          <>
            <ChartContainer config={CONFIG} className="aspect-auto h-56 w-full">
              <BarChart data={records} accessibilityLayer>
                <XAxis
                  dataKey="day"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={10}
                />
                <YAxis
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  width={24}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar
                  dataKey="todos"
                  stackId="activity"
                  fill="var(--color-todos)"
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="mail"
                  stackId="activity"
                  fill="var(--color-mail)"
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="assets"
                  stackId="activity"
                  fill="var(--color-assets)"
                  isAnimationActive={false}
                />
              </BarChart>
            </ChartContainer>
            <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
              {Object.entries(CONFIG).map(([key, value]) => (
                <span key={key} className="flex items-center gap-2">
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: value.color }}
                  />
                  {value.label}
                </span>
              ))}
            </div>
          </>
        ) : (
          <EmptyState
            title="还没有活动记录"
            action="添加待办"
            onAction={onEmpty}
          />
        )}
      </CardContent>
    </Card>
  )
}
