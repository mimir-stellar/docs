# Soroban contracts

Mimir's on-chain logic is two Rust / Soroban contracts, both dependency-free
beyond `soroban-sdk`, with `Cargo.lock` committed:

| Contract | Responsibility |
| --- | --- |
| `mimir-market` | Claim escrow, challenger roster, oracle-only resolution, fee policy, pull payouts |
| `mimir-squad` | Two-sided squad pools: both sides deposit into one escrow, winners claim pro rata |

Both are addressed by a `C…` contract id. The contracts are the source of truth;
the Postgres read-index is a cache, and if the two disagree the chain wins.

## `mimir-market`

### State machine

```
[*] ──create_claim─────────▶ Open
Open ──challenge_claim─────▶ Active
Open ──cancel_claim───────▶ Cancelled     (expired, unchallenged)
Active ──resolve_claim────▶ Resolved      (oracle only)
```

| State | Meaning |
| --- | --- |
| `Open` | Joinable. The creator side is funded; nobody has taken the counter-side yet. |
| `Active` | Both sides funded. The deadline must pass before settlement is possible. |
| `Resolved` | A `WinnerSide` is written. Challengers pull from `remaining_escrow`. |
| `Cancelled` | An expired, unchallenged claim was cleaned up. The creator's stake is refunded in full. |

`WinnerSide` is `None`, `Creator`, `Challengers`, `Draw` or `Unresolvable`.

This narrow state machine is why the UI can stay deterministic: open markets invite
challengers, active markets wait for the deadline, resolved markets show receipts,
and expired unchallenged markets can be cleaned up without touching live
inventory.

### Constants

Ground truth from `contracts-soroban/mimir-market/src/types.rs`:

| Constant | Value | Why |
| --- | --- | --- |
| `MIN_STAKE` | `2_0000000` (2 USDC) | Atomic USDC at 7 decimals — the decimals the Stellar Asset Contract actually reports |
| `MAX_CHALLENGERS` | `100` | Roster ceiling per claim |
| `DEFAULT_PAYOUT_BPS` | `20_000` | 2× total return, the default for fixed-odds markets |
| `CHALLENGE_LOCK_SECONDS` | `60` | Anti-sniping window: a challenge landing inside it is rejected |
| `MAX_TOTAL_FEE_BPS` | `1_000` | Hard 10% ceiling on platform + agent-owner fee. No function can raise it |
| `FEE_TIMELOCK_SECONDS` | `172_800` | A queued fee policy cannot execute for 2 days |
| `MAX_INVITE_KEY_BYTES` | `128` | Hashing a Soroban `String` requires a fixed-size host buffer, so a bound is required |
| `BPS_DIVISOR` | `10_000` | Basis-point denominator |

### Write functions

No allowance step exists anywhere in the staking path. Soroban authorises per
invocation, so a stake carries an authorisation entry permitting exactly one USDC
transfer of exactly that amount.

```
initialize(owner, oracle, usdc_token, platform_fee_bps,
           agent_owner_fee_bps, platform_recipient)

create_claim(creator, params) → claim_id
challenge_claim(challenger, claim_id, stake_amount, invite_key)
resolve_claim(claim_id, winner_side, summary, confidence, evidence_hash)  // oracle only
cancel_claim(claim_id)

claim_challenger_payout(challenger, claim_id) → net   // pull, once per challenger, O(1)
withdraw(who)  → amount                               // parked-payout pull
claim_fees(who) → amount                              // fee-recipient pull

set_oracle(new_oracle) / transfer_ownership(new_owner)          // owner-gated
queue_fee_policy(...) / cancel_fee_policy() / execute_fee_policy()  // timelocked
```

`initialize` is one-shot, and the fee cap is checked there — a policy totalling
over 1000 bps is refused at deploy time rather than discovered later.

A **rematch** is not a separate entry point: it is a `create_claim` with
`parent_id` set.

### Read functions

```
get_claim(claim_id)                     get_claim_market_config(claim_id)
get_claim_fees(claim_id)                get_challenger_list(claim_id)
quote_challenger_payout(...)            get_platform_stats()
get_fee_policy()                        get_pending_fee_policy()
get_owner() / get_oracle() / get_usdc()
get_withdrawable(who)                   get_accrued_fees(who)
```

`quote_challenger_payout` is tied to the pull path by a test —
`a_quote_matches_what_the_pull_actually_pays` — so the number the UI shows is the
number the contract transfers.

### Payout logic

| Verdict | What happens |
| --- | --- |
| `Creator` | The creator receives the entire pot, less fees charged on profit only |
| `Challengers`, pool mode | Pro-rata share of the creator stake, plus their own stake returned |
| `Challengers`, fixed odds | `stake × challenger_payout_bps / 10_000`; unspent creator liability is refunded without a fee |
| `Draw` / `Unresolvable` | Full refunds to every side, zero fee |

### Why challenger settlement is pull-based

This is a **solvency property, not a convenience**. A Stellar transaction is capped
on the ledger entries it may touch, and a market filled to `MAX_CHALLENGERS` (100)
does not fit in one transaction. So `resolve_claim` deliberately does not loop over
challengers.

