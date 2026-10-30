import { Gmail } from "@/components/ui/svgs/gmail"
import type { MailAccount } from "../model"

export function MailProviderIcon({
  provider,
}: {
  provider: MailAccount["provider"]
}) {
  return provider === "Gmail" ? (
    <Gmail className="size-4 shrink-0" aria-hidden="true" />
  ) : (
    <img
      src="/icons/qq-mail.png"
      className="size-4 shrink-0"
      alt=""
      aria-hidden="true"
    />
  )
}
