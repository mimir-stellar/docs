# Baskets and copy trading

Two related features, both built on the same principle: **Mimir never takes
custody of your USDC.** A basket is a read-only projection plus a mirroring
permission, and a copy-trading permission is a signed policy your own wallet
enforces. Neither pools funds.

::: warning Funded deposits are disabled
The funded basket vault is a designed-and-held-back upgrade path, not a shipped
feature. Deposits stay disabled until an independent contract audit and a
legal/eligibility review are signed off. No UI may call a funded deposit route
while that flag is false. See [the vault section](#the-funded-vault-designed-and-held-back).
:::

## Agent baskets

A basket is a **weighted mix of agents with a stated thesis**. Anyone can compose
one. The basket directory makes every basket searchable, shows who leads it, and
ranks *top earning* (realised PnL) and *top followed* (subscriber count) over
selectable time windows.

Every published performance curve is built from what member agents actually
settled on chain.

### Composition rules

Validated before storage:

- Weights are basis points and must sum to **exactly 10,000**.
- No duplicate agents.
- No zero or negative weights.
- No single agent above the policy's maximum single-agent weight.
- No category above the policy's maximum category weight.

### Virtual NAV: a backtest, not a pool

The NAV engine replays a hypothetical 1,000 USDC allocated by the basket's weights
through its members' settled markets. Three details decide whether that number is
honest:

- **Returns are stake-weighted per day.** A 10 USDC decision and a 1 USDC decision
  are not two equal votes.
- **A day with no settlement produces no point.** An idle agent draws a flat line
  rather than a zero that drags the average down.
- **Paused or stale legs earn 0%** while sitting in idle USDC. They cannot
  fabricate NAV.

Drawdown is tracked against the running high. The curve is a read-only projection
of real settlements — nothing is deposited and nothing is pooled.

### Following is mirroring, never depositing

A follower signs a message naming the basket, their own wallet, and a **per-market
USDC cap**. When the basket's agents take new positions, the copy is staked from
the follower's own wallet, with the follower's own signature.

Unfollowing is the same signature with the cap set to zero.

The composer earns the 25 bps basket leg on profit that followers make through the
mix — and that leg is waived on your own basket.

### The funded vault, designed and held back

Recorded as an accepted design decision (ADR-0008), with the launch gate explicitly
open.

The upgrade path is a **Soroban vault contract — not an agent — as the source of
truth** for shares and assets. Share accounting takes the shape ERC-4626
established on the EVM, adapted to a SEP-41 share token:

- Initial shares equal assets. Later conversions round down **in the vault's
  favour**, with residual dust recorded.
- A minimum locked seed plus a minimum-deposit rule blunts donation and inflation
  attacks. A direct USDC donation raises the share price and never mints shares to
  the donor.
- **Performance fees apply only to realised gains above an atomic high-water
  mark.** Management fees are disabled in v1.
- Rebalancing changes future allocation only; it cannot rewrite realised PnL.
- Create, rebalance and copy can each pause independently **while exit stays
  enabled**.

#### Stellar-specific constraints on the funded design

These shape the contract rather than the copy, and they are easy to lose:

- **Exit must be pull-shaped, not a loop.** A Stellar transaction is capped on its
  ledger-entry footprint — the same reason `mimir-market` pays challengers by pull.
  A vault redeeming many holders in one call hits the same ceiling, so the
  withdrawal claim is drawn down per holder.
- **A holder needs a trustline before they can be paid.** A share token or a USDC
  payout can only land in an account that already trusts the asset, and a trustline
  is a classic operation that cannot share a transaction with a Soroban operation.
  Exit cannot assume it can create the receiving position on the user's behalf.
- **A failed payout must park, not revert.** A frozen or authorisation-revoked USDC
  trustline makes the transfer fail; the vault must fall back to a withdrawable
  balance, or one uncooperative holder blocks everyone else.
- **No fee sponsorship.** The user pays their own ~100-stroop fee to exit. For a
  non-custodial vault that is a feature: exit cannot be gated on Mimir funding
  anything.

Emergency withdrawal is a **direct user-to-vault call** that cannot depend on an
agent executor, a research worker or the oracle. It returns liquid USDC
immediately. Funds sitting in unresolved on-chain markets cannot be fabricated as
liquid, so the user receives a **transferable pro-rata withdrawal claim** that
becomes redeemable from deterministic settlement events.

## Copy trading

Copy trading lets a follower's execution agent mirror a signal agent's new
positions, inside a policy the follower signed up front.

### What the permission names

A copy permission is not a toggle. It specifies:

- The **execution agent** and the **signal agent**.
- Caps on per-position, daily, weekly and total open exposure.
- A **realised-loss ceiling**.
- An allowlist of categories and settlement modes.
- Floors on confidence and payout.
- An **expiry**.

### The gate is deterministic and ordered

Given the same permission, signal and usage, the gate always returns the same
answer. The **first failure wins**, and the skip reason is a named enum
(`daily_cap`, `stale_signal`, `spend_permission_mismatch`, and the rest) that says
exactly which bound was hit.

The ordered checks:

1. Not globally paused.
2. Permission active and unexpired.
3. No self-copy.
4. **Copy depth is 1** — a copy of a copy is refused.
5. No ancestry cycle (`A → B → A` is detected and rejected).
6. No duplicate of a position already held.
7. Signal is fresh.
8. Open slots and liquidity available.
9. Category and settlement mode allowlisted.
10. Confidence and payout floors met.
11. Per-position, daily, weekly and total exposure caps.
12. Realised-loss limit.
13. Spend permission names the configured USDC Stellar Asset Contract and the
    configured spender, with allowance left **on chain**.
14. A clean simulation against Soroban RPC.

Every decision — executed or skipped — writes an audit row: source position,
permission, simulation ledger, attribution, stake, fee lines, transaction hash, and
status or skip reason.

### Threat model

What the design is actually defending against:

| Threat | Defence |
| --- | --- |
| **Compromised executor key** | It cannot raise signed limits, change the token or spender, bypass the on-chain USDC allowance, or act after an immediate revoke or a global pause |
| **Replay** | Permission and source-position uniqueness plus execution IDs make a repeated signal a skip. Nonces protect signed API requests |
| **Frontrun / race** | The executor re-reads deadline, slots, liquidity, payout and allowance, then simulates against Soroban RPC at a recorded ledger immediately before submission |
| **Stale odds** | A payout below the signed floor, or an expired deadline, is skipped |
| **Copy loop** | Source depth capped at one; self-copy and ancestry cycle checks reject `A → B → A`. Signal and execution agent IDs stay separate |
| **Fee loop** | One immutable source attribution ID follows the original signal. Downstream copies do not mint new fee ancestry, and recipient transfers are not read as additional revenue |
| **Changed spender** | Permissions allow only the configured deployed Mimir contract id. A different `C…` target requires a new, visibly signed permission — a UI or database allowlist alone is insufficient |
| **Address confusion** | `G…`/`C…` strkeys are case-sensitive base32, so token and spender are compared **exactly**. A `toLowerCase()` normalisation would silently break the match — and in an allowlist written the wrong way round, it would break it *open* |

### Allowance shape, and why there are two ceilings

The on-chain leg is the USDC Stellar Asset Contract's own SEP-41
`approve(from, spender, amount, expiration_ledger)`. That is a **single decreasing
bucket with an expiry — it does not refresh.**

But the thing a product actually promises a follower is a *rolling* budget: "up to
20 USDC a day". That is Mimir's own accounting layered on top, with the chain
enforcing the absolute ceiling and the expiry underneath.

Both must pass, so the pair is strictly tighter than either alone:

- Exceeding the period budget is refused with **no chain round-trip**.
- Exceeding the approved total is refused **by the Stellar Asset Contract**, even
  if Mimir's own ledger were wrong.

## Read next

- [Agents](/architecture/agents) — the twelve first-party agents
- [BYOA agent API](/developers/byoa-api) — spend permissions in detail
