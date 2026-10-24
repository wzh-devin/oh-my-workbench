/**
 * The hourly column grammar of the workflow sheet's Last 24 Hours chart: a
 * muted track per hour, stacked segments that rest hatched and turn solid
 * while their column sits under the pointer or keyboard.
 */
import { useEffect } from "react"
import { cn } from "@/lib/utils"
import { Rectangle, useActiveTooltipLabel, type BarShapeProps } from "recharts"

/** Each segment is its own pill: this corner, and this much air between. */
const RADIUS = 4
const SEGMENT_GAP = 2

/** The full-height track the first series lays behind every column. */
export const HOUR_TRACK = { fill: "var(--muted)", radius: 6 }

/** Reports the column under the pointer or keyboard, so it can go solid. */
export function ActiveLabelReporter({
  onChange,
}: {
  onChange: (label: string | null) => void
}) {
  const label = useActiveTooltipLabel()
  useEffect(() => {
    onChange(label === undefined || label === null ? null : String(label))
  }, [label, onChange])
  return null
}

/** One diagonal hatch per series, addressed as `url(#<uid>-<key>)`. */
export function hatchDefs(uid: string, keys: readonly string[]) {
  return (
    <defs>
      {keys.map((key) => (
        <pattern
          key={key}
          id={`${uid}-${key}`}
          width={5}
          height={5}
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect
            width={5}
            height={5}
            fill={`var(--color-${key})`}
            fillOpacity={0.22}
          />
          <rect
            width={2}
            height={5}
            fill={`var(--color-${key})`}
            fillOpacity={0.5}
          />
        </pattern>
      ))}
    </defs>
  )
}

function fieldOf(payload: unknown, key: string): unknown {
  if (typeof payload !== "object" || payload === null) return undefined
  return Reflect.get(payload, key)
}

const amountOf = (payload: unknown, key: string) => {
  const value = fieldOf(payload, key)
  return typeof value === "number" ? value : 0
}

/** A stacked segment: gapped from its neighbours, solid while active. */
export function renderHourSegment(
  props: BarShapeProps,
  key: string,
  stack: readonly string[],
  active: string | null,
  uid: string
) {
  if (amountOf(props.payload, key) === 0) return <g />
  const filled = stack.filter((item) => amountOf(props.payload, item) > 0)
  const at = filled.indexOf(key)
  const above = at < filled.length - 1 ? SEGMENT_GAP / 2 : 0
  const below = at > 0 ? SEGMENT_GAP / 2 : 0
  const lit = active !== null && fieldOf(props.payload, "label") === active
  return (
    <Rectangle
      x={props.x}
      y={props.y + above}
      width={props.width}
      height={Math.max(1, props.height - above - below)}
      radius={RADIUS}
      fill={lit ? `var(--color-${key})` : `url(#${uid}-${key})`}
    />
  )
}

/** The dot legend a chart carries in its header band. */
export function HourLegend({
  items,
}: {
  items: { key: string; label: string; tone: string }[]
}) {
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={cn("size-2 rounded-full", item.tone)}
          />
          {item.label}
        </li>
      ))}
    </ul>
  )
}
