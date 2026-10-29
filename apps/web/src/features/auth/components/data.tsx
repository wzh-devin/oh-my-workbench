import { GithubDark } from "@/components/ui/svgs/githubDark"
import { GithubLight } from "@/components/ui/svgs/githubLight"
import { Google } from "@/components/ui/svgs/google"

export const AUTH_PROVIDERS = [
  {
    id: "google",
    label: "Google 登录",
    logo: <Google aria-hidden="true" data-icon="inline-start" />,
  },
  {
    id: "github",
    label: "GitHub 登录",
    logo: (
      <>
        <GithubLight
          aria-hidden="true"
          data-icon="inline-start"
          className="dark:hidden"
        />
        <GithubDark
          aria-hidden="true"
          data-icon="inline-start"
          className="hidden dark:block"
        />
      </>
    ),
  },
]
