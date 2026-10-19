# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Draken avvikelse is the healthcare deviation (avvikelsehantering) application for Sundsvalls Kommun, built on
Support Management. It was split out of the multi-tenant Draken repo and now holds this one application only:
there is no CaseData, no other drake and no feature-flag system.

**IAF and VOF are two deployments of the same application.** They behave identically. What tells them apart is
backend configuration alone: `SUPPORTMANAGEMENT_NAMESPACE` (`HEALTHCAREDEVIATIONIAF` / `HEALTHCAREDEVIATIONVOF`) and
the AD groups (`AUTHORIZED_GROUPS`, `ADMIN_GROUP`, `DEVELOPER_GROUP`, `SUPERADMIN_GROUP`,
`HEALTHCAREDEVIATION_HANDLER_ROLES`), plus deployment plumbing (ports, URLs, SAML, base path, secrets). The
frontend's own env only says where it is served and what name it shows.

**The rules that keep it one application:**

- **Never branch on which deployment is running.** There is no application or deployment name in the
  configuration, and no logic may introduce one. If IAF and VOF ever need to differ, the difference is configuration
  the backend reads, not a code path keyed on a name.
- **No feature flags.** Everything the application uses is always on. `frontend/src/config/appconfig.tsx` holds the
  application name and one test-environment toggle (`NEXT_PUBLIC_USE_RELATED_REPORTS_MOCK`, never on in
  production); do not grow it back into a flag list.

## Investigation (utredning)

`frontend/src/supportmanagement/investigation/` holds the investigation contract (`investigation-variant.ts`), the
registry (`investigation-variant-registry.ts`, which answers the avvikelse implementation) and the implementation
in `avvikelse/`. Shared errand pages ask the registry for the slots they render - the tabs, the notice above them,
the handler fields, the next step, the decision tab and so on - and leave out what a slot does not fill.

- **The decision tab.** Avvikelse fills `decisionTab` with the Beslut errand tab, offered once the errand is in the
  decision phase, and to MAS/MAR on an HSL deviation from the start (`isOfferedBeforePhase`). It shows the decision
  document that applies to the errand (the lex Sarah decision on a reported misconduct, the IVO decision on an HSL
  deviation, never both). It says only that there is nothing to decide when neither applies, and only which role
  decides when the user does not reach the decision.
- **The investigation-only surface.** Investigation documents (`json-parameters`), JSON schemas, the profile's
  `labelFilter` (the overview's category filters come from its groups) and the classification PATCH
  (`supporterrands/{municipalityId}/{errandId}/classification`, the atomic write used when the investigation owns
  classification). The handover routes (`.../investigation-handover/{step}`, `.../unit-manager` and
  `.../location-managers/{labelId}`) write the `access/*` labels that move an errand between the unit manager and
  the LEX roles, and the `LOCATION` label chain that moves a wrongly routed errand to the unit it concerns. The
  `supportplacemanagers/...` routes write which places a manager has to AccessMapper - places only, never a role,
  and for the superadmin group alone; the variant's `administration` slot is what offers that view. A wrong routing
  is corrected in the labels only; the incoming JSON parameter stays the record of what was reported. The
  profile's `reportDocument` (Katla's `avvikelse-plats-handelse`) is written by the `json-parameters` route only on
  an errand registered in Draken (channel `WEB_UI`) that has not reached Utredning, and the generic errand PATCH
  refuses a channel change.
- **Handler roles are data, and required.** `HEALTHCAREDEVIATION_HANDLER_ROLES` names the AD group behind each
  handler role. `/users/admins` lists the members of those groups with a role per account, and the `Ansvarig`
  selector groups by those roles; the handover steps require a role of their assignee, and the roles decide who
  registers and who follows up measures. The backend refuses to start without the setting.
- **The runtime profile.** The BFF serves one investigation profile (`AVVIKELSE_INVESTIGATION_PROFILE`). Its state
  is `active`, or `unavailable` when the namespace is missing or the deployment is not on the Support Management
  sprint API target the profile requires; protected writes then fail closed.

