import { describe, it, expect } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("handles conditional classes", () => {
    expect(cn("base", true && "included", false && "excluded")).toBe(
      "base included"
    );
  });

  it("handles undefined and null", () => {
    expect(cn("base", undefined, null, "end")).toBe("base end");
  });

  it("merges tailwind classes correctly", () => {
    // twMerge should keep the last conflicting utility
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
  });

  it("handles arrays", () => {
    expect(cn(["foo", "bar"])).toBe("foo bar");
  });

  it("handles objects", () => {
    expect(cn({ foo: true, bar: false, baz: true })).toBe("foo baz");
  });

  it("handles empty input", () => {
    expect(cn()).toBe("");
  });

  it("handles complex tailwind conflicts", () => {
    // Background color conflict - last one wins
    expect(cn("bg-red-500", "bg-blue-500")).toBe("bg-blue-500");
    // Text size conflict
    expect(cn("text-sm", "text-lg")).toBe("text-lg");
  });
});
