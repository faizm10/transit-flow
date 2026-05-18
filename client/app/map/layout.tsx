import type { Metadata } from "next";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://transit-flow-two.vercel.app";

export const metadata: Metadata = {
  title: "Map",
  description:
    "Explore GO Transit routes on an interactive live map. Browse train lines, design custom routes, run simulations, and compare schedules — all in your browser.",
  alternates: { canonical: `${SITE_URL}/map` },
  openGraph: {
    title: "GO Transit Map — TransitFlow",
    description:
      "Explore GO Transit routes on an interactive live map. Browse train lines, design custom routes, run simulations, and compare schedules — all in your browser.",
    url: `${SITE_URL}/map`,
  },
  robots: {
    // Map is the app shell — indexable but no need to snippet aggressively
    index: true,
    follow: true,
  },
};

export default function MapLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
