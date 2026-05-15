const STRIP = [
  "Live GO Transit GTFS",
  "Explore · Design · Simulate · Schedules",
  "In your browser — no install",
  "Ontario-wide network",
  "Open data · Open map",
] as const;

function Strip({ idSuffix = "" }: { idSuffix?: string }) {
  return (
    <div className="flex shrink-0 items-center gap-12 px-6 sm:gap-16 sm:px-8">
      {STRIP.map((label) => (
        <span
          key={idSuffix + label}
          className="whitespace-nowrap text-sm font-medium text-[color-mix(in_oklab,var(--landing-fg)_38%,var(--landing-bg))]"
        >
          {label}
        </span>
      ))}
    </div>
  );
}

/**
 * Soft infinite trust / proof strip (editorial marketing pattern).
 */
export default function MarketingTrustMarquee() {
  return (
    <div className="border-y border-[var(--landing-border)] bg-[var(--landing-band)] py-5">
      <p className="sr-only">Highlights: {STRIP.join(". ")}</p>
      <div className="marketing-marquee">
        <div className="marketing-marquee-track items-center">
          <Strip />
          <div aria-hidden>
            <Strip idSuffix="dup-" />
          </div>
        </div>
      </div>
    </div>
  );
}
