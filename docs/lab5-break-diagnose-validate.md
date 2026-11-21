# CLO1 Lab 5 — Break, Diagnose and Validate

**Course:** SWE 320 — Infrastructure as Code & Container Management  
**Repository:** Ndukwopeace/Devops-lab1  
**Environment:** macOS with Docker Engine 29.6.1 running through Colima Linux VM  
**Application:** Docker Compose microservices stack (frontend, python-api, node-api, java-api, postgres, mysql)  
**Evidence date:** 21 November 2026 (terminal log timestamps)

## Objective

Use controlled fault injection and runtime inspection to diagnose application failure, database readiness, resource controls, and container isolation. Each exercise records the **observed symptom, diagnostic evidence, root cause or explanation, and corrective action**.

> Safety: Tests used reversible stops and a disposable resource-test container. Named database volumes were not deleted.

## Exercise A — Non-database application process failure

### Procedure

```sh
docker compose ps
curl -i http://localhost:8000/health
docker compose stop python-api
docker compose ps -a python-api
curl -i --max-time 5 http://localhost:8000/health
docker compose logs --tail=20 python-api
docker compose start python-api
docker compose ps python-api postgres
curl -i http://localhost:8000/health
curl -s http://localhost:8000/items
```

- **Observed symptom:** After stopping `python-api`, its HTTP endpoint on port 8000 was unreachable; curl reported connection failure (error 7).
- **Diagnostic evidence:** Container showed `Exited (0)`. Gunicorn logged `Handling signal: term`, worker exit, and master shutdown. This was a graceful stop, **not** an unexpected crash.
- **Root cause:** Deliberate `docker compose stop python-api` sent a termination signal to the application container.
- **Corrective action and verification:** `docker compose start python-api` restored the service. `GET /health` returned HTTP 200 with `{"status":"ok"}`; `GET /items` returned the previously stored `lab4-persistence-test` record. The container briefly reported `health: starting` during startup.

**Finding:** An application container can be stopped and recovered without deleting database data. Its lifecycle is distinct from the PostgreSQL service lifecycle.

## Exercise B — PostgreSQL database readiness failure

### Procedure

```sh
docker compose stop postgres
docker compose ps -a python-api postgres
curl -i --max-time 5 http://localhost:8000/health
docker compose logs --tail=30 python-api
docker compose start postgres
docker compose ps postgres python-api
curl -i http://localhost:8000/health
docker compose ps postgres python-api
curl -s http://localhost:8000/items
```

- **Observed symptom:** Python API remained running but returned **HTTP 503 Service Unavailable** with `{"status":"unavailable"}`.
- **Diagnostic evidence:** PostgreSQL showed `Exited (0)` while Python initially appeared `Up ... (healthy)`. Python's `/health` handler called `repo.ping()`, which raised `psycopg.OperationalError: [Errno -2] Name or service not known` during database connection resolution. After restarting PostgreSQL, the database initially showed `health: starting` and Python temporarily showed `unhealthy`.
- **Root cause:** Intentionally stopping PostgreSQL made its service endpoint unavailable; the API's database-backed health check could not connect. The initial healthy Docker status lagged the failure because health checks run periodically.
- **Corrective action and verification:** `docker compose start postgres`. Subsequently PostgreSQL and Python both reported `healthy`; Python `GET /health` returned HTTP 200 `{"status":"ok"}` without restarting the Python container. `GET /items` returned `[{"id":1,"name":"lab4-persistence-test"}]`.

**Finding:** Process liveness and application readiness are different. An API can remain running yet correctly report HTTP 503 when its database dependency is unavailable. Health-status reporting may lag the current endpoint behavior.

## Exercise C — CPU and memory limits

### Procedure

```sh
docker run -d --name lab5-resource-test --cpus="0.5" --memory="128m" alpine:3.20 sh -c 'while true; do :; done'
docker inspect lab5-resource-test --format 'CPU quota: {{.HostConfig.CpuQuota}}
CPU period: {{.HostConfig.CpuPeriod}}
Nano CPUs: {{.HostConfig.NanoCpus}}
Memory limit: {{.HostConfig.Memory}} bytes'
docker stats --no-stream lab5-resource-test
docker exec lab5-resource-test sh -c 'cat /sys/fs/cgroup/cpu.max; cat /sys/fs/cgroup/memory.max'
docker stop lab5-resource-test
docker rm lab5-resource-test
docker ps -a --filter name=lab5-resource-test
```

### Recorded evidence

| Measurement | Observed value |
|---|---|
| Docker NanoCpus | `500000000` |
| Docker CpuQuota / CpuPeriod fields | `0` / `0` (the limit was specified using NanoCpus) |
| Docker memory limit | `134217728` bytes = 128 MiB |
| One `docker stats` CPU sample | `67.71%` |
| One `docker stats` memory sample | `360KiB / 128MiB`, `0.27%` |
| Effective cgroup v2 `cpu.max` | `50000 100000` |
| Effective cgroup v2 `memory.max` | `134217728` |
| Container process count in sample | `1` |

