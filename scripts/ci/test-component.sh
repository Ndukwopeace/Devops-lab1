#!/usr/bin/env bash
# Usage: test-component.sh <frontend|python-api|node-api|java-api>
# Runs the component's unit and integration tests and returns their exit code.
# Used by both `make test` and the CI workflow.
set -euo pipefail

COMPONENTS="frontend python-api node-api java-api"
POSTGRES_IMAGE="postgres:16.4-alpine"
MYSQL_IMAGE="mysql:8.4.2"

component="${1:-}"
case "$component" in
  frontend|python-api|node-api|java-api) ;;
  *)
    echo "usage: $0 <${COMPONENTS// /|}>" >&2
    exit 2
    ;;
esac

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
db_container=""

cleanup() {
  if [ -n "$db_container" ]; then
    docker rm -f "$db_container" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

# Provide a disposable database for the integration test.
# In CI the workflow's `services:` container is used (TEST_<DB>_PORT is set).
# Locally a throwaway container is started: no volume, no password, bound to
# 127.0.0.1 on a random port, removed on exit. No credentials are involved.
use_test_db() {
  local kind="$1" image port_in_container user prefix
  case "$kind" in
    postgres) image="$POSTGRES_IMAGE"; port_in_container=5432; user=postgres; prefix=TEST_POSTGRES ;;
    mysql)    image="$MYSQL_IMAGE";    port_in_container=3306; user=root;     prefix=TEST_MYSQL ;;
  esac
  local host_var="${prefix}_HOST" port_var="${prefix}_PORT"

  if [ -z "${!port_var:-}" ]; then
    command -v docker >/dev/null || { echo "docker is required to start the test database" >&2; exit 1; }
    db_container="test-db-${kind}-$$"
    if [ "$kind" = postgres ]; then
      docker run -d --rm --name "$db_container" -p "127.0.0.1::${port_in_container}" \
        --tmpfs /var/lib/postgresql/data \
        -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=app_test "$image" >/dev/null
    else
      docker run -d --rm --name "$db_container" -p "127.0.0.1::${port_in_container}" \
        --tmpfs /var/lib/mysql \
        -e MYSQL_ALLOW_EMPTY_PASSWORD=yes -e MYSQL_DATABASE=app_test "$image" >/dev/null
    fi
    # Probe over TCP: the image's init phase only listens on a socket.
    local ready=""
    for _ in $(seq 1 90); do
      if [ "$kind" = postgres ]; then
        docker exec "$db_container" pg_isready -q -h 127.0.0.1 -U postgres -d app_test && ready=1
      else
        docker exec "$db_container" mysqladmin ping -h 127.0.0.1 -u root --silent && ready=1
      fi
      [ -n "$ready" ] && break
      sleep 1
    done
    [ -n "$ready" ] || { echo "test database did not become ready" >&2; exit 1; }
    export "$port_var=$(docker port "$db_container" "${port_in_container}/tcp" | head -n1 | sed 's/.*://')"
    export "$host_var=127.0.0.1"
  fi

  export TEST_DB_HOST="${!host_var:-127.0.0.1}"
  export TEST_DB_PORT="${!port_var}"
  export TEST_DB_NAME=app_test
  export TEST_DB_USER="$user"
}

# A run that executed zero tests is a failure, whatever the tool's exit code was.
assert_tests_ran() {
  local count
  count="$(cat "$@" 2>/dev/null | grep -o '<testcase' | wc -l | tr -d ' ')"
  if [ "${count:-0}" -eq 0 ]; then
    echo "FAIL: no tests were executed for $component (no <testcase> in reports)" >&2
    exit 1
  fi
  echo "$component: $count test case(s) recorded"
}

case "$component" in
  frontend)
    cd "$root/frontend"
    rm -rf reports
    [ -d node_modules ] || npm ci
    npm run lint
    npm test
    assert_tests_ran reports/*.xml
    ;;
  python-api)
    cd "$root/services/python-api"
    rm -rf reports
    mkdir reports
    # CI already has a configured Python; locally use an isolated venv.
    if [ -z "${VIRTUAL_ENV:-}" ] && [ "${CI:-}" != "true" ]; then
      [ -d .venv ] || python3 -m venv .venv
      # shellcheck disable=SC1091
      . .venv/bin/activate
    fi
    pip install --quiet -r requirements-dev.txt
    use_test_db postgres
    python -m pytest --junitxml=reports/junit.xml
    assert_tests_ran reports/*.xml
    ;;
  node-api)
    cd "$root/services/node-api"
    rm -rf reports
    [ -d node_modules ] || npm ci
    use_test_db postgres
    npm test
    assert_tests_ran reports/*.xml
    ;;
  java-api)
    cd "$root/services/java-api"
    rm -rf target/surefire-reports target/failsafe-reports
    use_test_db mysql
    ./mvnw -B -ntp verify
    assert_tests_ran target/surefire-reports/*.xml target/failsafe-reports/*.xml
    ;;
esac
