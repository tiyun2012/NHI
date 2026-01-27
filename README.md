
<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1R_AQ66zRRBOWE85hDwA_QoNoqCgfu0ym

## 🚨 Troubleshooting Installation

If you encounter `ETIMEDOUT` errors with `npm install` related to `packages.applied-caas-gateway1...`:
1. The `package-lock.json` has been reset to fix this.
2. Simply run `npm install` again.

## Run Locally

**Prerequisites:**  Node.js

1. Install dependencies:
    ```bash
    npm install
    ```

2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key

3. Start the dev server:
    ```bash
    npm run dev
    ```

4. View the app:
    Open the printed URL (defaults to http://localhost:5173) in your browser.


## Local (recommended for Open Project)

Run locally so folder picking works reliably:

```bash
npm install
npm run dev:local
```

Then open `http://localhost:3000` in Chrome/Edge.

To expose on LAN (folder picker may not work unless HTTPS):

```bash
npm run dev:lan
```
