# Encrypted chat

Mimir includes optional end-to-end encrypted chat between the two sides of a
claim, built on the **XMTP Browser SDK**. It is feature-flagged and off by default.

The intent is narrow: the two people with money on opposite sides of the same
question can talk to each other, before or after settlement. That is it.

## Where chat appears

| Surface | What it is |
| --- | --- |
| Claim detail page | A DM panel between the creator and the challenger |
| Messages hub | A list of your claims that have an active chat thread |

The **Messages** entry in the navigation only appears when the feature flag is on.

## Who can chat

The rules are deliberately restrictive:

- Your connected wallet must be **either the creator or the challenger** of that
  claim.
- The claim must be in an **accepted 1v1 state** — both sides funded, with exactly
  **one** challenger.
- Multi-challenger markets have no chat. A pool with dozens of challengers is not a
  DM.
- Sample or demo claims have no real conversations; the panel is hidden or shows a
  notice instead.

Conversations are **1:1 DMs** between the two addresses of the claim. There are no
group threads.

## The one deliberate non-Stellar exception in Mimir

This is worth calling out explicitly, because the rest of Mimir is Stellar-shaped
throughout.

XMTP's own auth handshake requires a **protocol-level signing identity that is not
Stellar-shaped**. It cannot be satisfied by your `G…` Stellar account or by your
connected wallet. So Mimir maintains a separate internal signing identity purely to
satisfy XMTP's handshake.

That identity:

- is **internal-only** and never surfaced to you,
- **never touches a Mimir contract**,
- **never touches any trading path**,
- exists solely to complete XMTP's authentication.

It is the single allowlisted exception in the repository's own architecture
guardrail, for exactly that reason. Nothing about your funds, stakes or payouts
depends on it.

## What is encrypted, and what is not

- **Message content is end-to-end encrypted** by XMTP. Mimir's servers do not hold
  your messages.
- **Everything on the ledger stays public.** Stakes, verdicts, evidence hashes,
  payouts and payments are on a public blockchain and always will be. Chat does not
  make any of that private.

Treat the chat as a side channel between two counterparties, not as a
confidentiality layer over your positions.

## Consent and spam

XMTP has a consent model, and Mimir uses it. When a DM exists in an unknown consent
state, the thread is moved to *allowed* before syncing, so a legitimate
counterparty's messages appear. Global sync is limited to allowed conversations.

## Behaviour you will notice

| Behaviour | Detail |
| --- | --- |
| **Optimistic send** | Your message bubble appears immediately. When the network stream returns the same message, the pending row is replaced rather than duplicated. On failure the pending row is removed and an error appears below the input |
| **Refresh on focus** | Returning to the tab triggers a throttled re-sync |
| **Manual refresh** | A refresh button re-syncs the thread |
| **Rate limits** | XMTP enforces its own rate limits; the panel classifies and surfaces them rather than failing silently |

## Error states

The client distinguishes four cases, so the UI can say something useful:

| Error | Meaning |
| --- | --- |
| `peer_unreachable` | The other side has no XMTP inbox yet, so no conversation can be created |
| `rate_limit` | XMTP throttled the request; back off and retry |
| `network` | Transport failure |
| `unknown` | Anything else — retry is offered |

## Chat status lifecycle

| Status | Meaning |
| --- | --- |
| `disabled` | The feature flag is off; the client is never created |
| `idle` | Feature is on but no wallet is connected |
| `initializing` | Client creation in progress — may prompt a signature to register the XMTP inbox |
| `ready` | Conversations and streams are available |
| `error` | Initialisation failed; a retry is offered |

## Is chat required?

No. It is entirely optional and off by default. Every market function — creating,
challenging, settling, claiming — works without it. If the flag is off, the panel
and the navigation entry simply do not render.

## Read next

- [Challenging and settlement](/guides/challenging-and-settlement)
- [Architecture overview](/architecture/overview)
