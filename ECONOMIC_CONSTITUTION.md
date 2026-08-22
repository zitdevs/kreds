<!--
  Synced from the public constitution in zitdevs/kreds-laws at policy v0.4
  (Amendment A03, Economic Hardening). That repository is the authoritative
  source. Where this copy and the source disagree, the source is right and this
  file is stale.

  Two deliberate differences from the source: links to the private chapter files
  are flattened to plain text, since they would 404 for anyone reading this, and
  em dashes are removed to match the house style in the rest of the repository.

  Deliberately absent: exact risk thresholds, trust gates, tier multipliers,
  credit limits and detection heuristics. Those govern the Official Kreds
  Network and stay private, because a published threshold is a published way
  around it. The laws below are the principles; the numbers that enforce them
  are operational.
-->

# The Kreds Economic Constitution

> Thirty-four foundational laws: I to XX original, XXI to XXV added by Amendment A01,
> XXVI to XXXIV added by Amendment A02. Everything else in this repository is subordinate to
> them. A default value may be tuned; a law may not be tuned. It can only be
> amended deliberately, with a version bump and a stated reason.

Each law below is stated, then explained: **what it means** in practice and
**what it prevents**. The "prevents" column is the important one, every law
here exists because something breaks without it.

---

## Law I: Official Issuance

> **Official KREDS can only be issued by the Kreds Network.**

**Means:** every official KRED originates from exactly one of three sources: the
Central Bank reserve, another existing holder, or an explicit reversal/refund of
an earlier transaction. No KRED appears from nowhere.

**Prevents:** local minting. A self-hosted instance, an org admin, or a
compromised client cannot create official supply. The maximum supply is only
meaningful if issuance has a single choke point.

---

## Law II: Auditable Movement

> **Every KRED movement must have an auditable ledger entry.**

**Means:** balances are _derived_, never stored-and-mutated. `user.balance += 30`
is a bug, not an optimisation.

**Prevents:** unexplainable state. If a balance cannot be reconstructed from its
entries, fraud investigation, reversal, and supply conservation all become
impossible at once.

---

## Law III: Productive Creation

> **Shipping may create value. Reviewing primarily circulates value.**

**Means:** merges mint (bounded, quality-scored). Reviews transfer from author to
reviewer. The economy grows through shipped work and _moves_ through helping
others ship.

**Prevents:** infinite inflation via review farming. If reviews minted, two
accounts reviewing each other would print money forever.

---

## Law IV: Organization Boundary

> **GitHub-derived economic activity first belongs to the economy of the
> connected GitHub Organization.**

**Means:** value earned from work inside an org lands in an org-scoped position
before it is anything else even when the org uses official KRED 1:1.

**Prevents:** earn-here-spend-there escapes. The boundary is what makes
reversals, debt, collusion detection, and settlement enforceable.

---

## Law V: Same Currency Does Not Mean Same Accounting Context

> **A team using KRED 1:1 still requires organization-scoped positions,
> settlement, debt, and risk controls before KRED becomes globally withdrawable.**

**Means:** "we just use KRED" is a _currency_ choice, not an _accounting_ choice.
The org position exists regardless.

**Prevents:** the obvious shortcut, treating 1:1 teams as a direct pipe into the
global wallet, which would delete every protection in Part XI.

---

## Law VI: Debt Is Allowed

> **Users may hold negative _net positions_ within defined credit limits. Actual
> KRED balances are never negative.**

**Means:** owing more review than you have paid for is a legitimate game state,
not an error condition. The debt is recorded as a liability alongside a KRED
balance that stays at or above zero. The intended way out is productive work,
especially reviewing others.

**Prevents:** a dead economy. If authors could not owe, review requests would
stall the moment a balance hit zero, and the core loop would deadlock.