## Development Commands

### Backend (run from `backend/`)

```bash
yarn dev                      # Start dev server with hot reload (.env.development.local)
yarn build                    # Build for production
yarn start                    # Start production server
yarn lint                     # Run ESLint
yarn type-check               # TypeScript check only (app; excludes src/tests)
yarn type-check:test          # TypeScript check for tests (src/tests/tsconfig.json)
yarn test                     # Vitest unit tests (run mode)
yarn test:watch               # Vitest watch mode
yarn test:coverage            # Vitest with v8 coverage
yarn generate:datacontracts   # Generate API types from Swagger
```

### Frontend (run from `frontend/`)

```bash
yarn dev                      # Start Next.js dev server (.env.local)
yarn build                    # Build for production
yarn start                    # Start production server
yarn lint                     # Run ESLint
yarn type-check               # TypeScript check only (app; excludes the colocated tests)
yarn type-check:test          # TypeScript check for tests (tsconfig.test.json)
yarn test                     # Vitest unit tests (run mode)
yarn test:watch               # Vitest watch mode
yarn test:coverage            # Vitest with v8 coverage
yarn test:e2e                 # Playwright E2E (needs `yarn dev` running)
yarn test:e2e:schema-lab      # Playwright E2E for the development-only schema lab
```

### Environment Setup

```bash
# Frontend: copy .env.local-example to .env.local
# Backend: copy .env.example.local to .env.development.local
```

The example files are written for IAF; for VOF change the namespace, the AD groups and `/iaf` to `/vof`.

## Tech Stack

**Backend:** Node 20, Express 4, TypeScript, routing-controllers (decorator-based), SAML auth (passport-saml), Winston logging, Axios

**Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS, @sk-web-gui (Sundsvall design system), react-hook-form + yup, i18next (Swedish only), @rjsf for dynamic JSON Schema forms

## Architecture

### Backend Structure (`backend/src/`)

```
controllers/           # HTTP handlers with @Controller() decorators
  └── supportmanagement/  # Support errand, investigation and measure endpoints
services/             # Business logic (ApiService, support-errand.service, investigation services, etc.)
config/               # Environment configuration, the investigation profile and its policies
data-contracts/       # Auto-generated API types from Swagger specs
middlewares/          # auth, permissions, validation, error handling
interfaces/           # TypeScript type definitions
dtos/                 # Data Transfer Objects for validation
```

**Key patterns:**

- Routing Controllers with `@Controller()`, `@Get()`, `@Post()`, `@UseBefore()` decorators
- `ApiService` wraps Axios with OAuth token injection via interceptors
- `ApiTokenService` manages OAuth token lifecycle (auto-refresh)
- Custom `HttpException` class for error handling

### Frontend Structure (`frontend/src/`)

```
app/[locale]/         # Next.js App Router pages (sv locale only)
  ├── oversikt/       # Dashboard/overview
  ├── registrera/     # Registration
  └── arende/[errandNumber]/  # Errand detail view
supportmanagement/    # The support errand pages
  ├── components/     # Errand forms, tabs, sidebar, overview
  ├── investigation/  # The investigation contract, registry and the avvikelse implementation
  ├── measures/       # Åtgärder
  └── services/       # support-errand-service, etc.
common/               # Shared utilities
  ├── components/     # Reusable UI (layout, sidebar, notifications, JSON schema forms)
  └── services/       # api-service, user-service, etc.
stores/               # Zustand stores (user, errand, metadata, UI settings)
config/appconfig.tsx  # Application name and the related-reports test toggle
```

**Key patterns:**

- Zustand stores in `stores/` hold global state (user, errand, metadata, UI settings); persisted stores are keyed
  by base path (`persistedStoreKey`), so two deployments on one origin keep them apart
- Services use Axios-based `apiService` for API calls
- Forms use react-hook-form with yup validation

### Path Aliases

**Backend:** `@config`, `@controllers/*`, `@services/*`, `@interfaces/*`, `@middlewares/*`, `@utils/*`

