.PHONY: all build build-sandboxes up down clean logs

all: build build-sandboxes up

build:
	docker compose build

build-sandboxes:
	docker compose -f docker-compose.build.yml build

up:
	docker compose up -d
	@echo "Waiting for services to be healthy..."
	@docker compose exec -T unleash sh -c 'until wget -qO- http://localhost:4242/unleash/health 2>/dev/null; do sleep 2; done'
	@echo ""
	@echo "Workbench ready at http://localhost:8080"

down:
	docker compose down

clean:
	docker compose down -v --rmi local
	docker compose -f docker-compose.build.yml down --rmi local 2>/dev/null || true

logs:
	docker compose logs -f

logs-%:
	docker compose logs -f $*
