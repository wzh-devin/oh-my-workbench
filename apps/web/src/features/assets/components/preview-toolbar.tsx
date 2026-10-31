import type { ComponentType, ReactNode } from "react"
import { MaximizeIcon, ZoomInIcon, ZoomOutIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

/** 图片与PDF使用同一组阅读操作，比例始终相对原始尺寸。 */
export function PreviewAction({
  label,
  icon: Icon,
  disabled,
  onClick,
}: {
  label: string
  icon: ComponentType<{ "aria-hidden"?: boolean }>
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={label}
            disabled={disabled}
            onClick={onClick}
          />
        }
      >
        <Icon aria-hidden />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

const levels = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]
export function PreviewToolbar({
  scale,
  onScaleChange,
  onFit,
  onFitWidth,
  disabled = false,
  maxScale = 4,
  children,
}: {
  scale: number
  onScaleChange: (scale: number) => void
  onFit: () => void
  onFitWidth?: () => void
  disabled?: boolean
  maxScale?: number
  children?: ReactNode
}) {
  return (
    <div
      role="toolbar"
      aria-label="预览操作"
      className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-b bg-background pb-2"
    >
      {children}
      <ButtonGroup aria-label="缩放">
        <PreviewAction
          label="缩小"
          icon={ZoomOutIcon}
          disabled={disabled || scale <= levels[0]}
          onClick={() =>
            onScaleChange(
              [...levels].reverse().find((value) => value < scale - 0.001) ??
                levels[0]
            )
          }
        />
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="min-w-16 tabular-nums"
                aria-label="缩放比例"
                disabled={disabled}
              />
            }
          >
            {Math.round(scale * 100)}%
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center">
            {onFitWidth && (
              <DropdownMenuItem onClick={onFitWidth}>适应宽度</DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={onFit}>适应窗口</DropdownMenuItem>
            {levels
              .filter((value) => value <= maxScale)
              .map((value) => (
                <DropdownMenuItem
                  key={value}
                  onClick={() => onScaleChange(value)}
                >
                  {Math.round(value * 100)}%
                </DropdownMenuItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <PreviewAction
          label="放大"
          icon={ZoomInIcon}
          disabled={disabled || scale >= maxScale}
          onClick={() =>
            onScaleChange(
              Math.min(
                maxScale,
                levels.find((value) => value > scale + 0.001) ?? maxScale
              )
            )
          }
        />
      </ButtonGroup>
      <ButtonGroup aria-label="显示尺寸">
        <PreviewAction
          label="适应窗口"
          icon={MaximizeIcon}
          disabled={disabled}
          onClick={onFit}
        />
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label="实际大小"
                disabled={disabled || maxScale < 1}
                onClick={() => onScaleChange(1)}
              />
            }
          >
            1:1
          </TooltipTrigger>
          <TooltipContent>实际大小</TooltipContent>
        </Tooltip>
      </ButtonGroup>
    </div>
  )
}
