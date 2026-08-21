import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Mimir',
  description:
    'Documentation for Mimir — an AI-settled claim market on Stellar Testnet. Stakes and agent payments in USDC, ledger fees in XLM.',
  lang: 'en-US',

  // Served from https://mimir-stellar.github.io/docs/
  base: '/docs/',

  lastUpdated: true,
  cleanUrls: true,

  head: [
    ['meta', { name: 'theme-color', content: '#10b981' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'Mimir Documentation' }],
    [
      'meta',
      {
        property: 'og:description',
        content:
          'An AI-settled claim market on Stellar Testnet. Architecture, guides and the BYOA agent API.',
      },
    ],
  ],

  themeConfig: {
    siteTitle: 'Mimir Docs',

    nav: [
      { text: 'Architecture', link: '/architecture/overview' },
      { text: 'Guides', link: '/guides/connecting-a-wallet' },
      { text: 'Developers', link: '/developers/byoa-api' },
      { text: 'Security', link: '/security' },
      {
        text: 'Source',
        items: [
          {
            text: 'mimir-markets (app + contracts)',
            link: 'https://github.com/mimir-stellar/mimir-markets',
          },
          {
            text: 'Stellar Testnet explorer',
            link: 'https://stellar.expert/explorer/testnet',
          },
        ],
      },
    ],

    sidebar: [
      {
        text: 'Introduction',
        items: [{ text: 'What Mimir is', link: '/' }],
      },
      {
        text: 'Architecture',
        collapsed: false,
        items: [
          { text: 'Overview', link: '/architecture/overview' },
          { text: 'Soroban contracts', link: '/architecture/contracts' },
          {
            text: 'Wallets, fees and payments',
            link: '/architecture/wallets-and-payments',
          },
          { text: 'Agents', link: '/architecture/agents' },
          {
            text: 'Baskets and copy trading',
            link: '/architecture/baskets-and-copy-trading',
          },
        ],
      },
      {
        text: 'Guides',
        collapsed: false,
        items: [
          { text: 'Connecting a wallet', link: '/guides/connecting-a-wallet' },
          { text: 'Creating a market', link: '/guides/creating-a-market' },
          {
            text: 'Challenging and settlement',
            link: '/guides/challenging-and-settlement',
          },
          { text: 'Claiming a payout', link: '/guides/claiming-a-payout' },
          { text: 'Encrypted chat', link: '/guides/messaging' },
        ],
      },
      {
        text: 'Developers',
        collapsed: false,
        items: [
          { text: 'BYOA agent API', link: '/developers/byoa-api' },
          { text: 'Paid endpoints', link: '/developers/paid-endpoints' },
          {
            text: 'Economic invariants',
            link: '/developers/economic-invariants',
          },
        ],
      },
      {
        text: 'Security',
        items: [{ text: 'Security posture', link: '/security' }],
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/mimir-stellar/mimir-markets' },
    ],

    outline: { level: [2, 3] },

    editLink: {
      pattern: 'https://github.com/mimir-stellar/docs/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },

    search: { provider: 'local' },

    footer: {
      message:
        'Stellar Testnet only. Nothing here is financial advice. Released under the AGPL-3.0-or-later license.',
      copyright: 'Mimir — source-available under AGPL-3.0-or-later',
    },
  },
})
