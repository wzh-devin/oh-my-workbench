"use client"

// next-themes, with the four props this template needs. It exists as its own
// file so theme defaults stay consistent across the application.
//
// The props:
//   attribute="class"          the `.dark` class the token layer keys off
//   defaultTheme="system"      follow the OS until the visitor picks otherwise
//   enableSystem               keep following it while "system" is selected
//   disableTransitionOnChange  suppress transitions during the swap, so a theme
//                              change is instant instead of a slow colour crossfade
//
// No `storageKey` is passed: next-themes reads and writes its default `theme`
// key, so two apps served from one origin do not end up with two competing
// preferences.
//
// Callers may still override any prop; `{...props}` is last on purpose.

import { ThemeProvider as NextThemesProvider } from "next-themes"

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      // A SPA applies its theme through effects; keep the SSR bootstrap script inert.
      scriptProps={{ type: "text/plain" }}
      {...props}
    >
      {children}
    </NextThemesProvider>
  )
}
