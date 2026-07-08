import { supabase } from "./supabase";

export type AISessionSummary = { keyPoints: string[]; actionItems: string[]; clinicalNote: string };

/** Calls the ai-summarize-session Edge Function. Returns null if AI isn't configured (function
 *  not deployed, GEMINI_API_KEY missing, the Gemini request failed, etc.) so callers can
 *  fall back to manual note-taking — the AI summary is always optional, never blocking. */
export async function getAISessionSummary(appointmentId: string, notes: string): Promise<AISessionSummary | null> {
  const { data, error } = await supabase.functions.invoke<{
    keyPoints?: string[];
    actionItems?: string[];
    clinicalNote?: string;
    error?: string;
  }>("ai-summarize-session", { body: { appointmentId, notes } });

  if (error || !data || !Array.isArray(data.keyPoints) || !Array.isArray(data.actionItems) || typeof data.clinicalNote !== "string") {
    return null;
  }

  return { keyPoints: data.keyPoints, actionItems: data.actionItems, clinicalNote: data.clinicalNote };
}

/** Calls the ai-improve-text Edge Function to rewrite/clean up a piece of text the professional
 *  already wrote (a SOAP field, a Biblioteca de Modelos preview). Returns null if AI isn't
 *  configured or the call fails, so callers just leave the original text untouched. */
export async function improveTextWithAI(text: string): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke<{ improvedText?: string }>("ai-improve-text", { body: { text } });
  if (error || !data?.improvedText) return null;
  return data.improvedText;
}
