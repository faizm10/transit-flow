import type { ReactNode } from "react";
import MarketingShell from "@/components/marketing/MarketingShell";
import MarketingHeader from "@/components/marketing/MarketingHeader";
import MarketingFooter from "@/components/marketing/MarketingFooter";

export default function BlogLayout({ children }: { children: ReactNode }) {
  return (
    <MarketingShell>
      <MarketingHeader />
      <div className="flex flex-1 flex-col">{children}</div>
      <MarketingFooter />
    </MarketingShell>
  );
}
