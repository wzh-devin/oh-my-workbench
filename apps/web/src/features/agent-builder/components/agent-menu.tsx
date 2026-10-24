import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  MoreHorizontalIcon,
  CircleDotIcon,
  RotateCcwIcon,
  CopyIcon,
} from "lucide-react"

interface AgentMenuProps {
  onClearRun: () => void
  onRestoreSample: () => void
  onCopyJson: () => void
}

/** What the whole agent owns, next to the per node menu each card carries. */
export function AgentMenu({
  onClearRun,
  onRestoreSample,
  onCopyJson,
}: AgentMenuProps) {
  return (
    <DropdownMenu>
      {/* The Dashboard's More options button: ghost, no border, and the
          menu opens 7px below it. */}
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" aria-label="Agent actions" />
        }
      >
        <MoreHorizontalIcon aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent sideOffset={7} align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Last run</DropdownMenuLabel>
          <DropdownMenuItem onClick={onClearRun}>
            {/* The idle mark, which is what every step wears afterwards. */}
            <CircleDotIcon aria-hidden="true" />
            Clear results
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onRestoreSample}>
            <RotateCcwIcon aria-hidden="true" />
            Restore sample
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Agent</DropdownMenuLabel>
          <DropdownMenuItem onClick={onCopyJson}>
            <CopyIcon aria-hidden="true" />
            Copy as JSON
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
