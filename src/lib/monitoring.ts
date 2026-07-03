import * as Sentry from "@sentry/react";

const dsn = import.meta.env.VITE_SENTRY_DSN;

export const monitoringEnabled = Boolean(dsn);

export function initMonitoring() {
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
  });
}

/** Reports a handled error (one we already caught and showed a friendly message for) so it's still visible to the team. */
export function reportError(error: unknown, context?: Record<string, unknown>) {
  if (!monitoringEnabled) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}
