# Tron Wallet Portal

This folder contains frontend (index.html) and backend (server.js) for the tron wallet automation.

## To run locally

1. Copy `env.sample` to `.env` and set your keys. For app access control, set:
   - `ADMIN_ID=` (or your chosen ID)
   - `ADMIN_PWD=` (or your chosen password)

2. Install dependencies (if not done): `npm install`

3. Start the backend (it serves both the API and the web app):

```
cd backend && node server.js
```

4. Open **http://localhost:4100** in your browser. You will be prompted to sign in with your ID and password before using the app.

## Vercel

- The `api/` folder contains serverless functions for Vercel (transfer, eth-transfer, bsc-transfer, pol-transfer). Deploy as usual; set env vars (including `ADMIN_ID`, `ADMIN_PWD` if you add auth to serverless) in the Vercel dashboard.
- Local dev with Vercel CLI: `vercel dev --port 4000`
- **Auth (login)**: When you run the **Express backend** (`cd backend && node server.js` on port 4100), the app and API are protected by ID/password. For Vercel deployment, the same env vars can be used; add serverless login/check-auth in `api/` if you want protection on Vercel too.
