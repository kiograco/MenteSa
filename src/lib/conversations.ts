import type { ChatMessage } from "./messages";

export type Conversation = {
  counterpartId: string;
  lastMessage: ChatMessage;
  unreadCount: number;
};

/** Groups a flat list of messages (every thread for one user) into one entry per conversation
 *  partner, each with its most recent message and how many are unread by `userId`. Kept free of
 *  the `supabase` import (unlike messages.ts) so it can be unit tested without initializing a
 *  Supabase client — see messages.test.ts. */
export function groupIntoConversations(messages: ChatMessage[], userId: string, role: "professional" | "patient"): Conversation[] {
  const byPartner = new Map<string, ChatMessage[]>();
  for (const m of messages) {
    const partnerId = role === "professional" ? m.patientId : m.professionalId;
    const list = byPartner.get(partnerId);
    if (list) list.push(m);
    else byPartner.set(partnerId, [m]);
  }

  const conversations: Conversation[] = [];
  for (const [counterpartId, msgs] of byPartner) {
    const sorted = [...msgs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const unreadCount = msgs.filter(m => m.senderId !== userId && !m.readAt).length;
    conversations.push({ counterpartId, lastMessage: sorted[0], unreadCount });
  }

  return conversations.sort((a, b) => new Date(b.lastMessage.createdAt).getTime() - new Date(a.lastMessage.createdAt).getTime());
}
