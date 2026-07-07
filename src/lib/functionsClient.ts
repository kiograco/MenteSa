/** Extracts the `{ error: string }` body an Edge Function returned on a non-2xx response — supabase-js's
 *  `functions.invoke` surfaces that as a FunctionsHttpError whose body has to be read separately from
 *  `error.context` (a Response). Shared by any lib module that wants to show the server's actual
 *  error message instead of a generic fallback (src/lib/payments.ts, src/lib/professionalPatients.ts). */
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
