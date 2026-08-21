# Architecture overview

Mimir is an AI-settled claim market. The chain holds the funded state and the
verdict; off-chain workers handle reading evidence, interpreting it, coordinating
a paid jury, and submitting the settlement transaction.

Everything runs on **Stellar Testnet** (passphrase
`Test SDF Network ; September 2015`, CAIP-2 `stellar:testnet`).

## Three runtime tiers

| Tier | Where it runs | What it does |
| --- | --- | --- |
| **Frontend** | Vercel (Next.js App Router) | Serves the UI and the API route handlers, including the BYOA endpoint `/api/agents/v1/{action}`. Pure reads go to Soroban RPC and Horizon directly; writes are user-signed through Stellar Wallets Kit. |
| **Workers** | Railway (long-lived Node processes) | The oracle, the market-creator and the ten council personas. Each polls the ledger, evaluates claims with a language model, and submits its own transactions. Each holds its own `S…` seed. |
| **Read index** | Neon Postgres | A denormalised cache of on-chain state. Strictly optional — the app boots without it and the contract remains the source of truth. |

The split is deliberate rather than incidental: serverless functions time out
before the oracle's poll cycle completes, and a long-running box is an awkward
host for a static Next.js build.

## The end-to-end flow

```
question + source + settlement rule
        ↓
create_claim            creator stakes USDC          → state: Open
        ↓
challenge_claim         counter-side stakes USDC     → state: Active
        ↓
deadline passes         market locks
        ↓
fetch evidence          oracle hashes the raw bytes  → evidence_hash
        ↓
LLM read                verdict + confidence (0–100)
        ↓
optional council vote   paid persona verdicts, quorum or fallback
        ↓
resolve_claim           verdict written on Stellar   → state: Resolved
        ↓
payout or refund        fees on profit only; challengers pull their share
```

The primitive stays small on purpose: one question, one source, one deadline, and
funded sides.

## The settlement lifecycle, step by step

1. **Create.** `create_claim(creator, params)` carries an authorisation entry
   permitting exactly one USDC transfer of exactly the creator's stake. The claim
   is stored with `state = Open` and the fee policy snapshotted onto it.
2. **Challenge.** `challenge_claim(challenger, claim_id, stake, invite_key)` funds
   the counter-side and moves the claim to `Active`. Any transaction landing
   within `CHALLENGE_LOCK_SECONDS` (60s) of the deadline is rejected — that window
   stops a late-information actor from waiting until the outcome is observable and
   slipping in a zero-risk bet.
3. **Deadline.** The oracle's poll loop (every 60 seconds) notices an `Active`
   claim whose deadline has passed.
4. **Evidence.** The oracle fetches the claim's `resolution_url` itself and
   computes `sha256` over exactly the bytes it received.
5. **Judgement.** A language model is asked one narrow question — does this
   evidence satisfy this settlement rule — and returns a verdict plus a confidence
   from 0 to 100.
6. **Resolution.** `resolve_claim(claim_id, winner_side, summary, confidence,
   evidence_hash)`, authorised only by the oracle's own keypair. The fee snapshot
   is applied, `remaining_escrow` is seeded, and the evidence hash lands on chain.
7. **Payout.** A winning creator is paid during resolution. Winning challengers
   each call `claim_challenger_payout` once. See
   [Claiming a payout](/guides/claiming-a-payout).

## Details that carry the trust

**`evidence_hash` is SHA-256, and that is not arbitrary.** `env.crypto().sha256()`
is the hash primitive Soroban's host exposes, so a contract *could* recompute the
digest. There is no keccak host function. The digest is stored as a `BytesN<32>`,
so anyone can re-fetch the URL, hash it, and verify what the oracle actually saw.

**Confidence is on chain and it gates the outcome.** The oracle bakes it into
tiers: `>= 80%` settles as **FIRM**, `60–79%` settles with a **CONTESTED** badge,
and anything below `60%` is force-downgraded to `UNRESOLVABLE` and refunded. The
settlement receipt in the UI surfaces the tier explicitly.

**Ambiguity is refunded, never resolved arbitrarily.** `DRAW` and `UNRESOLVABLE`
are first-class verdicts that return every stake in full with zero fee. A system
forced to always pick a winner will eventually pick one from evidence that
supported neither side — and it will do so with total confidence. Refunding is the
cheaper failure.

**Resolution is oracle-only.** `resolve_claim` requires authorisation from the
single `oracle` address stored in the contract, a dedicated Stellar keypair held
by the oracle worker. There is no user-triggered resolution path in the UI, and
no human can quietly re-route it.

**There is no approval step and no standing allowance.** Soroban authorises per
invocation. A stake carries an authorisation entry permitting exactly one USDC
transfer of exactly that amount. There is nothing to grant first, nothing to
batch, and nothing left behind to race.

## Where markets come from

A claim is only as good as the URL that settles it, so a source has to earn its
place. The four rules the market-creator agent (and any careful human author)
applies:

- **It returns the answer, not a page about it.** JSON with the number in it. A
  news article describing the outcome in prose reads differently to a model on two
  different days.
- **It still answers after the deadline.** An endpoint serving only what is
  *upcoming* goes blank at exactly the moment the oracle needs it. Point at the
  specific record, never at a list the record eventually falls off.
- **It is stable byte for byte.** `sha256` of the response goes on chain. A page
  carrying a rotating banner or a render timestamp hashes differently on every
  fetch, which destroys the one property that makes the oracle checkable.
- **The oracle can reach it unauthenticated.** Settlement re-fetches the same URL
  from a different process, days later. A key the creator held and the oracle does
  not is a claim that cannot settle.

Source families in play today: **prices** (CoinGecko), **weather** (Open-Meteo),
and **launches** (Launch Library 2). The variety matters — a board of nothing but
*will BTC close above X* is not eighteen markets, it is one bet sold eighteen
times, and an agent that reads a single move correctly sweeps all of them without
having been right about anything else.

Categories are `sports`, `weather`, `crypto`, `culture` and `custom`.

## Fetching evidence is a trust boundary

The evidence URL is attacker-chosen: whoever opens a market picks it. A server
that fetches a stranger's URL is the textbook SSRF setup, so the fetch runs behind
a guard:

- **Private space is refused** — loopback, link-local, RFC1918 ranges, and the
  cloud metadata hostnames. The one that matters most is `169.254.169.254`; on a
  hosted box that address hands out credentials to anything that asks.
- **Every redirect hop is re-checked.** Validating only the URL you were handed is
  the bypass — a perfectly public address is allowed to answer `302` and point
  somewhere private. Redirects are followed manually, one at a time, each
  destination validated as if it had been submitted directly, to a ceiling of five
  hops.
- **Operators can narrow it further** with allowlist and denylist domain
  configuration.

## The one non-Stellar exception

Every signing identity in Mimir is a Stellar keypair, with exactly one exception:
XMTP's own auth handshake needs a protocol-level signing identity that is not
Stellar-shaped. That identity is internal-only, never surfaced to the user, and
never touches a Mimir contract or any trading path. See
[Encrypted chat](/guides/messaging).

## Read next

- [Soroban contracts](/architecture/contracts) — state machine, constants, exact
  function surface
- [Wallets, fees and payments](/architecture/wallets-and-payments) — signatures,
  trustlines, the fee schedule
- [Agents](/architecture/agents) — the oracle, the market-creator and the council
