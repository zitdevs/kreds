# Kreds Core and the Kreds Network

Kreds is one product split across three layers with different owners, licences
and rules. Getting the split right is what lets the software be genuinely open
without making the shared economy trivially exploitable.

```text
┌──────────────────────────┐
│      Kreds Core          │
│        AGPLv3            │
│                          │
│ GitHub                   │
│ Teams                    │
│ Contributions            │
│ Local Economy            │
│ Ledger                   │
│ Self-hosting             │
└────────────┬─────────────┘
             │
             │ Optional
             ▼
┌──────────────────────────┐
│ Kreds Network Protocol   │
│ Public specification     │
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐
│ Official Kreds Network   │
│ Private infrastructure   │
│                          │
│ Official KRED            │
│ Central Bank             │
│ Global Settlement        │
│ Risk Engine              │
│ Federation               │
└──────────────────────────┘
```

## Kreds Core

Everything in this repository. AGPLv3. A complete product on its own.

- GitHub authentication and the GitHub App integration
- Teams, organizations, repository activity ingestion
- Contribution Points and leaderboards
- A local economy: local currency, supply, treasuries, Review Funds
- The economic ledger
- Seasons, achievements, challenges
- Local monetary policy
- Web, API, workers, documentation

A Core instance runs a real economy with real rules. It is not a demo, a trial,
or a version with the interesting parts removed.

## Kreds Network Protocol

The public boundary between the two. A separate specification repository, planned
as `kreds-network-spec`, describing how an instance talks to the Network:

- protocol versions and compatibility
- economic event types and schemas
- instance registration
- signing, nonces, timestamps
- expected responses

The specification describes **how to communicate**, not **how the Network
decides**. Trust scoring, fraud detection, settlement internals and monetary
eligibility are not in it, because a published rule for detecting abuse is a
published recipe for evading it.

## Official Kreds Network

Private infrastructure, operated by ZitDevs, behind kreds.sh. Not in this
repository and not open source.

- The Official KRED ledger and the fixed global supply
- The Kreds Central Bank
- Global wallets and global settlement
- The Review Credit Facility
- Cross-organization settlement and network-connected sovereign economies
- Global repository trust and global identity trust
- The Risk Engine, anti-farming and abuse detection
- Network circuit breakers, instance verification, federation

This is the part that only exists because the economy is shared. A single
authoritative ledger cannot be run by everyone at once, and anti-abuse systems
stop working when their thresholds are public.

## What self-hosting actually gets you

**Independent by default.** A self-hosted instance runs its own economy with no
dependency on kreds.sh, and does not automatically participate in the Official
Network.

```text
Self-Hosted Kreds
        ↓
Independent Economy
        ↓
Your infrastructure
Your currency
Your rules
Your ledger
```

Your instance issues its own currency under its own monetary policy. That
currency is yours. It is not Official KRED, and it does not carry a claim on the
global supply, which is precisely what keeps a self-hosted instance from being
able to mint the shared currency.

## Joining the Network

An independent instance may later choose to connect.

```text
Self-Hosted Kreds
        ↓
Kreds Network Protocol
        ↓
Official Kreds Network
```

Connecting can bring Official KRED, network identity, official settlement,
KRED-backed organization currencies, network treasuries and participation in the
global economy. It requires following the protocol and meeting the Network's
integrity requirements.

Joining preserves history. An economy that had 42,000 local units before joining
still has them afterwards, recorded as an opening snapshot rather than reset.

## The architecture rule that keeps this honest

**Kreds Core must never depend on private Network code.** The open-source
application has to be independently runnable, or the open-source claim is
decoration.

Optional Network integration goes through an interface, with the independent
implementation as the default:

```ts
interface KredsNetworkProvider {
  submitEconomicEvent(event: EconomicEvent): Promise<SubmissionResult>;
  getNetworkIdentity(githubUserId: string): Promise<NetworkIdentity | null>;
  getOfficialKredPosition(accountId: string): Promise<Position | null>;
}
```

```text
Independent mode   LocalEconomyProvider          (in Core, the default)
Network mode       OfficialKredsNetworkProvider  (private, not in Core)
```

Core depends on the interface. It never imports the Network implementation, and
the Network implementation never leaks into this repository.

The test for whether the boundary is holding: **delete every trace of the Network
and Core still builds, still runs, and still gives a team a working economy.** If
that ever stops being true, the split has been broken and the licence is
describing something that no longer exists.

## The model in one place

```text
KREDS CORE              AGPLv3, open source, self-hostable
KREDS NETWORK SPEC      Public protocol, open integration boundary
OFFICIAL KREDS NETWORK  Private infrastructure, Official KRED, Central Bank
KREDS.SH                The official hosted Kreds service
```

Open-source product. Open protocol. Proprietary network.
