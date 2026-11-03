export type AppChangelog = {
  version: string
  releases: {
    version: string
    url: string | null
    date: string | null
    sections: { title: string; items: string[] }[]
  }[]
}

export function buildChangelog(source: string, version?: string): AppChangelog
export function releaseNotes(source: string, version: string): string
