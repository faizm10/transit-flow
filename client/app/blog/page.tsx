import type { Metadata } from "next";
import Link from "next/link";
import { Eyebrow, SpecMeta } from "@/components/marketing/spec";

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
    date: "10.09.26",
    readingTime: "6 min",
    tag: "Product",
    excerpt:
      "TransitFlow can now rank the GO corridors that are served worst today — and hand you a starting point in the route builder.",
  },
] as const;

export default function BlogIndex() {
  return (
    <main className="mx-auto max-w-3xl flex-1 px-5 pb-32 pt-20 lg:px-8">
      <header className="mb-14 flex flex-col gap-4">
        <Eyebrow>Blog</Eyebrow>
        <h1 className="font-[family-name:var(--font-hanken)] text-[2.5rem] font-normal leading-[1.05] tracking-[-0.025em] text-[var(--landing-ink)]">
          Notes from the build
        </h1>
        <p className="max-w-xl text-[var(--landing-muted)]">
          How TransitFlow works under the hood, and where it&apos;s headed next.
        </p>
      </header>

      <div className="tf-spotlight border-t border-[var(--landing-border)]">
        {POSTS.map((post) => (
          <Link key={post.slug} href={`/blog/${post.slug}`} className="group">
            <SpecMeta
              className="mb-2 block"
              items={[post.date, post.tag, post.readingTime]}
            />
            <h2 className="font-[family-name:var(--font-hanken)] text-[1.6rem] font-normal leading-tight tracking-[-0.02em] text-[var(--landing-ink)] transition-colors group-hover:text-[var(--landing-accent)]">
              {post.title}
            </h2>
            <p className="mt-1.5 max-w-2xl text-[0.9375rem] text-[var(--landing-muted)]">
              {post.excerpt}
            </p>
          </Link>
        ))}
      </div>
    </main>
  );
}
