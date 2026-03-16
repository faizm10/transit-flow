import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-16 text-slate-900">
      <div className="space-y-8">
        <div className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#0b6f3c]">
            TransitFlow beta
          </p>
          <h1 className="text-4xl font-semibold tracking-tight">Terms</h1>
          <p className="text-base leading-7 text-slate-600">
            TransitFlow is a public beta planning tool. Outputs are provided for
            evaluation and are not guaranteed to be operationally correct or suitable
            for live transit deployment without independent review.
          </p>
        </div>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Acceptable use</h2>
          <p className="text-slate-600">
            Do not abuse the API routes, attempt to bypass rate limits, or submit
            unlawful or harmful content through prompts, bug reports, or feedback forms.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Beta availability</h2>
          <p className="text-slate-600">
            Features may change, degrade, or be disabled without notice during the beta,
            especially third-party AI functionality.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Community reporting</h2>
          <p className="text-slate-600">
            Community submissions are plain-text only and may be mirrored into public GitHub
            issues for triage. Do not include private or sensitive information.
          </p>
        </section>

        <Link href="/" className="inline-flex text-sm font-medium text-[#0b6f3c]">
          Back to home
        </Link>
      </div>
    </main>
  );
}
