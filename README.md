# HBOO — Home Bookkeeping

### Personal Finance & Planning

HBOO is a **local-first personal finance PWA** for bank synchronization,
transaction tracking, financial planning, and spending analytics.

It started as a personal tool for working with real financial data and
evolved into a full-stack application that combines banking
integrations, offline-first data management, financial planning, and
multi-device synchronization.

The project is designed around a practical question:

> **How much can I safely spend today without breaking my financial
> plan?**

<p align="center">
<img src="docs/screenshots/balance-desktop.png" width="90%" alt="HBOO balance dashboard">
</p>

## Highlights

- **Bank integrations** — Monobank and PrivatBank balances and
  transactions
- **Financial Planning** — budgets, planned expenses, Actual Spending,
  and safe-to-spend calculations
- **Smart Completion** — suggests bank transactions that may correspond
  to planned expenses
- **Local-first PWA** — financial data remains available without a
  network connection
- **Offline Planning** — create, edit, complete, and cancel planning
  items offline
- **Durable synchronization** — queued local changes automatically
  synchronize after reconnect
- **Multi-device conflict protection** — server revalidation prevents
  silent overwrites
- **IndexedDB persistence** — balances, transactions, categories,
  planning data, and sync state are stored locally
- **Local App Lock** — optional PIN protection for the application UI
- **Responsive UI** — desktop browser and fullscreen mobile PWA
- **Isolated environments** — separate DEV and REAL Docker environments
  with synthetic development data

## Tech Overview

``` text
Installed PWA / Browser
          │
          ▼
   Vanilla JavaScript
          │
   Stores / Services
          │
    ┌─────┴─────┐
    ▼           ▼
 IndexedDB    Node.js API
                  │
             ┌────┴────┐
             ▼         ▼
           MySQL    Spring Boot
                         │
                  ┌──────┴──────┐
                  ▼             ▼
              Monobank      PrivatBank
```

**Frontend:** Vanilla JavaScript, ES Modules, IndexedDB, Service Worker,
Web App Manifest, Web Crypto, CSS/SASS

**Backend:** Node.js using native `node:http`, REST API, MySQL

**Bank integration:** Java, Spring Boot, Monobank API, PrivatBank API

**Infrastructure:** Docker, Docker Compose, Nginx, HTTPS, MySQL 8

The main frontend and Node.js backend intentionally avoid application
frameworks. The frontend uses its own Router / Page / Store / Service /
Repository structure, while the backend is built directly on `node:http`
without Express, NestJS, or an ORM.

## Local-First Architecture

HBOO is designed so that temporary loss of the backend or internet
connection does not make the core application unusable.

``` text
App shell          → Service Worker / Cache Storage
Financial data     → IndexedDB
Planning changes   → Local state + durable sync queue
Bank refresh       → Online integration
Smart Completion   → Online enrichment
```

Previously loaded balances and transactions remain available offline,
while Planning can be modified offline and synchronized later.

Planning synchronization performs server revalidation before pushing
local changes. Independent changes can be synchronized while conflicting
modifications are stopped instead of silently overwriting data.

## Product Direction Overview

The next major area is the **Home analytics dashboard**, starting with:

- Income vs Expenses over 6- and 12-month periods
- spending by category for a selected period
- financial summary and planning context
- Plan vs Fact analytics

Future development includes receipt scanning and structured purchase
extraction, allowing transaction-level analytics to expand into
**purchase, product, store, quantity, and price-history analytics**.

------------------------------------------------------------------------

## Repository Structure

