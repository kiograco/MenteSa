import { supabase } from "./supabase";

export type AISessionSummary = { keyPoints: string[]; actionItems: string[]; clinicalNote: string };

/** Calls the ai-summarize-session Edge Function. Returns null if AI isn't configured (function
 *  not deployed, ANTHROPIC_API_KEY missing, the Anthropic request failed, etc.) so callers can
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
