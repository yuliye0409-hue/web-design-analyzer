# Deploy the analyzer

The GitHub Pages workflow publishes a static preview only. The Pages UI can fall back to a local service at `http://127.0.0.1:4173/api/analyze` when you run `npm start`; this is useful for personal use. To let all visitors run real browser analysis, deploy this repository as one Docker web service so the same origin serves the UI and `/api/analyze`.

## Run with Docker Compose

Install Docker Engine or Docker Desktop, then run from the repository root:

```sh
docker compose up --build
```

Open `http://localhost:4173`. The first image build downloads the pinned Playwright browser image and can take several minutes.

## Deploy to a container host

1. Connect this repository to a host that supports Docker images, long-running Node.js processes, Chromium, and at least 1 GB shared memory for the browser container.
2. Set the Dockerfile as the build method and deploy the repository root. The service reads `PORT` from the host and binds to `0.0.0.0` in production.
3. Configure the host health-check path as `/healthz` if it does not use the Docker `HEALTHCHECK` instruction.
4. Keep the UI and API on the same origin. The frontend already calls the relative path `/api/analyze`.
5. Check the deployment logs, then open the service URL and run an analysis against a public page that does not require sign-in.

The runtime image pins Playwright 1.64.1 to match `pnpm-lock.yaml`; the browser binary and Node package must stay on the same Playwright release. Do not change the image tag independently of the locked package.

The upstream Playwright image is intended for testing/development and is not recommended for visiting untrusted websites. Review the [Playwright Docker security guidance](https://playwright.dev/docs/docker) before exposing this crawler publicly; use an isolated runtime, browser sandbox/seccomp support, and outbound network restrictions. This scaffold adds basic request limits but is not a substitute for those controls.

## Public-service limits

The API is public and does not require an AI-provider key. It has in-memory per-client limits (`RATE_LIMIT`, `RATE_WINDOW_MS`) and a bounded analysis concurrency (`MAX_CONCURRENT_ANALYSES`). These limits reset when the service restarts and are per instance. For a busy multi-instance deployment, use a shared rate-limit store, authentication or CAPTCHA, and a job queue. Configure `TRUST_PROXY_HOPS` only to match the hosting provider's trusted reverse-proxy chain; never trust arbitrary forwarded headers on a directly exposed server.

The analyzer rejects private and local target addresses and rechecks browser requests. A public service still needs host-level outbound network controls, monitoring, and an abuse response process. Do not expose it as an unrestricted production scraper without reviewing those controls.

## Existing GitHub Pages URL

GitHub Pages will continue to serve a static preview and cannot execute the API. To make analysis work for visitors, publish the container service and share its URL (or point a custom domain at it). Keeping the Pages URL as the main UI would require a separate API origin plus CORS and frontend API-base configuration, so the single-origin container deployment is the default path.