> **Amended by A01 (`v0.2`).** Previously read _"Users may hold negative
> positions"_, which permitted negative currency balances, and therefore let two
> accounts at zero mint spendable KRED by reviewing each other. See
> [Law XXI](#law-xxi--no-monetary-creation-through-debt) and
> 23 Review Funding, Debt and Credit.

---

## Law VII: Extraction Is Not Guaranteed

> **Debt, pending value, borrowed value, or unsettled activity cannot be
> exported as global settled KRED.**

**Means:** withdrawable is a strict subset of balance. Value must survive the
settlement window and risk checks before it leaves the org context.

**Prevents:** the core farming attack, mint locally, export instantly, default
locally, walk away.

---

## Law VIII: Debt Is Repaid First

> **When an economic position carries outstanding debt or unfunded receivables,
> future eligible earnings settle those obligations before becoming withdrawable
> or transferable.**

**Means:** a user owing `200 K` who earns `+40 K` now owes `160 K` and holds
nothing new. That `+40 K` cannot be routed anywhere else. Where the obligation is
an unfunded receivable, the _reviewer_ is paid before the author receives a
kredbit.

**Prevents:** parallel-account debt parking: earn on the indebted account, route
the earnings out, leave the hole permanently open.

> **Amended by A01 (`v0.2`)** to cover receivables and non-organization debt, and
> to state the ordering explicitly:
> `earnings → debt → pending settlement → available → withdrawable`.

---

## Law IX: Global KRED Belongs to the Holder

> **Once settled, Official KRED belongs to the user's global wallet and follows
> them across the network.**

**Means:** one human, one global KRED wallet, regardless of how many orgs they
belong to. Leaving a team does not confiscate settled KRED.

**Prevents:** employer-captured reputation. Kreds is a portable developer
economy or it is a corporate points program; it cannot be both.

---

## Law X: Local Currency Stays Local

> **Organization-specific currencies belong to their respective economies.**

**Means:** `ZIT` is ZitDevs' currency. It does not travel, and holding 4,000 ZIT
never means holding KRED.

**Prevents:** implicit convertibility. Without this, every org currency becomes a
synthetic claim on the global reserve.

---

## Law XI: Independent Economies Are Free

> **Independent self-hosted economies may define their own currency and policy,
> but cannot mint or impersonate Official KRED.**

**Means:** run your own instance, print a billion of your own currency, set your
own fees. That is your economy. It is simply not the Kreds Network.

**Prevents:** counterfeit legitimacy, a self-hosted instance advertising local
tokens as network-backed.

---

## Law XII: Network Membership Is Optional for Self-Hosting

> **Self-hosting does not require Kreds Network participation. Joining later is
> permitted through a defined migration process.**

**Means:** the open-source path is genuinely usable standalone; the network is
an opt-in upgrade with registration, signed events, and identity verification.

**Prevents:** a fake open-source story where the software is useless without the
hosted service.

---

## Law XIII: Joining Does Not Rewrite History

> **Joining Kreds Network gives an existing local economy a reserve relationship;
> it does not erase its previous balances or ledger.**

**Means:** a member's 42,000 local units before joining are still 42,000 after.
The join is recorded as a snapshot: opening supply, opening reserve, opening
backing ratio.

**Prevents:** migration as a stealth wealth reset, the fastest way to lose the
trust of every existing member.

---

## Law XIV: Reserve Backing Is Not Fiat Value

> **KRED-backed local currencies may have relative backing against KRED without
> Kreds assigning KRED a cash price.**

**Means:** publish `1 ZIT = 0.025 KRED`. Never publish `1 KRED = $0.12`.

**Prevents:** turning a gamification layer into a financial instrument, with
every legal and adversarial consequence that follows.

---

## Law XV: Rules May Change, History May Not

> **Economic rules are versioned and forward-only.**

**Means:** every transaction stores the `rulesVersion` that produced it. Raising
the review maximum affects future eligible activity only.

**Prevents:** retroactive re-pricing, and the silent policy change, the single
fastest way to destroy trust in any economy.

---

## Law XVI: Bots Are Not Developers

> **Bots, GitHub Apps, and AI agents do not receive human economic rewards.**

**Means:** every GitHub identity is classified `HUMAN | BOT | AI_AGENT | UNKNOWN`.
Only eligible humans participate economically. Dependabot, Renovate, Copilot and
Claude Code may appear in history at `0 KRED`.

**Prevents:** the most trivially automatable farm in the entire design.

---

## Law XVII: Unclaimed Identity Can Have History

> **A GitHub identity may earn verified KRED before claiming a Kreds account.**

**Means:** your Kreds history starts before your Kreds account does. Review
someone's PR without ever signing up, and the value is waiting for you.

**Prevents:** the cold-start problem, and the unfairness of rewarding signup date
over actual contribution.

---

## Law XVIII: Unclaimed Accounts Are Passive

> **Unclaimed identities cannot perform voluntary economic actions.**

**Means:** an unclaimed identity can _receive_ verified GitHub-derived value. It
cannot send, donate, exchange, withdraw, or create economies. Voluntary
transfers _to_ unclaimed identities are also blocked.

**Prevents:** phantom-account farming, spraying value into fabricated identities
and claiming them later.

---

## Law XIX: Every Incentive Is Adversarial

> **Every reward mechanism must be designed under the assumption that someone
> will eventually attempt to farm it.**

**Means:** the design question is never "is this a nice reward?" It is "what
does the cheapest possible abuse of this reward look like, and what stops it?"

**Prevents:** shipping incentives whose failure mode is only discovered in
production, by the people exploiting them.

---

## Law XX: Economic Integrity Over Convenience

> **No UX shortcut may bypass ledger integrity, settlement rules, fraud
> protections, or supply conservation.**

**Means:** "let's just credit it instantly so the UI feels snappy" is not a
trade-off to be weighed. It is a violation.

**Prevents:** integrity erosion by a thousand small product decisions, each
individually reasonable.

---

## Amendment A01: Review funding and debt

> Added by policy `v0.2`. These five laws close the hole that negative currency
> balances opened: a review paid out of an overdraft was, in effect, minting.
> See 23 Review Funding, Debt and Credit.

---

## Law XXI: No Monetary Creation Through Debt

> **A negative economic position may represent a liability, but it may never
> create spendable Official KRED. Every settled reviewer reward must be funded by
> existing Official KRED.**

**Means:** `balance >= 0` at all times, for every account. Debt is tracked
alongside the balance, never inside it.

**Prevents:** the founding accounting bug. Under the old model, two accounts at
zero could review each other and produce spendable KRED that never came from the
5,000,000 supply, indistinguishable, once it existed, from legitimately issued
currency. The cap was not a cap.

---

## Law XXII: Reviews Must Be Funded

> **A valid Code Review may create an economic claim, but it becomes spendable
> KRED only when funded by the author's settled balance, a Review Fund (including
> Treasury KRED explicitly allocated into one), the Kreds Review Credit Facility,
> or a bounded Central Bank program (platform-funded review rewards and
> unclaimed-debt protection payments), subject to the same eligibility gates.
> New funding sources may be added only by constitutional amendment.**

