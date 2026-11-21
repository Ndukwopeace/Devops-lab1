# CLO2 Lab 1 — Container Optimization Baseline Report

**Course:** SWE 320 — Production-Grade Containerization & Multi-Container Orchestration  
**Project:** Secure and Reproducible Microservices Application  
**Repository:** Ndukwopeace/Devops-lab1  
**Environment:** Docker Engine with Colima on macOS  
**Status:** Baseline inspection complete; no Dockerfiles modified in this lab.

## 1. Objective and method

Inspect the four existing application Dockerfiles, image sizes, layers, build context exclusions and baseline build performance before attempting optimization. This is a baseline of **already multi-stage, non-root** images, not a claim that the original images were single-stage or root-running.

Commands used:

```sh
find . -name Dockerfile -type f
find . -name .dockerignore -type f
docker image ls --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}"
docker image inspect IMAGE --format 'Size: {{.Size}} bytes'
docker history --no-trunc=false IMAGE
time docker compose build
docker system df
```

## 2. Existing Dockerfile inspection

| Service | Dockerfile | Build/dependency stage | Final runtime base | Runtime identity | Port / command |
|---|---|---|---|---|---|
| Nuxt frontend | `frontend/Dockerfile` | `node:22.9.0-alpine3.20`, `npm ci`, `npm run build` | `node:22.9.0-alpine3.20` | `node` | 3000; `node .output/server/index.mjs` |
| Python API | `services/python-api/Dockerfile` | `python:3.12.5-slim`, pip installs under `/install` | `python:3.12.5-slim` | `app` (UID 10001) | 8000; Gunicorn `wsgi:app` |
| Java API | `services/java-api/Dockerfile` | `eclipse-temurin:21.0.4_7-jdk-alpine`, Maven wrapper dependency fetch and package | `eclipse-temurin:21.0.4_7-jre-alpine` | `app` (UID 10001) | 8080; `java -jar app.jar` |
| Node API | `services/node-api/Dockerfile` | `node:22.9.0-alpine3.20`, `npm ci --omit=dev` | `node:22.9.0-alpine3.20` | `node` | 3001; `node src/server.js` |

All four Dockerfiles have **two stages**, copy dependency manifests before frequently changing source files, and select non-root runtime users. No explicit OS package installation is present in the project Dockerfiles; base images supply their own packages. Java already excludes the JDK from its final stage. Frontend copies only Nuxt `.output`; Node API copies production dependencies; Python copies installed dependencies and source.

## 3. Initial image sizes

Two Docker commands produced different size metrics. Preserve the command provenance; **do not compare one metric against another when computing optimization percentages**.

| Service | `docker image ls` (reported MB) | `docker image inspect .Size` (bytes) |
|---|---:|---:|
| Frontend | 218 MB | 53,997,983 |
| Python API | 215 MB | 53,230,174 |
| Node API | 222 MB | 54,300,624 |
| Java API | 312 MB | 90,099,194 |

Java is largest in both reports. The difference between the two sets of figures has **not been independently reconciled**; inspect data and CLI listing may reflect different image accounting or compression representations in this Docker environment. Subsequent optimization comparisons must use the same command and measurement basis before and after.

## 4. Image layer analysis

Significant `docker history` entries (history layer sizes, not total image sizes):

| Service | Largest relevant layers observed | Interpretation |
|---|---|---|
| Frontend | Node base-image runtime layer ~148 MB; Nuxt `.output` COPY 2.52 MB; base package layer 5.7 MB | Base runtime dominates application output |
| Python API | Base Python runtime layer 37.7 MB; copied Python dependencies 21.4 MB; base rootfs 85.2 MB | Dependency set and Python runtime are optimization candidates |
| Node API | Node base-image runtime layer ~148 MB; production `node_modules` 5.51 MB; base package layer 5.7 MB | Runtime dominates small production dependencies |
| Java API | Java runtime base layer 165 MB; copied JAR 26 MB; base package layer 21.7 MB | Runtime is largest; application JAR is also material |

`docker history` includes inherited base-image layers and reports their historical layer sizes. These numbers are not summed to infer the current `docker inspect .Size` metric.

## 5. Build context analysis

All four services have `.dockerignore` files.

- **Frontend:** excludes `node_modules`, `.nuxt`, `.output`, `reports`, `tests`, `.env`, `.env.*`, `.git`, `Dockerfile`, `.dockerignore`.
- **Python API:** excludes `.venv`, `__pycache__`, `*.pyc`, `.pytest_cache`, `reports`, `tests`, `.env`, `.env.*`, `.git`, `Dockerfile`, `.dockerignore`.
- **Node API:** excludes `node_modules`, `reports`, `tests`, `.env`, `.env.*`, `.git`, `Dockerfile`, `.dockerignore`.
- **Java API:** excludes `target`, `.idea`, `.env`, `.env.*`, `.git`, `Dockerfile`, `.dockerignore`.

