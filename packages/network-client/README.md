# @kreds/network-client

Core's half of the Kreds Network boundary.

Kreds runs on its own. It watches GitHub, records contributions, and runs local
economies with local currencies and a local ledger, and none of that needs
anything outside the instance you are running.

Official KRED is the exception, and it is not an exception Core gets to make for
itself. This package is the entire path to it, and it goes one way.

## The rule

> Core submits evidence. The Network decides money.

Both halves of that are enforced by the shapes in `protocol.ts` rather than by
convention:

- Nothing Core sends carries an amount or a score. A candidate that arrived
  carrying its own value would mean Core had priced work.
- Nothing the Network returns carries a threshold. Decision reasons are a closed
  set of coarse values, so that the first convenient log line cannot carry an
  operational number into this public repository.
- There is no method that writes an Official balance. Not a guarded one. None.

## Two implementations

`OfflineNetworkClient` is the default, and it is what most instances run
forever. Everything local keeps working; Official KRED simply does not exist
here. It declines rather than throwing, because an unconfigured Network is an
ordinary state and code that has to wrap every call in a `try`/`catch` to
support the default deployment eventually gets that wrapping wrong.

`HttpNetworkClient` talks to a Network that has issued this instance a token. It
does not retry, on purpose: retrying inside a webhook handler turns a ten second
GitHub timeout into a thirty second one. Retries belong to the caller, which
holds the idempotency key that makes them safe.

## An outage is not a decision

`NetworkUnavailableError` and a `DECLINED` decision are different types because
they are different facts. Reading an outage as a decline silently denies people
work they earned. Reading it as an issuance would be worse. Neither may happen
by accident.

## Why the protocol is declared twice

`kreds-network` declares the same shapes in its own repository. That is the
design, not duplication waiting to be tidied:

- This repository is AGPLv3 and that one is not. An import would make them
  compile against each other.
- Most people running Core will never have access to `kreds-network`, and a
  build dependency on a private repository would mean they could not build at
  all.

The two are kept in step by `PROTOCOL_VERSION` and by an identical pinned test
on each side. Change the contract on one side only and one of the two suites
goes red, which is the point.
