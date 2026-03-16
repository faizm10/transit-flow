"use client";

import { useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { type CommunityReportPayload, type CommunityReportType } from "@/lib/community";

type CommunityReportFormProps = {
  initialType?: CommunityReportType;
  source: string;
  context?: Record<string, unknown>;
  compact?: boolean;
  onSubmitted?: (result: { issueUrl: string; issueNumber: number }) => void;
};

type SubmitState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "error"; message: string }
  | { status: "success"; issueUrl: string; issueNumber: number };

function randomReportId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `community-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function CommunityReportForm({
  initialType = "bug",
  source,
  context,
  compact = false,
  onSubmitted,
}: CommunityReportFormProps) {
  const [type, setType] = useState<CommunityReportType>(initialType);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [state, setState] = useState<SubmitState>({ status: "idle" });

  const helperCopy =
    type === "bug"
      ? "Bug reports become public GitHub issues after validation. Do not include private data."
      : "Feedback is converted into a public GitHub issue for triage. Keep it concise and plain text.";

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setState({ status: "submitting" });

    const payload: CommunityReportPayload = {
      type,
      title,
      description,
      metadata: {
        pagePath: typeof window !== "undefined" ? window.location.pathname : undefined,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
        viewport:
          typeof window !== "undefined"
            ? {
                width: window.innerWidth,
                height: window.innerHeight,
              }
            : undefined,
        appVersion:
          process.env.NEXT_PUBLIC_APP_VERSION ||
          process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
          undefined,
        source,
        clientReportId: randomReportId(),
        mapContext: context,
      },
    };

    try {
      const response = await fetch("/api/community/report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as {
        ok?: boolean;
        issueUrl?: string;
        issueNumber?: number;
        error?: string;
        details?: string;
      };

      if (!response.ok || !data.ok || !data.issueUrl || typeof data.issueNumber !== "number") {
        throw new Error(data.error || data.details || "Failed to submit report");
      }

      setState({
        status: "success",
        issueUrl: data.issueUrl,
        issueNumber: data.issueNumber,
      });
      onSubmitted?.({
        issueUrl: data.issueUrl,
        issueNumber: data.issueNumber,
      });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Failed to submit report",
      });
    }
  };

  return (
    <div className={`space-y-4 ${compact ? "" : "rounded-[2rem] border border-[#d8e2d4] bg-white/84 p-5 shadow-[0_24px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl"}`}>
      <div className="space-y-2">
        <div className="inline-flex rounded-full border border-[#cfe0cf] bg-[#f4fbf3] p-1">
          <button
            type="button"
            onClick={() => setType("bug")}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              type === "bug" ? "bg-[#0b6f3c] text-white" : "text-slate-600"
            }`}
          >
            Report a bug
          </button>
          <button
            type="button"
            onClick={() => setType("feedback")}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              type === "feedback" ? "bg-[#0b6f3c] text-white" : "text-slate-600"
            }`}
          >
            Send feedback
          </button>
        </div>
        <p className="text-xs leading-6 text-slate-600">{helperCopy}</p>
      </div>

      {state.status === "success" ? (
        <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-900">Report submitted</p>
          <p className="text-xs leading-6 text-emerald-800">
            Your submission was created as GitHub issue #{state.issueNumber}.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild className="rounded-full bg-[#0b6f3c] px-4 text-white hover:bg-[#095c32]">
              <Link href={state.issueUrl} target="_blank" rel="noopener noreferrer">
                View issue
              </Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => {
                setState({ status: "idle" });
                setTitle("");
                setDescription("");
              }}
            >
              Submit another
            </Button>
          </div>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label htmlFor="community-title" className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Title
            </label>
            <Input
              id="community-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={type === "bug" ? "Short bug summary" : "Short feedback summary"}
              maxLength={120}
              required
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="community-description" className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Description
            </label>
            <Textarea
              id="community-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={
                type === "bug"
                  ? "What happened, and where did it happen?"
                  : "What feedback do you have for TransitFlow?"
              }
              maxLength={4000}
              required
              rows={compact ? 4 : 5}
            />
          </div>

          {state.status === "error" ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs leading-6 text-red-700">
              {state.message}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="submit"
              className="rounded-full bg-[#0b6f3c] px-5 text-white hover:bg-[#095c32]"
              disabled={state.status === "submitting"}
            >
              {state.status === "submitting" ? "Submitting..." : type === "bug" ? "Submit bug report" : "Submit feedback"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