Exclusions already avoid common local dependencies, build outputs and environment files. Potential further improvements must be justified by the actual build context. A `.dockerignore` is not a substitute for secret management.

## 6. Initial build duration and caching evidence

Command: `time docker compose build`.

- **Wall-clock time:** **31.181 seconds** (shell `total`).
- **BuildKit progress summary:** `Building 26.3s (60/60) FINISHED`; the displayed timings differ because the progress view and shell wall-clock timer measure different spans.
- **Outcome:** All four images built successfully.
- **Cache condition:** This was a **warm/cached build**, not a cold build. Logs marked `npm ci`, `npm run build`, pip install, Maven dependency fetch, Maven package, and most COPY operations as `CACHED`. One Node API source COPY step executed instead of using cache.
- **Interpretation:** Manifest-first COPY instructions enable dependency cache reuse when source files change. The observed 31.181 seconds includes image export, metadata/provenance resolution and other overhead; it must not be presented as an uncached compile time.

### Docker-wide storage snapshot

`docker system df` reported:

| Category | Total | Active | Size | Reclaimable |
|---|---:|---:|---:|---:|
| Images | 45 | 26 | 12.95 GB | 3.005 GB (23%) |
| Containers | 45 | 8 | 132.4 MB | 131.3 MB (99%) |
| Local volumes | 9 | 7 | 1.111 GB | 48.72 MB (4%) |
| Build cache | 58 | 0 | 1.877 GB | 1.652 GB |

These are **Docker-wide** figures, not storage attributable solely to this project. No cleanup or volume removal was performed.

## 7. Identified optimization opportunities

1. **Java runtime:** Evaluate a smaller compatible Java runtime (for example a measured `jlink` build), maintaining required modules, certificates, health checks and application functionality. Current final stage already uses a JRE rather than a JDK.
2. **Node runtimes:** Compare the current official Node Alpine runtime against compatible smaller runtime options. Verify Nuxt and Node API execution, native dependency compatibility and security before adoption.
3. **Python dependencies:** Audit `requirements.txt` and the 21.4 MB installed dependency layer for unused packages and runtime-only requirements; retain necessary native libraries and Gunicorn functionality.
4. **Build context:** Audit remaining service-specific files for accidental inclusion; retain required source and dependency manifests.
5. **Caching:** Keep manifest-first dependency installation and measure a genuinely cold build separately if required; do not confuse cache-hit timing with cold-build performance.

These are **candidates for evaluation**, not verified size reductions. Changes belong in subsequent labs and must be benchmarked against the baseline with consistent metrics.

## 8. Lab questions

1. **Largest image:** Java API (`312 MB` in `docker image ls`; `90,099,194` bytes in `docker image inspect`).
2. **Unnecessary development tools:** No final Dockerfile intentionally includes a full build toolchain. Java builds with a JDK but runs on a JRE; Node and Python final stages may still inherit tools from official runtime images. Specific unnecessary packages require inspection before asserting removal.
3. **Largest layers:** Java runtime base (~165 MB), Node runtime base (~148 MB), and Python base rootfs (~85.2 MB) are prominent inherited layers; Java app JAR is 26 MB and Python dependency copy is 21.4 MB.
4. **Why copy dependencies first?** Docker can reuse dependency installation layers when source changes but dependency manifests do not, reducing rebuild time.
5. **Image layer vs writable layer:** Image layers are read-only filesystem content used to instantiate containers. A running container gets its own writable layer for changes made at runtime; that writable layer is not part of the immutable image and is normally discarded when the container is removed. Persistent database data should live in volumes.

## 9. Acceptance gate

- [x] All four application Dockerfiles inspected.
- [x] Initial image sizes recorded with command provenance.
- [x] Image layer composition analyzed.
- [x] At least three optimization opportunities identified.
- [x] Existing application images build successfully.
- [x] Initial **cached** build duration recorded.
- [x] Build context exclusions reviewed.
- [ ] Additional cold-build timing, if desired, has not been measured.
- [ ] Consistent size-metric reconciliation remains a recommended follow-up before calculating savings.

**Result:** CLO2 Lab 1 baseline report complete. Next: CLO2 Lab 2, evaluate and improve multi-stage production Dockerfiles without discarding already-correct multi-stage or non-root configuration.
