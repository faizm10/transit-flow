import Link from "next/link";

/** Yellow strip that sits above the marketing header. */
export default function AnnouncementBanner() {
  return (
    <div className="bg-[#f2c94c] text-[#1a1400]">
      <p className="mx-auto max-w-6xl px-5 py-2 text-center font-[family-name:var(--landing-mono)] text-[0.6875rem] uppercase tracking-[0.08em] lg:px-8">
        New look, and a new study.{" "}
        <Link
          href="/blog/gap-finder"
          className="underline underline-offset-2 decoration-[#1a1400]/50 transition-colors hover:decoration-[#1a1400]"
        >
          Read the Gap Finder blog
        </Link>
      </p>
    </div>
  );
}