**Frontend:** `@supportmanagement/*`, `@common/*`, `@config/*`, `@stores/*`, `@styles/*`

## External APIs

The backend acts as a BFF (Backend For Frontend), consuming Sundsvall municipal APIs via WSO2 API Gateway:

- SupportManagement (stable and sprint) - the errands, their documents, measures and notifications
- AccessMapper - document access and the places a manager has
- ActiveDirectory, Employee - User/staff management
- Citizen, Party, LegalEntity - Person/organization data
- Templating - Message and investigation text templates
- Relations, CaseStatus - Referred-from information and the brukare's other reports
- JsonSchema - Investigation document schemas

API types are generated from Swagger specs into `data-contracts/` directories.

## Testing

### Backend (Vitest)

Backend unit tests use **Vitest** (`backend/vitest.config.ts`), run from `backend/`.

- **Location**: `backend/src/tests/`; file naming `<module>.service.test.ts` / `<module>.controller.test.ts` (one file per module under test). Shared helpers live in `backend/src/tests/helpers/`: `http.ts` (express request/response doubles for calling controller methods directly) and `mock-data.ts` (shared fixtures).
- **Globals**: `globals: true`, so `describe`/`it`/`expect`/`vi` are available without importing. They are typed ambiently via `/// <reference types="vitest/globals" />` in `src/types/vitest.d.ts` — the tsconfig's explicit `typeRoots` prevents resolving `vitest/globals` through the `types` array, so a reference from an included source file is used instead.
- **Transform**: tests are transformed with **SWC** via `unplugin-swc`, because routing-controllers/class-validator need `emitDecoratorMetadata`, which Vite 8's native Oxc/esbuild transform does not emit. The transform sets `swcrc: false` so it ignores the project's `.swcrc` (that file targets the `build:swc` production output — es2017/CJS — and would rewrite aliases).
- **Path aliases**: resolved by an explicit `alias` table in `vitest.config.ts` (mirroring `tsconfig.json`). Unlike some sibling apps, this project's `tsconfig.json` has **no `baseUrl`**, so `vite-tsconfig-paths` can't synthesize the aliases — hence the manual table. Keep it in sync when tsconfig paths change.
- **Env bootstrap**: `backend/src/tests/setup.ts` (wired via `setupFiles`) imports `reflect-metadata` and seeds env vars **before any module loads**. This is required because `logger.ts` mkdirs `LOG_DIR` at import time, and `ad-role.service.ts` builds its role mapping from `DEVELOPER_GROUP`/`ADMIN_GROUP`/`SUPERADMIN_GROUP` at import time — a group seeded after the module loads is never mapped. Add other env defaults here when tests need them; keep it to env bootstrapping only (no fixtures, no mocks).
- **Type-checking**: `src/tests` is **excluded from the root `tsconfig.json`** so the `tsc` production build never emits test files. Tests get their own `backend/src/tests/tsconfig.json` (extends the root, `noEmit`, re-includes `src/tests` + the Vitest globals shim). This nested config is what makes the editor type test files correctly — VS Code auto-discovers the closest `tsconfig.json`, and the root one excludes tests, so without it `describe`/`it`/`expect` and `@/…` aliases show as unresolved. `yarn type-check:test` runs `tsc -p src/tests/tsconfig.json`.
- **CI**: `.github/workflows/vitest-backend.yml` runs `yarn type-check:test` and `yarn test` on pull requests and pushes to `develop`/`main`.
- **Scope**: the `services/` and `controllers/` layers — pure/transform functions directly, and IO-bound controller methods via the mocking pattern below.

**Mocking collaborators**: how you stub `ApiService` depends on where it is constructed.

- **Controllers** hold it as an _instance field_ (`private apiService = new ApiService()`), which is a plain runtime property — so a test can instantiate the controller and overwrite `controller.apiService` (and `controller.organizationService`) with `vi.fn()` stubs. Build a fresh instance per test so no state leaks between them. This is what `support-errand.controller.test.ts` does, and it needs no production-code changes.
- **Services** call `new ApiService()` _inside function bodies_, so the field-overwrite trick does not apply there. Those need `vi.mock('@/services/api.service')`, or a refactor to accept `api` as a parameter. The same holds for any collaborator constructed inside a function, which a test stubs with `vi.mock` plus a factory.

