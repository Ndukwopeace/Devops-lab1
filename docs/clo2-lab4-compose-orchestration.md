# CLO2 Lab 4 — Docker Compose Multi-Service Orchestration

**Course:** SWE 320 — Production-Grade Containerization & Multi-Container Orchestration  
**Environment:** Docker Engine with Colima on macOS  
**Date:** 22 November 2026  
**Status:** Six-service stack and all four application health endpoints verified.

## Objective

Orchestrate and validate the frontend, three application APIs, and two databases using Docker Compose.

## Observed Compose state

Command: `docker compose ps -a`

| Service | Image | Port | Observed state |
|---|---|---|---|
| frontend | locally built frontend | 3000 (published) | Up (healthy) |
| node-api | `local/node-api:dev` | 3001 (published) | Up (healthy) |
| python-api | locally built Python API | 8000 (published) | Up (healthy) |
| java-api | locally built Java API | 8080 (published) | Up (healthy) |
| postgres | `postgres:16.4-alpine` | 5432 (internal) | Up (healthy) |
| mysql | `mysql:8.4.2` | 3306 (internal) | Up (healthy) |

All six containers were healthy at inspection. Database ports were not shown as host-published.

## HTTP validation

Commands: `curl -i` or `curl -sS -o /dev/null -w 'HTTP %{http_code}\n'` against localhost service ports.

| Service | Endpoint | Observed response |
|---|---|---|
| frontend | `http://localhost:3000/health` | HTTP 200 |
| node-api | `http://localhost:3001/health` | HTTP 200 |
| python-api | `http://localhost:8000/health` | HTTP 200 |
| java-api | `http://localhost:8080/actuator/health` | HTTP 200; `{"status":"UP"}` |

The Java API returned HTTP 404 at `/health`; this was an incorrect endpoint, **not an application failure**. Docker's Java health-check configuration uses `/actuator/health`. Its Spring Boot 3.3.3 startup logs show Tomcat listening on port 8080 and a successful MySQL connection via HikariCP.

## Dependency and version verification

- `docker compose config` for node-api showed `depends_on: postgres: condition: service_healthy`.
- `docker compose exec -T node-api node -p "require('express/package.json').version"` returned **4.22.3**, confirming that the running Compose service includes the remediated Node dependency version.
- The earlier independent Node candidate image also returned HTTP 200 on `/health`, using PostgreSQL through the Compose network.

## Outcome and limits

- [x] Six services running and healthy simultaneously.
- [x] Four application HTTP health endpoints return HTTP 200.
- [x] Java actuator health response explicitly reports UP.
- [x] Node API dependency update verified inside running Compose container.
- [x] PostgreSQL and MySQL healthy.
- [ ] Deliberate dependency-failure and recovery test not yet performed; this belongs to Lab 5.
- [ ] No claim is made here about load, performance, failover, or automatic restart under every failure mode.

**Result:** Multi-container orchestration and endpoint-level operational checks passed.
