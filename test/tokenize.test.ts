import { describe, expect, it } from "vitest";
import { tokenize } from "../src/index.js";

describe("tokenize", () => {
  it("splits camelCase, PascalCase and snake_case identifiers", () => {
    expect(tokenize("searchContacts")).toEqual(["search", "contact"]);
    expect(tokenize("HTTPRequest send_email")).toEqual(["http", "request", "send", "email"]);
  });

  it("drops stopwords and single characters", () => {
    expect(tokenize("Please send a summary to the team")).toEqual(["send", "summary", "team"]);
  });

  it("stems inflections of the same word to one term", () => {
    expect(tokenize("schedule scheduled scheduling schedules")).toEqual(Array(4).fill("schedul"));
  });

  it("applies light stemming", () => {
    expect(tokenize("emails sending scheduled queries boxes")).toEqual([
      "email",
      "send",
      "schedul",
      "query",
      "box",
    ]);
  });

  it("returns nothing for empty or symbol-only input", () => {
    expect(tokenize("")).toEqual([]);
    expect(tokenize("  ?! -- ")).toEqual([]);
  });
});
