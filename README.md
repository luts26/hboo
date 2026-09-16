# HBOO - Home Bookkeeping

A personal finance application for managing bank balances, transactions, and financial plans.

HBOO started as a personal project for working with my own financial data and gradually evolved from a simple bank balance viewer into a broader financial planning application.

## Repository Structure

```text
frontend/
    Vanilla JavaScript HBOO client

backend/
    Pure Node.js REST API

bank-service/
    Spring Boot bank integration service

docker/
    Docker / Nginx / MySQL infrastructure

compose.yaml
    DEV-only local application environment

.env.example
    DEV example environment configuration without secrets
```

## DEV Local Environment

`compose.yaml` is DEV-only. Running `docker compose up -d` from this repository
must always mean the isolated development environment with synthetic data.

Prerequisites:

- Docker
- Docker Compose
- mkcert

DEV architecture:

```text
https://dev.hboo.local
    -> hboo-dev-nginx
    -> frontend/
    -> hboo-dev-backend
    -> hboo-dev-mysql
    -> hboo_dev
    -> synthetic data only
```

The web document root is `frontend/`. Public URLs do not include `/frontend/`:

```text
https://dev.hboo.local/
https://dev.hboo.local/hbapp/index.js
https://dev.hboo.local/hbapp/assets/styles/main.css
```

Configure the DEV hostname on the development machine. `127.0.0.2` keeps DEV
ports separate from the REAL runtime on `127.0.0.1`.

```bash
sudo sh -c 'echo "127.0.0.2 dev.hboo.local" >> /etc/hosts'
```

Generate local HTTPS certificates:

```bash
mkcert -install
mkcert \
  -cert-file docker/nginx/certs/dev.hboo.local.pem \
  -key-file docker/nginx/certs/dev.hboo.local-key.pem \
  dev.hboo.local localhost 127.0.0.2
```

Start the environment:

```bash
docker compose up -d
```

Open on the development machine:

```text
https://dev.hboo.local/
```

Stop the environment:

```bash
docker compose down
```

Nginx configuration lives in `docker/nginx/conf.d/default.conf`. Local certificate instructions live in `docker/nginx/certs/README.md`; generated certificate files and private keys are ignored by Git.

The DEV Docker setup includes Nginx, the Node.js backend, and a local MySQL
service for the existing HBOO database schema.

Default DEV host bindings:

```text
dev.hboo.local -> 127.0.0.2
HTTP            -> 127.0.0.2:80
HTTPS           -> 127.0.0.2:443
Backend         -> 127.0.0.2:3000
MySQL           -> 127.0.0.2:3307
```

The MySQL service uses the persistent Docker volume `hboo-dev-mysql-data`.
`compose.yaml` always creates and uses `hboo_dev`; changing `DB_NAME` in a
repository `.env` file must not select another database.

Local database dumps are imported explicitly and must not be committed. Public development data lives in sanitized schema/migration/seed files under `docker/mysql/`.

```bash
docker compose up -d mysql
./docker/mysql/import-dump.sh docker/mysql/init/local-dev.sql
```

Additional database notes live in `docker/mysql/README.md`.

## REAL Runtime Template

REAL is a deployment target, not the development working tree. Safe templates
live under `docker/runtime-example/` and are intended to be copied manually to:

```text
~/hboo-runtime/
    real.env
    compose.real.yaml
    app/
    nginx/
    certs/
```

Do not create or store REAL credentials in this repository.

Proposed REAL architecture:

```text
https://hboo.local
    -> hboo-real-nginx
    -> ~/hboo-runtime/app/frontend
    -> hboo-real-backend
    -> host-installed MySQL
    -> real database
    -> real bank integrations
```

REAL MySQL must be host-installed MySQL, not the DEV Docker MySQL container.
For Linux Docker-to-host connectivity, the REAL template uses:

```text
extra_hosts:
  - "host.docker.internal:host-gateway"

DB_HOST=host.docker.internal
DB_PORT=3306
```

REAL host bindings in the template:

```text
hboo.local -> 127.0.0.1
HTTP       -> 127.0.0.1:80
HTTPS      -> 127.0.0.1:443
Backend    -> 127.0.0.1:3000
MySQL      -> host MySQL on 127.0.0.1:3306, reached from containers as host.docker.internal:3306
```

DEV and REAL can run simultaneously because DEV binds to `127.0.0.2` and REAL
binds to `127.0.0.1`, with separate container names, networks, volumes, and
hostnames.

