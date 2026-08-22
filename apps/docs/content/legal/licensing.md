# Licensing, in plain terms

Kreds Core is **open source** under the
[GNU Affero General Public License v3.0](https://github.com/zitdevs/kreds/blob/main/LICENSE).

Not source-available. Not open-core with the good parts removed. The repository
you are reading is the whole product, and you can run it, change it and build a
business on it.

## What you can do

|     |                                                          |
| --- | -------------------------------------------------------- |
| ✅  | Read, fork and study every part of the system            |
| ✅  | Self-host it, on your laptop or in production            |
| ✅  | Use it commercially, inside a company of any size        |
| ✅  | Modify it however you like                               |
| ✅  | Sell services around it, including hosting it for others |
| ✅  | Contribute changes back                                  |

AGPLv3 does not prohibit commercial use. It does not prohibit selling. It does
not prohibit hosting Kreds for other people. Anyone who tells you otherwise has
confused it with a non-commercial licence.

## The one obligation

AGPLv3 has a single requirement that ordinary GPL does not:

> If you modify Kreds and let people use that modified version over a network,
> the users of that service must be offered the source of your modified version.

That is the whole of it. Run it unmodified and nothing changes for you. Modify it
for your own team and nothing changes for you either, because your team is not a
third party being served over a network. Modify it and offer it publicly as a
service, and your users get the same right to the source that you had.

The [LICENSE](https://github.com/zitdevs/kreds/blob/main/LICENSE) is the authoritative text. This page is a summary for
humans and loses to the licence wherever the two disagree.

## Why AGPL and not MIT

Because Kreds is infrastructure that a hosting company could take, improve
privately, and sell back to the same community that built it. AGPL keeps
improvements flowing in both directions.

It is a deliberately even trade: you get everything, and if you distribute a
changed version as a service, so does everyone else.

## Kreds Core is not the Kreds Network

This licence covers **Kreds Core**, which is the software in this repository.

The **Official Kreds Network** is separate infrastructure. It runs the shared
global economy behind Official KRED: the Central Bank, global settlement, network
identity, cross-organization trust and the risk systems that keep the supply
honest. It is proprietary and it is not in this repository.

That separation is the point rather than a catch. A shared economy needs a single
authoritative ledger and anti-abuse systems whose rules are not public, or the
protections stop working the moment someone reads them. Everything that does not
require a shared network is open.

```text
Kreds Core        AGPLv3, open source, runs standalone
Kreds Network     Public protocol specification
Official Network  Private infrastructure behind kreds.sh
```

A self-hosted Kreds runs its own economy, its own currency and its own rules,
with no dependency on kreds.sh. Joining the Official Network is an option, never
a requirement. See
[Kreds Core and the Kreds Network](../architecture/core-and-network.md).

## Contributions

Contributions are licensed under AGPLv3, the same as the project. There is no
CLA. We only ask that what you submit is genuinely yours to submit.

## Trademarks are separate

The licence covers the code. It does not grant rights to the Kreds name, the
logo, or to present a fork as the official service. Those rules live in
[TRADEMARKS.md](trademarks.md), which is deliberately permissive about honest
use and strict about impersonation.

## Free for open source

If your project is public and non-commercial, the hosted Team tier on kreds.sh is
free permanently. Open an issue with a link to your organization.

## Questions

Anything the licence does not answer: [contact@zitdevs.com](mailto:contact@zitdevs.com).
