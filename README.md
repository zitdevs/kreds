<div align="center">

# Kreds

**The leaderboard for your engineering team.**

Kreds turns the work your team already does on GitHub into a live leaderboard:
merged pull requests, code reviews, closed issues. Not a vanity commit counter.
The scoring is weighted so that helping someone else ship beats shipping alone.

[kreds.sh](https://kreds.sh) &nbsp;·&nbsp; [Docs](https://kreds.sh/docs) &nbsp;·&nbsp; [Self-hosting](docs/self-hosting.md) &nbsp;·&nbsp; [Pricing](https://kreds.sh/#pricing) &nbsp;·&nbsp; [Sponsor](https://github.com/sponsors/zitdevs)

[![CI](https://github.com/zitdevs/kreds/actions/workflows/ci.yml/badge.svg)](https://github.com/zitdevs/kreds/actions/workflows/ci.yml)
[![License: BUSL-1.1](https://img.shields.io/badge/license-BUSL--1.1-6ee7a0)](LICENSE)
[![Self-host](https://img.shields.io/badge/self--host-docker-8b949e)](docs/self-hosting.md)
[![Sponsor](https://img.shields.io/badge/sponsor-%E2%99%A5-e8b464)](https://github.com/sponsors/zitdevs)

</div>

---

> [!NOTE]
> Kreds is **source-available**, not OSI open source. You can read it, run it,
> and contribute to it. You just can't resell it as a competing hosted product.
> The plain-language version is in [Licensing](#licensing) below.

## Screenshots

> [!IMPORTANT]
> The application UI is in active development. This repository currently holds
> the marketing site, the licensing and the self-hosting path. Screenshots of
> the leaderboard, activity feed and profile land with the first app release.
> Follow [Discussions](https://github.com/zitdevs/kreds/discussions) if you want
> to know when.

## What Kreds is

Every engineering team has work that is invisible on a contribution graph. The
thorough review at 6pm. The flaky test someone finally fixed. The person who
unblocks three others before lunch.

Kreds makes that visible. It listens to GitHub events and scores the things that
actually move a team forward, through two systems that never touch each other.

**Contribution Points** are recognition. Cumulative, never spent, no supply.

| Action              | Points   |
| ------------------- | -------- |
| Merged pull request | 10 to 50 |
| Code review         | 10 to 60 |
| Issue resolved      | 5 to 20  |

**KRED** is currency, with a fixed supply and a double-entry ledger.

| Action                                   | KRED    | Source                                         |
| ---------------------------------------- | ------- | ---------------------------------------------- |
| Pull request merged to `main` / `master` | 5 to 35 | Issued from the Central Bank reserve           |
| Code review                              | 5 to 40 | Paid by the pull request author, less a 2% fee |

Merging creates KRED. Reviewing moves it. The author pays for help improving
their work, which is the whole opinion of the product expressed as an accounting
rule. If reviews created currency instead, two accounts could review each other
and print unlimited supply.

Self reviews, bot reviews and reviews filed after the merge are worth zero. Full
detail in [docs/kreds-rules.md](docs/kreds-rules.md).

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

1. **An OAuth App** identifies the person signing in (`read:user`, `read:org`).
2. **A GitHub App**, installed once on your org, delivers `pull_request`,
   `pull_request_review` and `issues` webhooks. This is where all activity comes
   from. No member ever grants access to code.

Both are walked through step by step in [docs/self-hosting.md](docs/self-hosting.md).

## Self-hosting

Self-hosting is a first-class path, not a grudging concession.

```bash
cp .env.example .env
docker compose up -d
```

- Runs anywhere Docker runs: your laptop, a VPS, your own Kubernetes.
- Bring your own GitHub App credentials. Your events never leave your infra.
- Postgres + Redis, both in the compose file.
- No license key, no phone-home, no seat check.

Full guide: **[docs/self-hosting.md](docs/self-hosting.md)**

## Pricing

The hosted version at [kreds.sh](https://kreds.sh) exists so you don't have to run
it yourself. Self-hosting is always free.

| Plan           | Price                  | For                                                |
| -------------- | ---------------------- | -------------------------------------------------- |
| **Community**  | Free                   | Up to 20 members, 1 team, unlimited repos          |
| **Team**       | $2.99 / member / month | Unlimited members, integrations, API, seasons      |
| **Growing**    | $79 / month flat       | Up to 50 members, cheaper than Team from 27 people |
| **Enterprise** | Custom                 | SSO/SAML, SCIM, audit logs, SLA, on-prem           |

**Free forever for verified open-source projects.** If your work is public, so is
ours. Open an issue with a link to your org and we'll flip the switch.

Full breakdown: [kreds.sh/#pricing](https://kreds.sh/#pricing)

## Licensing

Kreds is licensed under the [Business Source License 1.1](LICENSE), with the
Change License set to Apache 2.0. In plain language:

|     |                                                          |
| --- | -------------------------------------------------------- |
| ✅  | View, fork and study the source                          |
| ✅  | Self-host it: laptop, VPS, your own cloud                |
| ✅  | Use it inside your company, at any size, in production   |
| ✅  | Contribute changes back                                  |
| ❌  | Resell it as a competing hosted product                  |
| ❌  | Monetize a hosted version without a commercial agreement |

Each released version converts to **Apache 2.0** four years after its release.
Nothing gets rug-pulled. It only gets more permissive with time.

Being straight with you: this is **source-available, not open source**. It does
not meet the OSI definition, and we are not going to call it something it isn't.
If you need a commercial license, reach out: [contact@zitdevs.com](mailto:contact@zitdevs.com).

## Contributing

Contributions are genuinely welcome. Bug reports, docs fixes, new achievement
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

[**Sponsor on GitHub**](https://github.com/sponsors/zitdevs)

If Kreds helps your team, consider supporting development. Not in a position to?
Star the repo, file a bug report with a reproduction, or tell us why Kreds did
not work for your team. That helps too.

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
