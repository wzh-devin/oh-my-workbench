"use client"

import { Fragment, useRef, useState } from "react"
import { Badge } from "@/components/reui/badge"
import {
  MoreHorizontalIcon,
  PauseCircleIcon,
  PlayCircleIcon,
  PlusIcon,
  SendIcon,
  SettingsIcon,
  Trash2Icon,
  WebhookIcon,
} from "lucide-react"
import { toast } from "sonner"

import { HeaderActions } from "@/components/app-shell/header-actions"
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

import { useStore, webhooksStore } from "../settings-store"
import { ProfileIconContainer } from "./profile-icon-container"
import { SettingsSection, SettingsSectionStack } from "./settings-section"
import {
  ConfirmRemoveDialog,
  TOAST_SUCCESS_ICON,
  UNDO_TOAST_MS,
} from "./sheet-parts"
import {
  NewWebhookSheet,
  shortUrl,
  WebhookSheet,
  type WebhookActions,
  type WebhookTab,
} from "./webhook-sheets"
import {
  WEBHOOK_STATUS_FACE,
  type WebhookDraft,
  type WebhookEndpoint,
} from "./webhooks-data"

const TEST_MS = 900

// Webhooks: the workspace's endpoints as profile-2 rows, each opening its
// drawer (sheet-22); Add Endpoint (sheet-21) sits in the header.
export function WebhooksTabContent() {
  const endpoints = useStore(webhooksStore)
  const setEndpoints = webhooksStore.set
  const [testing, setTesting] = useState<string | null>(null)
  const [view, setView] = useState<{
    id: string | null
    tab: WebhookTab
    open: boolean
  }>({ id: null, tab: "overview", open: false })
  const [add, setAdd] = useState({ open: false, session: 0 })
  const [removing, setRemoving] = useState<WebhookEndpoint | null>(null)
  const [removeOpen, setRemoveOpen] = useState(false)
  /** Counts every id and secret issued here, so no two ever match. */
  const issued = useRef(0)

  const viewIndex = endpoints.findIndex((endpoint) => endpoint.id === view.id)
  const viewEndpoint = endpoints[viewIndex]

  function patch(id: string, next: Partial<WebhookEndpoint>) {
    setEndpoints((current) =>
      current.map((endpoint) =>
        endpoint.id === id ? { ...endpoint, ...next } : endpoint
      )
    )
  }

  function restore(original: WebhookEndpoint, at: number) {
    setEndpoints((current) => {
      if (current.some((endpoint) => endpoint.id === original.id)) {
        return current.map((endpoint) =>
          endpoint.id === original.id ? original : endpoint
        )
      }
      const next = [...current]
      next.splice(Math.min(at, next.length), 0, original)
      return next
    })
  }

  const actions: WebhookActions = {
    sendTest: (id) => {
      const endpoint = endpoints.find((item) => item.id === id)
      if (!endpoint) return
      setTesting(id)
      window.setTimeout(() => {
        setTesting(null)
        const event = endpoint.events[0]
        setEndpoints((current) =>
          current.map((item) =>
            item.id === id
              ? {
                  ...item,
                  lastDelivery: "Just now",
                  deliveries: [
                    {
                      id: `dlv-test-${item.deliveries.length + 1}`,
                      event,
                      code: 200,
                      ms: 182,
                      at: "Just now",
                    },
                    ...item.deliveries,
                  ].slice(0, 5),
                }
              : item
          )
        )
        toast.success("Test event delivered", {
          closeButton: true,
          icon: TOAST_SUCCESS_ICON,
          description: `${event} answered 200 OK in 182 ms.`,
        })
      }, TEST_MS)
    },
    togglePause: (id) => {
      const endpoint = endpoints.find((item) => item.id === id)
      if (!endpoint) return
      const paused = endpoint.status !== "paused"
      patch(id, { status: paused ? "paused" : "delivering" })
      toast.success(paused ? "Endpoint paused" : "Endpoint resumed", {
        closeButton: true,
        icon: TOAST_SUCCESS_ICON,
        description: paused
          ? "Events queue for 72 hours, then drop."
          : "Queued events are on their way.",
      })
    },
    rotateSecret: (endpoint) => {
      issued.current += 1
      const tail = (
        (parseInt(endpoint.secretTail, 16) + 0x3b7 * issued.current) %
        0xffff
      )
        .toString(16)
        .padStart(4, "0")
      patch(endpoint.id, { secretTail: tail })
      toast.success("Signing secret rotated", {
        closeButton: true,
        icon: TOAST_SUCCESS_ICON,
        description: "The old secret keeps working for 24 hours.",
      })
    },
    save: (id, draft) => {
      const index = endpoints.findIndex((endpoint) => endpoint.id === id)
      const original = endpoints[index]
      if (!original) return
      patch(id, draft)
      toast.success("Endpoint updated", {
        closeButton: true,
        icon: TOAST_SUCCESS_ICON,
        description: shortUrl(draft.url),
        duration: UNDO_TOAST_MS,
        action: { label: "Undo", onClick: () => restore(original, index) },
      })
    },
    requestDelete: (endpoint) => {
      setRemoving(endpoint)
      setRemoveOpen(true)
    },
  }

  function handleCreate(draft: WebhookDraft) {
    issued.current += 1
    const id = `whk-new-${issued.current}`
    const endpoint: WebhookEndpoint = {
      ...draft,
      id,
      status: "delivering",
      successRate: 100,
      lastDelivery: "Never",
      secretTail: (0x5a17 + issued.current).toString(16),
      deliveries: [],
    }
    setEndpoints((current) => [...current, endpoint])
    toast.success("Endpoint added", {
      closeButton: true,
      icon: TOAST_SUCCESS_ICON,
      description: shortUrl(draft.url),
      action: {
        label: "Open",
        onClick: () => setView({ id, tab: "overview", open: true }),
      },
    })
  }

  function confirmDelete() {
    const endpoint = removing
    setRemoveOpen(false)
    if (!endpoint) return
    const index = endpoints.findIndex((item) => item.id === endpoint.id)
    setEndpoints((current) => current.filter((item) => item.id !== endpoint.id))
    if (view.id === endpoint.id)
      setView((current) => ({ ...current, open: false }))
    toast.success("Endpoint deleted", {
      closeButton: true,
      icon: TOAST_SUCCESS_ICON,
      description: shortUrl(endpoint.url),
      duration: UNDO_TOAST_MS,
      action: { label: "Undo", onClick: () => restore(endpoint, index) },
    })
  }

  return (
    <SettingsSectionStack>
      {/* The section's header action, where other pages show Publish. */}
      <HeaderActions>
        <Button
          type="button"
          onClick={() =>
            setAdd((current) => ({ open: true, session: current.session + 1 }))
          }
        >
          <PlusIcon aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">Add Endpoint</span>
        </Button>
      </HeaderActions>

      <SettingsSection title="Endpoints">
        {endpoints.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">
            No endpoints yet. Add one to receive run events.
          </p>
        ) : (
          <div className="flex flex-col">
            {endpoints.map((endpoint, index) => {
              const face = WEBHOOK_STATUS_FACE[endpoint.status]
              const paused = endpoint.status === "paused"
              return (
                <Fragment key={endpoint.id}>
                  {index > 0 ? <Separator /> : null}
                  <Item size="sm">
                    <ItemMedia>
                      <ProfileIconContainer>
                        <WebhookIcon aria-hidden="true" />
                      </ProfileIconContainer>
                    </ItemMedia>
                    <ItemContent className="min-w-0 gap-1">
                      <ItemTitle className="max-w-full min-w-0">
                        <span className="truncate font-mono text-xs">
                          {shortUrl(endpoint.url)}
                        </span>
                      </ItemTitle>
                      <ItemDescription>{endpoint.description}</ItemDescription>
                      <p className="truncate text-sm text-muted-foreground tabular-nums">
                        {endpoint.events.length} event
                        {endpoint.events.length === 1 ? "" : "s"},{" "}
                        {endpoint.successRate}% delivered
                      </p>
                    </ItemContent>
                    <ItemActions className="w-full flex-wrap justify-end gap-2 sm:w-auto sm:self-center">
                      <Badge variant={face.variant}>{face.label}</Badge>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          setView({
                            id: endpoint.id,
                            tab: "overview",
                            open: true,
                          })
                        }
                      >
                        Manage
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="text-muted-foreground"
                              aria-label={`Open ${shortUrl(endpoint.url)} actions`}
                            />
                          }
                        >
                          <MoreHorizontalIcon aria-hidden="true" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuGroup>
                            <DropdownMenuItem
                              onClick={() =>
                                setView({
                                  id: endpoint.id,
                                  tab: "settings",
                                  open: true,
                                })
                              }
                            >
                              <SettingsIcon aria-hidden="true" />
                              Settings
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={paused}
                              onClick={() => actions.sendTest(endpoint.id)}
                            >
                              <SendIcon aria-hidden="true" />
                              Send test
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => actions.togglePause(endpoint.id)}
                            >
                              {paused ? (
                                <PlayCircleIcon aria-hidden="true" />
                              ) : (
                                <PauseCircleIcon aria-hidden="true" />
                              )}
                              {paused ? "Resume" : "Pause"}
                            </DropdownMenuItem>
                          </DropdownMenuGroup>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => actions.requestDelete(endpoint)}
                          >
                            <Trash2Icon aria-hidden="true" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </ItemActions>
                  </Item>
                </Fragment>
              )
            })}
          </div>
        )}
      </SettingsSection>

      <WebhookSheet
        open={view.open}
        onOpenChange={(open) => setView((current) => ({ ...current, open }))}
        endpoint={viewEndpoint}
        takenUrls={endpoints
          .filter((endpoint) => endpoint.id !== view.id)
          .map((endpoint) => endpoint.url)}
        tab={view.tab}
        onTabChange={(tab) => setView((current) => ({ ...current, tab }))}
        position={{ index: Math.max(viewIndex, 0), total: endpoints.length }}
        onStep={(direction) => {
          const next = endpoints[viewIndex + direction]
          if (next) setView((current) => ({ ...current, id: next.id }))
        }}
        testing={testing !== null && testing === view.id}
        actions={actions}
      />
      <NewWebhookSheet
        open={add.open}
        onOpenChange={(open) => setAdd((current) => ({ ...current, open }))}
        session={add.session}
        takenUrls={endpoints.map((endpoint) => endpoint.url)}
        onCreate={handleCreate}
      />
      <ConfirmRemoveDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title="Delete Endpoint?"
        subject={removing ? shortUrl(removing.url) : undefined}
        rest=" stops receiving events at once. Its delivery history goes with it."
        action="Delete Endpoint"
        onConfirm={confirmDelete}
      />
    </SettingsSectionStack>
  )
}
