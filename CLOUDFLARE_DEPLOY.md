# Cloudflare deploy

The deploy step fails because Cloudflare runs `npx wrangler deploy` with no arguments. Fix it in **one** of these ways:

---

## Option 1: Change the Deploy command (recommended)

1. Cloudflare dashboard → your project → **Settings** → **Builds & deployments**.
2. Set **Deploy command** to **exactly**:
   ```bash
   npx wrangler deploy --assets=./dist
   ```
   Or use the npm script:
   ```bash
   npm run deploy:cf
   ```
3. Keep **Build command**: `npm run build`.
4. Save and redeploy.

---

## Option 2: Do deploy inside the Build command

If you cannot change the Deploy command, run deploy from the build step and make the deploy step a no-op:

1. Set **Build command** to:
   ```bash
   npm run build && npx wrangler deploy --assets=./dist
   ```
2. Set **Deploy command** to:
   ```bash
   true
   ```
   (so the second step does nothing and does not run `npx wrangler deploy` alone).
3. Save and redeploy.
