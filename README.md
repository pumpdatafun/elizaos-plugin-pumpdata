# @pumpdatafun/plugin-pumpdata

An elizaOS plugin for [pumpdata.fun](https://pumpdata.fun): pump.fun history for trading agents, read by the call.
Every pump.fun trade, ever.

- Free: yesterday on pump.fun (`/stats.json`), as an action and as a provider.
- Paid per call in USDC on Solana over [x402](https://x402.org), with the agent's own wallet. No account, no API key.

| action | call | price | answers |
|---|---|---|---|
| `PUMPDATA_STATS` | `GET /stats.json` | free | coins launched and graduated, SOL and USD volume, trades, traders for one UTC day |
| `PUMPDATA_LAUNCH` | `GET /launch/{mint}` | $0.005 | the deployer's launches and graduations, the first-10 s buyers and their share of supply, the insiders' share, curve progress, and how launches that looked the same at this age went over the next 24 h |
| `PUMPDATA_WALLETS` | `POST /wallets` | $0.01 (up to 50 wallets) | per wallet: SOL put in, SOL taken out, pnl, coins traded, first seen, and its rule label |
| `PUMPDATA_DEPLOYER` | `GET /deployer/{address}` | $0.005 | a deployer's record, its last 90 days, its newest launches, and the base rate for its next launch |
| `PUMPDATA_SIMILAR` | `GET /similar/{mint}` | $0.005 | the launches most like this one at the same age, by mint, and how each went over its next 24 h |

The provider `PUMPDATA_STATS` adds the last UTC day's numbers to the agent's context, fetched at most once an hour.

Answers are numbers and what they mean. Wallet labels (`winner`, `bot`, `supply_seller`, `new`, `none`) are rules
over the whole history, and each answer states the rule next to the label. Similar-launch outcomes are what past
launches did, not a prediction.

## Install

```bash
elizaos plugins add @pumpdatafun/plugin-pumpdata
# or
bun add @pumpdatafun/plugin-pumpdata
```

```json
{
  "name": "MyAgent",
  "plugins": ["@pumpdatafun/plugin-pumpdata"],
  "settings": {
    "secrets": {
      "SOLANA_PRIVATE_KEY": "<the agent's wallet, base58>"
    }
  }
}
```

## Settings

| setting | required | default | meaning |
|---|---|---|---|
| `SOLANA_PRIVATE_KEY` (or `WALLET_PRIVATE_KEY`) | for paid calls | none | The agent's Solana wallet, the same setting `@elizaos/plugin-solana` reads (base58, or base64). It needs USDC for the calls; it does not need SOL, since the server's facilitator pays the network fee. Used only to sign x402 payments. |
| `PUMPDATA_MAX_PRICE_USD` | no | `0.01` | The most the plugin pays for one call. An offer above it is refused and nothing is paid. |
| `PUMPDATA_API_KEY` | no | none | A free-tier key (`pdk_...`, 5 lookup calls an hour, one per mailbox, from https://pumpdata.fun/keys), sent as `x-api-key`. Past the limit the call is paid over x402. |
| `SOLANA_RPC_URL` | no | public mainnet RPC | The RPC the payment transaction is built against. |
| `PUMPDATA_BASE_URL` | no | `https://pumpdata.fun` | API base URL. |

Without a wallet the plugin still loads: the free stats answer, and each paid action answers with its price and
says nothing was paid.

## How payment works

1. The plugin sends the call unpaid. pumpdata.fun answers `402` with an x402 v2 offer in the `PAYMENT-REQUIRED`
   header: scheme `exact`, network `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` (mainnet), asset USDC
   (`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`), the amount in base units (5000 = $0.005), and a fee payer.
2. The plugin checks the offer: USDC on Solana mainnet, at or under `PUMPDATA_MAX_PRICE_USD`. Anything else is
   refused, and nothing is paid.
3. It builds the payment with the x402 reference client (`@x402/core` and `@x402/svm`, scheme `exact`): a USDC
   transfer signed by the agent's wallet, with the facilitator as fee payer. The client's own spend controls cap it
   at the same price.
4. It retries the call once with `PAYMENT-SIGNATURE`. The answer comes back with the receipt in `PAYMENT-RESPONSE`,
   which the action returns in `data.receipt`.

| result | what the action says |
|---|---|
| 200 | the answer, with `X-Data-As-Of` and the price paid |
| 402, no wallet | the price; nothing was paid |
| 402 after paying (`payment_invalid`, `payment_settle_failed`) | the payment was refused; nothing settled |
| 503 `payment_settle_uncertain` | the payment may have settled; the plugin does not pay again |
| 404 | unknown mint (a fresh launch may not be built yet); nothing charged |
| 400, 429, 5xx | malformed request, rate limit (with retry-after), or the backend failed; nothing charged |

## Calling the actions with parameters

Each action reads its input from `options` when given, else from the message text:

- `PUMPDATA_LAUNCH`: `{ mint }`
- `PUMPDATA_WALLETS`: `{ addresses: string[], mint?: string }`; from text, every address in the message is a
  wallet, except one written after the word "mint", "coin" or "token", which is sent as the mint
- `PUMPDATA_DEPLOYER`: `{ address }`
- `PUMPDATA_SIMILAR`: `{ mint, limit? }` (1 to 25)
- `PUMPDATA_STATS`: `{ day? }` (`YYYY-MM-DD`)

The client is exported for direct use:

```ts
import { PumpdataClient, createX402Payer, signerFromSecret } from '@pumpdatafun/plugin-pumpdata';

const signer = await signerFromSecret(process.env.SOLANA_PRIVATE_KEY!);
const client = new PumpdataClient({ payer: createX402Payer(signer, { maxPriceUsd: 0.01 }) });
const r = await client.launch('<mint>');
```

## Development

```bash
bun install
bun run build
bun run lint        # prettier --check and tsc --noEmit
bun run test        # unit tests, HTTP mocked, including the 402 paths
bun run test:live   # reads the free /stats.json and sends each paid call unpaid to confirm its 402 and price
```

The tests never pay and never sign a transaction against the network.

## Links

- API docs: https://pumpdata.fun/llms.txt
- Agent skill: https://pumpdata.fun/skill.md
- OpenAPI: https://pumpdata.fun/openapi.json

Not affiliated with pump.fun.

## License

MIT
