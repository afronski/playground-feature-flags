# Architecture Decision Records

Decisions are appended chronologically. Each entry is numbered and
immutable once written — superseded decisions get a new entry, not an edit.

---

## ADR-001: Single PostgreSQL database with schema-per-service isolation

**Context:** Multiple services (Unleash now, potentially example apps later)
need a relational database. We could run one Postgres instance per service
or share a single instance.

**Decision:** One PostgreSQL 15 instance, one database (`workbench`), one
schema per service. Unleash gets the `unleash` schema owned by a dedicated
`unleash_user`. The root `workbench` superuser exists for admin tasks and
for bootstrapping new schemas in the future.

**Consequences:** Lower resource usage. Schema isolation provides adequate
security for a local workshop. Future services add a schema + user in
`postgres/init.sql` without touching Unleash's namespace.

---

## ADR-002: Layered Docker Compose files (run vs. build)

**Context:** Codapi sandbox images must be pre-built before the Codapi
server can use them, but sandbox containers are not long-running services.

**Decision:** Two compose files: `docker-compose.yml` for runtime services,
`docker-compose.build.yml` for building sandbox images. The Makefile
orchestrates the order: `build-sandboxes` before `up`.

**Consequences:** `docker compose up` never tries to start sandbox
containers as services. Build and run concerns are separated. Adding a new
sandbox means adding it to the build compose file and to Codapi's config.

---

## ADR-003: Nginx as the single entry point (port 8080)

**Context:** The browser needs to reach the workshop site, Unleash, Codapi,
the Express API, and the impression bus WebSocket. Multiple ports create
CORS and mixed-content issues.

**Decision:** Nginx reverse proxy on port 8080. All services are
same-origin from the browser's perspective. Paths: `/` (site),
`/unleash/` (Unleash), `/codapi/` (Codapi), `/app/` (Express API),
`/ws/impressions` (WebSocket).

**Consequences:** Zero CORS configuration needed. WebSocket upgrade must be
explicitly configured in Nginx for the `/ws/impressions` path.

---

## ADR-004: Static Astro build over SSR

**Context:** The workshop site could be server-rendered or statically built.

**Decision:** Static build at Docker image build time. No runtime Node
server for the site — served by Nginx.

**Consequences:** Faster page loads, simpler deployment. Content changes
require a rebuild. Acceptable since content is authored, not dynamic.

---

## ADR-005: npm workspaces for the monorepo

**Context:** Multiple packages need to share code (types, components).

**Decision:** npm workspaces. No Turborepo, Lerna, or other monorepo tools.

**Consequences:** Simple, zero extra dependencies. `@workbench/instruments`
is importable by the workshop site via `workspace:*`. Limited to what npm
workspaces can do — sufficient for this project.

---

## ADR-006: Empty Unleash — reader creates everything

**Context:** We could seed Unleash with flags and tokens, or leave it empty.

**Decision:** No seed container. The reader creates projects, flags, and
tokens as part of the learning journey.

**Consequences:** Chapters 2-3 guide the reader through Unleash setup. The
Secret Vault component bridges the manually-created token to the code
execution environment.

---

## ADR-007: Content lives outside services

**Context:** Where do MDX chapters and the example Express app live?

**Decision:** Top-level `content/` directory: `content/chapters/` for MDX,
`content/examples/express-api/` for the lens target. These are referenced
by services but are not services themselves.

**Consequences:** Clean separation of concerns. The Starlight Dockerfile
copies chapters into its content directory at build time. The Express app
Dockerfile builds from `content/examples/express-api/`.

---

## ADR-008: Codapi template injection via client-side JavaScript

**Context:** Codapi sandboxes need the user's Unleash API token to connect
to Unleash. The token is stored in the browser's sessionStorage (via Secret
Vault). Codapi's JS client does not support passing custom HTTP headers, and
the Codapi server has no mechanism to map headers to environment variables.

**Decision:** Build the template dynamically in the ReplCell's client-side
script. The script reads the token from sessionStorage and injects it as a
string literal into the template code, which is written into a
`<script type="text/plain">` DOM element. Codapi-snippet reads this element
when the user clicks Run.

**Consequences:** The token never touches the server until it's embedded in
the code that runs inside the sandbox. Template content is regenerated when
the token changes. No server-side configuration needed.

---

## ADR-009: Express-api token persistence via file

**Context:** The express-api needs the user's Unleash token to evaluate
flags. The token is pushed from the browser via `PUT /app/api/token`. But
nodemon restarts the process when lens fragments are applied, clearing
in-memory state.

**Decision:** Persist the token to `/tmp/.unleash-token` inside the
container. On startup, the server reads this file first, then falls back to
the `UNLEASH_API_TOKEN` environment variable.

**Consequences:** Token survives nodemon-triggered restarts. Token is lost
on container recreation (`docker compose down`), which is acceptable since
the user re-enters it via the Secret Vault.

---

## ADR-010: Lens fragments via HTTP, not shared Docker volumes

**Context:** The lens sandbox needs to write edited fragments to the
express-api's source directory. Originally this used a shared Docker volume,
but Codapi only supports a single `volume` field in `box.json`.

**Decision:** The lens sandbox uses `curl` to PUT the fragment content to
the express-api's `/api/fragments/:name` endpoint. The express-api writes
the file and nodemon detects the change.

**Consequences:** No shared volume needed between codapi and express-api.
The lens sandbox image includes `curl`. The express-api exposes GET/PUT
endpoints for fragment management.
