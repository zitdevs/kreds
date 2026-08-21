# Security Policy

## Reporting a vulnerability

**Please do not open a public issue.**

Report privately through either:

- **[GitHub Security Advisories](https://github.com/zitdevs/kreds/security/advisories/new)** — preferred
- **[security@zitdevs.com](mailto:security@zitdevs.com)**

Please include:

- what the issue is and roughly how bad you think it is
- steps to reproduce, or a proof of concept
- affected version, and whether it is the hosted service or a self-hosted install
- anything you already know about mitigation

## What happens next

|                     |                                                     |
| ------------------- | --------------------------------------------------- |
| **Within 48 hours** | We acknowledge your report                          |
| **Within 7 days**   | We confirm the issue and give you an assessment     |
| **Within 90 days**  | Fix released, or we explain why it is taking longer |

We will keep you updated as it progresses, credit you in the advisory unless you
would rather stay anonymous, and let you know when the fix ships.

## Scope

**In scope**

- The hosted service at `kreds.sh`
- This repository
- The official Docker images under `ghcr.io/zitdevs/kreds`

**Out of scope**

- Vulnerabilities in third-party dependencies with no exploitable path in Kreds —
  report those upstream
- Findings from automated scanners with no demonstrated impact
- Social engineering, physical access, or denial of service
- Missing hardening headers with no concrete exploit

## Things we care about especially

Given what Kreds does, these matter more than usual:

- **Webhook signature verification.** Forged GitHub deliveries awarding Kreds.
- **Idempotency bypass.** Any path where a replayed event credits twice.
- **Team scoping.** Data from one team reachable by another.
- **Token handling.** GitHub App installation tokens leaking into logs, error
  responses, or the client bundle.

## Safe harbour

We will not pursue legal action against anyone who reports in good faith, avoids
privacy violations and service disruption, and gives us reasonable time to fix
the issue before disclosing it. Test against your own self-hosted instance
wherever possible.
