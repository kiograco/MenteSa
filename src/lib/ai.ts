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

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // FileReader's result for readAsDataURL is "data:<mime>;base64,<data>" — Gemini's inlineData
      // wants just the <data> part.
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const MAX_OCR_IMAGE_BYTES = 8 * 1024 * 1024;

/** Calls the ocr-handwriting Edge Function to transcribe a photo of handwritten notes into plain
 *  text (Gemini multimodal). Returns null if the image is too large, AI isn't configured, or the
 *  call fails — the caller shows a generic "try another photo" message either way. */
export async function transcribeHandwriting(file: File): Promise<string | null> {
  if (file.size > MAX_OCR_IMAGE_BYTES) return null;

  const imageBase64 = await readFileAsBase64(file);
  const { data, error } = await supabase.functions.invoke<{ text?: string }>("ocr-handwriting", {
    body: { imageBase64, mimeType: file.type || "image/jpeg" },
  });

  if (error || !data?.text) return null;
  return data.text;
}

export type SessionPlan = { topics: string[]; notes: string };

/** Calls the ai-plan-session Edge Function — reads a patient's recent SOAP notes and assessment
 *  scores and suggests talking points for the next session. Returns null if AI isn't configured,
 *  the call fails, or there's not enough history to work from. */
export async function planSessionWithAI(patientId: string): Promise<SessionPlan | null> {
  const { data, error } = await supabase.functions.invoke<{ topics?: string[]; notes?: string }>("ai-plan-session", { body: { patientId } });
  if (error || !data || !Array.isArray(data.topics) || typeof data.notes !== "string") return null;
  return { topics: data.topics, notes: data.notes };
}
