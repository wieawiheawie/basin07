import { describe, expect, it } from "vitest";
import { getSuggestions, parseReply } from "./command";

describe("prompt helpers", () => {
  it("suggests glossary words and object names", () => {
    expect(getSuggestions("un", ["uncap", "upright", "bottle_1"])).toEqual(["uncap", "upright"]);
  });

  it("does not suggest after a completed word", () => {
    expect(getSuggestions("tip ", ["tip", "bottle_1"])).toEqual([]);
  });

  it("parses structured success and error replies", () => {
    expect(parseReply('{"ok":true,"message":"A groove was carved."}')).toEqual({
      ok: true,
      message: "A groove was carved."
    });
    expect(parseReply("not json").ok).toBe(false);
  });
});