**Means:** the reviewer always earns. What varies is whether they are paid _now_
or hold a claim until funding arrives. Value is never invented to close the gap
and the list of places value may come from is **closed**. A Treasury funds
reviews only through an explicit, ledgered allocation into a Review Fund; it is
never an automatic step of the waterfall.

**Prevents:** the two bad alternatives, inventing KRED to pay the reviewer, or
telling the reviewer their work was worth nothing because the author was broke.
The closed enumeration also prevents a quieter failure: an "other legitimate
mechanism" clause in an adversarial economy
([Law XIX](#law-xix--every-incentive-is-adversarial)) is a door someone
eventually walks through.

> **Amended by A03 (`v0.4`).** Previously listed "a Treasury" as a direct
> source, which contradicted the waterfall's requirement of an explicit Review
> Fund allocation, and ended with the open clause "or another legitimate funded
> mechanism".
>
> **Corrected in A03 audit round 2.** The first closed enumeration accidentally
> excluded the two Central Bank programs that legitimately pay reviewers:
> platform-funded rewards (reviewer #4+, simple re-approval) and protection
> payments. That forbade flows which Law XXIII's gating and chapter 25
> explicitly regulate. The list now names them; it remains closed.

---

## Law XXIII: Central Bank Credit Uses Existing Reserves

> **The Kreds Review Credit Facility may temporarily finance eligible review
> activity using existing Central Bank reserves. Credit does not increase the
> official KRED supply. Credit draws require repository economic eligibility and
> an eligible reviewer.**

**Means:** financed reviews move KRED from reserve into circulation and record a
matching debt. Total supply is untouched; **circulating** supply rises, which is
precisely why the facility must be capped, and why a draw is gated exactly like
a minting path: from the reserve's perspective it is the same act.

**Prevents:** an unbounded subsidy, and reserve extraction through collusion, a
throwaway repository full of fresh accounts drawing credit to pay one real
reviewer, then abandoning the debt. Without the eligibility gate, the facility
would be the cheapest farm in the system.

> **Amended by A03 (`v0.4`)** to add the eligibility clause. The A02 principle
> _every path that moves reserve KRED into circulation gets the same gate_
> covered platform-funded rewards but not credit draws.

---

## Law XXIV: Unfunded Work Is a Claim, Not Currency

> **An economically valid but unfunded review creates a receivable. Receivables
> do not count toward KRED supply and cannot be transferred, spent, or withdrawn
> until funded.**

**Means:** a receivable is recorded, visible, and settled ahead of the author's
own future earnings, but it is not money and never appears in circulating
supply.

**Prevents:** a shadow currency. A transferable claim would be a second money
supply with none of the first one's controls.

---

## Law XXV: Reciprocity Is Economic, Not Behavioral

> **Kreds does not require every developer to review as much code as they submit.
> Teams and projects may specialize, but persistent review deficits must be
> financed by productive activity, treasuries, sponsors, or limited credit.**

**Means:** a maintainer who ships constantly and reviews rarely is doing a real
job, not gaming anything. The obligation to balance sits with the **project**,
not with each individual.

**Prevents:** enforced tit-for-tat, which would destroy role specialization and
punish exactly the people carrying the most project responsibility.

---

## Amendment A02: Contribution Points and economic eligibility

> Added by policy `v0.3`. These nine laws split _recognition_ from _issuance_ and
> close the last path by which one person acting alone could mint Official KRED.
> See 24 Contribution Points and
> 25 Repository Economic Eligibility.

---

## Law XXVI: Contribution Is Not Currency

> **Contribution Points represent verified work and reputation. They cannot be
> transferred, spent, exchanged, or used as KRED, and they have no fixed or
> implied conversion rate into KRED in either direction.**

**Means:** points have no supply, no ledger position, and no economic effect.
They never appear in the supply equation, and no exchange, redemption, or
"points buy" mechanic may exist.

**Prevents:** a second money supply with none of the first one's controls, no
cap, no ledger discipline, no settlement, no funding requirement. A conversion
rate would make every supply control bypassable by minting reputation.

---

## Law XXVII: Contribution Does Not Decrease

> **Contribution Points are cumulative historical recognition and do not decrease
> through spending, debt, or normal economic activity.**

**Means:** paying for review does not erase the record that you did the work.
Points remain adjustable when the underlying contribution is _invalidated_ a
revert, confirmed fraud, or an actor reclassified as a bot.

**Prevents:** a reputation score that punishes participation in the economy it is
attached to.

---

## Law XXVIII: Monetary Eligibility Requires Stronger Verification

> **An activity may earn Contribution Points without being eligible to create or
> transfer Official KRED. KRED issuance requires a higher standard of economic
> verification than Contribution Point recognition.**

**Means:** recognition and issuance are separate decisions with separate
evidence, and the bar for _money_ is deliberately higher than the bar for
_credit_. When the two standards conflict, the economy defers and reputation
proceeds.

**Prevents:** the forced choice between insulting legitimate contributors and
monetizing unverifiable work and, more importantly, the supply being governed
by the weaker of two evidentiary standards.

---

## Law XXIX: Self-Directed Private Merges Do Not Create KRED

> **A merge performed in a private repository without a valid eligible human
> review does not create Official KRED.**

**Means:** owning the repository, opening the PR, and merging it yourself is not
evidence of anything Kreds can verify.

**Prevents:** the last remaining unilateral minting path, one person, one
private repository, unlimited repetition.

---

## Law XXX: Public Visibility Alone Is Not Sufficient

> **Making a repository public does not automatically grant full monetary
> eligibility. Repository relevance and trust must be established.**

**Means:** a public repository created ten seconds ago carries no more evidence
than a private one.

**Prevents:** trivially converting the private-merge farm into a public-merge
farm by flipping a visibility toggle.

---

## Law XXXI: Repository Relevance Is Multi-Signal

> **GitHub stars may influence repository trust, but no single popularity metric
> defines economic legitimacy.**

**Means:** trust is a score over many signals, moving gradually, never a
threshold on one number.

**Prevents:** buying eligibility. Any single metric that unlocks issuance becomes
a market.

---

## Law XXXII: Human Review Can Establish Economic Validation

> **A meaningful Code Review from an eligible independent human may establish
> economic eligibility for work that otherwise lacks sufficient repository
> trust.**

**Means:** a second party with something to lose is itself a form of evidence.
This is the escape hatch that keeps eligibility usable for new and private work.

**Prevents:** locking legitimate teams out of the economy for the crime of
working in a private repository.

---

## Law XXXIII: Established Public Projects May Earn Without Mandatory Review

> **A sufficiently trusted public repository may qualify merged work for KRED
> issuance even when a specific Pull Request receives no formal Code Review.**

**Means:** the repository's external history is the validation. Solo maintainers
of widely used projects participate normally.

**Prevents:** punishing exactly the open-source maintainers the economy most
wants to reward, for the structural fact that they have nobody to approve their
PRs.

---

## Law XXXIV: Alternate Accounts Cannot Legitimize Self-Directed Work

> **A user may not create economic eligibility by reviewing their own work
> through controlled alternate identities.**

**Means:** the reviewer used to unlock eligibility must be a genuinely
independent, trusted, human identity.

**Prevents:** defeating [Law XXIX](#law-xxix--self-directed-private-merges-do-not-create-kred)
with a second GitHub account, which is otherwise the obvious next move.

---

## Constitutional summary

| Law    | One line                                                |
| ------ | ------------------------------------------------------- |
| I      | Only the Network issues official KRED                   |
| II     | Every movement is a ledger entry                        |
| III    | Ship to create, review to circulate                     |
| IV     | Org activity belongs to the org economy first           |
| V      | Same currency ≠ same accounting context                 |
| VI     | Debt is legal                                           |
| VII    | Extraction is not guaranteed                            |
| VIII   | Debt is repaid first                                    |
| IX     | Settled KRED belongs to the holder                      |
| X      | Local currency stays local                              |
| XI     | Independent economies are free but not official         |
| XII    | Self-hosting needs no network                           |
| XIII   | Joining preserves history                               |
| XIV    | Backing is not a fiat price                             |
| XV     | Rules change forward-only                               |
| XVI    | Bots are not developers                                 |
| XVII   | Unclaimed identities can earn                           |
| XVIII  | Unclaimed identities cannot spend                       |
| XIX    | Every incentive is adversarial                          |
| XX     | Integrity beats convenience                             |
| XXI    | Debt never creates spendable KRED                       |
| XXII   | Reviews must be funded to become currency               |
| XXIII  | Credit deploys reserves, it does not issue              |
| XXIV   | Unfunded work is a claim, not money                     |
| XXV    | Reciprocity is economic, not behavioural                |
| XXVI   | Contribution Points are not currency, and never convert |
| XXVII  | Contribution does not decrease from economic activity   |
| XXVIII | Money requires stronger proof than credit               |
| XXIX   | Self-directed private merges do not mint                |
| XXX    | Public visibility alone is not enough                   |
| XXXI   | Relevance is multi-signal, never one metric             |
| XXXII  | Human review can establish eligibility                  |
| XXXIII | Trusted public projects earn without mandatory review   |
| XXXIV  | Alternate accounts cannot self-validate                 |
