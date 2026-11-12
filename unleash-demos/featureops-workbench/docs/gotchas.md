# Gotchas

Known issues, tricky behaviors, and their mitigations. Appended as
discovered during implementation.

---

## G-001: Nginx closes idle WebSocket connections after 60 seconds

**Symptom:** The lightbulb probe disconnects after ~60s of inactivity.

**Cause:** Nginx's default `proxy_read_timeout` is 60s.

**Fix:** Set `proxy_read_timeout 86400s` on the `/ws/impressions` location
block in `nginx/nginx.conf`.

---

## G-002: PostgreSQL 15 revokes CREATE on public schema by default

**Symptom:** Services that try to create tables in the `public` schema fail
with "permission denied for schema public".

**Cause:** PostgreSQL 15 changed the default privileges on the public
schema. Only the database owner can create objects in `public`.

**Fix:** We don't use the public schema at all. Each service gets its own
schema, owned by its dedicated user (see ADR-001). The `init.sql` script
creates schemas and assigns ownership before any service starts.

---

## G-003: Codapi requires Docker socket access

**Symptom:** Codapi cannot start sandbox containers.

**Cause:** Codapi needs access to the Docker daemon to spin up sandbox containers.

**Fix:** Mount `/var/run/docker.sock:/var/run/docker.sock:rw` in the
`codapi-server` service.

---

## G-004: Docker-in-Docker volume mount paths

**Symptom:** Sandbox containers start but `/sandbox/` is empty — user code
is not present.

**Cause:** Codapi writes temp files to `/tmp/XXXX` inside its own container,
then tells Docker to mount `--volume /tmp/XXXX:/sandbox`. The Docker daemon
(running on the host) resolves this path on the HOST, where it doesn't exist.

**Fix:** Set `TMPDIR=/tmp/codapi` on the codapi-server container and
bind-mount `/tmp/codapi:/tmp/codapi` so the path is identical on both the
host and inside the container.

---

## G-005: Codapi box.json only supports a single volume field

**Symptom:** Adding a `volumes` (plural) field to `box.json` is silently
ignored.

**Cause:** Codapi's box configuration only recognizes `volume` (singular)
with the `%s:/sandbox:rw` format for mounting the user code directory.

**Fix:** For sandboxes that need access to additional volumes (e.g., the
lens sandbox writing to express-api's fragments), use HTTP endpoints instead
of shared Docker volumes. The lens sandbox uses `curl` to PUT fragments to
the express-api's `/api/fragments/:name` endpoint.

---

## G-006: Codapi-snippet falls back to api.codapi.org

**Symptom:** REPL cells return "404 — Unknown sandbox or command".

**Cause:** The codapi-snippet JavaScript client ignores the `url` attribute
on individual `<codapi-snippet>` elements and falls back to the public
`https://api.codapi.org/v1/exec` unless a `<codapi-settings>` element
exists.

**Fix:** Include `<codapi-settings url="/codapi/v1"></codapi-settings>` in
the page head (via `CustomHead.astro`). Never remove this element.

---

## G-007: Codapi template HTML entity encoding

**Symptom:** Sandbox code contains literal `&quot;` instead of `"`.

**Cause:** Astro's `set:text` directive HTML-encodes content. `<script>`
elements (even `type="text/plain"`) don't decode entities, so the raw
`&quot;` is passed to esbuild.

**Fix:** Build the template dynamically in client-side JavaScript rather
than embedding it via Astro directives. The ReplCell script reads the token
from sessionStorage and constructs the full template at runtime.

---

## G-008: tsx runs CJS by default — no top-level await

**Symptom:** `Top-level await is currently not supported with the "cjs"
output format`.

**Cause:** `tsx` defaults to CommonJS output, which doesn't support
top-level `await`.

**Fix:** Wrap the template code in an async IIFE: `(async () => { ... })();`

---

## G-009: Starlight lobotomized owl selector breaks CodeMirror line spacing

**Symptom:** Huge gaps between lines in CodeMirror editors.

**Cause:** Starlight's `.sl-markdown-content :not(a, strong, em, ...) +
:not(...)` selector adds `margin-top: 1rem` to every `.cm-line` div.

**Fix:** Add the `not-content` class to the `.code-cell` wrapper. Starlight
excludes descendants of `.not-content` from this selector via
`:where(.not-content *)`.

---

## G-010: Express-api loses token on nodemon restart

**Symptom:** After applying a lens fragment, the express-api restarts and
returns `enabled: false` because it lost the Unleash SDK token.

**Cause:** The token was only held in memory. Nodemon restarts the process,
clearing all in-memory state.

**Fix:** Persist the token to `/tmp/.unleash-token` inside the container.
On startup, express-api reads this file first, then falls back to the
`UNLEASH_API_TOKEN` environment variable.
