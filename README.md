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
