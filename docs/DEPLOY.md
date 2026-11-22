# Deploying the demo

The Arcade demo is a static site (`npm run build:demo -w chronolog-web` writes `apps/web/dist-demo`). It has no
backend: the engine runs in the visitor's browser.

## GitHub Pages (the default)

`.github/workflows/pages.yml` builds the demo and publishes it to https://chronolog.akchhya.xyz/ on
every push to `main`. One-time setup (done 2026-11-22):

1. Repository Settings -> Pages -> Build and deployment -> Source: **GitHub Actions**.
2. At the DNS provider (Namecheap, Advanced DNS): a `CNAME` record, host `chronolog`, value `azzs11.github.io.`.
3. Settings -> Pages -> Custom domain: `chronolog.akchhya.xyz`, then **Enforce HTTPS**.

The custom domain serves the site from the root, so the build uses `VITE_BASE=/`. Without a custom domain the site
would be https://azzs11.github.io/chronolog/ and the build would need `VITE_BASE=/chronolog/`. The domain is set in
the repository settings, not by a `CNAME` file, because the site is deployed by Actions.

## Optional: Cloudflare Pages (free tier, PR previews)

1. In Cloudflare, create a Pages project named `chronolog` (direct upload, no Git integration).
2. Create an API token with the "Cloudflare Pages: Edit" permission, and note your account id.
3. In the GitHub repository settings, add two secrets: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
4. In the Pages project, add the custom domain `chronolog.akchhya.xyz` (Cloudflare creates the DNS record if the zone
   is on Cloudflare; otherwise add the CNAME it shows).

After that, every push to `main` publishes production and every pull request gets a preview URL. Without the secrets the
workflow still builds the demo and skips the upload.

## Checks that guard the demo

`ci.yml` builds the demo and fails if its JavaScript exceeds the size budget (`scripts/check-demo-size.sh`) or if
Lighthouse (mobile preset) reports accessibility under 95, best practices under 90, LCP over 3 s, blocking time over
300 ms or layout shift over 0.1 (`lighthouserc.json`).

Measured locally on 2026-11-19 (mobile preset, served with compression as Cloudflare Pages does): performance 98, accessibility 100,
best practices 100, LCP 2.1-2.3 s, layout shift 0.03. Measuring against a server that does not compress inflates LCP by
about a second, so `lighthouserc.json` starts a compressing server.
