import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { SupplyController } from "./supply.controller.js";

/**
 * The API's source root.
 *
 * From the working directory rather than from `import.meta`, because this
 * package compiles to CommonJS and `import.meta` is not available there. Vitest
 * runs from the package root, so this resolves the same way in both.
 */
const apiSource = join(process.cwd(), "src");

/** Every controller in the API, read as text. */
function everyController(): { path: string; source: string }[] {
  const found: { path: string; source: string }[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".controller.ts")) {
        found.push({ path: full, source: readFileSync(full, "utf8") });
      }
    }
  };
  walk(apiSource);
  return found;
}

describe("Phase 8's done-when, from Core's side", () => {
  /**
   * > The 5M supply exists entirely inside the private ledger and no Core
   * > endpoint can mint Official KRED.
   *
   * The second half, checked across the whole API rather than trusted. This is
   * a text scan, which is coarse, and coarse is the point: it will notice a
   * route added in a hurry by somebody who never read this file.
   */
  it("has no route anywhere in the API that could mint", () => {
    for (const { path, source } of everyController()) {
      // Route decorators only. A word in a comment is not an endpoint.
      const routes = source.match(/@(Post|Put|Patch|Delete)\([^)]*\)/g) ?? [];
      for (const route of routes) {
        expect(route, `in ${path}`).not.toMatch(/mint|issue|supply|kred|balance|ledger|reserve/i);
      }
    }
  });

  /**
   * The supply is a read and only a read. Not a guarded write, not a write
   * behind a flag: there is no write.
   */
  it("serves the supply with no write verb at all", () => {
    const supply = everyController().find(({ path }) => path.endsWith("supply.controller.ts"));
    expect(supply).toBeDefined();
    expect(supply?.source).not.toMatch(/@(Post|Put|Patch|Delete)\(/);
    expect(supply?.source).toMatch(/@Get\(/);
  });

  /**
   * No service behind the controller, because a service is where a write would
   * eventually be added. The controller reads the Network and returns what it
   * said.
   */
  it("reaches the Central Bank only through the network client", () => {
    const supply = everyController().find(({ path }) => path.endsWith("supply.controller.ts"));
    expect(supply?.source).toContain("@kreds/network-client");
    expect(supply?.source).not.toMatch(/@kreds\/database/);
  });
});

describe("an instance with no Network", () => {
  /**
   * The default, and what most instances run forever. Not a supply of zero:
   * five million KRED existing with none circulating is a different claim from
   * the question not applying here, and answering with numbers would invite
   * somebody to display them.
   */
  it("says it has no Official supply, rather than reporting zero", async () => {
    const controller = new SupplyController();
    await expect(controller.supply()).rejects.toBeInstanceOf(NotFoundException);
  });

  it("explains why, so the answer is not mistaken for an outage", async () => {
    const controller = new SupplyController();
    await expect(controller.supply()).rejects.toThrow(
      /not connected to the Official Kreds Network/,
    );
  });
});
