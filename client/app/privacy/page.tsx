import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-16 text-slate-900">
      <div className="space-y-8">
        <div className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#0b6f3c]">
            TransitFlow beta
          </p>
          <h1 className="text-4xl font-semibold tracking-tight">Privacy</h1>
          <p className="text-base leading-7 text-slate-600">
            TransitFlow stores route drafts in your browser and sends route-generation
            and schedule-optimization prompts to configured third-party providers only
            when you invoke those features. Community bug reports and feedback may be
            forwarded to GitHub as public issues.
          </p>
        </div>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">What we process</h2>
          <p className="text-slate-600">
            Beta telemetry captures product events like map load, route saves, and AI
            request outcomes. Prompts you submit to AI features may be processed by
            Anthropic or another configured provider, and community submissions may
            capture non-sensitive browser and page context for triage.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Local storage</h2>
          <p className="text-slate-600">
            Custom routes are stored in browser local storage for the active scenario.
            Removing local browser data clears those drafts.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Community submissions</h2>
          <p className="text-slate-600">
            The in-app community form is public beta infrastructure. Submitted bug reports
            and feedback can become public GitHub issues in the TransitFlow repository.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Contact</h2>
          <p className="text-slate-600">
            For beta issues or deletion requests, open an issue on the project repository.
          </p>
        </section>

        <Link href="/" className="inline-flex text-sm font-medium text-[#0b6f3c]">
          Back to home
        </Link>
      </div>
    </main>
  );
}
