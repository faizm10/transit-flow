import type { ReactNode } from "react";

/**
 * Wraps public marketing pages with shared canvas tokens (see globals.css `.marketing-shell`).
 */
export default function MarketingShell({ children }: { children: ReactNode }) {
  return <div className="marketing-shell min-h-screen antialiased">{children}</div>;
}
