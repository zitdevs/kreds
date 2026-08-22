import { describe, expect, it } from "vitest";

import { classifyActor } from "./classify.js";

describe("classifying from what GitHub states", () => {
  it("reads a human account as human", () => {
    expect(classifyActor({ login: "isaac", type: "User" })).toBe("HUMAN");
  });

  it("reads an account GitHub marks as a bot as a bot", () => {
    expect(classifyActor({ login: "dependabot", type: "Bot" })).toBe("BOT");
  });

  /**
   * GitHub's own naming convention for App accounts. Checked as well as `type`
   * so that a payload which omits `type` still catches the obvious case.
   */
  it("reads GitHub's [bot] suffix as a bot", () => {
    expect(classifyActor({ login: "dependabot[bot]" })).toBe("BOT");
    expect(classifyActor({ login: "renovate[bot]", type: "User" })).toBe("BOT");
  });

  /**
   * The automation 03 names is all typed `Bot` by GitHub, so the publicly named
   * registry needs no heuristic here. The heuristics themselves are operational
   * and must never appear in this repository.
   */
  it.each(["dependabot[bot]", "renovate[bot]", "github-actions[bot]", "copilot[bot]"])(
    "catches %s without any detection rule of its own",
    (login) => {
      expect(classifyActor({ login })).toBe("BOT");
    },
  );

  /**
   * 03: "`UNKNOWN` should fail closed toward restriction, not toward reward."
   * An absent type is not evidence of a human, and reading it as one is exactly
   * the mistake the asymmetry warns about.
   */
  it("leaves an actor unknown when GitHub says nothing", () => {
    expect(classifyActor({ login: "someone" })).toBe("UNKNOWN");
    expect(classifyActor({ login: "someone", type: "" })).toBe("UNKNOWN");
    expect(classifyActor({ login: "someone", type: "Mannequin" })).toBe("UNKNOWN");
  });

  it("does not read an organization as a person", () => {
    expect(classifyActor({ login: "zitdevs", type: "Organization" })).toBe("UNKNOWN");
  });

  it("is not fooled by case", () => {
    expect(classifyActor({ login: "x", type: "bot" })).toBe("BOT");
    expect(classifyActor({ login: "X[BOT]" })).toBe("BOT");
    expect(classifyActor({ login: "x", type: "user" })).toBe("HUMAN");
  });

  /**
   * An AI agent driving a human account is invisible to every signal GitHub
   * publishes. Claiming to detect one here would be a claim Core cannot
   * support, so it never returns this: the Network reclassifies, and 24 lists
   * that reclassification as a trigger that removes points already awarded.
   */
  it("never claims to have detected an AI agent", () => {
    const inputs = [
      { login: "claude", type: "User" },
      { login: "some-ai-agent", type: "User" },
      { login: "copilot", type: "User" },
    ];
    for (const actor of inputs) {
      expect(classifyActor(actor)).not.toBe("AI_AGENT");
    }
  });
});
