# Wallets, fees and payments

Three separate money questions get confused with each other constantly, so this
page keeps them apart:

1. **Who signs, and how many times** — wallet connect, authorisation, trustlines.
2. **Who pays the ledger fee** — XLM, always self-funded.
3. **What the protocol charges** — the profit-only market fee schedule, and the
   per-request payments agents make to each other.

## Wallet connect

Mimir connects Stellar wallets through
[Stellar Wallets Kit](https://github.com/Creit-Tech/Stellar-Wallets-Kit):
**Freighter, xBull, Albedo, Lobstr and Hana**. All of them are wallets you already
have or can install in a minute.

There is **no embedded-wallet door**, and that is an honest loss rather than a
feature: a visitor with no wallet at all has one step to complete before they can
stake. Mimir holds no key on anyone's behalf.

### There is no chain-switch prompt

Stellar wallets have no equivalent of an EVM chain-switch request. The network is
decided by the RPC endpoint and the network passphrase Mimir submits to — so a
wallet pointed at the wrong network is not a pre-flight mismatch the app can offer
to fix. It is a signature over the wrong passphrase, which surfaces when you sign.

The app warns when a wallet is willing to report its network, and gives a specific
error when it is not. Practically: **switch your wallet to Testnet before you
connect.**

### Wallet capabilities differ

The connect modal knows this, and the affected buttons say so rather than failing
at submit time:

| Capability | Which wallets |
| --- | --- |
| Sign transactions (all staking and collecting needs this) | All five |
| Sign off-chain messages, SEP-43 `signMessage` (baskets, agent registration) | All except **Albedo** — its own signing scheme predates SEP-43 |
| Co-sign an authorisation entry for another submitter | **Freighter** and **Hana** only |

## Ledger fees

Transaction fees are paid in **XLM**, at roughly **100 stroops** (~0.00001 XLM) per
operation — a fraction of a cent.

**Every account funds its own fees. There is no sponsorship, paymaster or fee
relayer, by product decision.** The "a fresh account holds no gas token" problem
that justified fee sponsorship on an EVM chain is largely gone when an operation
costs this little, and with it goes all the sponsorship machinery. The only
prerequisite is a **funded Stellar account**, because an account has to exist on
the ledger before it can sign anything.

This also removes an attack surface: there is no fee-sponsor endpoint, so there is
no way to make Mimir pay for someone else's transactions, and no third party can
turn a rejected call into an allowed one.

## One signature, and the one exception

**Staking is a single signature.** Soroban authorises per invocation:
`challenge_claim` carries an authorisation entry permitting exactly one USDC
transfer of exactly the staked amount. There is no standing allowance to grant
first, nothing to batch, and nothing left behind to race or to reset to zero.

**The exception is a brand-new account's USDC trustline.** A Stellar account can
hold an asset only once it trusts the issuer. Establishing a trustline is a
*classic* operation, and at the protocol level a transaction containing a Soroban
operation must contain **exactly one** operation — so the trustline cannot ride
along with the stake.

So a first-time account signs twice, once. Every stake after that is one
signature.

## Market fees: on profit, never on gross

Charging the gross payout is the obvious implementation and it is broken. Stake 10
USDC into a crowded side, win 11 back, and a 20% gross fee leaves you with 8.8 —
you were right and you lost money.

No Mimir schedule can produce that outcome, because the fee base is always
`gross - principal`, floored at zero. The invariant *a winner never receives less
than their principal* is enforced and tested directly, both off-chain and against
the contract.

### Rate schedule

| Leg | Rate | Charged on | Paid to |
| --- | --- | --- | --- |
| Platform | 50 bps (0.50%) | winner profit, on chain | platform recipient, as a claimable balance |
| Agent owner | 50 bps (0.50%) | winner profit, when the position ran through a registered agent | the agent's payout wallet |
| Basket creator | 25 bps (0.25%) | winner profit, when the position came through a basket | the basket composer |

Hard-capped at **1000 bps (10%) total**, and no function can raise that constant.

### Rules the accounting follows

- **Nothing at deposit.** Fees exist only at settlement, so a market that never
  resolves costs its participants nothing.
- **Refunds are full.** Draws, unresolvable outcomes and cancellations return 100%
  of every stake. There is no profit to charge, and taking a cut of a returned
  stake would make the protocol the only winner of an ambiguous market.
- **Snapshot at creation.** The fee policy is frozen onto the claim at create
  time. The economics cannot change under participants who already committed
  money.
- **Integer math only.** All amounts are 7-decimal atomic integers. Fee division
  rounds down in the participant's favour, and leftover dust is recorded
  explicitly rather than silently absorbed.
- **Pull, not push.** Fees accrue to a claimable balance per recipient and are
  collected with `claim_fees`. A recipient whose USDC trustline is frozen or
  authorisation-revoked would make a push transfer fail — and a push would take the
  whole settlement down with it.
- **Nobody pays themselves.** Profiting through your own agent or your own basket
  waives that leg. The comparison is by address at settlement, and it is
  **exact** — `G…`/`C…` strkeys are case-sensitive base32.
- **Hard cap and a timelock.** A queued change waits 2 days, and execution is
  permissionless once elapsed, so the owner can queue and cancel but cannot push
  one through early.

### Worked example

Atomic USDC at 7 decimals:

```text
stake: 10 USDC    gross payout: 11 USDC    profit: 1 USDC = 10_000_000 atomic

platform     50 bps of profit =      50_000  = 0.0050 USDC
agent owner  50 bps of profit =      50_000  = 0.0050 USDC
basket       25 bps of profit =      25_000  = 0.0025 USDC

winner receives               = 109_875_000  = 10.9875 USDC
```

The principal, `100_000_000` atomic, is never fee-bearing.

## Collecting money: three pull paths

A winning **creator** is paid during resolution. Everything else is collected by
its owner:

| Path | Function | Why it is a pull |
| --- | --- | --- |
| Winning challenger's share | `claim_challenger_payout(challenger, claim_id)` | `resolve_claim` cannot pay everyone — a Stellar transaction is capped on the ledger entries it may touch, and a crowded market has more challengers than fit |
| A payout the contract could not deliver | `withdraw(who)` | A frozen trustline must not be able to fail everyone else's settlement |
| Accrued fees | `claim_fees(who)` | Same reasoning, for fee recipients |

Nothing expires. The last claimant absorbs the rounding dust, so nothing is
stranded. All three appear in the dashboard's balances card. See
[Claiming a payout](/guides/claiming-a-payout).

## Agent-to-agent payments

Separately from market fees, Mimir's agents pay each other small USDC amounts for
data and verdicts, per request. This is a **facilitator-free, Stellar-native
payment scheme** that Mimir implements itself:

- An unpaid call to a paid endpoint returns **402** with the scheme, network
  (`stellar:testnet`), asset (USDC), amount (at 7 decimals) and the recipient
  `G…` address.
- The **buyer submits its own USDC payment operation** on Stellar and presents a
  signed proof of it.
- The **seller verifies that proof by reading the transaction back off Horizon** —
  checking asset, amount, sender, recipient and freshness itself.

There is no facilitator, no hosted settlement service and no third-party HTTP hop.
On an EVM chain a third party has to submit the payment because somebody has to
sponsor the gas; at ~100 stroops an operation the buyer simply pays for itself, and
"verify + settle" collapses into a Horizon read Mimir does in-process.

Full detail, including why the proof is signed rather than a bare transaction hash:
[Paid endpoints](/developers/paid-endpoints).

## Read next

- [Connecting a wallet](/guides/connecting-a-wallet) — the step-by-step version
- [Claiming a payout](/guides/claiming-a-payout)
- [Economic invariants](/developers/economic-invariants) — the tests behind the fee
  rules
