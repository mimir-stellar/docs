# Mimir documentation

The public documentation site for **[Mimir](https://github.com/mimir-stellar/mimir-markets)** —
an AI-settled claim market on **Stellar Testnet**. Stakes and agent payments in
USDC, ledger fees in XLM.

Built with [VitePress](https://vitepress.dev). Published to GitHub Pages at
**<https://mimir-stellar.github.io/docs/>**.

## Running locally

Requires **Node.js 20+**.

```bash
npm install
npm run docs:dev
```

The dev server prints a local URL (usually <http://localhost:5173/docs/>) with hot
reload.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run docs:dev` | Dev server with hot reload |
| `npm run docs:build` | Production build into `docs/.vitepress/dist` |
| `npm run docs:preview` | Serve the built output locally, to check it before pushing |

Building must succeed with no errors before a change is pushed — the deploy workflow
runs the same command.

## Layout

```
package.json
docs/
├── .vitepress/
│   └── config.ts                     # nav, sidebar, title, base path
├── index.md                          # landing page
├── architecture/
│   ├── overview.md                   # tiers, lifecycle, trust properties
│   ├── contracts.md                  # mimir-market + mimir-squad mechanics
│   ├── wallets-and-payments.md       # wallet connect, fees, signatures
│   ├── agents.md                     # oracle, market-creator, council
│   └── baskets-and-copy-trading.md   # baskets, mirroring, threat model
├── guides/
│   ├── connecting-a-wallet.md
│   ├── creating-a-market.md
│   ├── challenging-and-settlement.md
│   ├── claiming-a-payout.md
│   └── messaging.md                  # optional encrypted chat
├── developers/
│   ├── byoa-api.md                   # bring-your-own-agent signed API
│   ├── paid-endpoints.md             # the Stellar-native payment scheme
│   └── economic-invariants.md        # the tests behind the money claims
└── security.md
```

## Writing conventions

A few rules that keep this site useful:

- **Do not overstate security.** The Soroban contracts have **not** had an
  independent audit. Any page touching security must carry that caveat rather than
  implying review has happened. See `docs/security.md`.
- **Testnet only.** Every figure, faucet and endpoint refers to Stellar Testnet.
- **Get the chain facts right.** USDC on Stellar is **7 decimals** (not 6). Ledger
  fees are self-funded XLM — there is no paymaster or sponsor. Challenger payouts are
  **pull-based** via `claim_challenger_payout`. `G…`/`C…` strkeys are case-sensitive
  base32 and are never lowercased.
- **Cross-link rather than duplicate.** Pages stay short; a concept is explained once
  and linked to from elsewhere.
- **Prefer tables and short code blocks** over long prose walls.

Source of truth for anything factual is the
[mimir-markets repository](https://github.com/mimir-stellar/mimir-markets),
particularly `docs/STELLAR_NETWORK.md` and the contracts under
`contracts-soroban/`.

## Adding a page

1. Create the markdown file under the relevant `docs/` subdirectory.
2. Add it to the `sidebar` (and `nav`, if it is a new top-level section) in
   `docs/.vitepress/config.ts`.
3. Run `npm run docs:build` to confirm the build is clean — VitePress reports dead
   internal links as build failures.

## Deployment

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds the site and
deploys it to GitHub Pages. The Pages source is set to **GitHub Actions**.

The `base` option in `docs/.vitepress/config.ts` is `/docs/` because the site is
served from a repository subpath. Changing the repository name or moving to a custom
domain means updating that value.

## License

[AGPL-3.0-or-later](./LICENSE), matching the main Mimir repository.