**Test data**: never hardcode person numbers, organization numbers, phone numbers, party ids or similar identifiers in tests — import them from `src/tests/helpers/mock-data.ts`, which records each value's provenance (Skatteverket / PTS test ranges). That keeps one place to confirm no production-like identifier enters the repo.

### Frontend (unit)

Frontend unit tests use **Vitest** (`frontend/vitest.config.mts`), run from `frontend/`.
They previously ran on Node's built-in test runner from `.mjs` files; that was migrated so the
runner matches the backend and so tests are no longer restricted to alias-free modules.

- **Location**: colocated, `<module>.test.ts` next to the `<module>.ts` it covers. This
  deliberately differs from the backend layout: the backend keeps tests in `src/tests/` so the
  production `tsc` never emits them, a constraint Next.js does not have.
- **Shape**: `import { test } from 'vitest'` + `import assert from 'node:assert/strict'`, flat
  top-level `test(...)` calls. Assertions are **`node:assert`, not `expect`** — `globals` is
  off in the config, so nothing is injected and every import is explicit. No DOM, no React.
- **Path aliases**: resolved natively by Vite via `resolve.tsconfigPaths`, which reads the
  `paths` table in `tsconfig.json`. This works because that tsconfig sets `baseUrl`; the
  backend's does not, which is why `backend/vitest.config.ts` needs a hand-written alias table
  instead. Do not copy that pattern here.
- **Environment**: `node`. The suites are pure functions; nothing renders. Component tests
  would need `jsdom` plus `@testing-library/react`, which is a separate decision.
- **Scope**: pure functions — parsers, projectors, policy resolvers
  (`parseInvestigationProfile`, `projectLabelFilterGroups`, `resolveSupportErrandClassificationPlacement`, …).
  Anything needing rendering or navigation belongs in the Playwright suites below.
- **Type-checking**: `yarn type-check` does **not** cover the tests — the root `tsconfig.json`
  `include` entry `src/**/*.{ts,tsx}` uses brace expansion, which TypeScript's include globs do
  not support, so it matches nothing and `src` is only reached transitively through imports.
  Test files have no importer, so `tsconfig.test.json` includes them explicitly and
  `yarn type-check:test` runs it. The test config disables incremental compilation so the
  type-check does not create a generated `tsconfig.test.tsbuildinfo` artifact.
- **CI**: `.github/workflows/frontend-unit.yml` runs `yarn type-check:test` and `yarn test` on
  pull requests and pushes to `develop`/`main`.
- **Test data**: the same rule as the backend applies — no real person numbers, organization
  numbers or phone numbers. `.husky/pre-commit` scans `.ts`/`.tsx`/`.mjs` for them.

### Frontend (e2e)

Playwright E2E tests live in `frontend/e2e/`:

- `avvikelse/` - the application's end-to-end suite
- `schema-lab/` - development-only investigation schema lab tests

Every spec mocks the network, so only the frontend dev server needs to run: `yarn dev`, then `yarn test:e2e`
(or `yarn test:e2e:schema-lab`). Run a single spec with eg:
`npx dotenv -e .env.local -- playwright test --project=avvikelse e2e/avvikelse/support-measures.spec.ts`.
CI runs both projects as separate matrix jobs in `.github/workflows/playwright.yml`.

## Key Files

| File                                                                  | Purpose                                         |
| --------------------------------------------------------------------- | ----------------------------------------------- |
| `backend/src/server.ts`                                               | Entry point                                     |
| `backend/src/controllers.ts`                                          | Every registered controller                     |
| `backend/src/app.ts`                                                  | Express setup, middleware chain, SAML auth      |
| `backend/src/services/api.service.ts`                                 | HTTP client with OAuth interceptors             |
| `backend/src/config/support-investigation-profile.ts`                 | The investigation profile                       |
| `frontend/src/supportmanagement/investigation/investigation-variant.ts` | The investigation contract                      |
| `frontend/src/config/appconfig.tsx`                                   | Application name and the related-reports toggle |
| `frontend/next.config.js`                                             | Next.js configuration                           |

