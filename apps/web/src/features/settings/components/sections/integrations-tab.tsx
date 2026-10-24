"use client"

import { useState } from "react"
import { PlusIcon } from "lucide-react"
import { toast } from "sonner"

import { HeaderActions } from "@/components/app-shell/header-actions"
import { Button } from "@/components/ui/button"

import { integrationsStore, useStore } from "../settings-store"
import { IntegrationList, type IntegrationRowActions } from "./integration-list"
import {
  IntegrationSheet,
  NewIntegrationSheet,
  type IntegrationActions,
  type IntegrationTab,
  type NewIntegrationInput,
} from "./integration-sheets"
import {
  catalogEntry,
  isConnected,
  type CatalogId,
  type IntegrationRecord,
} from "./integrations-data"
import { SettingsSection, SettingsSectionStack } from "./settings-section"
import {
  ConfirmRemoveDialog,
  TOAST_SUCCESS_ICON,
  UNDO_TOAST_MS,
} from "./sheet-parts"

const SYNC_MS = 1200

export function IntegrationsTabContent() {
  const records = useStore(integrationsStore)
  const setRecords = integrationsStore.set
  const [syncing, setSyncing] = useState<string | null>(null)

  // The drawer (sheet-22): which record and tab. Kept while it fades out.
  const [view, setView] = useState<{
    id: string | null
    tab: IntegrationTab
    open: boolean
  }>({ id: null, tab: "overview", open: false })
  // New Integration (sheet-23): a fresh flow on every open.
  const [add, setAdd] = useState<{
    open: boolean
    preset: CatalogId | null
    session: number
  }>({ open: false, preset: null, session: 0 })
  const [removing, setRemoving] = useState<IntegrationRecord | null>(null)
  const [removeOpen, setRemoveOpen] = useState(false)

  const tools = records.filter(
    (record) => catalogEntry(record.catalogId).group === "tools"
  )
  const automation = records.filter(
    (record) => catalogEntry(record.catalogId).group === "automation"
  )
  // The drawer steps through what has a drawer: the connected records.
  const connectedRecords = [...tools, ...automation].filter((record) =>
    isConnected(record.status)
  )
  const viewIndex = connectedRecords.findIndex(
    (record) => record.id === view.id
  )
  const viewRecord = records.find((record) => record.id === view.id)

  function patch(id: string, next: Partial<IntegrationRecord>) {
    setRecords((current) =>
      current.map((record) =>
        record.id === id ? { ...record, ...next } : record
      )
    )
  }

  function restore(original: IntegrationRecord, at: number) {
    setRecords((current) => {
      if (current.some((record) => record.id === original.id)) {
        return current.map((record) =>
          record.id === original.id ? original : record
        )
      }
      const next = [...current]
      next.splice(Math.min(at, next.length), 0, original)
      return next
    })
  }

  function openAdd(preset: CatalogId | null) {
    setAdd((current) => ({ open: true, preset, session: current.session + 1 }))
  }

  const actions: IntegrationActions = {
    sync: (id) => {
      setSyncing(id)
      window.setTimeout(() => {
        setSyncing(null)
        patch(id, { lastSync: "Just now" })
        const record = records.find((item) => item.id === id)
        toast.success("Sync finished", {
          closeButton: true,
          icon: TOAST_SUCCESS_ICON,
          description: record
            ? `${catalogEntry(record.catalogId).name} is up to date.`
            : undefined,
        })
      }, SYNC_MS)
    },
    togglePause: (id) => {
      const record = records.find((item) => item.id === id)
      if (!record) return
      const paused = record.status !== "paused"
      patch(id, { status: paused ? "paused" : "connected" })
      toast.success(paused ? "Sync paused" : "Sync resumed", {
        closeButton: true,
        icon: TOAST_SUCCESS_ICON,
        description: `${catalogEntry(record.catalogId).name} ${paused ? "waits until you resume it." : "is running again."}`,
      })
    },
    refreshToken: (record) => {
      const entry = catalogEntry(record.catalogId)
      toast.success(
        entry.auth === "oauth" ? "Authorization renewed" : "Key rotated",
        {
          closeButton: true,
          icon: TOAST_SUCCESS_ICON,
          description: `${entry.name} keeps working without a pause.`,
        }
      )
    },
    save: (id, draft) => {
      const index = records.findIndex((record) => record.id === id)
      const original = records[index]
      if (!original) return
      patch(id, draft)
      toast.success("Integration updated", {
        closeButton: true,
        icon: TOAST_SUCCESS_ICON,
        description: catalogEntry(original.catalogId).name,
        duration: UNDO_TOAST_MS,
        action: { label: "Undo", onClick: () => restore(original, index) },
      })
    },
    requestDisconnect: (record) => {
      setRemoving(record)
      setRemoveOpen(true)
    },
  }

  const rowActions: IntegrationRowActions = {
    manage: (id) => setView({ id, tab: "overview", open: true }),
    settings: (id) => setView({ id, tab: "settings", open: true }),
    connect: openAdd,
    togglePause: actions.togglePause,
    requestDisconnect: actions.requestDisconnect,
  }

  function handleCreate(input: NewIntegrationInput) {
    const entry = catalogEntry(input.catalogId)
    const existing = records.find(
      (record) => record.catalogId === input.catalogId
    )
    const id = existing?.id ?? `int-${input.catalogId}`
    const record: IntegrationRecord = {
      id,
      catalogId: input.catalogId,
      description:
        input.description || `Connected for ${entry.kind.toLowerCase()}.`,
      target: input.target,
      uses: input.uses,
      alertOnFailure: input.alertOnFailure,
      status: "connected",
      lastSync: "Just now",
      calls: 0,
    }
    // A listed service that was waiting for setup becomes the connection.
    setRecords((current) =>
      existing
        ? current.map((item) => (item.id === id ? record : item))
        : [...current, record]
    )
    toast.success(`${entry.name} connected`, {
      closeButton: true,
      icon: TOAST_SUCCESS_ICON,
      description: `Flowly signs in as ${entry.principal}.`,
      action: {
        label: "Open",
        onClick: () => setView({ id, tab: "overview", open: true }),
      },
    })
  }

  function confirmDisconnect() {
    const record = removing
    setRemoveOpen(false)
    if (!record) return
    const index = records.findIndex((item) => item.id === record.id)
    setRecords((current) => current.filter((item) => item.id !== record.id))
    if (view.id === record.id)
      setView((current) => ({ ...current, open: false }))
    const name = catalogEntry(record.catalogId).name
    toast.success(
      isConnected(record.status) ? `${name} disconnected` : `${name} removed`,
      {
        closeButton: true,
        icon: TOAST_SUCCESS_ICON,
        description: "Workflows that used it skip its steps until it is back.",
        duration: UNDO_TOAST_MS,
        action: { label: "Undo", onClick: () => restore(record, index) },
      }
    )
  }

  const removingName = removing
    ? catalogEntry(removing.catalogId).name
    : undefined

  return (
    <SettingsSectionStack>
      {/* The section's header action, where other pages show Publish. */}
      <HeaderActions>
        <Button type="button" onClick={() => openAdd(null)}>
          <PlusIcon aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">Add Integration</span>
        </Button>
      </HeaderActions>

      <SettingsSection title="Connected tools">
        <IntegrationList items={tools} actions={rowActions} />
      </SettingsSection>

      <SettingsSection title="Automation tools">
        <IntegrationList items={automation} actions={rowActions} />
      </SettingsSection>

      <IntegrationSheet
        open={view.open}
        onOpenChange={(open) => setView((current) => ({ ...current, open }))}
        record={viewRecord}
        tab={view.tab}
        onTabChange={(tab) => setView((current) => ({ ...current, tab }))}
        position={{
          index: Math.max(viewIndex, 0),
          total: connectedRecords.length,
        }}
        onStep={(direction) => {
          const next = connectedRecords[viewIndex + direction]
          if (next) setView((current) => ({ ...current, id: next.id }))
        }}
        syncing={syncing !== null && syncing === view.id}
        actions={actions}
      />
      <NewIntegrationSheet
        open={add.open}
        onOpenChange={(open) => setAdd((current) => ({ ...current, open }))}
        preset={add.preset}
        session={add.session}
        connected={records
          .filter((record) => isConnected(record.status))
          .map((record) => record.catalogId)}
        onCreate={handleCreate}
      />
      <ConfirmRemoveDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title={
          removing && isConnected(removing.status)
            ? "Disconnect Integration?"
            : "Remove Integration?"
        }
        subject={removingName}
        rest={
          removing && isConnected(removing.status)
            ? " stops at once. Workflows that call it skip those steps."
            : " leaves the list. You can add it again from New Integration."
        }
        action={
          removing && isConnected(removing.status) ? "Disconnect" : "Remove"
        }
        onConfirm={confirmDisconnect}
      />
    </SettingsSectionStack>
  )
}
