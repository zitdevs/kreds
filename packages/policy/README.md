# @kreds/policy

```text
GENERATED, DO NOT EDIT
Source: zitdevs/kreds-laws, public/policy/
rulesVersion: v0.4
```

The published economic policy, copied here so that Kreds can read it at runtime.

## Why a copy exists at all

`kreds-laws` is the authority and is private. Most people running Kreds will
never have access to it, and an instance cannot ask a repository it cannot clone
what a merged pull request is worth.

So the **public** half of the policy is copied in, under the rule that permits
exactly this: a public-safe snapshot may live in the application when it is
needed for runtime, provided it is treated as generated.

Everything in `src/snapshots/` is a byte-for-byte copy of a file under
`kreds-laws/public/policy/`. Nothing in this package is authored here, and
nothing here may be edited to change a number. If a value looks wrong, it is
wrong in `kreds-laws`, and it is fixed there and re-copied.

`snapshot.test.ts` pins the checksum of every snapshot, so an edit fails the
suite rather than quietly changing what work is worth.

## What is deliberately absent

Anything unpublished. The snapshot itself says so in the places where a number
is operational rather than public:

```json
"dailyCaps": "NOT_PUBLISHED"
"timingMultipliers": "NOT_PUBLISHED"
```

Those govern the Official Kreds Network, are loaded there from a private source,
and must never appear in this repository, in a browser bundle, in an API
response, or in a log line. A published threshold is a published way around it.

Code that reads this package therefore has to handle a value being absent, and
the loader types those fields as `"NOT_PUBLISHED"` rather than pretending a
number exists.

## Adding a new version

1. Copy the file from `kreds-laws/public/policy/` unchanged.
2. Add its checksum to `snapshot.test.ts`.
3. Register it in `src/index.ts`.

Old versions stay. Law XV lets the rules change and does not let history change
with them, so a result produced under `v0.3` has to remain explainable after
`v0.4` ships, which means `v0.3` has to still be readable.
