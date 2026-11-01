# Targets mirror the CI jobs: validate -> test -> build (package).
COMPONENTS := frontend python-api node-api java-api

.PHONY: validate test build up down logs

.env:
	cp .env.example .env

validate: .env
	docker compose config -q

test:
	./scripts/ci/test-all.sh

build:
	for c in $(COMPONENTS); do ./scripts/ci/build-component.sh $$c || exit 1; done

up: .env
	docker compose up -d --build --wait

down:
	docker compose down

logs:
	docker compose logs -f --tail=100
