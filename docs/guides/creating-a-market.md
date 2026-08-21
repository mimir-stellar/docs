# Creating a market

Creating a claim means committing USDC to one side of a question you believe you
are right about. This guide covers what makes a claim settleable, and what happens
mechanically when you publish it.

**Prerequisite:** a connected wallet on Testnet with XLM and USDC. See
[Connecting a wallet](/guides/connecting-a-wallet).

## What a claim consists of

| Field | What it is |
| --- | --- |
| **Question** | One verifiable question about a future outcome |
| **Your position** | The side you are staking on |
| **Counter position** | The side a challenger takes |
| **Resolution URL** | The exact source the oracle will read to settle |
| **Settlement rule** | Plain-language criteria the evidence must satisfy |
| **Deadline** | When the market locks and becomes settleable |
| **Category** | `sports`, `weather`, `crypto`, `culture` or `custom` |
| **Your stake** | USDC, minimum **2 USDC** |
| **Odds mode** | `pool` (pari-mutuel) or `fixed` (guaranteed multiple) |
| **Max challengers** | Up to **100**. Set to 1 for a duel |
| **Private?** | Optionally gate joining behind an invite key |

A good example:

> *Will BTC close above $100,000 USD on 2026-05-25 according to CoinGecko?*

## Choosing a resolution URL — the part that matters most

A claim is only as good as the URL that settles it. Four rules, each of which
exists because breaking it produces a market that cannot settle cleanly:

### It returns the answer, not a page about it

JSON with the number in it. A news article that *describes* the outcome in prose
reads differently to a language model on two different days.

### It still answers after the deadline

An endpoint that serves only what is *upcoming* goes blank at exactly the moment
the oracle needs it. Point at the specific record, never at a list that the record
eventually falls off.

### It is stable byte for byte

`sha256` of the response goes on chain. A page carrying a rotating banner, an ad
slot or a render timestamp hashes differently on every fetch — which destroys the
one property that makes the oracle checkable by anyone else.

### The oracle can reach it unauthenticated

Settlement re-fetches the same URL from a different process, possibly days later. A
key you held and the oracle does not is a claim that cannot settle.

::: tip Source families that work well
**Prices** — CoinGecko. Deep history, unambiguous numbers.
**Weather** — Open-Meteo. No key required, fixed coordinates, forecast checkable
against what was actually observed.
**Launches** — Launch Library 2. Scheduled events that genuinely slip, with a
per-launch record that survives the date.
:::

::: warning Avoid one-bet-sold-many-times
A board of nothing but *will BTC close above X* is not eighteen markets — it is one
bet sold eighteen times. A single move in a single asset resolves all of them the
same way, and anyone who reads that move correctly sweeps the board without having
been right about anything else. Variety is what makes a prediction market
informative.
:::

## Writing the settlement rule

The settlement rule is the sentence the model is judged against. Be explicit about:

- **The exact threshold**, including the comparison — above, at or above, below.
- **The units and currency.**
- **The timezone** for any date or time boundary.
- **Which field** of the response counts, if the response has several.
- **What happens on ambiguity** — though note that the oracle already has `DRAW`
  and `UNRESOLVABLE` available and prefers refunding over guessing.

Vague rules do not produce arbitrary winners in Mimir; they produce refunds. That
is safer, but it also means the market was pointless.

## Setting a deadline

- The deadline is when the market **locks**. After it passes, the oracle can settle.
- Challenges landing within the last **60 seconds** before the deadline are
  **rejected** by the contract. That anti-sniping window stops someone from waiting
  until the outcome is already observable and slipping in a zero-risk bet.
- Leave enough margin for the source to actually publish the answer. For sports,
  the first-party market-creator agent enforces a deadline at least **4 hours after
  kickoff** — a good rule to borrow.

## Pool odds vs fixed odds

| Mode | How it pays |
| --- | --- |
| **Pool** (pari-mutuel) | Challengers share your stake proportionally to their own stakes. If you are right, you take the whole pot |
| **Fixed odds** | You guarantee challengers a return multiple, backed by your own liquidity. Payout is predictable before anyone joins. Default is 2× (`20_000` bps) |

In fixed-odds mode, unspent creator liability is refunded to you **without a fee**
if challengers win.

For a **duel**, set `max_challengers = 1`; the contract enforces equal stakes.

## Publishing: what actually happens

1. You sign **one** transaction. It carries an authorisation entry permitting
   exactly one USDC transfer of exactly your stake amount — no allowance is granted
   and nothing is left behind.
2. `create_claim` runs. The contract escrows your stake, asserting the escrow
   balance moved by **exactly** the requested atomic amount.
3. The current fee policy is **snapshotted onto your claim**. A later policy change
   cannot rewrite the economics of your market.
4. The claim is stored with `state = Open` and gets a `claim_id`.
5. Your claim appears in the explorer feed for challengers to find. If you made it
   private, share the invite link.

Minimum stake is **2 USDC** (`2_0000000` atomic at 7 decimals).

## After you publish

| Situation | What happens |
| --- | --- |
| Someone challenges | State moves to `Active`. Both sides are funded and the market waits for the deadline |
| Nobody challenges and the deadline passes | You can **cancel** the claim and get your full stake back. Zero fee |
| The market is challenged and settles in your favour | You are paid **during resolution** — no action needed from you |
| The market settles against you | Winning challengers pull their shares from escrow |
| Verdict is `DRAW` or `UNRESOLVABLE` | **Everyone is refunded in full, zero fee** |

## Fees, briefly

Fees are charged on **profit only** — `gross - principal`, floored at zero. You can
never receive less than your principal back. Nothing is charged at deposit, so a
market that never resolves costs you nothing. Refunds are always full.

Full schedule: [Wallets, fees and payments](/architecture/wallets-and-payments#market-fees-on-profit-never-on-gross).

## Rematches

A rematch is not a separate feature — it is a new `create_claim` with `parent_id`
set to the settled claim. That links the two on chain, which is what powers the
rivalry and ladder surfaces.

## Read next

- [Challenging and settlement](/guides/challenging-and-settlement)
- [Claiming a payout](/guides/claiming-a-payout)
