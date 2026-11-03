import { Fragment, type ReactNode } from "react"
import { Lexer, type Token } from "marked"

/** 日志允许普通HTTPS链接；HTML和其他协议始终保持为文本。 */
export function ChangelogLink({
  href,
  children,
}: {
  href: string | null
  children: ReactNode
}) {
  let url: URL
  try {
    url = new URL(href ?? "")
  } catch {
    return <>{children}</>
  }
  if (url.protocol !== "https:" || url.username || url.password)
    return <>{children}</>
  return (
    <a
      href={url.href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline underline-offset-4 transition-colors hover:text-primary/80"
    >
      {children}
    </a>
  )
}

function renderTokens(tokens: Token[]): ReactNode {
  return tokens.map((token, index) => {
    const children =
      "tokens" in token && token.tokens
        ? renderTokens(token.tokens)
        : "text" in token
          ? token.text
          : token.raw
    switch (token.type) {
      case "strong":
        return (
          <strong key={index} className="font-medium">
            {children}
          </strong>
        )
      case "em":
        return <em key={index}>{children}</em>
      case "codespan":
        return (
          <code key={index} className="bg-muted font-mono">
            {token.text}
          </code>
        )
      case "link":
        return (
          <ChangelogLink key={index} href={token.href}>
            {children}
          </ChangelogLink>
        )
      case "text":
      case "escape":
        return <Fragment key={index}>{children}</Fragment>
      default:
        return <Fragment key={index}>{token.raw}</Fragment>
    }
  })
}

export function ChangelogInline({ source }: { source: string }) {
  return <>{renderTokens(Lexer.lexInline(source))}</>
}
