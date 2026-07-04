import { supabase } from "./supabase";

export { groupIntoConversations, type Conversation } from "./conversations";

export type ChatMessage = {
  id: string;
  professionalId: string;
  patientId: string;
  senderId: string;
  content: string;
  createdAt: string;
  readAt: string | null;
};

function toChatMessage(d: any): ChatMessage {
  return {
    id: d.id,
    professionalId: d.professional_id,
    patientId: d.patient_id,
    senderId: d.sender_id,
    content: d.content,
    createdAt: d.created_at,
    readAt: d.read_at,
  };
}

export async function listThreadMessages(professionalId: string, patientId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("id, professional_id, patient_id, sender_id, content, created_at, read_at")
    .eq("professional_id", professionalId)
    .eq("patient_id", patientId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []).map(toChatMessage);
}

/** All messages across every conversation this user is part of — grouped client-side by
 *  groupIntoConversations() rather than a second round-trip per counterpart. */
export async function listAllMessagesFor(userId: string, role: "professional" | "patient"): Promise<ChatMessage[]> {
  const column = role === "professional" ? "professional_id" : "patient_id";
  const { data, error } = await supabase
    .from("messages")
    .select("id, professional_id, patient_id, sender_id, content, created_at, read_at")
    .eq(column, userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(toChatMessage);
}

export async function sendMessage(professionalId: string, patientId: string, senderId: string, content: string) {
  const trimmed = content.trim();
  if (!trimmed) return;
  const { error } = await supabase.from("messages").insert({
    professional_id: professionalId,
    patient_id: patientId,
    sender_id: senderId,
    content: trimmed,
  });
  if (error) throw error;
}

export async function markThreadRead(professionalId: string, patientId: string, readerId: string) {
  const { error } = await supabase
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("professional_id", professionalId)
    .eq("patient_id", patientId)
    .neq("sender_id", readerId)
    .is("read_at", null);
  if (error) throw error;
}

/** Live delivery for new messages via Supabase Realtime (enabled on this table by migration
 *  20260704000000). Returns an unsubscribe function. */
export function subscribeToMessages(userId: string, role: "professional" | "patient", onInsert: (message: ChatMessage) => void): () => void {
  const column = role === "professional" ? "professional_id" : "patient_id";
  const channel = supabase
    .channel(`messages-${role}-${userId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages", filter: `${column}=eq.${userId}` },
      (payload) => onInsert(toChatMessage(payload.new))
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
