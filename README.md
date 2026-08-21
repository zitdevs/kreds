<div align="center">

# Kreds

**The leaderboard for your engineering team.**

Kreds turns the work your team already does on GitHub — merged pull requests, code
reviews, closed issues — into a live leaderboard. Not a vanity commit counter:
the scoring is weighted so that helping someone else ship beats shipping alone.

[kreds.sh](https://kreds.sh) &nbsp;·&nbsp; [Docs](https://kreds.sh/docs) &nbsp;·&nbsp; [Self-hosting](docs/self-hosting.md) &nbsp;·&nbsp; [Pricing](https://kreds.sh/#pricing) &nbsp;·&nbsp; [Sponsor](https://github.com/sponsors/zitdevs)

[![CI](https://github.com/zitdevs/kreds/actions/workflows/ci.yml/badge.svg)](https://github.com/zitdevs/kreds/actions/workflows/ci.yml)
[![License: BUSL-1.1](https://img.shields.io/badge/license-BUSL--1.1-6ee7a0)](LICENSE)
[![Self-host](https://img.shields.io/badge/self--host-docker-8b949e)](docs/self-hosting.md)
[![Sponsor](https://img.shields.io/badge/sponsor-%E2%99%A5-e8b464)](https://github.com/sponsors/zitdevs)

</div>

---

> [!NOTE]
> Kreds is **source-available**, not OSI open source. You can read it, run it,
> and contribute to it — you just can't resell it as a competing hosted product.
> The plain-language version is in [Licensing](#licensing) below.

## Screenshots

> [!IMPORTANT]
> The application UI is in active development. This repository currently holds
> the marketing site, the licensing and the self-hosting path. Screenshots of
> the leaderboard, activity feed and profile land with the first app release —
> follow [Discussions](https://github.com/zitdevs/kreds/discussions) if you want
> to know when.

## What Kreds is

Every engineering team has work that is invisible on a contribution graph. The
thorough review at 6pm. The flaky test someone finally fixed. The person who
unblocks three others before lunch.

Kreds makes that visible. It listens to GitHub events and awards points for the
things that actually move a team forward:

| Action                                   | Default Kreds              |
| ---------------------------------------- | -------------------------- |
| Pull request merged to `main` / `master` | 25                         |
| Code review submitted                    | 15                         |
| Your pull request gets approved          | 10                         |
| Issue closed                             | 10                         |
| Five-day contribution streak             | 50                         |
| Finish the week at #1                    | 100                        |
| Commit pushed                            | 1 &nbsp;_(off by default)_ |

Every value is configurable per team. The ratio is the design: two reviews beat
one merge, which is why "commit pushed" ships turned off — it is the one rule
that rewards volume over collaboration.

## Why it exists

Standups tell you what people _say_ they did. Dashboards tell you how many lines
changed. Neither tells you who is holding the team together.

Kreds is built on one opinion: **the highest-leverage engineering work is
helping other people ship**, and if you are going to measure anything, measure
that. Everything else in the product follows from it.

## Quick start

Requires Node 20.11+, pnpm 9, and Docker (for Postgres and Redis).

```bash
git clone https://github.com/zitdevs/kreds.git
cd kreds
pnpm install

cp .env.example .env      # fill in your GitHub credentials
docker compose up -d db redis

pnpm dev                  # http://localhost:3000
```

You will need two things from GitHub, and they are different on purpose:

1. **An OAuth App** — identifies the person signing in (`read:user`, `read:org`).
2. **A GitHub App** — installed once on your org, delivers `pull_request`,
   `pull_request_review` and `issues` webhooks. This is where all activity comes
   from. No member ever grants access to code.

Both are walked through step by step in [docs/self-hosting.md](docs/self-hosting.md).

## Self-hosting

Self-hosting is a first-class path, not a grudging concession.

```bash
cp .env.example .env
docker compose up -d
```

- Runs anywhere Docker runs — your laptop, a VPS, your own Kubernetes.
- Bring your own GitHub App credentials. Your events never leave your infra.
- Postgres + Redis, both in the compose file.
- No license key, no phone-home, no seat check.

Full guide: **[docs/self-hosting.md](docs/self-hosting.md)**

## Pricing

The hosted version at [kreds.sh](https://kreds.sh) exists so you don't have to run
it yourself. Self-hosting is always free.

| Plan           | Price                  | For                                                 |
| -------------- | ---------------------- | --------------------------------------------------- |
| **Community**  | Free                   | Up to 20 members, 1 team, unlimited repos           |
| **Team**       | $2.99 / member / month | Unlimited members, integrations, API, seasons       |
| **Growing**    | $79 / month flat       | Up to 50 members — cheaper than Team from 27 people |
| **Enterprise** | Custom                 | SSO/SAML, SCIM, audit logs, SLA, on-prem            |

**Free forever for verified open-source projects.** If your work is public, so is
ours — open an issue with a link to your org and we'll flip the switch.

Full breakdown: [kreds.sh/#pricing](https://kreds.sh/#pricing)

## Licensing

Kreds is licensed under the [Business Source License 1.1](LICENSE), with the
Change License set to Apache 2.0. In plain language:

|     |                                                          |
| --- | -------------------------------------------------------- |
| ✅  | View, fork and study the source                          |
| ✅  | Self-host it — laptop, VPS, your own cloud               |
| ✅  | Use it inside your company, at any size, in production   |
| ✅  | Contribute changes back                                  |
| ❌  | Resell it as a competing hosted product                  |
| ❌  | Monetize a hosted version without a commercial agreement |

Each released version converts to **Apache 2.0** four years after its release.
Nothing gets rug-pulled — it only gets more permissive with time.

Being straight with you: this is **source-available, not open source**. It does
not meet the OSI definition, and we are not going to call it something it isn't.
If you need a commercial license, reach out — [hello@zitdevs.com](mailto:hello@zitdevs.com).

## Contributing

Contributions are genuinely welcome — bug reports, docs fixes, new achievement
ideas, integrations.

```bash
pnpm install
pnpm dev
pnpm lint && pnpm typecheck
```

Start with [CONTRIBUTING.md](CONTRIBUTING.md). Issues labelled
[`good first issue`](https://github.com/zitdevs/kreds/labels/good%20first%20issue)
are scoped small on purpose. Development happens in the open: roadmap, design
decisions and trade-offs all live in
[Discussions](https://github.com/zitdevs/kreds/discussions).

By contributing you agree your work is licensed under the same terms as the
project. See [CONTRIBUTING.md](CONTRIBUTING.md#licensing-of-contributions).

## Sponsorship

Kreds is built and maintained by [ZitDevs](https://zitdevs.com). Sponsorship is
what keeps the Community tier free and generous rather than a trial in disguise.

- [GitHub Sponsors](https://github.com/sponsors/zitdevs)
- [Open Collective](https://opencollective.com/kreds)
- [Buy Me a Coffee](https://buymeacoffee.com/zitdevs)

If Kreds helps your team, consider supporting development. If it doesn't, tell us
why in an issue — that helps too.

## Docs

|                                            |                                             |
| ------------------------------------------ | ------------------------------------------- |
| [Self-hosting guide](docs/self-hosting.md) | Docker, GitHub App setup, upgrades, backups |
| [Kreds rules](docs/kreds-rules.md)         | How scoring works and how to tune it        |
| [Licensing FAQ](docs/licensing.md)         | What BSL means for you, in plain terms      |
| [Contributing](CONTRIBUTING.md)            | Local setup, conventions, PR flow           |
| [Security](SECURITY.md)                    | Reporting a vulnerability                   |
| [Support](SUPPORT.md)                      | Where to ask questions                      |

---

<div align="center">

Built by [ZitDevs](https://zitdevs.com) · [kreds.sh](https://kreds.sh)

</div>
