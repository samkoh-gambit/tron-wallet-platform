# Tron Wallet Portal

This folder contains frontend (index.html) and backend (main.js) for the tron wallet automation.

## To run locally

Backend:

```
node main.js
```

Frontend:

```
http-server
```

Backend is running on http://localhost:3012
Frontend is running on http://localhost:8080

---

## Deploying to Vercel

1. **Move your frontend to `public/`**

   - Create a folder called `public` and move `index.html` (and any static assets) into it.

2. **Convert your backend to a Vercel serverless function**

   - Create a folder called `api`.
   - Move your backend logic into `api/transfer.js` (see below for template).

3. **Update your frontend**

   - Change API calls from `http://localhost:3012/transfer-trx` and `http://localhost:3012/transfer-trc20` to `/api/transfer`.
   - Add a `type` field to the payload to distinguish between TRX and TRC20 transfers.

4. **Set environment variables**

   - In the Vercel dashboard, add `TRON_WALLET_PRIVATE_KEY`.

5. **Deploy**
   - Install Vercel CLI: `npm i -g vercel`
   - Run `vercel` and follow the prompts.

---

### Example `api/transfer.js` template

```js
import { TronWeb } from "tronweb";

const fullNode = "https://api.shasta.trongrid.io";
const solidityNode = "https://api.shasta.trongrid.io";
const eventServer = "https://api.shasta.trongrid.io";
const privateKey = process.env.TRON_WALLET_PRIVATE_KEY;
const tronWeb = new TronWeb(fullNode, solidityNode, eventServer, privateKey);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { recipients, amounts, tokenAddress, type } = req.body;

  if (!recipients || !amounts || recipients.length !== amounts.length) {
    res.status(400).json({ error: "Invalid recipient/amount data" });
    return;
  }

  try {
    if (type === "trc20") {
      // ... (TRC20 logic)
    } else {
      // ... (TRX logic)
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
```
