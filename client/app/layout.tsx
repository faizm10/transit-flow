import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { SessionProvider } from "next-auth/react";
import { GoogleAnalytics } from "@next/third-parties/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://transit-flow-two.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "TransitFlow — GO Transit Explorer & Route Designer",
    template: "%s — TransitFlow",
  },
  description:
    "Explore GO Transit routes on a live map, design your own transit lines, run time-of-day simulations, and share network ideas with the community.",
  keywords: [
    "GO Transit",
    "transit planning",
    "GTFS",
    "route designer",
    "transit simulation",
    "transit map",
    "GO Train",
    "Metrolinx",
    "Ontario transit",
    "transit network",
  ],
  authors: [{ name: "TransitFlow" }],
  creator: "TransitFlow",
  openGraph: {
    type: "website",
    siteName: "TransitFlow",
    locale: "en_CA",
    url: SITE_URL,
    title: "TransitFlow — GO Transit Explorer & Route Designer",
    description:
      "Explore GO Transit routes on a live map, design your own transit lines, run time-of-day simulations, and share network ideas with the community.",
    images: [
      {
        url: "/landing-page.png",
        width: 1200,
        height: 630,
        alt: "TransitFlow — GO Transit route designer and simulator",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "TransitFlow — GO Transit Explorer & Route Designer",
    description:
      "Explore GO Transit routes on a live map, design your own transit lines, run time-of-day simulations, and share network ideas with the community.",
    images: ["/landing-page.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": 160,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
};

export const viewport: Viewport = {
  themeColor: "#007A33",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SessionProvider>
          {children}
          <Toaster richColors closeButton position="top-right" />
        </SessionProvider>
      </body>
      <GoogleAnalytics gaId="G-EXFK4TDNWN" />
    </html>
  );
}
