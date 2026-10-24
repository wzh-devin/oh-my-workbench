"use client"

import { Fragment } from "react"
import { Badge } from "@/components/reui/badge"
import {
  MoreHorizontalIcon,
  PauseCircleIcon,
  PlayCircleIcon,
  SettingsIcon,
  UnplugIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import { Separator } from "@/components/ui/separator"

import {
  catalogEntry,
  isConnected,
  STATUS_FACE,
  type CatalogId,
  type IntegrationRecord,
} from "./integrations-data"
import { ProfileIconContainer } from "./profile-icon-container"

/** What a row asks of the tab, which owns the records and the sheets. */
export type IntegrationRowActions = {
  manage: (id: string) => void
  settings: (id: string) => void
  connect: (catalogId: CatalogId) => void
  togglePause: (id: string) => void
  requestDisconnect: (record: IntegrationRecord) => void
}

// The profile-2 block's integration rows. Manage opens the integration's
// drawer, Connect the setup that ends in it.
export function IntegrationList({
  items,
  actions,
}: {
  items: IntegrationRecord[]
  actions: IntegrationRowActions
}) {
  return (
    <div className="flex flex-col">
      {items.map((item, index) => {
        const entry = catalogEntry(item.catalogId)
        const face = STATUS_FACE[item.status]
        const connected = isConnected(item.status)

        return (
          <Fragment key={item.id}>
            {index > 0 ? <Separator /> : null}

            <Item size="sm">
              <ItemMedia>
                <ProfileIconContainer>{entry.logo}</ProfileIconContainer>
              </ItemMedia>

              <ItemContent className="min-w-0 gap-1">
                <ItemTitle>{entry.name}</ItemTitle>
                <ItemDescription>{item.description}</ItemDescription>
                <p className="truncate text-sm text-muted-foreground">
                  {connected
                    ? `${entry.targetLabel}: ${item.target}`
                    : `Ready for ${item.target}`}
                </p>
              </ItemContent>

              <ItemActions className="w-full flex-wrap justify-end gap-2 sm:w-auto sm:self-center">
                <Badge variant={face.variant}>{face.label}</Badge>

                {connected ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => actions.manage(item.id)}
                  >
                    Manage
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={() => actions.connect(item.catalogId)}
                  >
                    Connect
                  </Button>
                )}

                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="text-muted-foreground"
                        aria-label={`Open ${entry.name} actions`}
                      />
                    }
                  >
                    <MoreHorizontalIcon aria-hidden="true" />
                  </DropdownMenuTrigger>

                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuGroup>
                      {connected ? (
                        <>
                          <DropdownMenuItem
                            onClick={() => actions.settings(item.id)}
                          >
                            <SettingsIcon aria-hidden="true" />
                            Settings
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => actions.togglePause(item.id)}
                          >
                            {item.status === "paused" ? (
                              <PlayCircleIcon aria-hidden="true" />
                            ) : (
                              <PauseCircleIcon aria-hidden="true" />
                            )}
                            {item.status === "paused"
                              ? "Resume sync"
                              : "Pause sync"}
                          </DropdownMenuItem>
                        </>
                      ) : (
                        <DropdownMenuItem
                          onClick={() => actions.connect(item.catalogId)}
                        >
                          <SettingsIcon aria-hidden="true" />
                          Set up
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => actions.requestDisconnect(item)}
                    >
                      <UnplugIcon aria-hidden="true" />
                      {connected ? "Disconnect" : "Remove"}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </ItemActions>
            </Item>
          </Fragment>
        )
      })}
    </div>
  )
}
