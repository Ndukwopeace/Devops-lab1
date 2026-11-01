# microservices-app

A small starter repository for a CI/CD course lab. The app is tiny on purpose;
the pipeline is the subject. Four services (Nuxt frontend, Flask, Express and
Spring Boot APIs), PostgreSQL and MySQL, Docker Compose, and a GitHub Actions
workflow.

Requirements: Docker with Compose v2, make, and for `make test` also Node.js 22,
Python 3.12+ and a JDK 21. Test databases run in throwaway Docker containers.

## Quickstart

```bash
make up
```

`make up` copies `.env.example` to `.env` if needed (fake placeholder values),
builds the images and waits until every container is healthy.

```bash
curl localhost:8000/health            # python-api
curl localhost:3001/health            # node-api
curl localhost:8080/actuator/health   # java-api
curl localhost:3000/health            # frontend
```

Add an item and open the frontend at http://localhost:3000:

```bash
curl -X POST localhost:8000/items -H 'content-type: application/json' -d '{"name":"first"}'
```

```bash
make test
make down
```

Other targets: `make validate`, `make build`, `make logs`. They run the same
commands as the pipeline.

## The workflow

`.github/workflows/ci.yml` runs on every push, pull request and manual run.

1. **validate**: `docker compose config -q`.
2. **test**: one job per component (`fail-fast: false`) calling
   `scripts/ci/test-component.sh`. PostgreSQL and MySQL run as `services:`
   containers. JUnit XML reports are uploaded as artifacts.
3. **package**: runs only if all tests passed. Builds each image with Buildx and
   a per-component GitHub Actions cache. Pushes to GHCR only on `main` and on
   manual runs.
4. **summary**: prints the final image reference for each component.

Image names (owner and repo lowercased):

```
ghcr.io/<owner>/<repo>/frontend:<commit sha>
ghcr.io/<owner>/<repo>/python-api:<commit sha>
ghcr.io/<owner>/<repo>/node-api:<commit sha>
ghcr.io/<owner>/<repo>/java-api:<commit sha>
```

Details, ports and the dependency diagram are in
[docs/ci-cd-architecture.md](docs/ci-cd-architecture.md).

## How to demo a failing test

1. Create a branch and add a failing test to python-api:

   ```bash
   git switch -c demo-failing-test
   printf '\n\ndef test_demo_failure():\n    assert 1 == 2\n' >> services/python-api/tests/unit/test_api.py
   ```

2. See it fail locally. `make test` exits non-zero.

   ```bash
   make test
   ```

3. Push the branch. In Actions, the `python-api` test job turns red, the other
   three test jobs still finish (`fail-fast: false`), and `package` is skipped.

   ```bash
   git commit -am "demo: failing test" && git push -u origin demo-failing-test
   ```

4. Revert it: `git revert HEAD`, push, and the run goes green.
