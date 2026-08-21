# Connecting a wallet

Mimir is non-custodial. It holds no key on your behalf, which means you need a
Stellar wallet before you can stake. This takes about two minutes end to end.

## 1. Install a supported wallet

Mimir connects through **Stellar Wallets Kit**, which supports:

| Wallet | Notes |
| --- | --- |
| **Freighter** | Browser extension. Can also co-sign an authorisation entry for another submitter |
| **Hana** | Same full capability set as Freighter |
| **xBull** | Extension and web |
| **Lobstr** | Popular mobile-first wallet |
| **Albedo** | Works for staking, but **cannot sign off-chain messages** — see below |

Any of the five is enough to create claims, stake, and collect payouts.

## 2. Switch the wallet to Testnet

**Do this before you connect.** Mimir runs on Stellar Testnet:

- Network passphrase: `Test SDF Network ; September 2015`
- CAIP-2 id: `stellar:testnet`

::: warning There is no chain-switch prompt
Stellar wallets have no equivalent of an EVM chain-switch request, so Mimir
**cannot** offer to switch the network for you.

The network is decided by the RPC endpoint and passphrase Mimir submits to. A
wallet pointed at the wrong network is therefore not a pre-flight mismatch the app
can fix — it is a signature over the wrong passphrase, which only surfaces when
you sign. Mimir warns you when your wallet is willing to report its network, and
gives a specific error when it is not.
:::

## 3. Fund the account with XLM

Your account has to **exist on the ledger** before it can sign anything. That
requires a small XLM balance for the account reserve, plus a fraction of a cent per
transaction for ledger fees.

Get free test XLM from **Friendbot**:
[lab.stellar.org/account/fund](https://lab.stellar.org/account/fund)

You fund your own fees. There is no sponsorship, paymaster or relayer in Mimir — at
roughly 100 stroops (~0.00001 XLM) per operation, there is nothing worth
sponsoring. XLM pays the ledger fee and the account reserve, and nothing else.

## 4. Get test USDC

Stakes, payouts and refunds all move **Circle's Testnet USDC** on Stellar, at
**7 decimals**.

Get free test USDC from **Circle's faucet**:
[faucet.circle.com](https://faucet.circle.com)

## 5. Connect

Click **Connect Wallet**, pick your wallet from the connector modal, and approve.
Your address is now available to the app.

## 6. Establish a USDC trustline (first time only)

A Stellar account can hold an asset only once it **trusts** the issuer. If this is a
brand-new account, you will be asked to sign a trustline transaction before your
first stake.

Why it is a separate signature rather than bundled into the stake: a trustline is a
*classic* operation, and at the protocol level **a transaction containing a Soroban
operation must contain exactly one operation**. The trustline physically cannot
ride along.

So a first-time account signs twice, once. **Every stake after that is one
signature.**

## What each signature actually authorises

This is worth understanding, because it is stronger than the EVM pattern most
people are used to:

- **There is no `approve` step and no standing allowance.** Soroban authorises
  **per invocation**. When you stake, the transaction carries an authorisation entry
  permitting exactly **one** USDC transfer of exactly **that** amount.
- Nothing is granted in advance, nothing is left behind afterwards, and there is no
  allowance to race, to forget about, or to have to reset to zero.
- Mimir cannot move your USDC. Each transfer needs a fresh signature from you,
  scoped to that exact amount.

## Wallet capability differences

Every listed wallet can sign transactions, which is all that staking and collecting
require. Two capabilities vary, and the connect modal tells you rather than letting
you fail at submit time:

| Capability | Which wallets | What needs it |
| --- | --- | --- |
| Sign off-chain messages (SEP-43 `signMessage`) | All except **Albedo** | Following a basket, registering an agent |
| Co-sign an authorisation entry for another submitter | **Freighter**, **Hana** only | Advanced delegated flows |

Albedo's own signing scheme predates SEP-43, which is why it cannot do the first
one. It still works fine for staking.

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| Signature rejected or "invalid network" at submit | Your wallet is on the wrong network. Switch it to Testnet and reconnect |
| "Account not found" | The account does not exist on the ledger yet. Fund it with XLM from Friendbot first |
| Stake fails and you have USDC showing elsewhere | You have no USDC trustline on **this** account. Sign the trustline transaction, then stake |
| Basket-follow or agent-register button is disabled | You are connected with Albedo, which cannot sign off-chain messages. Use another wallet for those flows |
| Reads work but writes are slow or erratic | Public Soroban RPC and Horizon endpoints are rate-limited. Deployed environments should configure their own providers |

## Verifying anything you see

Every stake, settlement and payment lands on a public ledger. You can check any
number in the UI against
[stellar.expert/explorer/testnet](https://stellar.expert/explorer/testnet).

Accounts (`G…`) and contracts (`C…`) live at different explorer routes, which is
why Mimir builds its links based on the form of the address.

## Read next

- [Creating a market](/guides/creating-a-market)
- [Wallets, fees and payments](/architecture/wallets-and-payments) — the deeper
  version of this page
