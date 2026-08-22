import { describe, expect, it, vi } from "vitest";

import { InstallationService } from "./installation.service.js";

/**
 * A stand-in for the persistence layer, recording what it was asked to do.
 *
 * The repository itself is covered against a real Postgres in
 * `@kreds/database`. What is worth checking here is different: that each
 * webhook action is routed to the right call, and that unknown ones are
 * ignored rather than exploding.
 */
function fakeRepository() {
  return {
    install: vi.fn(async () => ({
      installation: { accountLogin: "zitdevs" },
      organization: null,
      repositories: [],
    })),
    addRepositories: vi.fn(async () => []),
    removeRepositories: vi.fn(async () => 0),
    setStatus: vi.fn(async () => ({ status: "REMOVED" })),
    refreshRepository: vi.fn(async () => ({ nameWithOwner: "zitdevs/kreds" })),
    findRepository: vi.fn(async () => null),
    findCoveredRepositories: vi.fn(async () => []),
    findInstallation: vi.fn(async () => null),
  };
}

function serviceWith(repository: ReturnType<typeof fakeRepository>) {
  return new InstallationService(repository as never);
}

const installation = {
  id: 48_291_037,
  account: { id: 9001, login: "zitdevs", type: "Organization" },
};
const repository = { id: 77_001, full_name: "zitdevs/kreds", private: false };

describe("installation events", () => {
  it("records a new installation and the repositories it covers", async () => {
    const repo = fakeRepository();
    const outcome = await serviceWith(repo).handle("installation", {
      action: "created",
      installation,
      repositories: [repository],
    });

    expect(outcome).toBe("PROCESSED");
    expect(repo.install).toHaveBeenCalledOnce();
    const [account, covered] = repo.install.mock.calls[0] as unknown as [
      { accountType: string },
      unknown[],
    ];
    expect(account.accountType).toBe("ORGANIZATION");
    expect(covered).toHaveLength(1);
  });

  /**
   * 02 ties a Kreds Team to a real GitHub Organization. A personal account is
   * a legitimate installation that forms no Team, so the account type has to
   * survive the trip from GitHub's wording to the domain's.
   */
  it("classifies a personal account as a user installation", async () => {
    const repo = fakeRepository();
    await serviceWith(repo).handle("installation", {
      action: "created",
      installation: { ...installation, account: { id: 42, login: "isaac", type: "User" } },
      repositories: [],
    });

    const [account] = repo.install.mock.calls[0] as unknown as [{ accountType: string }];
    expect(account.accountType).toBe("USER");
  });

  /**
   * Fails toward "personal", which creates no organization economy. An
   * unrecognised account type must never be able to conjure a Team.
   */
  it("treats an unrecognised account type as personal", async () => {
    const repo = fakeRepository();
    await serviceWith(repo).handle("installation", {
      action: "created",
      installation: { ...installation, account: { id: 42, login: "x", type: "Enterprise" } },
      repositories: [],
    });

    const [account] = repo.install.mock.calls[0] as unknown as [{ accountType: string }];
    expect(account.accountType).toBe("USER");
  });

  it.each([
    ["deleted", "REMOVED"],
    ["suspend", "SUSPENDED"],
    ["unsuspend", "ACTIVE"],
  ])("maps %s onto status %s", async (action, status) => {
    const repo = fakeRepository();
    const outcome = await serviceWith(repo).handle("installation", { action, installation });

    expect(outcome).toBe("PROCESSED");
    expect(repo.setStatus).toHaveBeenCalledWith(installation.id, status);
  });
});

describe("repository selection", () => {
  it("adds newly selected repositories", async () => {
    const repo = fakeRepository();
    const outcome = await serviceWith(repo).handle("installation_repositories", {
      action: "added",
      installation,
      repositories_added: [repository],
    });

    expect(outcome).toBe("PROCESSED");
    expect(repo.addRepositories).toHaveBeenCalledOnce();
  });

  it("removes deselected repositories by their GitHub id", async () => {
    const repo = fakeRepository();
    await serviceWith(repo).handle("installation_repositories", {
      action: "removed",
      installation,
      repositories_removed: [repository],
    });

    expect(repo.removeRepositories).toHaveBeenCalledWith(installation.id, [77_001]);
  });

  /**
   * A rename says what a repository is called, not that Kreds may watch it.
   * Routing it through the upsert would re-cover a deselected repository.
   */
  it("refreshes a renamed repository instead of re-adding it", async () => {
    const repo = fakeRepository();
    const outcome = await serviceWith(repo).handle("repository", {
      action: "renamed",
      installation: { id: installation.id },
      repository: { ...repository, full_name: "zitdevs/kreds-renamed" },
    });

    expect(outcome).toBe("PROCESSED");
    expect(repo.refreshRepository).toHaveBeenCalledOnce();
    expect(repo.addRepositories).not.toHaveBeenCalled();
  });

  it("ignores a repository event for one it has never recorded", async () => {
    const repo = fakeRepository();
    repo.refreshRepository = vi.fn(async () => null) as never;

    const outcome = await serviceWith(repo).handle("repository", {
      action: "renamed",
      installation: { id: installation.id },
      repository,
    });

    expect(outcome).toBe("IGNORED");
  });
});

describe("everything else is ignored, not fatal", () => {
  /**
   * GitHub sends every event the App is subscribed to, and adds new actions
   * over time. Throwing on an unread one would make GitHub retry it forever
   * and eventually mark the endpoint unhealthy.
   */
  it.each([
    ["push", { action: "whatever" }],
    ["installation", { action: "a_future_action", installation }],
    ["installation_repositories", { action: "reshuffled", installation }],
    ["repository", { action: "archived", installation: { id: 1 }, repository }],
  ])("ignores %s without throwing", async (eventType, payload) => {
    const repo = fakeRepository();
    await expect(serviceWith(repo).handle(eventType, payload)).resolves.toBe("IGNORED");
  });

  it("ignores a payload that does not match the shape at all", async () => {
    const repo = fakeRepository();
    await expect(serviceWith(repo).handle("installation", { nonsense: true })).resolves.toBe(
      "IGNORED",
    );
    await expect(serviceWith(repo).handle("installation", null)).resolves.toBe("IGNORED");
    expect(repo.install).not.toHaveBeenCalled();
  });
});
