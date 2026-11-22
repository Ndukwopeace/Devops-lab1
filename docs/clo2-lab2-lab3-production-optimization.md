# CLO2 Labs 2–3 — Production Dockerfile and Image Optimization Evidence

**Course:** SWE 320 — Production-Grade Containerization & Multi-Container Orchestration  
**Project:** Secure and Reproducible Microservices Application  
**Environment:** macOS / Colima / Linux amd64  
**Date:** 22 November 2026  
**Status:** Node.js service validated; all four existing application Dockerfiles previously inspected.

## Lab 2 — Multi-stage production Dockerfiles

### Existing implementation
All four application Dockerfiles already use multi-stage builds and non-root users; see [Lab 1 baseline](container-optimization-report.md).

| Service | Build / dependency stage | Runtime stage | Runtime user |
|---|---|---|---|
| Nuxt frontend | Node 22 Alpine; `npm ci`, `npm run build` | Node 22 Alpine; copies Nuxt `.output` | `node` |
| Python API | Python 3.12 slim; pip installs dependencies to `/install` | Python 3.12 slim; copies installed dependencies and application | UID 10001 |
| Node API | Node 22 Alpine; `npm ci --omit=dev` | Node 22 Alpine; copies production `node_modules` and source | UID 1000 (`node`) |
| Java API | Eclipse Temurin 21 JDK Alpine; Maven build | Eclipse Temurin 21 JRE Alpine; copies application JAR | UID 10001 |

**Decision:** Retain sound existing multi-stage designs rather than rewrite Dockerfiles without measured evidence. Perform a targeted production-dependency security upgrade for the Node API.

### Node.js security remediation
Initial `npm audit --omit=dev` identified **five vulnerabilities** (one low, one moderate, three high) in the installed dependency tree associated with Express 4.21.0 and packages including `body-parser`, `cookie`, `path-to-regexp`, and `qs`.

Executed:
```sh
cd services/node-api
npm install express@4.22.3 --save-exact
npm audit --omit=dev
cd ../..
bash scripts/ci/test-component.sh node-api
```
Results:
- Express pinned to **4.22.3** in `package.json` and lockfile.
- `npm audit --omit=dev`: **0 vulnerabilities** (at time of test).
- Node API tests: **6 passed, 0 failed**, including real PostgreSQL integration test against disposable `app_test` database.
- Direct `npm test` without required `TEST_DB_*` configuration fails by design; `scripts/ci/test-component.sh node-api` provisions a disposable PostgreSQL instance with the required environment and removes it on exit.
- Dependency upgrade committed as `c68be03` (full commit: `c68be03553ffabebad6c0b4c37448fd81221d173`).

### Runtime image verification
Built separately from the original:
```sh
docker build -t local/node-api:optimized ./services/node-api
docker run --rm --entrypoint node local/node-api:optimized \
  -e "console.log('Express:', require('express/package.json').version); console.log('UID:', process.getuid())"
```
Observed: Express **4.22.3**, UID **1000**, build succeeded.

Ran the candidate on the Compose network with its existing PostgreSQL service and localhost port 3002; `GET http://localhost:3002/health` returned **HTTP 200** with JSON `{"status":"ok"}`. The temporary test container was stopped afterward; no persistent database volumes were removed. The existing Compose service image remains `local/node-api:dev`, so this was **a separately validated candidate**, not evidence that the Compose stack itself was upgraded.

Python runtime was independently verified: Python 3.12.5, Gunicorn present, non-root UID 10001, and `GET http://localhost:8000/health` returned HTTP 200 with PostgreSQL healthy. Installed Python site-packages measured about 27 MB; Python standard library directory measured approximately 48 MB **including** site-packages (not additive).

## Lab 3 — Build caching, size and security

### Before/after measured image size
**Identical command and metric:** `docker image inspect IMAGE --format '{{.Size}} bytes'`.

| Image | Size (bytes) |
|---|---:|
| `local/node-api:dev` | 54,300,677 |
| `local/node-api:optimized` | 54,342,171 |
| **Difference (optimized − original)** | **+41,494 (+0.0764%)** |

The candidate is **slightly larger**, not a size-reduction success. The upgrade is retained because the security audit improved from 5 findings to 0 with passing tests and health verification. Initial Lab 1's Node value of 54,300,624 bytes was a separate snapshot; this direct comparison uses the concurrently measured 54,300,677-byte baseline.

### Cache evidence
Candidate build command: `docker build -t local/node-api:optimized ./services/node-api`. BuildKit output: **55.3 seconds** end-to-end. `WORKDIR /app` was `CACHED`; `COPY package.json package-lock.json` and `RUN npm ci --omit=dev` reran because dependency manifests changed. The dependency install step took **35.5 seconds**. A previously measured **31.181-second warm/cached** four-service `docker compose build` is recorded in the Lab 1 report. These are *different build scopes* and must **not** be compared as a controlled speedup or slowdown.

### Security and operational controls
- Multi-stage builds keep build-only artifacts out of final images.
- Node runtime executes with UID 1000; Python UID 10001; Java UID 10001; frontend uses `node`.
- Node image installs production dependencies only: `npm ci --omit=dev`.
- Service-specific `.dockerignore` files exclude local artifacts, test reports and environment files from build context.
- Node dependency advisory count decreased from five to zero after controlled update.
- The health check confirms a functional HTTP endpoint in the candidate container connected to PostgreSQL.
- Docker Compose config shows `node-api` depends on `postgres` with `condition: service_healthy`; it does not guarantee ongoing availability after startup.
- The printed Compose configuration exposed an example database password. Keep real credentials in protected secrets/configuration; rotate if used outside the lab.

## Acceptance summary
- [x] Inspect original four multi-stage production Dockerfiles.
- [x] Verify non-root runtime users.
- [x] Record build caching observations and distinguish cached vs rebuilt layers.
- [x] Measure image size consistently before and after Node dependency update.
- [x] Audit production dependencies and remediate reported advisories.
- [x] Run six Node tests with disposable PostgreSQL.
- [x] Build an updated production image.
- [x] Validate updated image's Express version, UID, and HTTP 200 health endpoint.
- [ ] Formal cold-versus-warm rebuild timing of the *same* build scope not measured.
- [ ] Full Compose stack smoke test and failure-recovery validation belong to Labs 4–5.

**Conclusion:** Existing Dockerfiles already satisfy the main production multi-stage and least-privilege patterns. The targeted Node security remediation was tested and pushed; image-size increase is transparently recorded, and no unsupported size-saving claim is made.
