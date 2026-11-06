import type { ErrorComponentProps } from "@tanstack/react-router";
import { ArrowLeft, CircleAlert, House, RotateCcw, SearchX } from "lucide-react";

function RecoveryActions({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
      <a
        href="/"
        className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-slate-950 transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <House aria-hidden="true" className="size-4" />
        Go to GamesLord
      </a>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <RotateCcw aria-hidden="true" className="size-4" />
          Try again
        </button>
      ) : (
        <button
          type="button"
          onClick={() => window.history.back()}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Go back
        </button>
      )}
    </div>
  );
}

function StatusPage({
  code,
  title,
  description,
  icon,
  onRetry,
}: {
  code: string;
  title: string;
  description: string;
  icon: "not-found" | "error";
  onRetry?: () => void;
}) {
  return (
    <main
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-bg px-6 py-16 text-center text-fg"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -top-48 left-1/2 size-[28rem] -translate-x-1/2 rounded-full bg-purple-500/10 blur-3xl" />
        <div className="absolute bottom-0 left-1/2 h-px w-full max-w-3xl -translate-x-1/2 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>
      <section className="relative w-full max-w-xl">
        <a
          href="/"
          aria-label="GamesLord home"
          className="mb-12 inline-flex items-center gap-2 text-sm font-semibold tracking-wide text-white/85 transition hover:text-white"
        >
          <img
            src="/playora/logo/gameslord-icon.svg"
            alt=""
            aria-hidden="true"
            className="size-9 rounded-xl"
          />
          GamesLord
        </a>
        <div
          aria-hidden="true"
          className="mx-auto mb-6 grid size-20 place-items-center rounded-3xl border border-white/10 bg-white/5 text-primary shadow-[0_16px_60px_rgba(0,0,0,.25)]"
        >
          {icon === "not-found" ? (
            <SearchX className="size-9" strokeWidth={1.7} />
          ) : (
            <CircleAlert className="size-9" strokeWidth={1.7} />
          )}
        </div>
        <p className="text-sm font-bold tracking-[0.3em] text-primary">{code}</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mx-auto mt-4 max-w-md text-base leading-7 text-muted">{description}</p>
        <RecoveryActions onRetry={onRetry} />
      </section>
    </main>
  );
}

export function AppNotFoundComponent() {
  return (
    <StatusPage
      code="404"
      title="This page wandered off."
      description="We can’t find that page. It may have moved, or the link may be incorrect."
      icon="not-found"
    />
  );
}

export function AppErrorComponent({ reset }: ErrorComponentProps) {
  return (
    <StatusPage
      code="OOPS"
      title="Something went wrong."
      description="The page hit an unexpected error. Try again, or head back to GamesLord."
      icon="error"
      onRetry={reset}
    />
  );
}
