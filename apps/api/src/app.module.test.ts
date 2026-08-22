import { Test } from "@nestjs/testing";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The application actually boots.
 *
 * This test exists because it was missing. Amendment A04 shipped with green
 * CI and a container that exited at startup: `AccessModule` injected a service
 * its own imports did not export, and a `RateBudget` interface, which has no
 * runtime token for Nest to resolve.
 *
 * Neither is visible to a unit test. Every other suite here constructs classes
 * directly with fakes, which is the right way to test behaviour and says
 * nothing at all about whether the container can build them. The dependency
 * graph is a real artifact and it needs its own check.
 *
 * `compile()` resolves every provider in every module, which is precisely the
 * step that failed. It does not listen on a port and it does not run the
 * migrations.
 */
describe("the module graph", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    // The module registry holds the validated configuration, so a second boot
    // under different variables has to start from a fresh copy.
    vi.resetModules();
  });

  /** Enough configuration to construct, and nothing that reaches the network. */
  function withEnvironment(extra: Record<string, string> = {}): void {
    const base: Record<string, string> = {
      NODE_ENV: "test",
      AUTH_SECRET: "a".repeat(48),
      DATABASE_URL: "postgres://kreds:kreds@127.0.0.1:1/kreds",
      KREDS_URL: "https://kreds.sh",
      KREDS_API_URL: "https://api.kreds.sh",
      KREDS_APP_URL: "https://app.kreds.sh",
      AUTH_GITHUB_ID: "id",
      AUTH_GITHUB_SECRET: "secret",
      ...extra,
    };
    for (const [key, value] of Object.entries(base)) vi.stubEnv(key, value);
  }

  /**
   * `AppModule` is imported here rather than at the top of the file.
   *
   * Its `ConfigModule.forRoot` validates the environment while the decorator is
   * evaluated, which happens at import. A static import would therefore run the
   * validation before any test could set a variable, and the first version of
   * this file failed exactly that way.
   */
  async function boot() {
    const { AppModule } = await import("./app.module.js");
    // `AppModule` configures its own global `ConfigModule`. Adding a second one
    // here registered a competing `ConfigService` and left the factories with
    // `undefined`.
    return Test.createTestingModule({ imports: [AppModule] }).compile();
  }

  /**
   * The default deployment: no delegated-query key configured. Most instances
   * run exactly this, so it is the arrangement most likely to break unnoticed.
   */
  it("resolves every provider with no optional secret configured", async () => {
    withEnvironment();
    const moduleRef = await boot();
    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  });

  /**
   * And with delegated query switched on, which is a different graph: the token
   * cipher exists, so `Authorizations` is a real instance rather than null.
   */
  it("resolves every provider with delegated query configured", async () => {
    withEnvironment({
      TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
      UNOBSERVED_POINTS_PER_DAY: "1",
      UNOBSERVED_POINTS_PER_MONTH: "2",
    });
    const moduleRef = await boot();
    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  });

  /**
   * The routes the application serves, pinned.
   *
   * A module that fails to register is a module whose controllers quietly
   * vanish, and the app still answers `/health`, so a smoke test on one route
   * proves nothing. This lists them.
   */
  it("registers every controller, including the ones A04 added", async () => {
    withEnvironment();
    const moduleRef = await boot();
    const app = moduleRef.createNestApplication();
    await app.init();

    const server = app.getHttpAdapter().getInstance() as {
      _router: { stack: { route?: { path: string; methods: Record<string, boolean> } }[] };
    };
    const routes = server._router.stack
      .filter((layer) => layer.route)
      .map(
        (layer) => `${Object.keys(layer.route!.methods)[0]?.toUpperCase()} ${layer.route!.path}`,
      );

    for (const route of [
      "GET /health",
      "GET /supply",
      "GET /access/ingestion",
      "GET /access/status/:gitHubUserId",
      "DELETE /access/authorization/:gitHubUserId",
    ]) {
      expect(routes, `${route} is missing`).toContain(route);
    }

    await app.close();
  });
});
