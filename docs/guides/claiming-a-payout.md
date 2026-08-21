# Claiming a payout

Some money in Mimir is pushed to you, and some you collect yourself. This page
explains which is which, and why the difference is a safety property rather than a
UX shortcut.

## Who gets paid automatically

**A winning creator is paid during resolution.** When the oracle submits
`resolve_claim` and the verdict is `CREATOR_WINS`, the payout transfer happens
inside that same transaction. You do not need to do anything.

## Who collects manually

**A winning challenger collects with a button.** After the verdict is
`CHALLENGERS_WIN`, each winning challenger calls:

```
claim_challenger_payout(challenger, claim_id) → net
```

once. It is an O(1) call, it requires **your own signature**, and it can only be
made by an address actually on the challenger roster.

### Why it works this way

This is a **solvency property, not a convenience**.

A Stellar transaction is capped on the ledger entries it may touch, and a market
filled to `MAX_CHALLENGERS` (100) simply does not fit in one transaction. If
`resolve_claim` tried to loop over challengers and pay each one, a crowded market
would become unsettleable.

So resolution instead **seeds `remaining_escrow`**, and each winner draws it down
with their own call. The contract therefore cannot pay out more than it took in,
regardless of what order people claim in.

Two consequences worth knowing:

- **Nothing expires.** There is no deadline on collecting. An unclaimed share
  simply stays in escrow.
- **The last claimant absorbs the rounding dust.** `challenger_claims` counts the
  pulls, so truncation dust is never stranded — it goes to whoever claims last.

## The other two pull paths

Both live alongside your payout in the dashboard's balances card.

### A parked payout — `withdraw(who)`

A payout the contract could not deliver is **parked for you** rather than reverting
the whole settlement.

The case this defends against: a frozen or authorisation-revoked USDC trustline
makes the Stellar Asset Contract transfer fail. If settlement pushed payouts, one
uncooperative trustline would take down everyone else's settlement in the same
market. So the contract uses `try_transfer` and, on failure, records a withdrawable
balance you collect later.

Check yours with `get_withdrawable(who)`.

### Accrued fees — `claim_fees(who)`

Fees are never pushed to a fee recipient either — same reasoning. They accrue per
recipient as a claimable balance and are collected with `claim_fees`.

This applies to the platform recipient, agent owners earning the 50 bps owner leg,
and basket composers earning the 25 bps leg.

Check with `get_accrued_fees(who)`.

## Refunds

Refunds are **full, and carry zero fee**. There is no profit to charge, and taking
a cut of a returned stake would make the protocol the only winner of an ambiguous
market.

| Situation | What you get back |
| --- | --- |
| Verdict is `DRAW` | 100% of your stake |
| Verdict is `UNRESOLVABLE` | 100% of your stake |
| Oracle confidence was below 60% | Force-downgraded to `UNRESOLVABLE` → 100% |
| Creator cancelled an expired, unchallenged claim | 100% of the creator's stake |
| Fixed-odds market where challengers won | Creator's **unspent liability** refunded, no fee |

## What gets deducted when you win

Fees are charged on **profit only** — the base is always `gross - principal`,
floored at zero. **A winner never receives less than their principal**, and that
invariant is asserted directly against the contract in its test suite
(`winner_never_receives_less_than_principal_in_a_crowded_pool`).

| Leg | Rate |
| --- | --- |
| Platform | 50 bps of profit |
| Agent owner (if the position ran through a registered agent) | 50 bps of profit |
| Basket creator (if the position came through a basket) | 25 bps of profit |

Fee division rounds **down in your favour**. Nobody pays themselves: profiting
through your own agent or your own basket waives that leg.

## Checking what you are owed before you claim

`quote_challenger_payout` returns the exact net amount your pull will transfer.
That view is tied to the pull path by a test —
`a_quote_matches_what_the_pull_actually_pays` — so the number the UI shows is the
number the contract moves. The squad contract has the same guarantee via
`preview_claim` and `preview_matches_the_amount_actually_paid`.

## Practical steps

1. Connect the **same wallet** you staked from. The pull requires that address's
   own signature.
2. Open the claim detail page, or the dashboard's balances card.
3. Check the quoted net amount.
4. Click **Claim** and sign. You pay your own ledger fee — a fraction of a cent in
   XLM.
5. Verify the transfer on
   [stellar.expert/explorer/testnet](https://stellar.expert/explorer/testnet).

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| Claim button is inactive | The market is not `Resolved` yet, or the verdict was not `CHALLENGERS_WIN`. Pulling before resolution is rejected by the contract |
| "Already claimed" | Each challenger can pull exactly once — this is enforced on chain |
| Transaction rejected | You are connected with a different wallet than the one that staked. A non-challenger cannot pull |
| Payout is slightly larger than quoted | You claimed last and absorbed the truncation dust |
| Balance shows under "parked" instead of arriving | The transfer to you failed, most likely a trustline issue. Fix the trustline, then call `withdraw` |
| You expected a payout but got a refund | Oracle confidence was below 60%, so the verdict was downgraded to `UNRESOLVABLE` |

## Squad pools

`mimir-squad` works the same way for the same reason: winners `claim(participant,
market_id, side)` pro rata, `remaining_escrow` is drawn down per claim, and the
last winner absorbs the dust. Claiming twice, claiming from the losing side,
claiming with no position, and claiming without your own signature are each
rejected.

Before the deadline, a squad participant can also `withdraw_before_deadline` their
own side balance. A cancelled squad market refunds every principal in full —
including both sides of a double-sided depositor — and a break-even winner pays no
fee.

## Read next

- [Wallets, fees and payments](/architecture/wallets-and-payments)
- [Economic invariants](/developers/economic-invariants) — the conservation tests
