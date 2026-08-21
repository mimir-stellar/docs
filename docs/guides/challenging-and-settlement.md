# Challenging and settlement

Challenging means taking the opposite side of someone's claim with your own USDC.
This page covers how to do it, and exactly what happens when the deadline arrives.

**Prerequisite:** a connected wallet on Testnet with XLM and USDC. See
[Connecting a wallet](/guides/connecting-a-wallet).

## Finding a market

The explorer feed lists claims with **Open**, **AI signals** and **Closed** tabs,
filterable by category and stake size. An `Open` claim has a funded creator side and
no challenger yet; an `Active` claim already has both sides funded but may still
have roster slots free.

Each claim detail page shows the pool sizes, the current challenger list, the
resolution URL, the settlement rule, and — once settled — the settlement receipt
with its confidence tier.

## Placing a challenge

1. Read the **resolution URL and the settlement rule**, not just the question. The
   rule is what the oracle judges against, and it is where the ambiguity lives.
2. Decide your stake. Minimum **2 USDC**.
3. Sign **one** transaction. `challenge_claim` carries an authorisation entry
   permitting exactly one USDC transfer of exactly your stake — no allowance step,
   nothing left behind.

The claim moves to `Active` once the counter-side is funded.

::: warning The last 60 seconds are locked
`challenge_claim` **rejects** any transaction that lands within
`CHALLENGE_LOCK_SECONDS` (60 seconds) of the deadline.

This is deliberate anti-sniping. Without it, a late-information actor could wait
until the outcome was already observable and slip in a zero-risk bet against
someone who committed money while the outcome was still genuinely uncertain.
:::

Other reasons a challenge can be rejected:

| Reason | Detail |
| --- | --- |
| Roster full | `MAX_CHALLENGERS` is 100; a duel is capped at 1 |
| Private claim | You need the invite key |
| You are the creator | You cannot challenge your own claim |
| Duel stake mismatch | In a 1v1, the contract enforces equal stakes |
| Deadline already passed | The market is locked |

## What you are paid if you win

| Odds mode | Your payout |
| --- | --- |
| **Pool** | Pro-rata share of the creator's stake, proportional to your stake among challengers, **plus your own stake returned** |
| **Fixed** | `your stake × challenger_payout_bps / 10_000` (default 2×). Unspent creator liability goes back to the creator without a fee |

You can check the number before it is paid: `quote_challenger_payout` is tied to the
actual pull path by a test (`a_quote_matches_what_the_pull_actually_pays`), so the
figure the UI shows is the figure the contract transfers.

## Settlement, step by step

Settlement is the only step where something off chain gets to move money, so it is
worth describing precisely.

When the deadline passes, the oracle agent's poll loop (every 60 seconds) picks up
the claim and:

1. **Fetches the resolution URL itself.** Behind an SSRF guard — private address
   space is refused and every redirect hop is re-validated.
2. **Hashes exactly the bytes it received.** `sha256`, committed on chain as
   `evidence_hash` (a `BytesN<32>`). SHA-256 rather than keccak because
   `env.crypto().sha256()` is the primitive Soroban's host exposes, so a contract
   could recompute the digest.
3. **Asks a language model one narrow question:** does this evidence satisfy this
   settlement rule? The model returns a verdict plus a confidence from 0 to 100,
   and is instructed to cite only what it actually saw.
4. **Submits `resolve_claim`** — verdict, summary, confidence and evidence hash, in
   a single transaction authorised by the oracle's own keypair.

### The four verdicts

| Verdict | Result |
| --- | --- |
| `CREATOR_WINS` | The creator receives the pot, less fees on profit only |
| `CHALLENGERS_WIN` | Challengers pull their shares from escrow |
| `DRAW` | **Every stake refunded in full, zero fee** |
| `UNRESOLVABLE` | **Every stake refunded in full, zero fee** |

The last two exist specifically to let the oracle **decline**. A system forced to
always pick a winner will eventually pick one from evidence that supported neither
side — and it will do so with total confidence. Refunding is the cheaper failure.

### Confidence gates the outcome

Confidence is not decorative; it is stored on chain and it changes the result:

| Confidence | Outcome |
| --- | --- |
| **≥ 80%** | Settles as **FIRM** |
| **60–79%** | Settles with a **CONTESTED** badge |
| **< 60%** | Force-downgraded to `UNRESOLVABLE` and **refunded** |

## Verifying the oracle yourself

This is the point of committing the hash. You can independently check what the
oracle saw:

1. Read `evidence_hash` from the claim on chain.
2. Re-fetch the claim's resolution URL.
3. Compute `sha256` over the raw response bytes.
4. Compare.

If the source is byte-stable — which is exactly why the sourcing rules in
[Creating a market](/guides/creating-a-market#choosing-a-resolution-url-the-part-that-matters-most)
insist on it — the digests match, and you have verified the oracle's input without
trusting anyone.

Every transaction is also on the public ledger at
[stellar.expert/explorer/testnet](https://stellar.expert/explorer/testnet).

## Who can settle

**Only the oracle.** `resolve_claim` requires authorisation from the single
`oracle` address stored in the contract — a dedicated Stellar keypair held by the
oracle worker. There is no user-triggered resolution path in the UI, and no human
can quietly re-route it.

The ten council personas can only call `challenge_claim`. Market creation is
similarly restricted. The contract enforces all three separations.

## Council-assisted settlement

Optionally, the oracle can settle by **council jury** instead of deciding alone —
either as a majority tally of paid persona verdicts, or as a sequential
**self-resolving prediction market** where jurors see prior reports, are scored by
cross-entropy against the oracle's independent terminal assessment, and split a
bonus pool for informative updates.

In that mode the q-chain, the terminal belief and the per-juror scores are all
serialised into the payload whose `sha256` becomes `evidence_hash` — so the entire
scored market is auditable against the on-chain digest.

Details: [Agents](/architecture/agents#self-resolving-settlement).

## Read next

- [Claiming a payout](/guides/claiming-a-payout) — collecting what you won
- [Soroban contracts](/architecture/contracts) — the exact function surface