Instead resolution seeds `remaining_escrow`, and each winner calls
`claim_challenger_payout` exactly once, in an O(1) call that draws it down. The
contract therefore cannot pay out more than it took in, regardless of the order
claims arrive in. `challenger_claims` counts the pulls, so **the last claimant
absorbs the truncation dust** and nothing is stranded. Nothing expires.

Tested behaviour: a challenger can only pull once, a non-challenger cannot pull,
pulling before resolution is rejected, pulling requires the challenger's own
signature, and an abandoned share simply stays in escrow.

### A failed payout parks, it does not revert

A frozen or authorisation-revoked USDC trustline makes the Stellar Asset Contract
transfer fail. If settlement pushed payouts, one uncooperative trustline would take
down everyone else's settlement. So `escrow::push_or_park` uses `try_transfer` and
parks an undeliverable amount as a withdrawable balance, collected later with
`withdraw(who)`.

The same reasoning applies to fees: they accrue per recipient and are collected
with `claim_fees(who)`, never pushed.

### Exact balance-delta intake

`escrow::pull` asserts that escrow moved by **exactly** the requested atomic
amount and errors `UnsupportedToken` otherwise. Strict equality is intentional —
accepting a smaller or larger delta would make escrow accounting incorrect. It
rejects fee-on-transfer and rebasing behaviour, and it catches a misconfigured
deployment pointing `usdc` at some other token.

### The fee policy is timelocked and capped

- `platform_fee_bps + agent_owner_fee_bps` can never exceed `MAX_TOTAL_FEE_BPS`
  (1000 bps = 10%). No function can raise that constant, so no admin action and no
  compromised key can take more than 10% of profit. Checked on `initialize` and on
  every queued change.
- A queued policy waits `FEE_TIMELOCK_SECONDS` (2 days), and **execution is
  permissionless** once elapsed. The owner can queue and cancel but cannot execute
  early or hold a favourable policy hostage.
- Claim creation **snapshots** the bps values and both recipients onto the claim
  (`FeeSnapshot`), so a later policy change cannot rewrite the economics of a
  market someone already committed money to. Tested both ways.

## `mimir-squad`

Two-sided squad pools. Both sides deposit into one escrow; before the deadline a
participant can withdraw their own side balance; after resolution winners claim
pro rata.

### Function surface

```
initialize(...)
create_market(...)
deposit(...)
withdraw_before_deadline(...)
resolve(market_id, result)          // SIDE_A | SIDE_B | RESULT_CANCELLED
claim(participant, market_id, side) → amount
claim_fees() → amount

get_market(market_id)        get_deposit(market_id, side, who)
has_claimed(...)             preview_claim(...)
get_market_count()           get_accrued_fees()
get_usdc() / get_oracle() / get_fee_recipient() / get_escrow_balance()
```

### Constants

| Constant | Value |
| --- | --- |
| `SIDE_A` / `SIDE_B` | `1` / `2` |
| `RESULT_CANCELLED` | `3` |
| `MAX_FEE_BPS` | `1_000` (10%) |
| `MAX_PARTICIPANTS_PER_SIDE` | `200` |
| `MIN_DURATION` | `600` (10 minutes) |
| `MAX_DURATION` | `31_536_000` (365 days) |

Payouts are pull-based for the same ledger-footprint reason as the market
contract: `remaining_escrow` is drawn down by each claim and the last winner
absorbs the dust. Claiming twice, claiming from the losing side, claiming with no
position, and claiming without the participant's signature are each rejected. A
cancelled market refunds every principal in full, including both sides of a
double-sided depositor. A break-even winner pays no fee, and
`preview_matches_the_amount_actually_paid` ties the quoting view to the pull.

## No reentrancy guard, and that is not an omission

The Soroban host rejects a call that re-enters a contract already on the call
stack, so the EVM `nonReentrant` modifier has no counterpart to port. The ordering
discipline it protected — state written before an external transfer — is kept
anyway, because it is also what makes the pull paths correct.

## Deployment configuration boundary

The USDC Stellar Asset Contract id is **derived, not chosen**:

```bash
stellar contract id asset --asset USDC:<issuer> --network testnet
```

Deployment must pass the SAC id for Circle's official Testnet USDC issuer.
Hardcoding one is a bug. The deploy script, a `verify:deployment` check, and env
validation form the configuration boundary; the contract additionally proves every
stake transfer changes escrow by the exact requested atomic amount.

## Game modes

The contract already supports `odds_mode` (`pool` or `fixed`), `max_challengers`,
challenger stake sizing, rematches via `parent_id`, and private invite links — so
several roadmap modes are product policy rather than contract work.

| Mode | Status | Rule in one line |
| --- | --- | --- |
| Pool market | live | Pari-mutuel: challengers share the creator stake proportionally; the creator wins everything if right |
| Duel / 1v1 | live | `max_challengers = 1` with equal stake enforced; winner takes the two-person pot |
| Fixed odds | contract-ready | The creator guarantees a challenger return multiple, backed by creator liquidity |
| Squad vs squad | contract-ready | `mimir-squad` implements two-sided pools with pull payouts; the remaining work is product surface |
| Rematch ladder | partial (`parent_id`) | A settled claim spawns the next round |
| Streak / conviction scoring | read-index first | Surfaced from indexed history before any contract change |

## Read next

- [Economic invariants](/developers/economic-invariants) — the tests that back
  every claim on this page
- [Security posture](/security) — what has and has not been reviewed
