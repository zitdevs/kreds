# Licensing, in plain terms

Kreds is **source-available**, not open source. We would rather say that plainly
than dress it up.

The full legal text is in [LICENSE](../LICENSE) — the
[Business Source License 1.1](https://mariadb.com/bsl11/), the same license used
by Sentry, Cal.com, HashiCorp's Terraform and CockroachDB.

## The short version

|     |                                                          |
| --- | -------------------------------------------------------- |
| ✅  | Read, fork and study the source                          |
| ✅  | Self-host it — laptop, VPS, your own cloud               |
| ✅  | Use it inside your company, at any size, in production   |
| ✅  | Modify it for your own needs                             |
| ✅  | Contribute changes back                                  |
| ❌  | Resell it as a competing hosted product                  |
| ❌  | Monetize a hosted version without a commercial agreement |

## Why not MIT or Apache?

Because a permissive license lets a cloud provider take Kreds, host it, sell it,
and put nothing back — and there is no version of that story where the project
survives to keep its Community tier free.

The BSL draws exactly one line: **do not sell Kreds as a service in competition
with us.** Everything else you would expect from open source stays intact.

## It becomes Apache 2.0

Every released version converts to the **Apache License 2.0** four years after
release. That is written into the license itself — not a promise in a blog post
we can walk back.

Concretely: v0.1.0 is Apache 2.0 on **2030-08-21**. From that date it is
unambiguously open source, forever, no matter what happens to ZitDevs.

The direction is one-way. Kreds only ever gets more permissive.

## What counts as "competing"

The one thing the license forbids is offering Kreds to third parties on a hosted
or embedded basis in order to compete with our paid version.

**Fine:**

- Running Kreds for your company's engineering team, at any size
- Running it for several teams inside the same organization
- Running it for a client as part of consulting work you do for them
- Bundling it into an internal platform your company uses
- Modifying it heavily and running your fork internally

**Not fine without talking to us:**

- Launching `kreds-cloud.io` and charging teams to use it
- Adding Kreds to your SaaS product as a paid feature for your customers
- Offering "managed Kreds hosting" as a commercial service

The distinction is whether you are serving **your own organization** or
**selling to third parties**.

## Contributions

Contributions are welcome and are licensed under the same terms as the project.
There is no CLA. We only ask that what you submit is genuinely yours to submit.

Your contributions also convert to Apache 2.0 on the same four-year clock.

## Free for open source

If your project is public and non-commercial, the hosted Team tier is free —
permanently, not as a trial. Open an issue with a link to your organization.

## Commercial licenses

Need terms the BSL does not grant? That conversation is welcome, not a trap.
Email **[hello@zitdevs.com](mailto:hello@zitdevs.com)** and tell us what you want
to build.

## Is this really not open source?

No, and we will not claim otherwise. The Open Source Initiative's definition
requires no restriction on field of use, and the BSL restricts one. Projects that
call BSL "open source" are stretching a word that has a specific meaning.

What we will claim: the source is public, you can run it, you can change it, you
can contribute to it, and it becomes properly open source on a fixed date.

---

_This page is a summary written for humans. Where it and [LICENSE](../LICENSE)
disagree, the LICENSE governs._
