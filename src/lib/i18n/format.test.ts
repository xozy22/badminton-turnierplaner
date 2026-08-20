import { describe, it, expect } from "vitest";
import { fill } from "./format";

describe("fill", () => {
  it("replaces a placeholder", () => {
    expect(fill("At least {count} players required", { count: 4 })).toBe(
      "At least 4 players required",
    );
  });

  it("replaces the same placeholder everywhere it appears", () => {
    expect(fill("{score}:{score} is not possible", { score: 21 })).toBe(
      "21:21 is not possible",
    );
  });

  it("handles several different placeholders", () => {
    expect(fill("{men} men, {women} women", { men: 5, women: 3 })).toBe("5 men, 3 women");
  });

  it("leaves an unknown placeholder visible", () => {
    // Better a visible {count} pointing at the missing argument than a gap
    // that reads like a typo.
    expect(fill("At least {count} players", {})).toBe("At least {count} players");
  });

  it("returns the template unchanged without params", () => {
    expect(fill("No placeholders here")).toBe("No placeholders here");
  });

  it("accepts strings as well as numbers", () => {
    expect(fill("Welcome, {name}", { name: "Anna" })).toBe("Welcome, Anna");
  });
});
