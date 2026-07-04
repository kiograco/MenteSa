import { describe, expect, it } from "vitest";
import { groupIntoConversations } from "./conversations";
import type { ChatMessage } from "./messages";

function msg(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: "m1",
    professionalId: "pro-1",
    patientId: "pat-1",
    senderId: "pat-1",
    content: "oi",
    createdAt: "2026-07-01T10:00:00.000Z",
    readAt: null,
    ...overrides,
  };
}

describe("groupIntoConversations", () => {
  it("returns one conversation per counterpart, from the professional's point of view", () => {
    const messages = [
      msg({ id: "1", patientId: "pat-1", senderId: "pat-1", createdAt: "2026-07-01T10:00:00.000Z" }),
      msg({ id: "2", patientId: "pat-2", senderId: "pat-2", createdAt: "2026-07-01T11:00:00.000Z" }),
    ];
    const conversations = groupIntoConversations(messages, "pro-1", "professional");
    expect(conversations.map(c => c.counterpartId).sort()).toEqual(["pat-1", "pat-2"]);
  });

  it("uses the professional as the counterpart from the patient's point of view", () => {
    const messages = [msg({ professionalId: "pro-1", patientId: "pat-1", senderId: "pro-1" })];
    const conversations = groupIntoConversations(messages, "pat-1", "patient");
    expect(conversations).toHaveLength(1);
    expect(conversations[0].counterpartId).toBe("pro-1");
  });

  it("picks the most recent message per conversation as lastMessage", () => {
    const messages = [
      msg({ id: "old", createdAt: "2026-07-01T09:00:00.000Z", content: "primeira" }),
      msg({ id: "new", createdAt: "2026-07-01T12:00:00.000Z", content: "mais recente" }),
    ];
    const conversations = groupIntoConversations(messages, "pro-1", "professional");
    expect(conversations[0].lastMessage.content).toBe("mais recente");
  });

  it("counts unread as messages from the other participant with no readAt", () => {
    const messages = [
      msg({ id: "1", senderId: "pat-1", readAt: null }),
      msg({ id: "2", senderId: "pat-1", readAt: null }),
      msg({ id: "3", senderId: "pro-1", readAt: null }), // sent by me — never counts as unread for me
      msg({ id: "4", senderId: "pat-1", readAt: "2026-07-01T10:30:00.000Z" }), // already read
    ];
    const conversations = groupIntoConversations(messages, "pro-1", "professional");
    expect(conversations[0].unreadCount).toBe(2);
  });

  it("sorts conversations by most recent message first", () => {
    const messages = [
      msg({ id: "1", patientId: "pat-1", createdAt: "2026-07-01T09:00:00.000Z" }),
      msg({ id: "2", patientId: "pat-2", createdAt: "2026-07-01T15:00:00.000Z" }),
    ];
    const conversations = groupIntoConversations(messages, "pro-1", "professional");
    expect(conversations.map(c => c.counterpartId)).toEqual(["pat-2", "pat-1"]);
  });

  it("returns an empty array for no messages", () => {
    expect(groupIntoConversations([], "pro-1", "professional")).toEqual([]);
  });
});
