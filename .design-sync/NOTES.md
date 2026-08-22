# design-sync notes for @kreds/ui

Repo-specific things a future sync needs. Read this before re-running.

## Commit the durable set. Seriously.

During the first sync (2026-08-22) a concurrent `git` operation on this repo,
the commit that landed `0cc222c refactor: split the documentation into its own
site and extract a UI package`, plus a `git clean`, **deleted every untracked
file under `.design-sync/`**: the config, all 38 authored previews, the 38 doc
stubs, the `next/link` shim, `conventions.md` and this file. It also removed the
staged `.ds-sync/*.mjs` scripts and the `ds-bundle/` output, and reverted the
`.gitignore` additions that protected them.

Everything was reproducible and was restored, but only because the transcript
still existed. **These files are the sync's real source code, so commit them.**
Only `.design-sync/.cache/`, `.design-sync/node_modules`, `.ds-sync/`,
`ds-bundle/`, `packages/ui/.ds-css/` and `packages/ui/types/` are disposable.

## How this repo is wired

- The design system is **`packages/ui` (`@kreds/ui`)**. It has no build: its
  `exports["."]` points straight at `src/index.ts`, so the converter is pointed
  at the TypeScript source with `--entry ./packages/ui/src/index.ts`.
  **`--entry` is resolved against the current working directory**, and the
  converter then walks _up_ to the nearest `package.json` with a name to decide
  the package directory. Run it from the repo root: `--entry ./src/index.ts`
  makes the repo root the package and silently syncs nothing.
- **`--node-modules apps/web/node_modules`**, not `packages/ui/node_modules`.
  `@kreds/ui` declares `react` but not `react-dom`, so under pnpm its own
  `node_modules` has no `react-dom` and the bundle step dies with
  `Could not resolve "react-dom"`.
- The campaign also syncs the **12 kreds.sh marketing sections** from
  `apps/web/src/components/*.tsx`, pulled in through `cfg.extraEntries`. They
  resolve their `@/lib/*` imports through `.design-sync/tsconfig.design-sync.json`.

## Things that will bite you

- **Tailwind v4 must be compiled.** `tokens.css` is Tailwind _source_: `@theme`,
  `@utility` and utility classes mean nothing to a browser. `.design-sync/tailwind-entry.css`
  is compiled by the Tailwind CLI into `packages/ui/.ds-css/kreds.css`, and
  `cfg.cssEntry` points there. Re-run `cfg.buildCmd` before every converter run.
  `cfg.cssEntry` is bounded to the **package** directory (unlike `extraFonts`,
  which is bounded to the git root), which is why the compiled file lives inside
  `packages/ui/` rather than under `.design-sync/`.
- **The compiled CSS carries a utility safelist.** Tailwind only emits classes it
  finds in scanned files, so without it roughly half of ordinary utilities
  (`mt-8`, `gap-8`, `grid-cols-2`, `opacity-50`, …) would not exist and the design
  agent's own layout glue would silently render unstyled. The `@source inline(...)`
  block at the end of `tailwind-entry.css` generates them. Colour utilities are
  deliberately restricted to the Kreds token names. Cost: ~293 KB of CSS.
- **`next/link` is shimmed.** Every linking component imports it, and outside a
  Next runtime it reads `process.env` and throws `process is not defined` before
  anything renders. `.design-sync/shims/next-link.tsx` renders the anchor that
  `Link` would have rendered and drops the navigation-only props; it is wired
  through `paths` in `.design-sync/tsconfig.design-sync.json`. This substitutes
  the framework, never a design-system component.
- **The preview harness paints `body{background:#fff}`** in an inline `<style>`
  after the stylesheet link. Kreds is dark-only, so `tailwind-entry.css` restates
  the surface at `html body` specificity. Without it every card is near-white ink
  on white.
- **Fonts.** kreds.sh loads Geist through `next/font`, which defines
  `--font-geist-sans` / `--font-geist-mono` at runtime. Claude Design has no Next
  runtime, so `.design-sync/fonts.css` ships the two variable woff2s from the
  `geist` package (SIL OFL 1.1) and `tailwind-entry.css` binds the two custom
  properties to those families.
- **Prop contracts needed help.** The extractor only matches a type literally
  named `<Name>Props`. `Section`, `SiteHeader` and `SiteFooter` export theirs and
  extract perfectly; `Button` (local `type Props`), the icons (shared `IconProps`)
  and the marketing sections do not, so they are hand-written in `cfg.dtsPropsFor`.
  **If a component's real props change, update `dtsPropsFor` by hand**, because nothing
  will warn you. Declarations are emitted to `packages/ui/types/` (gitignored) by
  the `tsc` line in "Re-running" below; the directory name matters, because
  `findTypesRoot` probes `types/`, `lib/`, `dist/` and ignores dot-directories.
