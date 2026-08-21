# Security posture

This page describes what has been reviewed, what has **not**, and what the design
deliberately removes from the attack surface. It is written to be conservative:
where something is unassessed, it says so.

::: danger The Soroban contracts have not been independently audited
This is the single most important sentence on this page.

A fresh security review of `mimir-market` and `mimir-squad` is a **separate, real,
open undertaking** — a different language, a different VM, a different
authorization model and a different tooling set from the EVM contracts these were
ported from. Nothing in Mimir's documentation should be read as closing that gate.

Mimir runs on **Stellar Testnet with test funds** for exactly this reason.
:::

## What exists today

| Artefact | What it is | What it is **not** |
| --- | --- | --- |
| Contract security review document | A documentation pass rewritten for Soroban after the EVM original was superseded | An audit |
| OWASP web/API review | A source review of the Next.js web/API layer, agent signed API, copy permissions and research gateway | A penetration test |
| Economic invariant evidence | Repository tests asserting conservation, profit-only fees and pull-path correctness | An independent economic audit |

There is also **no** independent smart-contract audit, penetration test,
legal/custody/sanctions review, or deployment attestation.

## Why the old contract review does not carry over

The original review was produced against a Solidity contract that no longer exists
in the repository. The market and squad logic now lives in Rust / Soroban.

- The **economic properties survived** the port and are re-tested — see
  [Economic invariants](/developers/economic-invariants).
- The **security findings did not survive**, because most of them were about EVM
  mechanics.

Rewriting that document was a documentation pass. It is not an audit. The tooling a
real Soroban review needs is different too: no Slither, but `cargo test`,
`cargo clippy`, fuzzing, and a Soroban-literate human reviewer.

## What the port removed from the attack surface

These were real concerns on the EVM and have **no Soroban counterpart** — they are
gone rather than mitigated:

| Removed | Why |
| --- | --- |
| **Reentrancy / `nonReentrant`** | The Soroban host rejects a call that re-enters a contract already on the call stack. There is nothing to guard. The ordering discipline is kept anyway, because it also makes the pull paths correct |
| **`approve` front-running** | Staking uses no allowance at all. Soroban authorises per invocation, permitting exactly one USDC transfer of exactly the staked amount. There is no standing allowance to race, to leave behind, or to set to zero first |
| **Gas-bounded loops** | `resolve_claim` no longer loops over challengers. The Soroban constraint is the ledger-entry footprint, and the answer is structural: settlement seeds `remaining_escrow` and each challenger pulls in an O(1) call |
| **Payable receiver / native value** | There is no payable invocation on Soroban. XLM is the ledger fee, never an argument, so a native-value rejection has nothing left to reject |
| **`msg.sender` confusion** | There is no equivalent for a top-level Soroban call. Every beneficiary and spender is an explicit argument that must itself authorise — `withdraw(who)`, `claim_fees(who)`, `claim_challenger_payout(challenger, claim_id)`. Tested: `pulling_requires_the_challengers_signature` |
| **Compiler/bytecode concerns** | Optimizer settings, bytecode size and compiler pinning are not applicable. The build is `cargo` against a pinned `soroban-sdk`, with `Cargo.lock` committed |
| **Fee-sponsorship abuse** | Every account funds its own ledger fee. There is no fee-sponsor endpoint, so there is no surface for making Mimir pay for an attacker's transactions |

## What the port deliberately kept

| Kept | Why it still matters |
| --- | --- |
| **Exact balance-delta intake** | `escrow::pull` asserts escrow moved by exactly the requested atomic amount, erroring `UnsupportedToken` otherwise. Strict equality is intentional — a well-behaved SAC will not deviate, but a misconfigured deployment pointing `usdc` at some other token would |
| **Push-with-pull fallback** | On EVM the motivating case was a blacklisted USDC recipient. Soroban has no blacklist, but a **frozen or authorization-revoked trustline** makes the SAC transfer fail the same way. `escrow::push_or_park` parks the amount instead of failing the whole settlement |
| **Pull-based fee accrual** | Fees accrue per recipient and are collected with `claim_fees`, never pushed |
| **The immutable fee cap** | `MAX_TOTAL_FEE_BPS = 1_000` is checked on `initialize` and every queued change; no function can raise it. A 2-day timelock gates execution, and execution is permissionless once elapsed, so the owner cannot hold a favourable policy hostage or push one through early |
| **Owner/oracle gating and checked arithmetic** | `set_oracle` and `transfer_ownership` are owner-gated. Every multiplication in `fees.rs` is `checked_mul` and errors `Overflow` rather than wrapping |

## What a real Soroban review must still cover

Listed so the gap is **explicit**, not to imply any of it has been assessed:

- **Authorization** — every `require_auth` site, and whether any path can be invoked
  with authorization from the wrong subject.
- **Storage** — instance vs. persistent vs. temporary choice per key, and TTL /
  archival behaviour for long-lived claims and roster entries.
- **Ledger-entry footprint under adversarial input** — including a claim filled to
  `MAX_CHALLENGERS` and the `MAX_INVITE_KEY_BYTES` hashing path.
- **Cross-contract behaviour** against the USDC Stellar Asset Contract, including
  `try_transfer` failure modes.
- **Contract-account (`C…`) callers** reaching any entry point that assumes a `G…`
  account.
- **Upgrade and admin surface**, plus key custody for the `owner` and `oracle`
  addresses.

## Web and API layer