- **Observed symptom / workload behavior:** Busy-loop container generated CPU activity while consuming very little memory. A single CPU sample showed 67.71%, above the nominal 50% CPU quota.
- **Diagnostic evidence:** Docker configuration and cgroup v2 both confirmed a half-CPU limit (`50000/100000 = 0.5`) and 128 MiB memory limit. The 67.71% value is one sampled observation, **not evidence that the sustained CPU limit was bypassed**; no longer-term CPU measurement was recorded.
- **Root cause / explanation:** Linux cgroups enforce resource controls. Configured ceilings do not represent guaranteed or preallocated consumption. Sampled CPU metrics can fluctuate over measurement intervals.
- **Corrective action:** No fault required correction. The disposable test container was stopped and removed; the final filtered `docker ps -a` output showed no matching container.

**Finding:** A memory limit is a maximum, not an exclusive reservation of 128 MiB of host RAM. CPU quota and momentary reported utilization are distinct measurements.

## Exercise D — Isolation investigation

### Process view

```sh
docker compose exec python-api ps aux
docker top microservices-app-python-api-1
docker inspect microservices-app-python-api-1 --format 'Container PID: {{.State.Pid}}'
docker compose exec python-api sh -c 'echo "Container PID: $$"; cat /proc/1/status | head -n 8'
```

- **Observed symptom:** `docker compose exec python-api ps aux` failed because the application image did not contain the `ps` executable. This was a missing diagnostic utility, not a container-runtime failure.
- **Diagnostic evidence:** `docker top` showed Gunicorn master PID `2282093` and worker PID `2282256` from the Linux VM host's view, both UID `10001`. Docker inspect also reported host-side PID `2282093`. Inside the container, `/proc/1/status` identified `gunicorn` with `Pid: 1` and `PPid: 0`. The temporary exec shell printed `$$ = 1078`, which is the shell's own container PID, **not** Gunicorn's.
- **Root cause / explanation:** PID namespaces present different process-number views. Minimal images may omit tools such as `ps`.
- **Corrective action:** Used `docker top` and `/proc/1/status` instead of installing extra packages into the application image.

### Namespace and filesystem view

```sh
docker compose exec python-api ls -l /proc/self/ns
docker compose exec python-api sh -c 'pwd; ls /; cat /proc/self/mountinfo | head -n 5'
```

Observed namespace links included:

| Namespace | Identifier |
|---|---|
| PID | `pid:[4026532688]` |
| Mount | `mnt:[4026532685]` |
| Network | `net:[4026532690]` |
| IPC | `ipc:[4026532687]` |
| UTS | `uts:[4026532686]` |
| Cgroup | `cgroup:[4026532689]` |
| User | `user:[4026531837]` |

Working directory was `/app`. Root filesystem mount information showed `overlay` with lower, upper and work directories under containerd snapshotter storage. `/proc` used procfs, `/dev` used tmpfs, and `/sys` was mounted read-only.

**Interpretation:** Mount and PID namespaces provide container-specific views; OverlayFS supports a layered root filesystem. The presence of a user-namespace link alone does not prove that a separate user namespace or user remapping is enabled.

### Network and security view

```sh
docker inspect microservices-app-python-api-1 --format '{{json .NetworkSettings.Networks}}'
docker compose exec python-api cat /etc/resolv.conf
docker inspect microservices-app-python-api-1 --format 'Privileged: {{.HostConfig.Privileged}}
User: {{.Config.User}}
PID mode: {{.HostConfig.PidMode}}
Network mode: {{.HostConfig.NetworkMode}}'
```

| Field | Observed value |
|---|---|
| Compose network | `microservices-app_default` |
| Container IP | `172.22.0.5/16` |
| Network gateway | `172.22.0.1` |
| Docker embedded DNS | `127.0.0.11` |
| Privileged | `false` |
| Configured user | `app` |
| PID mode | empty (no explicit host PID mode) |
| Network mode | `microservices-app_default` |

- **Observed symptom / investigation focus:** Containers present distinct process, mount and network views, but they are not separate kernel instances.
- **Diagnostic evidence:** Host/container PID difference, namespace identifiers, overlay mount records, Docker network details and non-privileged configuration.
- **Root cause / explanation:** Docker relies on Linux namespaces for scoped views, cgroups for resource accounting, and kernel-backed filesystem/network mechanisms. With Colima, the relevant Linux host is the **Colima VM**, not macOS itself.
- **Corrective action / security implications:** No configuration fault was demonstrated. Maintain least privilege; avoid privileged containers, unnecessary host mounts and Docker socket exposure; restrict network access where needed; patch the shared Linux kernel and runtime. Sharing a Compose network does not imply that peers are unreachable. Namespace isolation does **not** guarantee that a compromised container cannot affect other containers.

## Overall outcome

| Exercise | Outcome |
|---|---|
| A — Application process failure | Completed: failure observed and recovery verified |
| B — Database readiness failure | Completed: HTTP 503 diagnosed and HTTP 200/data recovery verified |
| C — Resource limits | Completed: Docker and cgroup limits verified; test container removed |
| D — Container isolation | Completed: process, namespace, mount, network and security views inspected |

**Limitations of evidence:** Exercise C includes only one CPU-usage sample, so sustained throttling was not measured. Exercise D inspected namespace identifiers but did not independently compare every namespace inode against the Colima VM host or a second container. These limitations do not change the recorded command outputs.

**Next step:** Review the complete CLO1 acceptance checklist and required submission paths before beginning CLO2 Lab 1.
