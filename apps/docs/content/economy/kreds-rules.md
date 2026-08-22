<!--
  Every number on this page comes from public/policy/kreds-rules-public-v0.4.json
  in zitdevs/kreds-laws, read alongside chapter 21 (Default Economy). That
  repository is the authoritative source, and rulesVersion v0.4 is the version
  this page reflects.

  Not a generated file. Nothing regenerates it when the policy moves, so a
  version bump upstream leaves this page silently wrong until someone re-checks
  it against the new policy file.

  Deliberately absent: anything from kreds-laws/internal. Exact risk thresholds,
  trust gates and detection heuristics are operational and stay private.
-->

# How Kreds are awarded

Kreds exist to answer one question honestly: **who is moving this team forward?**

Every number on this page comes from the published economic policy. Nothing here
is invented, and nothing here is a suggestion. Where this page and the
constitution disagree, the constitution is right and this page is a bug.

## Two systems, deliberately separate

Kreds runs two scoring systems that never touch each other.

**Contribution Points** are recognition. They record that you did the work. They
are cumulative, they are never spent, and they have no supply.

**KRED** is currency. It has a fixed maximum supply, a double-entry ledger, and
rules about who may create it.

They never convert into each other, in either direction, at any rate. That is not
a product decision that could be revisited next quarter. A conversion rate would
turn reputation into a second money supply with none of the first one's controls,
and every supply limit would become bypassable by minting points.

## Contribution Points

| Action              | Points   |
| ------------------- | -------- |
| Merged pull request | 10 to 50 |
| Code review         | 10 to 60 |
| Issue resolved      | 5 to 20  |

Ranges, not flat values. A one line typo fix and a week of work are both merged
pull requests, and paying them the same teaches the wrong thing.

Points do not decrease when you spend KRED, carry debt, or participate in the
economy at all. They are adjusted only when the underlying contribution turns out
not to have happened: a revert, confirmed fraud, or an actor reclassified as a
bot.

## KRED: what creates it

| Action                                   | KRED    | Source                               |
| ---------------------------------------- | ------- | ------------------------------------ |
| Pull request merged to `main` / `master` | 5 to 35 | Issued from the Central Bank reserve |

Scaled by a quality score. Passing checks, a description someone can read,
resolved review threads, a linked issue and a sane diff size all feed it.

That is the short list on purpose. Shipping is the productive act, so shipping is
what creates value.

## KRED: what moves it

| Action      | KRED    | Source                          |
| ----------- | ------- | ------------------------------- |
| Code review | 5 to 40 | Paid by the pull request author |

A review moves existing KRED. It does not create any. The author pays for help
improving their work, the reviewer receives it less a 2% protocol fee, and the
fee returns to the Central Bank reserve.

```text
Review value      12.00 K
Author pays      -12.00 K
Reviewer gets    +11.76 K
Protocol          +0.24 K
```

**Why a transfer and not an award?** Because if reviews created KRED, two
accounts could review each other and print unlimited supply. No quality bar
survives that, because the attacker controls both sides of it. The fixed supply
would describe nothing.

## What is worth nothing

| Action                            | KRED |
| --------------------------------- | ---- |
| Reviewing your own pull request   | 0    |
| Reviews from bots and AI agents   | 0    |
| Reviews submitted after the merge | 0    |

Every GitHub identity is classified as human, bot, AI agent or unknown, and only
eligible humans participate economically. Dependabot and Renovate appear in your
history at zero, which is correct rather than rude.

Unknown fails closed. An identity Kreds cannot classify does not get paid.

## What happens when you cannot afford a review

You still get reviewed, and the reviewer still earns. What changes is where the
money comes from.

```text
1. Your settled balance
2. Your team's Review Fund
3. The Kreds review credit facility
4. A receivable the reviewer holds until it is funded
```

What never happens is a negative balance. A KRED balance is always zero or more.
What you owe is tracked beside it as debt, and future earnings clear that debt
before anything else becomes available to you.

So a heavy shipper with a review deficit reads as:

```text
Balance          0 K
Debt           204 K
Net position  -204 K
```

Not as minus 204 KRED, which would be currency that never came from anywhere.

## Specialising is allowed

Kreds does not require you to review as much code as you submit. A maintainer who
ships constantly and reviews rarely is doing a real job, not gaming anything.

The obligation to balance sits with the project, not with each individual. A
persistent deficit gets financed by productive work, a treasury, a sponsor or
limited credit. It does not get enforced as tit for tat, which would punish
exactly the people carrying the most responsibility.

## Where the work happened matters

An activity can earn Contribution Points without being eligible to create KRED.
The bar for money is deliberately higher than the bar for recognition, and when
the two standards disagree, the economy defers and reputation proceeds.

Opening a pull request in your own private repository and merging it yourself is
not evidence Kreds can verify, so it creates no KRED. Making that repository
public ten seconds ago does not change it either.

Two things can establish eligibility. A meaningful review from an independent,
trusted human is one: a second party with something to lose is itself evidence.
An established public repository with real history is the other, which is why
solo maintainers of widely used projects participate normally.

Repository trust is a score over many signals that moves gradually. It is never a
threshold on one number, because any single metric that unlocks issuance becomes
a market.

## Awards are immutable

Every award is a row: what happened, who it went to, the source GitHub event, the
rules version in force, and the amount granted at that moment.

Changing a value affects future awards only. Raise the merge ceiling today and
last month's merges keep what they were paid. A leaderboard that rewrites itself
when someone edits a setting is not a leaderboard, it is a rumour.

## Nothing is ever counted twice

GitHub redelivers webhooks on failure, on timeout, and whenever someone presses
Redeliver. A redelivery must never pay twice.

Every award is keyed on the event type, the GitHub node id and the recipient,
with a unique index behind it. A replayed event collides with the row already
there and is dropped.

Note what the key is not: the delivery id. GitHub issues a new one on every
redelivery, so keying on it would pay for the same merge again every time.

## Two leaderboards

| Board        | Ranks by            | Answers                     |
| ------------ | ------------------- | --------------------------- |
| Economy      | KRED net position   | Who is economically liquid? |
| Contribution | Contribution Points | Who is doing the work?      |

They are allowed to disagree, and when they do it is information. Somebody
leading contribution and trailing the economy is shipping a lot and funding
little of the review it took to get there.

## Tuning it for your team

Values are configurable. The ratios are the part worth thinking about.

**A team that under reviews.** Raise the review ceiling. Reviewing becomes the
efficient way to stay liquid.

**A team drowning in tiny pull requests.** Leave the values alone and set a
challenge instead. Rewarding responsiveness does not distort the base scoring.

**A team with wide seniority gaps.** Scope the board by squad. A leaderboard with
the same winner every week stops motivating everybody else.

**A team gaming it.** That is a signal, not a betrayal. Somebody just told you
the incentives are wrong. Move the numbers.