A source review of the web/API paths found **no open critical finding** in the paths
reviewed. That review is chain-agnostic for the most part and still holds; the
signature and chain-configuration parts were rewritten for Stellar, and **that
rewrite is a documentation pass, not a re-review**.

What the review recorded:

- Financial writes use **parameterized SQL** and signed wallet requests with nonce,
  idempotency and audit controls.
- Agent capability and owner/operator authorization is **deny-by-default**.
- **Signature verification fails closed.** A `G…` account is checked locally as
  Ed25519 over the SEP-43 message. A `C…` contract account — whose `__check_auth`
  would need a network round trip — is **refused by default** rather than guessed
  at, so nobody who can merely POST can claim to be a contract account.
- **Research/evidence fetching** validates URL, port, credentials, DNS/IP and every
  redirect hop, bounds MIME type, byte count and time, and has global and per-agent
  kill switches.
- React output is escaped. There is **no** dynamic code execution, no shell
  execution from request data, no credentialed wildcard CORS, and no unsafe HTML
  rendering.
- Security headers were added: CSP, HSTS, frame denial, MIME-sniffing protection,
  referrer and permissions policy.

::: warning Known hardening item
CSP retains `unsafe-inline` for framework hydration and style compatibility.
Removing it requires a nonce-based rendering migration. That is tracked as
**hardening, not represented as an audit pass**.
:::

Production dependency audit (`npm audit --omit=dev`) is clean after a lockfile
update and pinning a vulnerable transitive line forward.

## Stellar-specific security notes

### Address handling

`G…`/`C…` strkeys are **case-sensitive base32**. A `toLowerCase()` normalisation —
the reflex from EVM hex addresses — turns a valid address into one that matches
nothing, and **in an allowlist written the wrong way round, that fails open**.

Every comparison in the repository is exact, covered by
`tests/node/db-address-fidelity.test.ts` and
`tests/node/stellar-address-validation.test.ts`.

### Signature primitive

Ed25519 has **no recovery step**, so the public key is an *input* to verification,
not an output of it. This removes a class of confusion the EVM `personal_sign`
recovery flow invited — but it means **the address a signature is checked against
must come from the registry, never from the request body**.

### Payment proofs

The paid-endpoint payload is a **signed proof over an already-landed Stellar
payment**, not a bare transaction hash.

A landed hash is public and permanent, so a bare-hash proof would be a bearer token
published to the world. Requiring an Ed25519 signature by the payment's source
account confines it to the holder of the paying key, and including `payTo`, `amount`
and `asset` in the signed material stops it being moved to a differently-priced
resource.

Replay is denied by claiming the hash at settlement — durably in the payments table
and in-process for the window before that row exists. Proofs older than 5 minutes
are refused.

### No sponsorship path

Every account funds its own ledger fee. There is no fee-sponsor endpoint, so there
is no surface for making Mimir pay for an attacker's transactions, and no third
party can turn a rejected call into an allowed one.

## Trust boundaries, stated plainly

| Boundary | What you are trusting |
| --- | --- |
| **The oracle keypair** | `resolve_claim` is authorised only by the stored `oracle` address. Whoever holds that key decides verdicts. Mitigation is transparency, not permission: the verdict, confidence and `sha256` evidence digest are all on chain, and you can re-fetch and re-hash the source yourself |
| **The language model** | A model reads the evidence and returns a verdict plus confidence. Low confidence (< 60%) force-downgrades to `UNRESOLVABLE` and refunds, rather than settling a coin flip |
| **The evidence source** | Whoever created the claim chose the URL. A byte-unstable or disappearing source produces a refund, not a wrong payout |
| **The `owner` role** | Can rotate the oracle and transfer ownership. Cannot exceed the 10% fee cap, and cannot execute a fee change inside the 2-day timelock |
| **Off-chain read index** | A cache only. If it disagrees with the chain, the chain wins |
| **Your own keys** | Mimir never holds a user seed or an external agent's seed. Agent seeds live only in worker process environments; the web server holds public `G…` addresses only |

## Non-custodial guarantees

- Mimir holds **no user key** and **no external agent key**.
- Staking grants **no standing allowance** — authorisation is per invocation, scoped
  to one transfer of one exact amount.
- **Withdrawals are never pausable.** Operational pause switches exist per
  capability (staking, market creation, copy execution, selling), but exit paths are
  excluded from them by design.
- **Funded basket deposits are disabled** until an independent contract audit and a
  legal/eligibility review are recorded. No UI may call a funded deposit route while
  that flag is false.

## Operational requirements

| Requirement | Why |
| --- | --- |
| The USDC SAC id must be **derived** from Circle's official Testnet issuer (`stellar contract id asset`), never hardcoded | A misconfigured token address is the failure mode the exact-balance-delta check exists to catch |
| Deployed environments must configure **their own** Soroban RPC and Horizon providers | The public endpoints are rate-limited and development/testnet-only |
| Node 22+ | Declared in `package.json`; older runtimes are unsupported |
| Agent seeds (`S…`) live **only** in worker environments | Never in the frontend deployment, never in a browser |

## Reporting a vulnerability

Please report security issues privately through the
[main repository](https://github.com/mimir-stellar/mimir-markets) rather than
opening a public issue. Include the affected path, the impact, and reproduction
steps.

## Read next

- [Economic invariants](/developers/economic-invariants) — the tests that back the
  money claims
- [Soroban contracts](/architecture/contracts) — the surface a review would cover
