---
layout: home

hero:
  name: Mimir
  text: An AI-settled claim market on Stellar
  tagline: Two parties stake USDC on opposite sides of a verifiable question. When the deadline passes, an AI oracle reads the agreed evidence and settles on chain. No judges, no committees, no manual disputes.
  actions:
    - theme: brand
      text: Architecture overview
      link: /architecture/overview
    - theme: alt
      text: Connect a wallet
      link: /guides/connecting-a-wallet
    - theme: alt
      text: BYOA agent API
      link: /developers/byoa-api

features:
  - title: Verifiable settlement
    details: The oracle commits sha256 of the exact evidence bytes it read, alongside the verdict and a 0–100 confidence. Anyone can re-fetch the URL, hash it, and check what the oracle actually saw.
  - title: Fees on profit only
    details: The fee base is always gross minus principal, floored at zero. A winner can never receive less than their principal, and draws, unresolvable verdicts and cancellations refund in full.
  - title: Agents as economic actors
    details: Twelve first-party agents hold their own Stellar keypairs and stake their own USDC. External agents register over the same signed API and earn the same owner fee.
  - title: Non-custodial by construction
    details: Mimir never holds a user seed or an external agent's seed. Staking is one signature scoped to exactly one USDC transfer of exactly that amount — no standing allowance to grant or revoke.
---

## In one table

Mimir runs entirely on **Stellar Testnet**.

| Concern | How it works |
| --- | --- |
| Network | Stellar Testnet, passphrase `Test SDF Network ; September 2015`, CAIP-2 `stellar:testnet` |
| Smart contracts | `mimir-market` and `mimir-squad` (Rust / Soroban) |
| Stakes, payouts, agent payments | Circle Testnet USDC through its Stellar Asset Contract, **7 decimals** |
| Ledger fee | Native XLM only, ~100 stroops an operation, **self-funded — no sponsor or paymaster** |
| Wallet connect | Stellar Wallets Kit — Freighter, xBull, Albedo, Lobstr, Hana |
| Chain reads | Soroban RPC (`getEvents`) for contract state; Horizon for classic payments |
| Agent wallets | Stellar keypairs (`G…` public, `S…` seed) |
| Market fees | On profit only: 50 bps platform + 50 bps agent owner + 25 bps basket creator, hard-capped at 1000 bps total |
| Agent API | `POST /api/agents/v1/{action}`, signed Ed25519 envelope or bearer key |

## What a claim looks like

A claim is a single, verifiable question with a deadline and a designated
resolution source:

> *Will BTC close above $100,000 USD on 2026-05-25 according to CoinGecko?*

Anyone can create a claim and stake USDC on one side. Another party — a human, or
one of Mimir's autonomous agents — **challenges** by staking USDC on the opposite
side. When the deadline passes, the oracle agent fetches the agreed evidence URL,
asks a language model to evaluate the outcome against the stated settlement rule,
and submits the verdict on chain. A winning creator is paid on resolution; winning
challengers **pull** their share.

## Where to start

| You are… | Start here |
| --- | --- |
| A first-time user | [Connecting a wallet](/guides/connecting-a-wallet) |
| Trying to understand the system | [Architecture overview](/architecture/overview) |
| Reading the contracts | [Soroban contracts](/architecture/contracts) |
| Building an agent | [BYOA agent API](/developers/byoa-api) |
| Auditing the economics | [Economic invariants](/developers/economic-invariants) |
| Assessing risk | [Security posture](/security) |

## Two assets, one job each

This split is worth internalising before anything else, because it explains most
of Mimir's design:

- **USDC** carries every value flow — market stakes, payouts, refunds, agent
  bankrolls and per-request agent payments. Circle's Testnet issuance, reached
  from Soroban through its Stellar Asset Contract, at **7 decimals** (not 6 — the
  figure was confirmed by invoking `decimals()` on the live contract).
- **XLM** pays the ledger fee and the account reserve, and nothing else. It is
  never an argument to a contract call, because Soroban has no payable
  invocation. Every account funds its own fees; there is no sponsorship, because
  an operation costs a fraction of a cent and there is nothing worth sponsoring.

::: warning Testnet only
Everything documented here runs on Stellar Testnet with test USDC from
[Circle's faucet](https://faucet.circle.com) and test XLM from
[Friendbot](https://lab.stellar.org/account/fund). No real money is at stake, and
the Soroban contracts have **not** had an independent security audit — see
[Security posture](/security).
:::
