SHELL := /usr/bin/env bash
.SHELLFLAGS := -eu -o pipefail -c
.DEFAULT_GOAL := help

IMAGE_NAME ?= ghcr.io/no42-org/coolmodfiles
IMAGE_TAG  ?= rc

ENV_FILE_ARG := $(if $(wildcard .env),--env-file .env,)
LIBRARY_MOUNT_ARG := $(if $(wildcard ./mods),-v $(CURDIR)/mods:/library:ro -e LIBRARY_ROOT=/library,)

.PHONY: help install lint audit build test verify format format-check image run clean

help: ## Show this help
	@awk 'BEGIN {FS=":.*?## "} /^[a-zA-Z_-]+:.*?## /{printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Install dependencies (clean install from lockfile)
	npm ci

lint: install ## Run ESLint
	npm run lint

audit: install ## Run npm audit (fails on high or critical)
	npm audit --audit-level=high

build: install ## Build the Next.js app
	npm run build

test: install ## Run Vitest test suite
	npm test

verify: install ## Run lint + audit + build (fail-fast)
	npm run lint
	npm audit --audit-level=high
	npm run build

format: ## Format all files with Prettier
	npm run format

format-check: ## Check that all files are Prettier-formatted
	npm run format:check

image: ## Build the Docker image
	docker build -t $(IMAGE_NAME):$(IMAGE_TAG) .

run: ## Run the image locally on port 3000 (uses .env and ./mods if present)
	docker run --rm -p 3000:3000 $(ENV_FILE_ARG) $(LIBRARY_MOUNT_ARG) $(IMAGE_NAME):$(IMAGE_TAG)

clean: ## Remove build artifacts
	rm -rf .next node_modules
