import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["src/**/*.test.ts"],
    /**
     * One file at a time. These suites are integration tests against one real
     * Postgres, and they truncate to isolate themselves.
     *
     * In parallel that isolation becomes the problem: `domain_events` carries a
     * foreign key to `repositories`, so the installation suite's
     * `truncate ... cascade` reaches the event suite's rows and deletes them
     * mid-test. The symptom was a fact reporting itself as new immediately
     * after being recorded, which is exactly what a duplicate getting through
     * would look like, so the pipeline appeared broken when only the harness
     * was.
     *
     * Worse, it only appeared when the files happened to interleave. Running
     * them in sequence costs a second or two and removes a class of flake that
     * would otherwise be blamed on the code under test.
     */
    fileParallelism: false,
  },
});
