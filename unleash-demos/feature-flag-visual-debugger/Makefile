.PHONY: install dev build lint test clean example-up example-down example-logs

install:
	npm install

dev:
	npx concurrently \
		"npm run dev --workspace=packages/server" \
		"npm run dev --workspace=packages/client"

build:
	npm run build --workspace=packages/client
	npm run build --workspace=packages/server

lint:
	npm run lint --workspaces --if-present

test:
	npm run test --workspaces --if-present

clean:
	rm -rf node_modules packages/*/node_modules packages/*/dist

example-up:
	docker compose -f example/docker-compose.yml up -d --build

example-down:
	docker compose -f example/docker-compose.yml down -v

example-logs:
	docker compose -f example/docker-compose.yml logs -f