- **Chromium.** No playwright browser cache on this machine and the homebrew
  `chromium` shim points at a missing app. `playwright` is installed into
  `.ds-sync/` with `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` and driven against the
  installed Google Chrome via
  `DS_CHROMIUM_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"`.
  Export it before `package-validate.mjs` and `package-capture.mjs`.
- **The `web` group name is not a choice.** Groups come from the doc-stub
  `category:` frontmatter in `.design-sync/docs/`, but only when the src-derived
  group is generic. The marketing sections sit in `apps/web/src/components`, whose
  last non-generic path segment is `web`, so that wins over `Sections`. Renaming
  it would mean forking the converter, which is not worth it.

## Known render warns

None. The final validate run is clean: 38/38 render, no `bad`, no `thin`, no
`variantsIdentical`, no floor cards.

## Re-running

From the repo root:

```sh
cd packages/ui && pnpm exec tsc --declaration --emitDeclarationOnly --noEmit false --outDir types && cd ../..
node .ds-sync/node_modules/@tailwindcss/cli/dist/index.mjs -i .design-sync/tailwind-entry.css -o packages/ui/.ds-css/kreds.css
export DS_CHROMIUM_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
node .ds-sync/resync.mjs --config .design-sync/config.json --node-modules apps/web/node_modules \
  --entry ./packages/ui/src/index.ts --out ./ds-bundle --remote .design-sync/.cache/remote-sync.json
```

On a fresh clone (or after a `git clean`) also re-stage the scripts from the
skill directory, `npm i esbuild ts-morph @types/react @tailwindcss/cli` and
`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright` inside `.ds-sync/`, and
recreate the gitignored symlink
`ln -sfn ../.ds-sync/node_modules .design-sync/node_modules`, because the Tailwind CLI
resolves `@import "tailwindcss"` relative to the entry file, which lives in
`.design-sync/`.

## Re-sync risks

- **`cfg.dtsPropsFor` is hand-written for 37 of 38 components** and cannot detect
  drift. A prop added to `Button`, an icon, or any marketing section will not
  appear in the contract the design agent reads. Check it whenever `@kreds/ui`'s
  API changes.
- **The utility safelist is a fixed list.** New Tailwind families the design agent
  might reach for are not in it. If designs come back partially unstyled, extend
  the `@source inline(...)` block rather than assuming the bundle is broken.
- **Preview content is hand-written copy**, close to but not identical to the live
  site's. If kreds.sh's messaging changes, the `Button`/`Section`/`SiteHeader`/
  `SiteFooter`/`Brand`/`Eyebrow` previews will quietly age. The 12 marketing
  sections render their own real copy and cannot drift.
- **The Geist woff2s are read out of `apps/web/node_modules/geist`.** If `geist`
  is dropped from `apps/web` or the package restructures its `dist/fonts` layout,
  `extraFonts` breaks and every design silently falls back to a system font.
- **The marketing-section previews depend on `apps/web` staying where it is.**
  Both `extraEntries` and the `@/*` alias are path-based; moving or renaming
  `apps/web` breaks them with a `not found, skipped` line, and the sections would
  quietly vanish from the sync rather than fail loudly.
- **Concurrent git operations are the biggest practical risk**: see the top of
  this file. Do not run a sync while a branch switch, stash or clean is in flight.
- Toolchain at sync time: node 25.8.0, pnpm 9.12.0, tailwindcss 4.3.3 (matched to
  the repo's own version, keep them in step), esbuild/ts-morph from `.ds-sync/`.

## Brand glyphs (added 2026-08-22, second sync)

`KredsMark` and `KredSymbol` live in `packages/ui/src/brand.tsx` and both export
a real `<Name>Props` interface, so the extractor picks their contracts up with no
`dtsPropsFor` entry — do not add one unless that stops being true. They are
grouped under `Brand` via the `category:` frontmatter in `.design-sync/docs/`,
which works because their src-derived group is generic.

The usage rule (mark = identity only, symbol = always beside an amount) is stated
in the `brand.tsx` docblock and is now transcribed into `conventions.md`, because
the design agent reads only the README. **If that rule changes in the source,
change it in `conventions.md` too** — nothing cross-checks them.

`apps/web/src/components/kred-amount.tsx` (`KredAmount`) wraps `KredSymbol` with a
figure. It is deliberately NOT synced: it is an app-level convenience, and the
design agent can compose the same thing from `KredSymbol` directly. Add it to
`extraEntries` + `componentSrcMap` if that judgement changes.

## Cosmetic finding (not fixed: it belongs to the repo, not the sync)

`packages/ui/src/styles/tokens.css` opens with the "Kreds design tokens" header
comment **twice**; one block was carried over during the extraction from
`apps/web`. Harmless, but worth deleting.
