# Contribution Rules

> How Kreds recognises work, and why recognition is deliberately not payment.
>
> The companion document is [ECONOMIC_CONSTITUTION.md](ECONOMIC_CONSTITUTION.md),
> which governs KRED. This one governs Contribution Points. They are separate
> systems and the separation is load-bearing.

## Two systems, one platform

Kreds scores two different questions and never lets one answer both.

|                         | KRED                                         | Contribution Points        |
| ----------------------- | -------------------------------------------- | -------------------------- |
| Answers                 | What has been verified, funded, and settled? | What have you contributed? |
| Supply                  | Capped at 5,000,000                          | None. No supply exists     |
| Transferable            | Yes                                          | Never                      |
| Spendable               | Yes                                          | Never                      |
| Can create debt         | Yes                                          | Never                      |
| Decreases from spending | Yes                                          | No                         |
| Conversion between them | -                                            | None, ever                 |

The reason for the split is that the two questions have different evidentiary
standards, and forcing one answer to serve both broke each of them. Under a
single system, every recognition of work was also an issuance of currency. That
left Kreds two options: refuse to acknowledge legitimate work it could not
safely monetize, or monetize work it could not safely verify. The first insults
contributors. The second is the farming vector.

> **Kreds recognizes more work than it monetizes.**

Splitting the systems lets the economy stay paranoid while the reputation layer
stays generous.

## What earns points

Points are a range over quality, not a counter. The same quality scores that
drive the economy drive the points.

| Activity                      | Points     |
| ----------------------------- | ---------- |
| Merged pull request           | 10 to 50   |
| Code review                   | 10 to 60   |
| Issue resolution              | 5 to 20    |
| Meaningful review follow-up   | Bonus      |
| External project contribution | Multiplier |

Note that a review tops out higher than a merge. That is the same asymmetry the
economy uses, expressed in the layer that has no supply constraint at all:
reviewing should be the most valuable thing you can do. It also lets a team
recognise the developer whose main contribution is improving everyone else's
work, which is exactly the person a commit-counting metric renders invisible.

These ranges evolve independently of KRED monetary policy. Changing the review
reward curve does not imply changing review points.

## Points never become KRED

There is no conversion rate, in either direction, implied or explicit.

```text
10 Contribution Points = 1 KRED     never
```

The moment a conversion exists, points become a claim on KRED: a second money
supply with none of the first one's controls. No cap, no ledger discipline, no
settlement, no funding requirement. Every protection in the constitution would
be bypassable by minting reputation.

In the codebase this is enforced by the type system rather than by a runtime
check. `Points` and `Kredbits` are distinct nominal types in
[`@kreds/domain`](packages/domain), so a conversion is not something the code
refuses to do. It is something that does not compile.

## Points do not decrease from economic activity

Spending KRED, carrying debt, or holding a negative net position does not touch
your contribution score.

```text
KRED                 500 -> 200
Contribution Points  8,420 -> 8,420
```

Points are historical recognition. They record that work happened, and that fact
does not become untrue when you later pay someone to review your code.

This is why a developer can be economically underwater and among the highest
contributors on the platform at the same time. That combination is not a
contradiction. It is a maintainer having an expensive month.

### But invalidation is different

Points are immune to economic events. They are not immune to the underlying
contribution turning out not to be one.

| Event                           | Points              |
| ------------------------------- | ------------------- |
| Spending KRED                   | Unchanged           |
| Going into debt                 | Unchanged           |
| Unfunded review receivable      | Awarded anyway      |
| Pull request reverted           | Adjusted            |
| Confirmed fraud or farming      | Adjusted or removed |
| Actor reclassified as bot or AI | Removed             |

Adjustments follow the same discipline as the ledger: never delete history,
record a compensating entry.

## Recognition does not wait for funding

Points are awarded even when the KRED reward cannot be funded yet.

```text
Valid code review

Contribution Points   +30 pts
KRED Reward            30 K
KRED Status           Awaiting Funding
```

The work happened and is recognised immediately. Settlement is a separate
concern, handled by the funding waterfall.

This is the practical payoff of the split. A reviewer whose author is broke is
no longer told, implicitly, that their review was worth nothing.

## Your history starts before your account does

An unclaimed GitHub identity earns Contribution Points for verified work,
exactly as it can earn KRED. Review someone's pull request without ever signing
up, and the recognition is waiting for you. Points are claimed together with the
identity.

Like all points they are subject to invalidation, and an identity confirmed as a
fabricated farming account loses them entirely. Points carry no supply risk, so
this permissiveness costs the economy nothing.

## Two scopes, two leaderboards

Points are tracked globally and per organization.

```text
@isaac

Global Contribution Score
8,942 pts

ZitDevs Contribution Score
2,840 pts
```

That gives a team the ranking it usually actually wants: engineering
contribution, independent of personal KRED wealth.

- The **economy leaderboard** tells you who is liquid.
- The **contribution leaderboard** tells you who is doing the work.

A negative economic position does not imply low contribution.

## Bots do not earn

Every GitHub identity is classified `HUMAN`, `BOT`, `AI_AGENT`, or `UNKNOWN`,
and only humans participate. Dependabot, Renovate, Copilot and Claude Code may
appear in your history at zero.

`UNKNOWN` fails closed. An unclassified actor that turns out to be a bot has
already been credited for work it did not do; an unclassified actor that turns
out to be human can be credited retroactively. The asymmetry has one correct
default.

## What is not in this document

Exact quality-score formulas, trust thresholds, farming detection rules, and
tier multipliers are not published. Publishing them would tell anyone farming
the system precisely which line to stand behind.

That is not a gap in the documentation. It is the one part of the design that
stops working when it becomes public.

---

Governed by the [Kreds Economic Constitution](ECONOMIC_CONSTITUTION.md),
Laws XXVI to XXVIII. Where this document and the constitution disagree, the
constitution wins and this document is the bug.
