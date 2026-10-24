"use client"

import { useState } from "react"
import { XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet"

import { LEGAL_DOCS, type LegalDoc } from "./data"
import {
  SHEET_BODY,
  SHEET_FOOTER,
  SHEET_HEADER,
  SHEET_SHELL,
} from "./sheet-layout"

// Terms and Privacy open over the sign-in page instead of leaving it, so a
// half-typed email survives reading them.
export function LegalSheet({
  doc,
  onClose,
}: {
  doc: LegalDoc | null
  onClose: () => void
}) {
  // The last doc stays rendered while the sheet slides out.
  const [shown, setShown] = useState<LegalDoc>("terms")
  if (doc && doc !== shown) setShown(doc)
  const content = LEGAL_DOCS[doc ?? shown]

  return (
    <Sheet open={doc !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className={SHEET_SHELL}
      >
        {/* Header band */}
        <div className={SHEET_HEADER}>
          <div className="flex items-center justify-between gap-2">
            <SheetTitle className="min-w-0 text-lg">{content.title}</SheetTitle>
            <SheetClose
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Close"
                />
              }
            >
              <XIcon aria-hidden="true" />
            </SheetClose>
          </div>
          <SheetDescription className="mt-1">
            {content.updated}
          </SheetDescription>
        </div>

        <ScrollArea className={SHEET_BODY}>
          <div className="flex flex-col gap-5 px-5 py-5">
            {content.sections.map((section) => (
              <section key={section.heading} className="flex flex-col gap-1.5">
                <h3 className="text-sm font-medium">{section.heading}</h3>
                <p className="text-sm leading-6 text-pretty text-muted-foreground">
                  {section.body}
                </p>
              </section>
            ))}
          </div>
        </ScrollArea>

        <div className={SHEET_FOOTER}>
          <SheetClose render={<Button type="button" variant="outline" />}>
            Done
          </SheetClose>
        </div>
      </SheetContent>
    </Sheet>
  )
}
