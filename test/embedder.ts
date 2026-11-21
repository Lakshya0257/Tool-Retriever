import type { Embedder } from "../src/index.js";

const concepts: string[][] = [
  ["email", "mail", "message", "inbox", "recipient", "ping", "notify"],
  ["weather", "forecast", "rain", "umbrella", "temperature", "celsius"],
  ["calendar", "meeting", "schedule", "event", "attendee", "sync"],
  ["file", "path", "storage", "document", "contents"],
  ["delete", "remove", "erase", "permanently", "wipe"],
  ["contact", "people", "person", "address", "colleague"],
];

export function conceptEmbedder(): Embedder & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    calls,
    async embed(texts) {
      calls.push(texts);
      return texts.map((text) => {
        const lower = text.toLowerCase();
        return concepts.map((words) => words.filter((word) => lower.includes(word)).length);
      });
    },
  };
}
