# Deploying the demo

The Arcade demo is a static site (`npm run build:demo -w chronolog-web` writes `apps/web/dist-demo`). It has no
backend: the engine runs in the visitor's browser.

## One-time setup (Cloudflare Pages, free tier)

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
