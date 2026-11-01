# CI/CD architecture

## Components

| Component | Port | Health endpoint | Database | Image name |
| --- | --- | --- | --- | --- |
| frontend (Nuxt 3) | 3000 | `GET /health` | none | `ghcr.io/<owner>/<repo>/frontend:<sha>` |
| python-api (Flask) | 8000 | `GET /health` | PostgreSQL 16.4 | `ghcr.io/<owner>/<repo>/python-api:<sha>` |
| node-api (Express) | 3001 | `GET /health` | PostgreSQL 16.4 | `ghcr.io/<owner>/<repo>/node-api:<sha>` |
| java-api (Spring Boot 3) | 8080 | `GET /actuator/health` | MySQL 8.4.2 | `ghcr.io/<owner>/<repo>/java-api:<sha>` |

`<owner>` and `<repo>` are lowercased by the workflow. `<sha>` is `github.sha`.
Local builds are tagged `local/<component>:dev`.

## Commands

| Component | Build | Test |
| --- | --- | --- |
| frontend | `./scripts/ci/build-component.sh frontend` | `./scripts/ci/test-component.sh frontend` (eslint + vitest) |
| python-api | `./scripts/ci/build-component.sh python-api` | `./scripts/ci/test-component.sh python-api` (pytest) |
| node-api | `./scripts/ci/build-component.sh node-api` | `./scripts/ci/test-component.sh node-api` (node:test) |
| java-api | `./scripts/ci/build-component.sh java-api` | `./scripts/ci/test-component.sh java-api` (`./mvnw verify`: surefire + failsafe) |

Every test script fails when a tool exits non-zero and also when the run
recorded zero test cases.

## Environment variables (names only)

Compose, read from `.env` (template: `.env.example`):

- `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`
- `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD`

Set by compose inside the containers:

- python-api, node-api, java-api: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- frontend: `NUXT_PYTHON_API_URL`, `NUXT_NODE_API_URL`, `NUXT_JAVA_API_URL`

Tests (set by `test-component.sh` or the workflow's `services:`):

- `TEST_POSTGRES_HOST`, `TEST_POSTGRES_PORT`, `TEST_MYSQL_HOST`, `TEST_MYSQL_PORT`
- derived for the test processes: `TEST_DB_HOST`, `TEST_DB_PORT`, `TEST_DB_NAME`, `TEST_DB_USER`

Build scripts: `REGISTRY_IMAGE_PREFIX`, `GITHUB_SHA` (both optional locally).

The test databases are passwordless, disposable containers (no volume,
removed on exit), so there is no test password to leak. The integration
tests refuse to run against a database whose name does not contain `test`.

## Pipeline

Workflow: `.github/workflows/ci.yml`. Triggers: every push, every pull
request, and manual `workflow_dispatch`.

```
validate
   |
   v
test  ---- frontend | python-api | node-api | java-api   (4 parallel jobs)
   |
   v   (only if all four passed)
package ---- frontend | python-api | node-api | java-api (4 parallel jobs)
   |
   v
summary  (prints image references to the job summary)
```

| Job | Needs | Runs in parallel with |
| --- | --- | --- |
| validate | nothing | nothing |
| test (4 matrix entries) | validate | each other |
| package (4 matrix entries) | all of test | each other |
| summary | all of package | nothing |

Test matrix entries use `fail-fast: false`, so a failing component does not
cancel the other three. `package` is skipped if any test entry failed.

Images are pushed to GHCR only on pushes to `main` and on `workflow_dispatch`.
Pull requests and other branches build the image without pushing.
Only the `package` job has `packages: write`.

Pinned versions appear in more than one place (`compose.yaml`,
`scripts/ci/test-component.sh`, the `services:` block in `ci.yml`): change
the PostgreSQL and MySQL tags in all three together.
