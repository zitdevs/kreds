# Contributing to Kreds

Thanks for being here. Kreds Core is open source under AGPLv3, and development
happens in the open: issues, roadmap, and the reasoning behind decisions are all
public.

## Ways to help

You do not need to write code to be useful:

- **Report a bug.** Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.yml).
  A reproduction beats a description every time.
- **Propose a feature.** Use the [feature request template](.github/ISSUE_TEMPLATE/feature_request.yml).
  Tell us the problem before the solution.
- **Improve the docs.** Anything confusing in `docs/` is a bug in the docs.
- **Suggest an achievement or a Kreds rule.** These come from real teams; ours
  are only a starting point.
- **Answer a question** in [Discussions](https://github.com/zitdevs/kreds/discussions).

## Local setup

Requires **Node 20.11+**, **pnpm 9**, and **Docker**.

```bash
git clone https://github.com/zitdevs/kreds.git
cd kreds
pnpm install

cp .env.example .env
docker compose up -d db redis

pnpm dev
```

The landing site lives in `apps/web` and runs on <http://localhost:3000>.

Before pushing:

```bash
pnpm lint
pnpm typecheck
pnpm format
```

CI runs the same three. If they pass locally they pass there.

## Repository layout

```
kreds/
├── apps/
│   └── web/              Next.js marketing site (kreds.sh)
│       └── src/
│           ├── app/      App Router entry, metadata, SEO routes
│           ├── components/
│           └── lib/      site config, pricing data, content
├── docs/                 self-hosting, rules, licensing
└── .github/              CI, issue and PR templates, funding
```

There is no `packages/ui` yet, deliberately: with a single consumer a shared
package is ceremony, not architecture. When the app itself lands and two things
need the same button, we will add it then.

## Pull requests

- **Branch from `main`.** Name it `feat/short-thing` or `fix/short-thing`.
- **One concern per PR.** A PR that fixes a bug _and_ renames twelve files is
  two PRs.
- **Conventional Commits** for the title: `feat:`, `fix:`, `docs:`, `chore:`,
  `refactor:`, `test:`. The changelog is generated from these.
- **Explain the why.** The diff already says what changed.
- **Screenshots for UI changes.** Light and dark if the change touches both.

Small, focused PRs get reviewed fast. Large ones sit, not out of spite but
because nobody has a free hour.

## Code conventions

- **TypeScript, no `any`.** If a type is genuinely unknown, `unknown` and narrow.
- **Server Components by default.** Reach for `"use client"` only when you need
  state, effects, or event handlers.
- **Tailwind for styling**, using the design tokens in `globals.css`. If you need
  a new colour, add a token rather than a one-off hex.
- **Accessibility is not optional.** Semantic elements, real focus states, labels
  on interactive things, and text that survives 200% zoom.
- **No new dependency without a reason** in the PR description. Bundle size on a
  marketing page is a feature.

## Licensing of contributions

Kreds Core is licensed under [AGPLv3](LICENSE). By submitting a contribution you
agree that:

- your contribution is licensed under the same terms as the project, and
- you have the right to submit it (it is your own work, or you have permission).

We do not require a CLA. We do require that you actually own what you send.

## Code of conduct

Participation is governed by the [Code of Conduct](CODE_OF_CONDUCT.md). It comes
down to: assume good faith, critique the work and not the person, and let people
learn in public without being made to feel small.

## Security

Do **not** open a public issue for a vulnerability. See [SECURITY.md](SECURITY.md).
