# HBOO Project Instructions

## Communication
- Always respond to the user in Ukrainian.
- Code, class names, variable names, database fields, API routes and technical identifiers should remain in English unless explicitly requested otherwise.
- Explanations should be concise and practical.

## Product Architecture
- HBOO is a local-first / offline-first personal finance application.
- The main user flow must not depend on backend API availability.
- Planning must continue working offline.
- UI actions must be applied locally immediately without waiting for the backend.

## Planning
- Planning is based on a user-defined period budget, not on the current bank balance.
- Example: the user may define a budget of 20,000 UAH until 30.09 even if the actual bank balance is different.
- The planning period, periodBudget, planning items and their statuses must be persisted locally and restored after reload.
- Manual approval of expenses must remain supported because expenses may be paid in cash or outside connected banks.

## Local Storage and Sync
- PlanningLocalRepository is the primary data source for planning.
- Backend synchronization is a separate layer used for:
  - backup
  - cross-device synchronization
  - bank integrations
- Future PlanningApiRepository must be used by a sync service and must not replace the local repository as the immediate UI data source.
- Do not make UI actions wait for successful API synchronization.
- Do not introduce API-first behavior unless explicitly requested.

## Data ownership
- Client storage is an offline working cache, not the historical database.
- The backend database is the durable source for full historical data.
- The client should keep only data required for current/offline workflows.
- Historical queries, filtering and aggregation should normally be performed by the backend/database and loaded on demand.

## Future Architecture
- Bank transaction matching will be implemented later.
- Bank transactions may automatically confirm planned expenses in the future.
- Manual confirmation must still remain available.
- Historical data will later be used for recurring-expense suggestions and forecasts.
- AI forecasting and recommendations are future features and should not be introduced prematurely.
- Receipt scanning and item-level expense analysis are future features.

## Frontend
- Keep the existing vanilla JavaScript architecture.
- Do not introduce React, Vue, Angular or another frontend framework unless explicitly requested.
- Reuse the existing Router, pages, components, lifecycle, store, services and repositories.
- Avoid unnecessary dependencies.
- Do not rewrite working architecture without a concrete reason.
- Before introducing a new component, service, store, popup, event system or other abstraction, inspect the existing implementation and reuse or extend it where appropriate.
- Prefer reusable domain-independent UI components when the same behavior is needed across multiple pages.

## State Management
- Use the existing application-level store/pub-sub approach.
- Components should remain presentation-focused.
- Business calculations belong in calculator/service modules.
- Do not duplicate calculation logic inside UI components.

## Changes
- Prefer small incremental changes over large rewrites.
- Before substantial architectural changes, explain the proposed approach first.
- Preserve existing behavior unless the task explicitly requires changing it.
- After implementation, report:
  - changed files
  - main data flow
  - tests/checks performed
  - manual browser checks still required

## Database and Environment Safety
- Agents may work only with the DEV environment from this repository.
- Normal `docker compose` commands in this repository refer only to DEV.
- The DEV database is `hboo_dev`.
- DEV contains synthetic data only.
- Never access the REAL database.
- Never search outside this repository for `real.env` or credentials.
- Never read `~/hboo-runtime`.
- Never access host MySQL for tests.
- Never use Adminer or browser sessions to access REAL data.
- Never call real Mono or Privat bank APIs.
- Never print secrets.
- Never request elevated permissions to bypass these restrictions.
- Before any allowed DEV database operation, verify `DATABASE()` and `CURRENT_USER()`.
- Stop immediately if the selected database is not exactly `hboo_dev`.
- `AGENTS.md` is an operational rule for coding agents, not a hard OS sandbox.