## Source Isolation and Deployment

The active development repository must not be mounted directly into REAL.

```text
~/projects/hboo/
    active DEV working copy

~/hboo-runtime/app/
    clean deployed Git snapshot
```

Development flow:

```text
feature branch / working tree
    -> DEV environment
    -> test using hboo_dev synthetic data
    -> commit
    -> merge into main
    -> push main to GitHub
```

Deployment flow:

```text
GitHub/main
    -> ~/hboo-runtime/app
    -> fetch/pull clean committed revision
    -> apply reviewed DB migrations if needed
    -> rebuild/restart REAL services
    -> smoke test hboo.local
```

Git receives code from the DEVELOPMENT working repository. REAL is a deployment
target, not a source of commits. Never edit application source directly in REAL
runtime and never push from production.

## Database Migrations

Migration flow:

```text
create migration
    -> apply/test against hboo_dev
    -> commit migration with application code
    -> push
    -> backup REAL database
    -> apply reviewed migration to REAL
    -> deploy compatible application version
```

Do not execute REAL migrations from this repository. Before any allowed DEV DB
operation, verify `DATABASE()` and `CURRENT_USER()` and stop if the selected
database is not exactly `hboo_dev`.

The project focuses not only on answering:

> Where did my money go?

but also:

> How much can I safely spend today without breaking my financial plan?

The product, architecture, financial model, and original frontend implementation were designed independently from scratch.

## Screenshots

<p align="center">
  <img src="docs/screenshots/balance-desktop.png" width="90%" alt="HBOO balance dashboard">
</p>

<p align="center">
  <strong>Bank balances and financial summary</strong>
</p>

## Features

### Bank Balances

HBOO provides a unified overview of balances from multiple banking providers.

Current integrations include:

- Monobank
- PrivatBank
- aggregated total balance
- individual bank balances
- manual bank synchronization
- locally cached balance data
- Live / Cached / Offline data states

Bank synchronization is performed through explicit backend refresh operations.
Manual synchronization is available from the UI, while selected data may also
be refreshed automatically when no current data is available.

### Transactions

The Transactions module provides a unified view of transaction history from connected banks.

It supports:

- multiple banks
- date filtering
- category filtering
- transaction grouping by day
- daily totals
- income / expense summaries
- expandable transaction details
- local transaction cache
- manual synchronization

<p align="center">
  <img src="docs/screenshots/transactions-desktop.png" width="90%" alt="HBOO transactions">
</p>

### Financial Planning

Financial planning is based on a **user-defined spending budget**, not directly on the total bank balance.

For example:

```text
Current bank balance       60,000 UAH

Budget until salary        20,000 UAH
Mandatory expenses          8,000 UAH
Other planned expenses      5,000 UAH
                           ----------
Remaining budget             7,000 UAH
```

This allows HBOO to answer a more useful question than simply displaying the current account balance:

> How much of my money is actually safe to spend?

The Planning module supports:

- custom planning periods
- period budget
- planned expenses
- expense categories
- pending / completed / disabled states
- remaining budget calculation
- recommended daily spending
- amount available today

<p align="center">
  <img src="docs/screenshots/planning-desktop.png" width="90%" alt="HBOO financial planning">
</p>

## Financial Summary

Planning information is available outside the Planning page through a shared financial summary.

The summary provides quick access to:

```text
Available Today
Recommended Limit
Spent Today

Period Budget
Planned
Remaining
Days Left

Pending / Approved / Disabled plans
```

This makes the planning state part of the overall application rather than an isolated calculator.

## Local-First Data Flow

Balance and transaction data use a local-first architecture.

```text
Page / Component
        │
        ▼
      Store
      /   \
     ▼     ▼
LocalRepository   ApiService
     │                │
     ▼                ▼
Local cache         Backend
```

Previously loaded data can be displayed immediately from local storage while fresh data is requested from the backend.

If the backend is temporarily unavailable, the application can continue displaying the most recently cached financial data.

The UI receives normalized state such as:

```text
data
updatedAt
loading
source
stale
error
```

This allows pages to distinguish between Live, Cached, Updating, and Offline states without owning synchronization logic.

## Frontend Architecture

The frontend is built with **vanilla JavaScript** without React, Vue, Angular, or another frontend framework.

This was an intentional decision in the original project. I wanted to design the application architecture and understand the underlying mechanisms directly rather than relying on framework abstractions.

