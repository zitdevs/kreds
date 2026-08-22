# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Public repository, marketing site for [kreds.sh](https://kreds.sh), and the
  self-hosting guide.

## [0.1.0] - 2026-08-21

The first public drop. Site and repository only. The application itself is in
active development and lands next.

### Added

- **Marketing site** (`apps/web`). Next.js 15, TypeScript, Tailwind 4. Hero,
  how-it-works, features, leaderboard showcase, pricing, self-hosting, licensing,
  community, sponsorship, and FAQ.
- **Business Source License 1.1**, Change License Apache 2.0, converting four
  years after each release. Internal and production use explicitly granted;
  competing hosted offerings are not.
- **Self-hosting path.** `docker-compose.yml` with Postgres and Redis, an
  annotated environment reference, and [docs/self-hosting.md](docs/self-hosting.md).
- **Community files.** Contributing guide, code of conduct, security policy,
  support guide, issue and pull request templates, funding configuration.
- **CI.** Lint, typecheck, format check and build on every push and pull
  request.

[Unreleased]: https://github.com/zitdevs/kreds/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/zitdevs/kreds/releases/tag/v0.1.0
