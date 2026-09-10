import type { ReactNode } from "react";
import { Newsreader } from "next/font/google";
import MarketingShell from "@/components/marketing/MarketingShell";
import MarketingHeader from "@/components/marketing/MarketingHeader";
import MarketingFooter from "@/components/marketing/MarketingFooter";

const serif = Newsreader({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

export default function BlogLayout({ children }: { children: ReactNode }) {
  return (
    <MarketingShell>
      <div className={serif.variable}>
        <MarketingHeader />
        {children}
        <MarketingFooter />
      </div>
    </MarketingShell>
  );
}
