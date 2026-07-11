import { supabase } from "./supabase";
import type { FunctionInvokeOptions, FunctionsResponse } from "@supabase/functions-js";

/** Extracts the `{ error: string }` body an Edge Function returned on a non-2xx response — supabase-js's
 *  `functions.invoke` surfaces that as a FunctionsHttpError whose body has to be read separately from
 *  `error.context` (a Response). Shared by any lib module that wants to show the server's actual
 *  error message instead of a generic fallback (src/lib/payments.ts, src/lib/professionalPatients.ts).
 *
 *  `context` is a fetch Response, so its body can only be read once — call this at most once per
 *  error (invokeEdgeFunction below reads a *clone* for its own session check, precisely so this
 *  function still gets an unconsumed body when the caller uses both). */
export async function extractFunctionErrorMessage(error: unknown): Promise<string | null> {
  const context = (error as any)?.context;
  if (!context || typeof context.json !== "function") return null;
  try {
    const body = await context.json();
    return typeof body?.error === "string" ? body.error : null;
  } catch {
    return null;
  }
}

/** Every Edge Function that authenticates the caller (mark-appointment-paid, create-pix-charge,
 *  livekit-room-access, etc.) returns this exact string when `callerClient.auth.getUser()` rejects
 *  the JWT the browser sent — see e.g. supabase/functions/mark-appointment-paid/index.ts. It's the
 *  one error that specifically means "this tab's session is no longer valid," as opposed to any
 *  other business-logic error a function might return, so it's matched literally rather than just
 *  treating every 401 as a dead session. */
const SESSION_INVALID_MESSAGE = "Sessão inválida.";

type SessionExpiredListener = () => void;
let sessionExpiredListener: SessionExpiredListener | null = null;

/** App.tsx registers the one listener that signs the user out and shows a "sua sessão expirou"
 *  notice on the login screen (mirrors the existing suspended-account flow). Every other module
 *  just calls invokeEdgeFunction() as a drop-in replacement for supabase.functions.invoke() and
 *  the redirect happens automatically — no per-call-site handling needed. Returns an unsubscribe
 *  function, though in practice App.tsx mounts once for the app's lifetime. */
export function onSessionExpired(listener: SessionExpiredListener): () => void {
  sessionExpiredListener = listener;
  return () => {
    if (sessionExpiredListener === listener) sessionExpiredListener = null;
  };
}

/** Drop-in replacement for `supabase.functions.invoke` — identical signature and return value, so
 *  existing callers (including their own later `extractFunctionErrorMessage(error)` calls) keep
 *  working unchanged. The only addition: on a non-2xx response it peeks at a *clone* of the body
 *  (the original stays unread for the caller) and, if the function rejected the caller's session,
 *  notifies App.tsx to sign out and show a clear message instead of leaving every screen to show
 *  the raw "Sessão inválida." string next to a session that looks logged in but isn't. */
export async function invokeEdgeFunction<T = unknown>(
  functionName: string,
  options?: FunctionInvokeOptions
): Promise<FunctionsResponse<T>> {
  const result = await supabase.functions.invoke<T>(functionName, options);

  const context = (result.error as any)?.context;
  if (result.error && context && typeof context.clone === "function") {
    void extractFunctionErrorMessage({ context: context.clone() }).then(message => {
      if (message === SESSION_INVALID_MESSAGE) sessionExpiredListener?.();
    });
  }

  return result as FunctionsResponse<T>;
}