``` text
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

## Application Architecture

``` text
Browser / Installed PWA
        |
        | HTTPS
        v
      Nginx
       |
       +-- Frontend
       |     +-- Router / Pages / Components
       |     +-- Stores / Services
       |     +-- IndexedDB local repositories
       |     +-- Service Worker
       |     +-- Planning sync queue
       |
       +-- /api/*
              |
              v
        Node.js REST API
          |          |
          |          +-- Spring Bank Service
          |                  +-- Monobank API
          |                  +-- PrivatBank API
          |
          v
        MySQL
```

The Node.js service is the primary backend used by the frontend. It
handles authentication, application logic, planning synchronization,
transaction normalization, and database access.

The Spring Boot service acts as a dedicated bank integration layer. It
communicates with external banking APIs and synchronizes balance and
transaction data.

## DEV Local Environment

`compose.yaml` is DEV-only. Running `docker compose up -d` from this
repository must always mean the isolated development environment with
synthetic data.

Prerequisites:

- Docker
- Docker Compose
- mkcert

DEV architecture:

``` text
https://dev.hboo.local
    -> hboo-dev-nginx
    -> frontend/
    -> hboo-dev-backend
    -> hboo-dev-mysql
    -> hboo_dev
    -> synthetic data only
```

Adminer:

``` text
http://dev.hboo.local:8080
```

The web document root is `frontend/`. Public URLs do not include
`/frontend/`.

Configure the DEV hostname. `127.0.0.2` keeps DEV ports separate from
the REAL runtime on `127.0.0.1`.

``` bash
sudo sh -c 'echo "127.0.0.2 dev.hboo.local" >> /etc/hosts'
```

Generate local HTTPS certificates:

``` bash
mkcert -install
mkcert \
  -cert-file docker/nginx/certs/dev.hboo.local.pem \
  -key-file docker/nginx/certs/dev.hboo.local-key.pem \
  dev.hboo.local localhost 127.0.0.2
```

Start and stop:

``` bash
docker compose up -d
docker compose down
```

Open:

``` text
https://dev.hboo.local/
```

Default DEV host bindings:

``` text
dev.hboo.local -> 127.0.0.2
HTTP            -> 127.0.0.2:80
HTTPS           -> 127.0.0.2:443
Backend         -> 127.0.0.2:3000
MySQL           -> 127.0.0.2:3307
Adminer         -> 127.0.0.2:8080
```

The MySQL service uses the persistent Docker volume
`hboo-dev-mysql-data`. `compose.yaml` always creates and uses
`hboo_dev`. DEV MySQL is Docker-only and contains synthetic data only.

Local database dumps must not be committed. Public development data
lives in sanitized schema, migration, and seed files under
`docker/mysql/`.

## REAL Runtime Template

REAL is a deployment target, not the development working tree. Safe
templates live under `docker/runtime-example/` and are intended to be
copied manually to a separate runtime directory:

``` text
~/hboo-runtime/
    real.env
    compose.real.yaml
    app/
    nginx/
    certs/
```

Do not create or store REAL credentials in this repository.

DEV and REAL use separate databases, container names, networks, volumes,
hostnames, and loopback addresses.

## Source Isolation and Deployment

The active development repository must not be mounted directly into
REAL.

``` text
~/projects/hboo/
    active DEV working copy

~/hboo-runtime/app/
    clean deployed Git snapshot
```

Development flow:

``` text
working tree
    -> DEV
    -> test with synthetic data
    -> commit
    -> merge into main
    -> push
```

Deployment flow:

``` text
main
    -> clean REAL checkout
    -> pull committed revision
    -> apply reviewed DB migrations if needed
    -> recreate or rebuild affected services
    -> smoke test
```

Environment-only changes require recreating the affected container so it
receives the new environment. Application image changes require
rebuilding the corresponding image.

REAL is a deployment target, not a source of commits.

## Database Migrations

``` text
create migration
    -> apply/test against hboo_dev
    -> commit with application code
    -> push
    -> backup REAL database
    -> apply reviewed migration to REAL
    -> deploy compatible application version
```

Do not execute REAL migrations from the development environment. Before
an allowed DEV DB operation, verify that the selected database is
exactly `hboo_dev`.

## Features

### Bank Balances

HBOO provides a unified overview of balances from multiple banking
providers:

- Monobank
- PrivatBank
- aggregated total balance
- individual bank balances
- manual bank synchronization
- locally cached balance snapshots
- data freshness information
- offline access to the last known balance

Bank synchronization is performed through explicit backend refresh
operations. The frontend remains usable with previously persisted data
when bank integrations are unavailable.

<p align="center">

<img src="docs/screenshots/balance-desktop.png" width="90%" alt="HBOO balance dashboard">

</p>

### Transactions

The Transactions module provides a unified view of persisted transaction
history from connected banks.

It supports:

- multiple banks
- date and category filtering
- transaction grouping by day
- daily totals
- income / expense summaries
- expandable transaction details
- IndexedDB transaction cache
- local-first range queries
- persisted filter state
- manual synchronization
- offline browsing of previously loaded transactions

<p align="center">

<img src="docs/screenshots/transactions-desktop.png" width="90%" alt="HBOO transactions">

</p>

### Financial Planning

Financial planning is based on a **user-defined spending budget**, not
directly on the total bank balance.

``` text
Current bank balance       60,000 UAH

Budget until salary        20,000 UAH
Mandatory expenses          8,000 UAH
Other planned expenses      5,000 UAH
                           ----------
Remaining budget             7,000 UAH
```

The Planning module supports:

- custom planning periods and period budgets
- planned expenses and categories
- pending / completed / disabled states
- remaining budget calculation
- recommended daily spending
- amount available today
- Actual Spending
- manual matching of planned items to bank transactions
- Smart Completion transaction suggestions
- offline create / edit / complete / cancel
- durable autosync after reconnect
- multi-device revalidation
- pre-push conflict protection

<p align="center">

<img src="docs/screenshots/planning-desktop.png" width="90%" alt="HBOO financial planning">

</p>

## Planning and Transaction Matching

Planning items represent concrete expected expenses rather than category
budgets.

HBOO can associate planned expenses with persisted bank transactions.
This provides the foundation for Plan vs Fact analysis and prevents a
completed expense from continuing to behave as a future reserve.

Manual transaction linking remains available as a fallback.

### Smart Completion

Smart Completion suggests likely transactions for pending planning
items.

Candidate ranking uses signals such as merchant similarity, category,
transaction date, and amount proximity. The matching strategy
intentionally prefers missing an uncertain suggestion over presenting
aggressive false positives.

Suggestions are advisory. A transaction is not attached to a planning
item until the user confirms it.

## Financial Summary

Planning information is available outside the Planning page through a
shared financial summary.

``` text
Available Today
Recommended Limit
Spent Today

Period Budget
Planned
Remaining
Days Left
```

This makes the planning state part of the overall application rather
than an isolated calculator.

## PWA and Offline Operation

HBOO is an installable Progressive Web App.

``` text
App shell
    -> Service Worker / Cache Storage

Financial data
    -> IndexedDB

Planning changes
    -> local state + durable sync queue

Bank refresh
    -> online-only integration
```

The Service Worker caches the static application graph required for
startup. API requests remain network operations rather than static
cached resources.

Current offline capabilities include:

- PWA installation
- offline cold start
- Balance from the last known local snapshot
- cached Transactions
- cached Categories
- Planning read/create/edit/complete/cancel
- durable queued Planning synchronization
- automatic synchronization after connectivity or authentication
  recovery

Bank synchronization and Smart Completion remain online operations.

## Local-First Data Flow

``` text
Page / Component
       |
       v
     Store
    /     \
   v       v
Local      API
Repository Service
   |       |
   v       v
IndexedDB Backend
```

Local data can be rendered immediately, while network operations enrich
or synchronize it when connectivity is available.

## Planning Synchronization

Planning uses a durable local synchronization queue. Local edits are
preserved across page reloads and connectivity loss.

The synchronization model distinguishes browser network availability,
API authentication, pending local changes, active synchronization,
errors, and conflicts.

Before pushing dirty Planning state, HBOO compares:

``` text
BASE   = last known server snapshot
LOCAL  = current IndexedDB state
REMOTE = fresh server state
```

Independent changes can be merged through granular synchronization.
Overlapping edits to the same persisted planning item are stopped as
conflicts instead of silently overwriting remote data.

Strong server-side revision/ETag concurrency control is a possible
future improvement.

## Connection and Sync Status

The UI distinguishes states such as:

``` text
Synced
Syncing...
Offline
Sign in to sync
Sync error
Sync conflict
```

Data freshness is also shown contextually for Balance, Transactions, and
Planning.

## Authentication and Local App Lock

Backend authentication and local application access are separate
concerns.

If the API session expires, HBOO can continue using local data.
Re-authentication does not discard the current route or offline state.

HBOO can optionally protect the local UI with a PIN. The verifier is
derived locally using Web Crypto PBKDF2 with SHA-256 and a random salt.
The plaintext PIN is not persisted.

App Lock supports configurable inactivity timeouts and a privacy shield
while the application is backgrounded.

App Lock is an **application UI access layer, not encryption at rest**.
It does not make IndexedDB inaccessible to someone with access to the
browser profile or device storage.

## Frontend Architecture

The frontend is built with **vanilla JavaScript** without React, Vue,
Angular, or another frontend framework.

This was an intentional decision: to design the application architecture
and work directly with browser mechanisms rather than relying on
framework abstractions.

``` text
HBOO
|
+-- Application Core
+-- Router
+-- Pages
|   +-- Home
|   +-- Balance
|   +-- Transactions
|   +-- Planning
|   +-- Deposits
|   +-- Settings
+-- Components
+-- Stores
+-- Services
+-- Local Repositories
+-- API Services
+-- Reusable UI Helpers
```

The frontend includes routing, pages and components, shared application
state, lifecycle-like behavior, centralized event delegation, stores,
services, repositories, and reusable UI components.

## Mobile UI

HBOO is designed for both desktop and mobile usage.

<p align="center">

<img src="docs/screenshots/balance-mobile.png" width="30%" alt="HBOO balance mobile">
<img src="docs/screenshots/transactions-mobile.png" width="30%" alt="HBOO transactions mobile">
<img src="docs/screenshots/planning-mobile.png" width="30%" alt="HBOO planning mobile">

</p>

The installed PWA supports fullscreen operation and offline startup.
Mobile navigation uses the same financial model and application
architecture as desktop.

## From FIPL to HBOO Planning

The current Planning functionality evolved from a standalone experiment
called **FIPL (Financial Planner)**.

FIPL was a rapid prototype for period-based financial planning. Its
successful concepts were later redesigned around HBOO’s Store / Service
/ Repository and local-first architecture.

## Tech Stack

### Frontend

- JavaScript / ES Modules
- HTML
- CSS / SASS
- IndexedDB
- Local Storage for lightweight preferences and compatibility state
- Service Worker
- Web App Manifest / PWA
- Web Crypto
- Responsive Web Design

### Backend

- Node.js
- Native `node:http`
- MySQL / mysql2
- REST API
- Java / Spring Boot bank integration service
- Monobank API
- PrivatBank API

The main backend intentionally uses Node.js without Express, NestJS, or
an ORM.

### Infrastructure

- Docker
- Docker Compose
- Nginx
- HTTPS
- MySQL 8
- mkcert for local trusted HTTPS

## Analytics Direction

The next major product area is the Home analytics dashboard.

The first analytics stage will use financial data that already exists in
HBOO:

``` text
Home
+-- Current financial summary
+-- Income vs Expenses
|   +-- 6 months
|   +-- 1 year
+-- Spending by Category
|   +-- current month
|   +-- selected period
+-- Recent / upcoming planning context
```

A later receipt-processing layer can extend this into deeper drill-down:

``` text
Transactions
    -> Categories
    -> Purchases
    -> Products
    -> Price history / stores / quantities
```

This keeps the first analytics version useful with bank transaction data
while leaving room for item-level purchase statistics later.

## Product Direction

HBOO is primarily developed as a real personal finance tool rather than
as a demonstration project.

### Near-term

- Home analytics dashboard
- Income vs Expenses history for 6- and 12-month periods
- spending by category for selected periods
- Plan vs Fact analytics
- recurring planning items
- improved Planning conflict-resolution UI
- broader offline financial calculations
- migration tracking and deployment hardening

### Future

- receipt scanning and structured purchase extraction
- item-level purchase analytics
- product and price history
- store-level spending insights
- savings and financial goals
- balance history
- cash-flow forecasting
- spending pattern analysis
- PWA notifications
- AI-assisted transaction and purchase categorization
- AI-powered financial insights and budget optimization suggestions
- natural-language queries about personal financial data

## Security and Data Safety

HBOO works with financial data, so DEV and REAL environments are
intentionally isolated.

- no REAL credentials in Git
- no real bank tokens in DEV
- DEV uses synthetic financial data
- REAL uses a separate database and runtime
- generated certificates and private keys are not committed
- database migrations are reviewed before REAL execution
- transaction imports use provider transaction IDs to prevent duplicate
  imports

The repository contains safe development/runtime templates rather than
production secrets.

## Project Background

HBOO was originally designed and implemented independently from scratch
before I started actively using AI coding assistants.

The original architecture, frontend core, routing, components, financial
model, bank integration approach, and UI were developed through the
normal product and engineering process rather than generated from a
predefined implementation.

Current development uses AI-assisted engineering where useful, while
product decisions, architecture, code review, security boundaries, and
validation remain developer-driven.

## Status

**Active development**

The current milestone is a local-first PWA with bank synchronization,
offline financial data, durable Planning synchronization, and
conflict-aware multi-device behavior.

The next major product area is the Home analytics dashboard.
