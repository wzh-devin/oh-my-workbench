import type { ReactNode } from "react"
import { KeyRoundIcon } from "lucide-react"

import { AnthropicBlackWordmark } from "@/components/ui/svgs/anthropicBlackWordmark"
import { AnthropicWhiteWordmark } from "@/components/ui/svgs/anthropicWhiteWordmark"
import { GithubDark } from "@/components/ui/svgs/githubDark"
import { GithubLight } from "@/components/ui/svgs/githubLight"
import { Google } from "@/components/ui/svgs/google"
import { NvidiaWordmarkDark } from "@/components/ui/svgs/nvidiaWordmarkDark"
import { NvidiaWordmarkLight } from "@/components/ui/svgs/nvidiaWordmarkLight"
import { OpenaiWordmarkDark } from "@/components/ui/svgs/openaiWordmarkDark"
import { OpenaiWordmarkLight } from "@/components/ui/svgs/openaiWordmarkLight"
import { ResendWordmarkBlack } from "@/components/ui/svgs/resendWordmarkBlack"
import { ResendWordmarkWhite } from "@/components/ui/svgs/resendWordmarkWhite"
import { SupabaseWordmarkDark } from "@/components/ui/svgs/supabaseWordmarkDark"
import { SupabaseWordmarkLight } from "@/components/ui/svgs/supabaseWordmarkLight"

export type AuthProvider = {
  id: string
  label: string
  logo: ReactNode
}

export type TrustBrand = {
  id: string
  name: string
  logo: ReactNode
}

function ThemeLogo({ light, dark }: { light: ReactNode; dark: ReactNode }) {
  return (
    <>
      <span aria-hidden="true" className="dark:hidden">
        {light}
      </span>
      <span aria-hidden="true" className="hidden dark:block">
        {dark}
      </span>
    </>
  )
}

export const AUTH_PROVIDERS: AuthProvider[] = [
  {
    id: "google",
    label: "Continue with Google",
    logo: <Google aria-hidden="true" data-icon="inline-start" />,
  },
  {
    id: "github",
    label: "Continue with GitHub",
    logo: (
      <ThemeLogo
        light={<GithubLight aria-hidden="true" data-icon="inline-start" />}
        dark={<GithubDark aria-hidden="true" data-icon="inline-start" />}
      />
    ),
  },
  {
    id: "sso",
    label: "Use Single Sign-On",
    logo: <KeyRoundIcon aria-hidden="true" data-icon="inline-start" />,
  },
]

export const TRUST_BRANDS: TrustBrand[] = [
  {
    id: "anthropic",
    name: "Anthropic",
    logo: (
      <ThemeLogo
        light={
          <AnthropicBlackWordmark className="h-3 w-auto" aria-hidden="true" />
        }
        dark={
          <AnthropicWhiteWordmark className="h-3 w-auto" aria-hidden="true" />
        }
      />
    ),
  },
  {
    id: "supabase",
    name: "Supabase",
    logo: (
      <ThemeLogo
        light={
          <SupabaseWordmarkLight className="h-4 w-auto" aria-hidden="true" />
        }
        dark={
          <SupabaseWordmarkDark className="h-4 w-auto" aria-hidden="true" />
        }
      />
    ),
  },
  {
    id: "nvidia",
    name: "NVIDIA",
    logo: (
      <ThemeLogo
        light={
          <NvidiaWordmarkLight className="h-3.5 w-auto" aria-hidden="true" />
        }
        dark={
          <NvidiaWordmarkDark className="h-3.5 w-auto" aria-hidden="true" />
        }
      />
    ),
  },
  {
    id: "resend",
    name: "Resend",
    logo: (
      <ThemeLogo
        light={
          <ResendWordmarkBlack className="h-3 w-auto" aria-hidden="true" />
        }
        dark={<ResendWordmarkWhite className="h-3 w-auto" aria-hidden="true" />}
      />
    ),
  },
  {
    id: "openai",
    name: "OpenAI",
    logo: (
      <ThemeLogo
        light={
          <OpenaiWordmarkLight className="h-4 w-auto" aria-hidden="true" />
        }
        dark={<OpenaiWordmarkDark className="h-4 w-auto" aria-hidden="true" />}
      />
    ),
  },
]

// Where a signed-in member lands: the default page.
export const SIGNED_IN_HREF = "/dashboard"

export type LegalDoc = "terms" | "privacy"

export const LEGAL_DOCS: Record<
  LegalDoc,
  {
    title: string
    updated: string
    sections: { heading: string; body: string }[]
  }
> = {
  terms: {
    title: "Terms of Service",
    updated: "Last updated September 1, 2026",
    sections: [
      {
        heading: "Your workspace",
        body: "Your organisation owns its Flowly workspace and everything in it: workflows, agents, connections and run history. Admins decide who is invited and what each member can change.",
      },
      {
        heading: "Acceptable use",
        body: "Do not use Flowly to send unsolicited messages, scrape services against their terms or run workloads meant to disrupt other systems. We may pause a workflow that does.",
      },
      {
        heading: "Availability",
        body: "We aim for 99.9% monthly uptime for the editor and the run engine. Scheduled maintenance is announced in the app at least 48 hours ahead.",
      },
      {
        heading: "Ending your plan",
        body: "You can export every workflow and run log at any time. After a workspace is closed, its data is kept for 30 days and then deleted.",
      },
    ],
  },
  privacy: {
    title: "Privacy Policy",
    updated: "Last updated September 1, 2026",
    sections: [
      {
        heading: "What we collect",
        body: "Your name, work email and sign-in events, plus the workflows and run logs your team creates. Credentials for connected apps are encrypted and never shown again after they are saved.",
      },
      {
        heading: "How we use it",
        body: "To run your workflows, keep your account secure and send the notifications you choose. We do not sell personal data or use run payloads to train models.",
      },
      {
        heading: "Where it lives",
        body: "Workspace data is stored in the region picked when the workspace was created, encrypted at rest and in transit.",
      },
      {
        heading: "Your choices",
        body: "Members can download or delete their personal data from Settings. Workspace admins can request a full export by contacting support.",
      },
    ],
  },
}
