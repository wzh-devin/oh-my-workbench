import { TRUST_BRANDS } from "./data"

export function AuthFooter() {
  return (
    <footer className="flex flex-col items-center gap-6 px-6 py-10 sm:px-8 sm:py-12">
      <p className="text-xs text-muted-foreground sm:text-sm">
        Joining 14,000+ teams shipping faster with Flowly
      </p>

      <div
        className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4 opacity-70 sm:gap-x-10"
        role="list"
        aria-label="Customers building with Flowly"
      >
        {TRUST_BRANDS.map((brand) => (
          <div key={brand.id} role="listitem" aria-label={brand.name}>
            {brand.logo}
          </div>
        ))}
      </div>
    </footer>
  )
}
