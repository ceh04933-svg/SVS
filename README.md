# Whiteout Survival Hosted Sign-Up App

This is the real shareable version: guests submit entries to a backend, and only the host can unlock the dashboard with a PIN.

## Run on your computer

1. Install Node.js 18 or newer.
2. Open this folder in a terminal.
3. Start it:

```powershell
$env:HOST_PIN='2468'
npm start
```

Open http://localhost:3000

## Deploy

Use a Node hosting service such as Render, Railway, Fly.io, or a VPS. Static-only hosts like ordinary GitHub Pages will not store guest entries.

Set these environment variables on the host:

- `HOST_PIN`: your private host PIN
- `PORT`: usually set automatically by the host
- `DATA_DIR`: optional folder for stored entries. Leave it unset for the free/simple deploy.

## Host dashboard

- Public guests submit on the main form.
- Host unlocks with the PIN.
- Host can sort, export CSV, or clear entries.

Default local PIN is `2468`. Change it with `HOST_PIN` before sharing the live site.

## Render quick deploy

This folder includes `render.yaml`. On Render, create a new Blueprint from this folder/repo and set `HOST_PIN`.

The included config is the simplest free deploy. Entries are saved on the running service, but may reset if the service restarts or redeploys. After the site works, you can add a paid persistent disk later if you need long-term storage.