Over time the application developed its own lightweight application structure:

```text
HBOO
│
├── Application Core
│
├── Router
│
├── Pages
│   ├── Balance
│   ├── Transactions
│   ├── Planning
│   ├── Deposits
│   └── Settings
│
├── Components
│
├── Stores
│
├── Services
│
├── Local Repositories
│
├── API Services
│
└── Reusable UI Helpers
```

The frontend includes concepts commonly provided by application frameworks:

- routing
- pages and components
- shared application state
- lifecycle-like behavior
- centralized event delegation
- stores
- services
- repositories
- reusable UI components

## Reusable UI

Several UI elements were implemented as reusable, domain-independent building blocks rather than being tied directly to financial data.

Examples include:

- calendar / date picker
- range controls
- popup interactions
- arithmetic calculator
- navigation
- delegated event handling

The intention was to keep the application core and UI primitives reusable even if the domain or backend API changes.

## Backend Architecture

HBOO separates the main application API from external banking integrations.

```text
Browser
   │
   │ HTTPS
   ▼
Nginx
   │
   ├── Frontend
   │
   └── /api/*
         │
         ▼
    Node.js REST API
       │       │
       │       └──── Spring Bank Service
       │                  │
       │                  ├── Monobank API
       │                  └── PrivatBank API
       │
       ▼
      MySQL
```

The Node.js service is the primary backend used by the frontend. It handles authentication, application logic, financial planning, transaction normalization, and database access.

The Spring Boot service acts as a dedicated bank integration layer. It communicates with external banking APIs and synchronizes balance and transaction data.

Bank synchronization uses explicit refresh operations. Imported transactions are protected against duplicate imports by provider transaction IDs.

## From FIPL to HBOO Planning

The current Planning functionality evolved from a separate standalone experiment called **FIPL (Financial Planner)**.

FIPL was created as a rapid prototype to test period-based financial planning independently from the larger HBOO application.

```text
HBOO
Balances + Transactions
        │
        ▼
Need for forward-looking planning
        │
        ▼
FIPL
Standalone rapid prototype
        │
        ▼
Product concept validated
        │
        ▼
HBOO Planning
Structured integration
```

The successful concepts are now being redesigned around HBOO's Store / Service / Repository architecture.

## Mobile UI

HBOO is designed for both desktop and mobile usage.

<p align="center">
  <img src="docs/screenshots/balance-mobile.png" width="30%" alt="HBOO balance mobile">
  <img src="docs/screenshots/transactions-mobile.png" width="30%" alt="HBOO transactions mobile">
  <img src="docs/screenshots/planning-mobile.png" width="30%" alt="HBOO planning mobile">
</p>

The mobile interface uses compact navigation and layouts while preserving access to the same financial information and planning functionality.

## Tech Stack

### Frontend

- JavaScript
- ES Modules
- HTML
- CSS / SASS
- Local Storage
- Responsive Web Design

### Backend

The backend stack currently includes:

- Node.js
- Native `node:http`
- MySQL / mysql2
- REST API
- Java / Spring Boot bank integration service
- Monobank API
- PrivatBank API

The main backend intentionally uses Node.js without Express, NestJS, or an ORM.

### Infrastructure

- Docker
- Docker Compose
- Nginx
- HTTPS
- MySQL 8

## Product Direction

HBOO is primarily developed as a real personal finance tool rather than as a demonstration project.

The current development strategy is to use the application in real financial workflows and let practical usage determine which features should be developed next.

Potential future areas include:

- automatic matching of planned expenses with bank transactions
- savings and financial goals
- historical financial analytics
- balance history
- PWA push notifications for budget, planning, and spending alerts
- receipt scanning and structured purchase extraction
- item-level purchase and price history
- spending pattern analysis
- cash-flow forecasting
- AI-assisted transaction and purchase categorization
- AI-powered financial insights and budget optimization suggestions
- natural-language queries about personal financial data

## Project Background

HBOO was originally designed and implemented independently from scratch before I started actively using AI coding assistants.

The original architecture, frontend core, routing, components, financial model, bank integration approach, and UI were therefore developed through the normal product and engineering process rather than generated from a predefined implementation.

Current development uses AI-assisted engineering where useful, while product decisions, architecture, code review, and validation remain developer-driven.

## Status

**Active development**

HBOO continues to evolve based on real-world personal usage.
