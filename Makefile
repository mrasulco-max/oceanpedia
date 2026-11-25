.PHONY: dev up down db-migrate db-seed api-test api-run web-dev mobile-run lint

up:            ## Jalankan semua (postgres, api, web) dengan Docker
	docker compose up --build

down:
	docker compose down

db-migrate:    ## Terapkan migrasi ke DATABASE_URL
	cd api && go run ./cmd/api migrate

db-seed:       ## Isi data contoh (development)
	psql "$$DATABASE_URL" -f db/seed/dev_seed.sql

api-test:
	cd api && go vet ./... && go test ./...

api-run:
	cd api && go run ./cmd/api

web-dev:
	cd web && npm install && npm run dev

mobile-run:    ## Jalankan app Flutter (API prod by default)
	cd mobile && flutter pub get && flutter run

lint:
	cd api && go vet ./...
	cd web && npm run lint && npm run typecheck
	cd mobile && flutter analyze
