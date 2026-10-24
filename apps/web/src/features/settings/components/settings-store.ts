import { useSyncExternalStore } from "react"

import { MEMBER_REVIEW_ITEMS, type MemberRecord } from "./sections/data"
import {
  SEED_INTEGRATIONS,
  type IntegrationRecord,
} from "./sections/integrations-data"
import { SEED_ENDPOINTS, type WebhookEndpoint } from "./sections/webhooks-data"

// What Settings' sections hold and the section panel's footer reports on.
// The sections live in the page and the footer in the shell, two trees, so
// the records sit outside both; they also outlive a switch between
// sections, so an invite or a new endpoint is still there on the way back.

type Updater<T> = T | ((current: T) => T)

export type Store<T> = {
  get: () => T
  set: (next: Updater<T>) => void
  subscribe: (listener: () => void) => () => void
  initial: T
}

function createStore<T>(initial: T): Store<T> {
  let value = initial
  const listeners = new Set<() => void>()

  return {
    initial,
    get: () => value,
    set: (next) => {
      value =
        typeof next === "function" ? (next as (current: T) => T)(value) : next
      listeners.forEach((listener) => listener())
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export function useStore<T>(store: Store<T>) {
  return useSyncExternalStore(store.subscribe, store.get, () => store.initial)
}

export const membersStore = createStore<MemberRecord[]>(MEMBER_REVIEW_ITEMS)

export const integrationsStore =
  createStore<IntegrationRecord[]>(SEED_INTEGRATIONS)

export const webhooksStore = createStore<WebhookEndpoint[]>(SEED_ENDPOINTS)

/** Whether every workflow run is paused: the header's Pause All Runs. */
export const runsPausedStore = createStore(false)
