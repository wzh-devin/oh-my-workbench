/**
 * The sign-in page's sheets, laid out like the Workflows drawer: a floating
 * inset shell 16px off the viewport edges, a bordered header band, a scrolling
 * body and a pinned muted footer.
 */

/** The floating inset shell: header band, scroll body, pinned footer. */
export const SHEET_SHELL =
  "inset-y-4 right-4 left-auto flex h-[calc(100svh-2rem)] w-[min(var(--sheet-width),calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden rounded-xl p-0 outline-none data-[side=right]:inset-y-4 data-[side=right]:right-4 data-[side=right]:h-[calc(100svh-2rem)] data-[side=right]:w-[min(var(--sheet-width),calc(100vw-2rem))] data-[side=right]:sm:max-w-none"

/** Title and Close on one line, the description under them. */
export const SHEET_HEADER = "flex shrink-0 flex-col border-b px-5 py-3.5"

/** Only the body scrolls; the header band and footer stay put. */
export const SHEET_BODY = "scroll-fade-y min-h-0 flex-1"

/** Pinned under the scrolling body; px-5 keeps it on the band's spine. */
export const SHEET_FOOTER =
  "flex shrink-0 items-center justify-end gap-2 border-t bg-muted px-5 py-3"
