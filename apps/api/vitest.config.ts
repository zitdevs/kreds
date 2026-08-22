import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { globals: true, include: ["src/**/*.test.ts"] },
  plugins: [
    /**
     * Transpile with SWC rather than esbuild, for one reason: esbuild does not
     * emit decorator metadata, and Nest resolves a constructor parameter by
     * reading the type it emits.
     *
     * Without this, a test that boots the application gets `undefined` for
     * every injected service and fails in a way that looks like a bug in the
     * service. That is why `app.module.test.ts` did not exist until A04 shipped
     * a container that could not start.
     */
    swc.vite({
      module: { type: "es6" },
      jsc: {
        target: "es2022",
        parser: { syntax: "typescript", decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
});
