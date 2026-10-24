// ── Team ──
// The Flowly workspace's people, one list for every page: the signed-in user
// in the account menu, the owners in Workflows and Agents, the Dashboard's
// presence stack. A name or role changed here changes everywhere.

export type TeamMemberId = "nick" | "ines" | "tomas" | "hanna" | "omar" | "lena"

export type TeamMember = {
  id: TeamMemberId
  name: string
  role: string
  initials: string
  avatarSrc: string
}

export const TEAM: Record<TeamMemberId, TeamMember> = {
  nick: {
    id: "nick",
    name: "Nick Bold",
    role: "Workspace Admin",
    initials: "NB",
    avatarSrc:
      "https://images.unsplash.com/photo-1543299750-19d1d6297053?w=96&h=96&dpr=2&q=80",
  },
  ines: {
    id: "ines",
    name: "Ines Marchetti",
    role: "Head of Operations",
    initials: "IM",
    avatarSrc:
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=96&h=96&dpr=2&q=80",
  },
  tomas: {
    id: "tomas",
    name: "Tomas Lindqvist",
    role: "Solutions Engineer",
    initials: "TL",
    avatarSrc:
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=96&h=96&dpr=2&q=80",
  },
  hanna: {
    id: "hanna",
    name: "Hanna Berg",
    role: "Support Lead",
    initials: "HB",
    avatarSrc:
      "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=96&h=96&dpr=2&q=80",
  },
  omar: {
    id: "omar",
    name: "Omar Haddad",
    role: "Data Engineer",
    initials: "OH",
    avatarSrc:
      "https://images.unsplash.com/photo-1507591064344-4c6ce005b128?w=96&h=96&dpr=2&q=80",
  },
  lena: {
    id: "lena",
    name: "Lena Wade",
    role: "Finance Ops",
    initials: "LW",
    avatarSrc:
      "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=96&h=96&dpr=2&q=80",
  },
}

export const TEAM_MEMBERS: TeamMember[] = Object.values(TEAM)

/** The signed-in user; new workflows and agents default to them. */
export const CURRENT_USER = { ...TEAM.nick, email: "nick@reui.io" } as const

export function findTeamMember(nameOrId: string): TeamMember | undefined {
  return TEAM_MEMBERS.find(
    (member) => member.id === nameOrId || member.name === nameOrId
  )
}
