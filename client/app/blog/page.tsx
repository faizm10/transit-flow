import type { Metadata } from "next";
import Link from "next/link";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://transit-flow-two.vercel.app";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Notes on how TransitFlow works and where it's going — network analysis, route design, and the ideas behind the tool.",
  alternates: { canonical: `${SITE_URL}/blog` },
  openGraph: {
    title: "Blog — TransitFlow",
    description: "Notes on how TransitFlow works and where it's going.",
    url: `${SITE_URL}/blog`,
  },
};

export const POSTS = [
  {
    slug: "gap-finder",
    title: "Where should the next route go?",
    date: "September 2026",
    readingTime: "6 min read",
    tag: "Product",
    excerpt:
      "TransitFlow can now rank the GO corridors that are served worst today — and hand you a starting point in the route builder.",
  },
] as const;

export default function BlogIndex() {
  return (
    <main className="mx-auto max-w-3xl px-6 pb-28 pt-20 lg:px-8">
      <header className="mb-16 border-b border-[var(--landing-border)] pb-10">
        <p className="text-[13px] font-medium uppercase tracking-[0.16em] text-[var(--landing-muted)]">
          Blog
        </p>
        <h1 className="mt-3 text-[2.5rem] font-semibold leading-[1.05] tracking-[-0.02em] text-[var(--landing-ink)]">
          Notes from the build
        </h1>
        <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-[var(--landing-muted)]">
          How TransitFlow works under the hood, and where it&apos;s headed next.
        </p>
      </header>

      <ul className="flex flex-col gap-12">
        {POSTS.map((post) => (
          <li key={post.slug}>
            <Link href={`/blog/${post.slug}`} className="group block">
              <div className="flex items-center gap-3 text-[13px] text-[var(--landing-muted)]">
                <span className="font-medium uppercase tracking-[0.1em] text-[var(--landing-accent)]">
                  {post.tag}
                </span>
                <span aria-hidden>·</span>
                <span>{post.date}</span>
                <span aria-hidden>·</span>
                <span>{post.readingTime}</span>
              </div>
              <h2 className="mt-2 text-[1.75rem] font-semibold leading-tight tracking-[-0.015em] text-[var(--landing-ink)] transition-colors group-hover:text-[var(--landing-accent)]">
                {post.title}
              </h2>
              <p className="mt-2 max-w-2xl text-[16px] leading-relaxed text-[var(--landing-muted)]">
                {post.excerpt}
              </p>
              <span className="mt-3 inline-block text-[14px] font-medium text-[var(--landing-accent)]">
                Read the post →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
