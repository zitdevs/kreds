# Self-hosting Kreds

Kreds is designed to run in your own infrastructure. No license key, no
phone-home, no seat check. The whole product is in the box.

This guide takes about 20 minutes, most of it spent in GitHub's settings.

- [Requirements](#requirements)
- [1. Get the code](#1-get-the-code)
- [2. Create a GitHub OAuth App](#2-create-a-github-oauth-app)
- [3. Create a GitHub App](#3-create-a-github-app)
- [4. Configure the environment](#4-configure-the-environment)
- [5. Start it](#5-start-it)
- [Upgrading](#upgrading)
- [Backups](#backups)
- [Running behind a proxy](#running-behind-a-proxy)
- [Troubleshooting](#troubleshooting)

## Requirements

|                       |                                                    |
| --------------------- | -------------------------------------------------- |
| Docker                | 24+ with Compose v2                                |
| Postgres              | 15+, provided by the compose file                  |
| Redis                 | 7+, provided by the compose file, optional         |
| A GitHub organization | You need admin rights to install an App on it      |
| A public HTTPS URL    | GitHub must be able to reach your webhook endpoint |

That last one is the only real constraint. GitHub pushes events to you; it
cannot reach `localhost`. For local development use a tunnel. `cloudflared
tunnel --url http://localhost:4000` or `ngrok http 4000` both work. The tunnel points
at the API, which is the service GitHub talks to.

## 1. Get the code

```bash
git clone https://github.com/zitdevs/kreds.git
cd kreds
cp .env.example .env
```

## 2. Create a GitHub OAuth App

This one only identifies people signing in. It never touches code.

1. Go to **Settings → Developer settings → OAuth Apps → New OAuth App**
   ([direct link](https://github.com/settings/developers)).
2. Fill in:
   - **Application name**: `Kreds` (or `Kreds acme-labs`)
   - **Homepage URL**: your `KREDS_URL`
   - **Authorization callback URL**: `<KREDS_API_URL>/auth/callback/github`
3. Generate a client secret.
4. Put the client ID and secret into `AUTH_GITHUB_ID` and `AUTH_GITHUB_SECRET`.

Kreds requests `read:user` and `read:org` at sign-in, enough to know who someone
is and which organizations they belong to. Nothing more.

## 3. Create a GitHub App

This is where all activity comes from. Separating it from OAuth is deliberate:
one admin installs the App once, and no individual member ever grants access to
source code.

1. Go to **Organization settings → Developer settings → GitHub Apps → New GitHub App**.
2. Fill in:
   - **GitHub App name**: `Kreds` (must be unique across GitHub, so add your org
     name if it is taken)
   - **Homepage URL**: your `KREDS_URL`
   - **Webhook URL**: `<KREDS_API_URL>/github/webhook`
   - **Webhook secret**: generate one with `openssl rand -hex 32` and keep it
3. **Repository permissions**, read-only, all three:

   | Permission    | Access                  |
   | ------------- | ----------------------- |
   | Metadata      | Read-only _(mandatory)_ |
   | Pull requests | Read-only               |
   | Issues        | Read-only               |

4. **Subscribe to events**: `Pull request`, `Pull request review`, `Issues`.
5. Create the App, then:
   - note the **App ID**
   - generate a **client secret**
   - generate a **private key**, which downloads a `.pem` file
6. **Install the App** on your organization and choose which repositories it can
   see. Only what you select here is ever counted.

Turning on the optional "commit pushed" rule later also needs the `Push` event.
You can add it without recreating the App.

## 4. Configure the environment

Fill in `.env`. Every value, and what it is for:

### Core

| Variable        | Required | Notes                                                                                                        |
| --------------- | -------- | ------------------------------------------------------------------------------------------------------------ |
| `KREDS_URL`     | yes      | Public origin of the marketing site, no trailing slash.                                                      |
| `KREDS_APP_URL` | yes      | Public origin of the product. Where a finished sign-in lands, and the only origin allowed to read a session. |
| `KREDS_API_URL` | yes      | Public origin of the API, no trailing slash. GitHub talks to this one, so it must be reachable.              |
| `AUTH_SECRET`   | yes      | Session signing key. `openssl rand -base64 32`.                                                              |
| `DATABASE_URL`  | yes      | Postgres connection string. The compose file wires this for you.                                             |

### GitHub OAuth

| Variable             | Required | Notes                            |
| -------------------- | -------- | -------------------------------- |
| `AUTH_GITHUB_ID`     | yes      | OAuth App client ID from step 2. |
| `AUTH_GITHUB_SECRET` | yes      | OAuth App client secret.         |

### GitHub App

| Variable                   | Required | Notes                                                                                  |
| -------------------------- | -------- | -------------------------------------------------------------------------------------- |
| `GITHUB_APP_ID`            | yes      | Numeric App ID from step 3.                                                            |
| `GITHUB_APP_CLIENT_ID`     | yes      | Starts with `Iv1.` or `Iv23`.                                                          |
| `GITHUB_APP_CLIENT_SECRET` | yes      | App client secret.                                                                     |
| `GITHUB_APP_PRIVATE_KEY`   | yes      | Contents of the `.pem`. See the note below.                                            |
| `GITHUB_WEBHOOK_SECRET`    | yes      | The secret you set on the App. Deliveries failing signature verification are rejected. |

> **The private key trips everyone up.** It is a multi-line PEM and `.env` files
> are single-line. Convert it:
>
> ```bash
> awk 'BEGIN{ORS="\\n"} {print}' your-app.private-key.pem
> ```
>
> Paste the result as one line. Alternatively base64 it
> (`base64 -i key.pem | tr -d '\n'`). Kreds accepts either form.

### Optional

| Variable            | Default | Notes                                                                                                             |
| ------------------- | ------- | ----------------------------------------------------------------------------------------------------------------- |
| `REDIS_URL`         | unset   | Queue for webhook processing. Without it, events are handled in-process, fine for small teams but not for bursts. |
| `KREDS_SUPERADMINS` | unset   | Comma-separated GitHub logins that bypass team admin checks on this instance.                                     |
| `PORT`              | `3000`  | Host port the container binds to.                                                                                 |

## 5. Start it

```bash
docker compose up -d
docker compose logs -f kreds
```

Open your `KREDS_APP_URL`, sign in with GitHub, create a team, and pick the
repositories the App can see.

Kreds backfills the last 30 days of pull requests, reviews and issues on first
connect, so the leaderboard is not empty on day one.

## Upgrading

```bash
docker compose pull
docker compose up -d
```

Migrations run automatically on boot. We do not ship destructive migrations in
patch releases, but take a backup first anyway.

Pin a version rather than tracking `latest` in production:

```yaml
services:
  kreds:
    image: ghcr.io/zitdevs/kreds:v0.1.0
```

Breaking changes are called out in [CHANGELOG.md](https://github.com/zitdevs/kreds/blob/main/CHANGELOG.md) and in the
release notes.

## Backups

Everything that matters is in Postgres. Redis is a cache and a queue, so losing it
costs you at most the events in flight.

```bash
# Back up
docker compose exec -T db pg_dump -U kreds kreds | gzip > kreds-$(date +%F).sql.gz

# Restore
gunzip -c kreds-2026-08-21.sql.gz | docker compose exec -T db psql -U kreds kreds
```

The awards ledger is append-only, so a restore gives you back a consistent
leaderboard rather than a half-recomputed one.

## Running behind a proxy

Terminate TLS in front of Kreds and forward to port 3000. A minimal Caddy config:

```caddy
kreds.example.com {
    reverse_proxy localhost:3000
}
```

Two things to get right:

- `KREDS_URL`, `KREDS_APP_URL` and `KREDS_API_URL` must all be **public HTTPS**
  origins, not `http://localhost`. OAuth callbacks and webhook signatures are
  checked against `KREDS_API_URL`, so getting that one wrong breaks sign-in and
  ingestion at the same time. `KREDS_APP_URL` is the origin CORS allows, so
  getting it wrong leaves people signed in with a product that cannot read the
  session it just issued them.
- Do not buffer or rewrite the request body on `/api/github/webhook`. Webhook
  signatures are computed over the raw bytes; a proxy that reformats JSON will
  break verification.

## Troubleshooting

### Kreds is running but no Kreds are awarded

Check delivery first. In your GitHub App settings, open **Advanced → Recent
Deliveries**. You will see one of three things:

- **No deliveries at all.** The webhook URL is wrong, or GitHub cannot reach it.
- **Deliveries with a non-2xx response.** The response body says why.
- **Deliveries returning 401.** `GITHUB_WEBHOOK_SECRET` does not match the
  secret configured on the App.

GitHub keeps failed deliveries for redelivery. Fix the cause, hit **Redeliver**,
and nothing is lost. Awards are idempotent, so a redelivery cannot double-credit.

### `redirect_uri_mismatch` on sign-in

The OAuth App's callback URL must be exactly
`<KREDS_API_URL>/auth/callback/github`: same scheme, same host, no trailing
slash, no port mismatch. Note that it is the **API** origin, not the web one.

### `error: unable to parse private key`

The PEM lost its newlines, or you pasted the public key. See the note in
[step 4](#github-app).

### A member is missing from the leaderboard

They have to sign in once before they can be scored, because Kreds needs to map a GitHub
account to a team member. Until then their activity is recorded but unattributed.

### Events arrive but totals look wrong

Kreds stores the amount awarded at the time of the award. If an admin changed a
rule value, past awards deliberately keep their original amount. The season is
never rewritten underneath people. The awards ledger on each profile shows the
value each award was granted with.

---

Still stuck? Open a [Discussion](https://github.com/zitdevs/kreds/discussions)
with your `docker compose logs kreds` output, secrets removed.
