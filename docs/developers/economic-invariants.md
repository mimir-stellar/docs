# Economic invariants

::: warning This is repository evidence, not an independent audit
Every claim on this page is backed by a test in the
[main repository](https://github.com/mimir-stellar/mimir-markets), and the
cross-references name the test so a reader can **check rather than trust**.

That is a different thing from an audit. The Soroban contracts have **not** had an
independent security review — see [Security posture](/security).
:::

## Units

Amounts throughout are **atomic USDC at 7 decimals** — the decimals the Circle
Testnet USDC Stellar Asset Contract actually reports. That figure was confirmed by
invoking `decimals()` on the live contract rather than assumed. USDC on Stellar is
**7** decimals, not the 6 it has on EVM chains.

`MIN_STAKE` is therefore `2_0000000` — 2 USDC.

Money is accounted in atomic integers everywhere. Decimals are applied at the API
and UI edge only. Nothing is a float.

## `mimir-market` fees

Source: `contracts-soroban/mimir-market/src/fees.rs`, mirrored off-chain in
`lib/fees.ts`.
Tests: `src/test_fees.rs`, `src/test_settlement.rs`, `tests/node/fees.test.ts`.

- **Fees are charged on profit only** — `gross - principal`, floored at zero — so a
  winner never receives less than their principal. Integer division truncates,
  which rounds fees **down in the participant's favour**.
- **A fee with no recipient is not charged**, so a malformed snapshot cannot mint an
  unclaimable balance.
- **Claim creation snapshots** platform and agent-owner bps plus both recipients onto
  the claim (`FeeSnapshot`). A later policy change cannot rewrite the economics of an
  open market. Tested **both ways**:
  `a_later_policy_change_cannot_reach_an_existing_claim` and
  `a_new_claim_picks_up_the_new_policy`.
- **`platform_fee_bps + agent_owner_fee_bps` can never exceed `MAX_TOTAL_FEE_BPS`**
  (1,000 bps = 10%). No function can raise that constant, so no admin action and no
  compromised key can take more than 10% of profit. Checked on `initialize` and on
  every queued change, including via the queue/execute path.
- **A queued policy waits `FEE_TIMELOCK_SECONDS` (2 days)** before it can execute,
  and **execution is permissionless** once elapsed. The owner can queue and cancel
  but cannot execute early.
- **Fees are pulled, not pushed.** They accrue per recipient and are collected with
  `claim_fees`. Tested once-only
  (`fees_are_pulled_not_pushed_and_only_once`) and for an unrelated address having
  nothing to claim.
- **Lifetime accrued and claimed totals** (`get_platform_stats`) support
  reconciliation against the off-chain atomic ledger.
- **Exact-balance intake.** `escrow::pull` asserts escrow moved by exactly the
  requested amount and errors `UnsupportedToken` otherwise, which rejects
  fee-on-transfer and rebasing behaviour.

## Settlement conservation

`conservation_holds_across_every_verdict` asserts, for **every** `WinnerSide`, that:

```
payouts + fees + dust  ==  escrow inflow
```

Alongside it:

| Test | What it pins down |
| --- | --- |
| `winner_never_receives_less_than_principal_in_a_crowded_pool` | The headline invariant, under the worst case |
| `challengers_win_pool_mode_is_pro_rata_and_conserved` | Pool-mode distribution |
| `pool_mode_truncation_dust_is_absorbed_by_the_last_claimant` | Nothing is stranded |
| `fixed_odds_challenger_win_refunds_unspent_liability_without_fee` | Unspent creator liability is not fee-bearing |
| `fixed_odds_with_several_challengers_conserves_exactly` | Fixed-odds arithmetic |
| `draw_refunds_everyone_in_full_with_no_fee` + the `Unresolvable` equivalent | Refunds are total |
| `a_quote_matches_what_the_pull_actually_pays` | The quoted view cannot drift from the transfer |

The off-chain mirror exports `conservationHolds` and `noWinnerLosesPrincipal` from
`lib/fees.ts` and asserts them over the same shapes, so the UI's arithmetic and the
contract's arithmetic are held to one standard.

## Pull settlement is a solvency property

`resolve_claim` does not loop over challengers, because a Stellar transaction is
capped on its **ledger-entry footprint** and a market filled to `MAX_CHALLENGERS`
(100) does not fit.

Resolution instead seeds `remaining_escrow`, and each `claim_challenger_payout`
draws it down — so **the contract cannot pay out more than it took in, regardless of
ordering**. `challenger_claims` counts the pulls, so the last claimant absorbs the
truncation dust.

Tested: a challenger can only pull once; a non-challenger cannot pull; pulling
before resolution is rejected; pulling requires the challenger's own signature
(`pulling_requires_the_challengers_signature`); an abandoned share simply stays in
escrow.

### Undeliverable payouts park rather than revert

A payout the contract cannot deliver — a frozen or authorisation-revoked USDC
trustline makes the Stellar Asset Contract transfer fail — is **parked as a
withdrawable balance** rather than failing the whole settlement.

Source: `escrow::push_or_park`, using `try_transfer`.
Tests: `a_failed_payout_is_parked_and_withdrawable_later`,
`a_blocked_challenger_has_their_payout_parked`.

Without this, one uncooperative trustline in a hundred-challenger market would
block everyone else.

## `mimir-squad`

Source: `contracts-soroban/mimir-squad/src/pool.rs`.
Tests: `src/test_lifecycle.rs`, `src/test_payouts.rs`,
`tests/node/squad-pool.test.ts`.

- Both sides deposit into one escrow, and **exact USDC balance deltas are
  required**.
- Before the deadline, participants can withdraw their own side balance; after
  resolution, winners claim pro rata.
- **Conservation:** the sum of winner payouts, the profit-only fee and deterministic
  final-winner dust equals the escrowed pot.
  `conservation_holds_over_awkward_stake_distributions` sweeps **every result ×
  three fee levels × deliberately awkward stake sets**.
- Caps: `MAX_PARTICIPANTS_PER_SIDE` (200), `MAX_FEE_BPS` (1,000 = 10%), duration
  between `MIN_DURATION` (10 minutes) and `MAX_DURATION` (365 days).
- **Payouts are pull-based** for the same footprint reason: `remaining_escrow` is
  drawn down by each claim and the last winner absorbs the dust. Claiming twice,
  claiming from the losing side, claiming with no position, and claiming without the
  participant's signature are each rejected.
- **A cancelled market refunds every principal in full**, including *both* sides of
  a double-sided depositor. A break-even winner pays no fee.
- `preview_matches_the_amount_actually_paid` ties the quoting view to the pull.

## Virtual baskets

Source: `lib/baskets.ts`.
Tests: `tests/node/baskets.test.ts`, `tests/node/basket-returns.test.ts`.

- Weights equal **exactly 10,000 bps**, and single-agent and per-category caps are
  enforced.
- **Paused, stale or failed-copy allocation remains idle USDC and cannot fabricate
  NAV.**
- Share, deposit, redemption and high-water-mark calculations use integer rounding
  with **explicit dust ownership**.
- **Funded deposits remain off** until the external audit and the legal/eligibility
  gates are complete.

## Reentrancy

There is **no reentrancy guard in these contracts, and that is not an omission.**

The Soroban host rejects a call that re-enters a contract already on the call stack,
so the EVM `nonReentrant` modifier has no counterpart to port. The ordering
discipline it protected — state written before an external transfer — is kept anyway,
because it is also what makes the pull paths correct.

## Checked arithmetic

Every multiplication in `fees.rs` is `checked_mul` and errors `Overflow` rather than
wrapping, matching the revert-on-overflow semantics the original Solidity relied on.

## Address fidelity

`G…`/`C…` strkeys are **case-sensitive base32**. Every comparison in the repository
is exact.

A `toLowerCase()` normalisation — the reflex carried over from EVM hex addresses —
turns a valid address into one that matches nothing. In an allowlist written the
wrong way round, that fails **open**.

Tests: `tests/node/db-address-fidelity.test.ts`,
`tests/node/stellar-address-validation.test.ts`.

## Running the suites yourself

From the main repository:

```bash
npm run test:contracts    # cargo test --release over contracts-soroban
npm run test:smoke        # node-native smoke tests
npm run test:baskets      # basket validation, virtual NAV, high-water fee
npm run test:squad        # squad view and pool suites
npm run typecheck         # tsc --noEmit across app, workers and scripts
```

## Read next

- [Soroban contracts](/architecture/contracts) — the surface these tests cover
- [Security posture](/security) — what is still unreviewed
