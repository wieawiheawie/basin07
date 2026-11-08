export interface CommandReply {
  ok: boolean;
  message: string;
}

export function getSuggestions(input: string, vocabulary: string[]): string[] {
  if (input.endsWith(" ")) return [];
  const fragment = input.trim().split(/\s+/).at(-1)?.toLowerCase() ?? "";
  if (fragment.length === 0) return [];
  return vocabulary
    .filter((word) => word.toLowerCase().startsWith(fragment) && word.toLowerCase() !== fragment)
    .slice(0, 6);
}

export function parseReply(raw: string): CommandReply {
  try {
    const value: unknown = JSON.parse(raw);
    if (
      typeof value === "object" && value !== null &&
      "ok" in value && "message" in value &&
      typeof value.ok === "boolean" && typeof value.message === "string"
    ) {
      return { ok: value.ok, message: value.message };
    }
  } catch {
    // Treat malformed simulation output as a readable command error.
  }
  return { ok: false, message: "The desk returned an unreadable reply. Please try that command again." };
}