## Writing to a Support Errand: scope the version check to what you write

Support Management versions an errand **and** the sub-resources beneath it. Versions roll up but not
down: changing a parameter or a JSON parameter moves the errand's version too, while the errand's
version moving says nothing about any particular child.

So a write is conditioned on the version of **the resource it writes**, never on the errand around
it. Conditioning a child write on the errand version rejects saves over fields nobody contended,
and — worse — sending a whole collection rewrites entries another user just changed.

| What you write | Route | Precondition |
| --- | --- | --- |
| One parameter | `PUT /supporterrands/:m/:id/parameters/:key` | that parameter's version |
| One JSON parameter | `PUT /supporterrands/:m/:id/json-parameters/:key` | that document's ETag |
| Errand-level fields (`title`, `stakeholders`, `labels`, `externalTags`, …) | `PATCH /supporterrands/:m/:id` | the errand's version |
| Assignee / status / classification / handover | their own command routes | the errand's version |
| Phase | `PATCH /supporterrands/:m/:id/phase` | the active phase the client saw; the BFF conditions the upstream write on the version it just read |
| One measure (its fields, decision, end date, follow-up) | `PATCH /supporterrands/:m/:id/measures/:measureId[/…]` | that measure's version (`requireMeasureVersion`, `readWritableMeasure`) |

Two consequences worth keeping:

- **`parameters` must not go in the generic errand PATCH body.** It is written per key instead. The
  errand is still read fresh before a child write, but only for its **status** — a locked or closed
  errand accepts nothing.
- **Only write what changed.** `saveChangedErrandParameters` skips parameters whose values are
  unchanged: rewriting one with the value it already has moves its version and can clobber a
  concurrent edit. Likewise Starta handläggning saves the sidebar's errand fields only when they hold a
  draft. An action that writes nothing of the errand but must act on the errand the user was shown checks
  that by reading it (`assertSupportErrandUnchangedSinceSeen`), never by a PATCH that changes nothing.

`notes`, `attachments` and `notifications` have their own routes but no version in the upstream model,
so no conflict detection is available for them.

## Notes

- All text content is in Swedish
- No database layer - all data via external APIs
- One codebase, deployed as IAF and VOF; the frontend Docker image replaces its `NEXT_PUBLIC_*` placeholders at
  start-up (`entrypoint.sh`), so the same image serves both
- SAML SSO authentication with Active Directory group-based authorization
- Support Management notifications come from SM's subscriber model. The investigation profile says the assignee
  alone follows the errand (`assigneeFollowsErrand`): the BFF moves the following with every assignment, handover
  and registration (`followErrandWithAssignee`), and the previous assignee stops following the errand; the sidebar
  offers no follow button. An errand's notifications are acknowledged when the errand page opens. A user action
  that makes several writes runs in `withRequestGroup` (`common/services/api-service.ts`) so it becomes one
  notification. The helpers that make one request per item (`saveChangedErrandParameters`,
  `saveSupportAttachments`) group their own requests, and a group started inside another joins it; an action
  that makes several requests of its own still has to be wrapped where it starts. A write the system makes on its
  own (read markers, acknowledgements, bookkeeping) passes `notifySubscribers: false` to `ApiService`, which sends
  `X-notify: false`; never use it for what a user did. The labels subscription profiles notify from
  (`RISK/HIGH_HSL`, `ANALYSIS/HSL_STARTED`, `ANALYSIS/VC_COMMENT_HSL`) are never written silently, and never taken
  off an errand once it carries them (`IAF_VOF_PERMANENT_LABELS`). A user chooses e-mail and SMS beside the
  notifications in Draken from Notiser in the user menu (`notificationChannels`). The BFF stores the kind of
  channel and nothing else: never a destination, and always `INTERNAL`.
