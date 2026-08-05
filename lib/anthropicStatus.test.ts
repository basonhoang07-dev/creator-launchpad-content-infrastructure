import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isAnthropicConfigured } from "./anthropicStatus";

describe("isAnthropicConfigured", () => {
  const original = process.env.ANTHROPIC_API_KEY;
  afterEach(() => {
    process.env.ANTHROPIC_API_KEY = original;
  });

  it("is false when unset", () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(isAnthropicConfigured()).toBe(false);
  });

  it("is false when blank", () => {
    process.env.ANTHROPIC_API_KEY = "  ";
    expect(isAnthropicConfigured()).toBe(false);
  });

  it("is false for the known placeholder value", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-placeholder-add-later";
    expect(isAnthropicConfigured()).toBe(false);
  });

  it("is true for what looks like a real key", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-api03-real-looking-key-value";
    expect(isAnthropicConfigured()).toBe(true);
  });
});
