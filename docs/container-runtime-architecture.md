# CLO1 Lab 1: Container Runtime Architecture and Inspection

**Course:** SWE 320, Infrastructure as Code & Container Management  
**Module:** CLO1, Container Runtime Architecture and OCI Mechanics  
**Lab:** 01, Observe the container runtime  
**Inspection date:** 20 November 2026  
**Environment:** macOS Intel host, Docker context `colima`, Ubuntu Linux VM

## Objective

Identify Docker's runtime components, inspect a running container's Linux process and isolation mechanisms, and explain the distinction between an OCI image and a container instance.

## 1. Verified environment

| Component | Observed value |
| --- | --- |
| Git | 2.51.1 |
| Docker CLI | 29.6.1 (darwin/amd64) |
| Docker Engine | 29.5.2 (linux/amd64) |
| Docker Compose | 5.5.0 |
| containerd | 2.2.4 |
| runc | 1.3.5 |
| Docker context | colima |
| Linux VM | Ubuntu 24.04.4 LTS |
| Kernel | 6.8.0-117-generic |
| Cgroup version / driver | v2 / cgroupfs |
| Storage driver | overlayfs |
| Default OCI runtime | runc |
| VM resources | 2 CPUs, 5.781 GiB RAM |

Docker's Linux processes run in the Colima VM, not directly in the macOS kernel. Therefore, `ps`, `lsns`, and `/proc` observations below were made after `colima ssh`.

## 2. Commands and observed container

Commands executed on the macOS host:

```sh
git --version
docker version
docker compose version
docker info
docker ps -a
CID=$(docker run -d nginx:alpine)
docker inspect "$CID"
docker top "$CID"
docker logs "$CID"
```

Observed Nginx instance:

| Property | Observed value |
| --- | --- |
| Image | nginx:alpine |
| Container ID | b15939bfe5a3b6bb2d9a6e793b57c77088f409972408a057cc4eb722176a6913 |
| Container name | intelligent_antonelli |
| State at initial inspection | running |
| Initial VM host PID | 2091451 |
| Entrypoint | /docker-entrypoint.sh |
| Command | nginx -g 'daemon off;' |
| Container runtime | runc |
| Network | bridge |
| Container IPv4 address | 172.17.0.2 |
| Exposed port | 80/tcp, **not published to host** |
| Storage | overlayfs snapshotter |
| OCI manifest media type | application/vnd.oci.image.manifest.v1+json |
| Privileged mode | false |
| AppArmor profile | docker-default |
| Root filesystem read-only | false |
| Configured memory limit | 0 (no explicit limit in HostConfig) |

`docker top` showed a master process at PID 2091451 and two workers at PIDs 2091511 and 2091512. `docker logs` showed initialization, configuration completion, and Nginx worker startup without an observed startup error. This does **not** independently prove HTTP readiness, since no HTTP request was captured.

## 3. Linux namespace and cgroup evidence

Executed inside the Colima VM:

```sh
ps -fp 2091451
sudo lsns -p 2091451
cat /proc/2091451/cgroup
sudo ls -l /proc/2091451/ns/pid
sudo readlink /proc/2091451/ns/pid
```

`ps -fp` identified `nginx: master process nginx -g daemon off;` as PID 2091451, parent PID 2091426, user root.

`lsns` reported:

| Namespace | Namespace inode | Observation |
| --- | --- | --- |
| user | 4026531837 | Shared with VM's init process in observed output |
| mnt | 4026532486 | Container mount view |
| uts | 4026532487 | Container hostname/domain view |
| ipc | 4026532488 | IPC view |
| pid | 4026532489 | Container PID view |
| cgroup | 4026532490 | Cgroup namespace view |
| net | 4026532491 | Container networking view |
| time | 4026532549 | Time namespace view |

The namespace entries identify the process's memberships. A separate comparison with VM init namespace links would strengthen claims about which ones are private. The user namespace is visibly shared with init according to the `lsns` output.

Cgroup output:

```text
0::/docker/b15939bfe5a3b6bb2d9a6e793b57c77088f409972408a057cc4eb722176a6913
```

This locates the container in the unified cgroup v2 hierarchy. It identifies membership; it does **not** by itself prove that a particular CPU or memory limit is active.

The PID namespace link was verified as:

```text
/proc/2091451/ns/pid -> pid:[4026532489]
```

An initial unprivileged `readlink` returned no text. Re-running with `sudo` confirmed the link and matched the `lsns` PID namespace inode.

## 4. Container lifecycle experiment

Executed from the macOS host:

```sh
CID=b15939bfe5a3
docker inspect -f 'Before: {{.State.Status}} PID={{.State.Pid}}' "$CID"
docker stop "$CID"
docker inspect -f 'Stopped: {{.State.Status}} PID={{.State.Pid}}' "$CID"
docker start "$CID"
docker inspect -f 'Restarted: {{.State.Status}} PID={{.State.Pid}}' "$CID"
```

Observed:

```text
Before: running PID=2091451
Stopped: exited PID=0
Restarted: running PID=2095017
```

**Interpretation:** The same container identity persisted across stop/start, while the Linux main process terminated and was replaced with a new PID. Stopping a container does not delete its image or container configuration.

## 5. Conceptual runtime architecture

```text
macOS host
  |
  +-- Docker CLI (context: colima)
        |
        v
    Colima Linux VM (Ubuntu, Linux kernel 6.8)
        |
        v
    Docker Engine / daemon
        |
        v
    containerd (container lifecycle management)
        |
        v
    runc (OCI runtime implementation)
        |
        v
    Nginx container process (Linux PID, namespaces, cgroups)
        |
        +-- mount namespace + overlayfs filesystem
        +-- PID namespace + worker processes
        +-- network namespace + bridge networking
        +-- cgroup v2 resource accounting / possible limits
```

This is a conceptual architecture; it does not claim that every internal runtime call was traced.

## 6. Answers to Lab 1 questions

1. **Which host process corresponds to the container's main process?** Nginx master, PID 2091451 in the Colima Linux VM at initial inspection. This is not a macOS process PID.
2. **Which namespaces can be identified?** user, mount, UTS, IPC, PID, cgroup, network, and time. PID namespace inode 4026532489 was independently confirmed via `readlink`.
3. **What does cgroup information reveal?** Membership under `/docker/<container-id>` in cgroup v2; the path alone does not show effective resource limits.
4. **What configuration does `docker inspect` return?** State and PID, image and OCI manifest, entrypoint/command, runtime, environment, networking, port configuration, storage driver, mounts, privileges, and resource settings.
5. **What changes when stopped and restarted?** State goes from running to exited to running; PID changes from 2091451 to 0 to 2095017. The container ID stays the same.

**Image versus container:** `nginx:alpine` is the reusable image template, including image metadata and filesystem layers. `b15939bfe5a3...` is one created container instance with its own identity, configuration, writable layer, and changing process state.

## 7. Acceptance evidence and remaining actions

- [x] Docker and runtime versions inspected.
- [x] Container created, inspected, and logs checked.
- [x] Main process and worker processes identified.
- [x] Namespaces and cgroup membership inspected.
- [x] Container stop/restart state and PID changes demonstrated.
- [x] Image versus container explained.
- [x] Runtime architecture documented.
- [ ] Attach or commit raw terminal output files/screenshots if the lecturer requires them.
- [ ] Optional: verify an HTTP response from a correctly published Nginx port.

**Evidence provenance:** This report transcribes terminal outputs supplied during the lab session. It does not claim the GitHub CI runner independently executed the commands or that the full six-service application was tested in this lab. The later CLO1 labs remain separate acceptance gates.
