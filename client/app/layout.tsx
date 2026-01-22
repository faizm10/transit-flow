import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Sans } from "next/font/google";
import "./globals.css";

const notoSans = Noto_Sans({variable:'--font-sans', subsets: ["latin"]});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://transitflow.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "TransitFlow",
    template: "%s | TransitFlow",
  },
  description:
    "TransitFlow is a modern dashboard for public transit: monitor fleets, analyze ridership, and keep riders informed.",
  applicationName: "TransitFlow",
  keywords: [
    "TransitFlow",
    "public transit dashboard",
    "GTFS",
    "GTFS-RT",
    "ridership analytics",
    "service alerts",
    "real-time transit",
  ],
  authors: [{ name: "TransitFlow" }],
  creator: "TransitFlow",
  publisher: "TransitFlow",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: siteUrl,
    title: "TransitFlow",
    description:
      "Modern public transit analytics and real-time monitoring for fleets, service alerts, and ridership insights.",
    siteName: "TransitFlow",
  },
  twitter: {
    card: "summary",
    title: "TransitFlow",
    description:
      "Modern public transit analytics and real-time monitoring for fleets, service alerts, and ridership insights.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={notoSans.variable}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
