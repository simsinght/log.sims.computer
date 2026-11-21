# Deploy: tvlog on nimbus

How the production instance runs. Network path: **Cloudflare (proxied DNS for
`tvlog.sims.computer`) → apartment public IP → router → nimbus → DSM routing →
container on port 3000**.

## The pieces

- **Image**: built from `infra/Dockerfile` (multi-stage, Next standalone
  output, `unzip` installed for the import flow, runs as the non-root `node`
  user, serves on 3000). Build for the NAS from a Mac:
  `docker buildx build --platform linux/amd64 -f infra/Dockerfile -t registry.sims.computer/tvlog:latest .`
- **Delivery**: push to `registry.sims.computer` (a registry container on
  nimbus) and `docker compose pull` on the NAS — or, registry-free,
  `docker save … | gzip` → scp → `sudo docker load`.
- **Runtime**: `infra/compose.yaml` as a **Container Manager Project** on
  nimbus, rooted at `~/tvlog/` next to a `.env` (chmod 600) holding exactly:
  `BASE_URL=https://tvlog.sims.computer`, `SESSION_SECRET`, `TMDB_API_KEY`.
  `SESSION_SECRET` (32+ chars) must be set: without it the cookie is sealed
  with a dev constant that is in the public source.
- **Durable sign-ins**: compose sets `TVLOG_DATA_DIR=/data` and mounts the
  named volume `tvlog-data` there. The image creates `/data` owned by `node`
  (uid 1000), mode 0700, and Docker seeds a new named volume with that
  ownership. A bind mount works too, but the host directory must be created
  first and `chown 1000:1000` / `chmod 700` (Docker creates a missing one as
  root, which the app can't write). The volume holds credentials — OAuth
  refresh tokens + DPoP keys (`oauth-sessions.json`), the OAuth client's
  signing key (`oauth-signing-key.json`), app-password tokens
  (`password-sessions.json`) — so keep it private and out of any shared or
  backed-up-in-the-clear folder. `GET /api/healthz` answers
  `"sessions": "durable"` when it is in use, `"memory"` when not (unset or
  unwritable; the log then says why).
  **Never set `ATP_TEST_*` in production** — their absence is what disables
  `/api/auth/test-login` and the settings "Load sample export" button.
  `restart: unless-stopped` gives start-on-boot; no Task Scheduler needed.
- **Ingress on the NAS**: either a Web Station web portal bound to the
  Container Manager project (hostname `tvlog.sims.computer` → container 3000),
  or a DSM reverse-proxy rule (`tvlog.sims.computer` → `http://localhost:3000`)
  — same pattern as `registry.sims.computer`. Two-minute GUI swap between them.

## Updating the app

1. Build + tag from the desired commit (`:latest` plus the short sha).
2. Deliver (push+pull, or save/scp/load).
3. `sudo docker compose up -d` in `~/tvlog` (recreates on new image).

Sign-ins survive restarts and redeploys as long as the `tvlog-data` volume
does (the session cookie lasts 400 days). Without `TVLOG_DATA_DIR` every
restart signs everyone out: the OAuth sessions are in memory and the signing
key is regenerated. In-flight logins (the OAuth state, ~minutes) and the TMDB
caches are in memory either way (single-process assumption; see
`docs/access-patterns.md`). Losing the volume just means signing in again.

## Gotchas learned the hard way

- Plain `ssh nimbus` gets a non-login PATH **without** `/usr/local/bin` —
  Container Manager's `docker` lives there and looks "not installed" if you
  forget. The ssh user also can't reach the docker socket; daemon operations
  need interactive `sudo`.
- DSM's sshd has SFTP disabled: every file copy must be `scp -O`.
- Synology nginx layers can ship a small `client_max_body_size` — if Trakt
  zip uploads to `/api/import` return 413, raise the body-size limit on the
  portal/reverse-proxy rule, not in the app.
- The import flow shells out to `unzip -p` at runtime — any new image recipe
  must keep `unzip` installed.
