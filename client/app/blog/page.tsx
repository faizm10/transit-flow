import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://transit-flow-two.vercel.app";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Notes on how TransitFlow works and where it's going — network analysis, route design, and the ideas behind the tool.",
  alternates: { canonical: `${SITE_URL}/blog` },
  openGraph: {
    title: "Blog — TransitFlow",
    description:
      "Notes on how TransitFlow works and where it's going.",
    url: `${SITE_URL}/blog`,
  },
};

export const POSTS = [
  {
    slug: "gap-finder",
    title: "Where should the next route go?",
    date: "September 2026",
    tag: "Product",
    excerpt:
      "TransitFlow lets anyone design a GO Transit route. The new part tells you which routes are worth designing.",
  },
] as const;

export default function BlogIndex() {
  return (
    <main className="mx-auto max-w-2xl px-5 pb-28 pt-16 lg:px-8">
      <header className="mb-14 text-center">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--landing-muted)]">
          TransitFlow
        </p>
        <h1 className="mt-3 font-[family-name:var(--font-serif)] text-4xl font-light tracking-tight text-[var(--landing-ink)]">
          Blog
        </h1>
        <p className="mt-3 text-[15px] text-[var(--landing-muted)]">
          How the tool works, and where it&apos;s headed.
        </p>
      </header>

      <ul className="flex flex-col divide-y divide-[var(--landing-border)]">
        {POSTS.map((post) => (
          <li key={post.slug}>
            <Link
              href={`/blog/${post.slug}`}
              className="group flex flex-col gap-1.5 py-7 outline-offset-4 transition-opacity focus-visible:outline-2 focus-visible:outline-[var(--landing-accent)]"
            >
              <span className="flex items-center gap-2 text-xs uppercase tracking-[0.1em] text-[var(--landing-muted)]">
                {post.tag}
                <span aria-hidden>·</span>
                <span className="normal-case tracking-normal">{post.date}</span>
              </span>
              <span className="font-[family-name:var(--font-serif)] text-2xl font-light leading-snug text-[var(--landing-ink)] transition-colors group-hover:text-[var(--landing-accent)]">
                {post.title}
              </span>
              <span className="text-[15px] leading-relaxed text-[var(--landing-muted)]">
                {post.excerpt}
              </span>
              <span className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-[var(--landing-accent)]">
                Read
                <ArrowUpRight className="h-3.5 w-3.5" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
