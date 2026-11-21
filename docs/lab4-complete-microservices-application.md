# SWE 320 — CLO1 Lab 4: Run the Complete Microservices Application

**Course:** SWE 320 — Infrastructure as Code & Container Management  
**Lab:** 04 — Complete microservices application  
**Date of execution:** 21 November 2026  
**Repository:** [Ndukwopeace/Devops-lab1](https://github.com/Ndukwopeace/Devops-lab1)  
**Environment:** Intel macOS host, Docker Engine running in a Colima Linux VM

## 1. Objective

Build and run a six-service microservices application using Docker Compose; inspect service health, internal networking and resource consumption; verify HTTP APIs and database connectivity; demonstrate persistent data across application restart and database container recreation; and diagnose a service failure using container logs.

## 2. Application architecture

```text
                    Browser / macOS host
                            |
                       localhost:3000
                            |
                     Nuxt frontend
                            |
             +--------------+--------------+
             |              |              |
       python-api:8000 node-api:3001 java-api:8080
             |              |              |
             +------+-------+              |
                    |                      |
              postgres:5432            mysql:3306
                    |                      |
              postgres-data            mysql-data
               named volume            named volume

All six services use the Compose-managed bridge network
`microservices-app_default`.
```

| Service | Technology / image | Published host port | Internal dependency | Health endpoint / probe |
| --- | --- | --- | --- | --- |
| `frontend` | Nuxt / `local/frontend:dev` | 3000 | Three APIs | `GET /health` |
| `python-api` | Flask/Gunicorn / `local/python-api:dev` | 8000 | PostgreSQL | `GET /health` |
| `node-api` | Express / `local/node-api:dev` | 3001 | PostgreSQL | `GET /health` |
| `java-api` | Spring Boot / `local/java-api:dev` | 8080 | MySQL | `GET /actuator/health` |
| `postgres` | `postgres:16.4-alpine` | Not published | Named volume | `pg_isready` |
| `mysql` | `mysql:8.4.2` | Not published | Named volume | MySQL `SELECT 1` |

Database services are accessible to application containers by Compose service name and internal port. They do not need published host ports. `localhost` inside one container refers to that container, not to its peers.

## 3. Configuration and build

A local `.env` was created from `.env.example`; `.env` is ignored by Git. Actual credentials are deliberately omitted from this report.

```sh
cp .env.example .env
docker compose config -q
docker compose build
docker compose up -d
docker compose ps -a
```

**Observed results:** `docker compose config -q` completed successfully; `docker compose build` built all four application images (reported completion approximately 793 seconds); the two database containers and four application containers initially started and reported healthy. The Compose project created the default network and two named volumes.

## 4. Endpoint and database verification

```sh
curl -i http://localhost:8000/health
curl -i http://localhost:3001/health
curl -i http://localhost:8080/actuator/health
curl -i http://localhost:3000/health
```

| Check | Observed evidence |
| --- | --- |
| Python API | HTTP 200, `{"status":"ok"}` |
| Node API | HTTP 200, `{"status":"ok"}` (confirmed again after recovery) |
| Java API | HTTP 200, `{"status":"UP"}` |
| PostgreSQL | `pg_isready` reported accepting connections |
| MySQL | Compose health reported healthy; logs showed ready for connections |
| Frontend | Compose health reported healthy; separate HTTP response body not captured in the provided evidence |

The Node API's `/health` implementation invokes `repo.ping()`, which runs `SELECT 1` against PostgreSQL. It returns HTTP 200 on success and HTTP 503 on database failure. The Compose health check requests this endpoint every 10 seconds. This is a dependency-aware readiness-style check. Java startup logs showed the Hikari connection pool successfully opening a MySQL connection.

## 5. Data persistence experiment

A test record was created through the Python API:

```sh
curl -i -X POST http://localhost:8000/items \
  -H 'Content-Type: application/json' \
  -d '{"name":"lab4-persistence-test"}'
curl -i http://localhost:8000/items
```

**Observed:** POST returned HTTP 201 with `{"id":1,"name":"lab4-persistence-test"}`; GET returned HTTP 200 with the same record.

### 5.1 Application container restart

```sh
docker compose restart python-api
curl -i http://localhost:8000/items
```

**Observed:** The original record remained available after restarting the Python API.

### 5.2 Database container recreation

```sh
docker compose up -d --no-deps --force-recreate postgres
docker compose ps postgres
curl -i http://localhost:8000/items
```

**Observed:** PostgreSQL returned to healthy status and the original record remained available. This demonstrates persistence across database container recreation using the named volume, not the database container's writable layer.

### 5.3 Volume inspection

```sh
docker volume inspect microservices-app_postgres-data
```

Observed volume properties:

| Property | Value |
| --- | --- |
| Name | `microservices-app_postgres-data` |
| Driver | `local` |
| Scope | `local` |
| Mountpoint | `/var/lib/docker/volumes/microservices-app_postgres-data/_data` |

The mountpoint is within the Colima Linux VM, not a native macOS directory. The MySQL service separately uses `microservices-app_mysql-data`. MySQL persistence was configured but was not independently demonstrated by a create/read/recreate test in the captured evidence.

**Data safety:** `docker compose down -v` would remove the Compose-managed named volumes; it was not used.

## 6. Networking inspection

```sh
docker network inspect microservices-app_default
```

| Property | Observed value |
| --- | --- |
| Network | `microservices-app_default` |
| Driver | `bridge` |
| IPv4 subnet | `172.22.0.0/16` |
| Gateway | `172.22.0.1` |
| PostgreSQL | `172.22.0.2` |
| MySQL | `172.22.0.3` |
| Python API | `172.22.0.5` |
| Java API | `172.22.0.6` |
| Frontend | `172.22.0.7` |

**Finding:** The Node API was absent from this particular network inspection because its process had exited. Container IP addresses are runtime-assigned and should not be hard-coded; application connections use service DNS names such as `postgres` and `mysql`.

## 7. Resource inspection

```sh
docker stats --no-stream
```

One observed snapshot (not an average):

| Container | CPU | Memory |
| --- | ---: | ---: |
| PostgreSQL | 9.30% | 19.02 MiB |
| MySQL | 4.37% | 446.1 MiB |
| Python API | 0.04% | 45.62 MiB |
| Java API | 1.57% | 165 MiB |
| Frontend | 0.00% | 22.24 MiB |

The Docker VM reported a 5.781 GiB memory limit in the snapshot. The Node API was not in this snapshot because it had exited. Other unrelated containers also appeared in `docker stats`; they are excluded from the table.

## 8. Failure investigation and recovery

After PostgreSQL was force-recreated, `docker compose ps -a` showed `microservices-app-node-api-1` in state **Exited (1)** while PostgreSQL was healthy. The Node API was therefore absent from the network inspection and resource snapshot.

Investigation commands:

```sh
docker compose ps -a
docker compose logs --tail=50 node-api
docker compose logs node-api 2>&1 | grep -iE -B 5 -A 8 'error|fatal|ECONN|timeout|terminated'
```

Relevant log excerpts:

```text
error: terminating connection due to administrator command
code: '57P01'
Unhandled 'error' event
Emitted 'error' event on BoundPool instance
```

**Diagnosis:** PostgreSQL terminated an existing connection during recreation. The Node PostgreSQL connection pool emitted an unhandled error event, which terminated the Node.js process. This is a runtime resilience issue rather than a failure of the named-volume persistence mechanism.

Recovery commands:

```sh
docker compose restart node-api
docker compose ps node-api
curl -i http://localhost:3001/health
```

**Observed:** The Node API returned to **Up (healthy)** and `/health` returned HTTP 200 with `{"status":"ok"}` on repeated checks.

**Recommended follow-up (not implemented in this lab):** Add an appropriate `pg` pool `error` event handler, retry transient database operations safely, and evaluate a suitable process restart policy. Health-check failure alone does not automatically restart a running unhealthy container. A pool error listener prevents this specific unhandled idle-client error, but does not by itself retry queries.

## 9. Acceptance checklist

- [x] Compose configuration validated.
- [x] Four application images built.
- [x] Six services initially started and were healthy.
- [x] Python, Node and Java API health endpoints returned successful responses.
- [x] PostgreSQL and MySQL reported healthy.
- [x] API create/read operation verified against PostgreSQL.
- [x] Data persisted after application container restart.
- [x] Data persisted after PostgreSQL container recreation.
- [x] Docker network and named volume inspected.
- [x] Resource consumption inspected.
- [x] Node API failure diagnosed and manually recovered.
- [ ] Optional: capture a direct frontend HTTP response or browser screenshot for submission.
- [ ] Optional: demonstrate MySQL data persistence with a separate write/read test.
- [ ] Optional: capture fresh `docker compose ps -a` after Node recovery to show all six services healthy simultaneously.

## 10. Conclusion

The six-service application was built and deployed successfully with Docker Compose. Health probes, internal service discovery, persistent storage, API operations, and resource inspection were demonstrated. The persistence test established that PostgreSQL data survives both application restart and database container recreation. A controlled PostgreSQL recreation exposed an unhandled connection-pool error in the Node API; logs identified the cause, and a manual restart restored service. This is a documented improvement opportunity for production resilience, not evidence of data loss.

**Evidence provenance:** This report is based on the repository's Compose and application configuration and terminal outputs captured during the lab. It does not claim that optional checks or recommended code changes were completed.