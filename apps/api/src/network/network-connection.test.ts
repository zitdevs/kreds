import { Logger } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HttpNetworkClient, OfflineNetworkClient } from "@kreds/network-client";

import type { Env } from "../config/env.js";
import { readNetworkConnection } from "./network-connection.js";

const TOKEN = "issued-to-this-instance-and-never-logged";

function config(values: Partial<Record<keyof Env, string>>): ConfigService<Env, true> {
  return { get: (key: keyof Env) => values[key] } as unknown as ConfigService<Env, true>;
}

function captureLogs() {
  return {
    warn: vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined),
    log: vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Law XII: "Self-hosting does not require Kreds Network participation." The
 * default is an ordinary state, and an announced one.
 */
describe("an instance with no Network configured", () => {
  it("runs offline and warns once, naming both variables", () => {
    const { warn } = captureLogs();

    const connection = readNetworkConnection(config({}));

    expect(connection.connected).toBe(false);
    expect(connection.client).toBeInstanceOf(OfflineNetworkClient);
    expect(warn).toHaveBeenCalledOnce();
    const [message] = warn.mock.calls[0] as [string];
    expect(message).toContain("KREDS_NETWORK_URL");
    expect(message).toContain("KREDS_NETWORK_TOKEN");
  });

  /** Half a configuration is the easier one to miss. */
  it("stays offline with only the URL, naming the missing token", () => {
    const { warn } = captureLogs();

    const connection = readNetworkConnection(
      config({ KREDS_NETWORK_URL: "https://network.kreds.sh" }),
    );

    expect(connection.connected).toBe(false);
    const [message] = warn.mock.calls[0] as [string];
    expect(message).toContain("KREDS_NETWORK_TOKEN is not set");
    expect(message).not.toContain("KREDS_NETWORK_URL is not set");
  });

  it("stays offline with only the token, and never logs it", () => {
    const { warn, log } = captureLogs();

    const connection = readNetworkConnection(config({ KREDS_NETWORK_TOKEN: TOKEN }));

    expect(connection.connected).toBe(false);
    const [message] = warn.mock.calls[0] as [string];
    expect(message).toContain("KREDS_NETWORK_URL is not set");
    for (const call of [...warn.mock.calls, ...log.mock.calls]) {
      expect(JSON.stringify(call)).not.toContain(TOKEN);
    }
  });
});

describe("an instance connected to the Network", () => {
  it("speaks HTTP to it and warns about nothing", () => {
    const { warn, log } = captureLogs();

    const connection = readNetworkConnection(
      config({ KREDS_NETWORK_URL: "https://network.kreds.sh", KREDS_NETWORK_TOKEN: TOKEN }),
    );

    expect(connection.connected).toBe(true);
    expect(connection.client).toBeInstanceOf(HttpNetworkClient);
    expect(warn).not.toHaveBeenCalled();
    for (const call of log.mock.calls) {
      expect(JSON.stringify(call)).not.toContain(TOKEN);
    }
  });
});
