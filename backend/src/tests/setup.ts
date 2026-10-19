// Vitest setupFiles bootstrap — runs before any module is imported, so env
// defaults are in place when config/logger/services initialize. Keep this to env
// bootstrapping only (no fixtures, no mocks).

// routing-controllers / class-validator decorators read metadata via reflect-metadata.
// Import it once for the whole test run so decorated classes can be imported in tests.
import 'reflect-metadata';

import {
  MOCK_ADMIN_GROUP,
  MOCK_AUTHORIZED_GROUPS,
  MOCK_DEVELOPER_GROUP,
  MOCK_HSL_INVESTIGATOR_GROUP,
  MOCK_LEX_MANAGER_GROUP,
  MOCK_OPERATIONS_MANAGER_GROUP,
  MOCK_SOL_LSS_INVESTIGATOR_GROUP,
  MOCK_SUPERADMIN_GROUP,
  MOCK_UNIT_MANAGER_GROUP,
  mockMunicipalityId,
  mockSupportNamespace,
} from './helpers/mock-data';

// logger.ts resolves `join(__dirname, LOG_DIR)` and mkdirs it at import time.
// Give it a default so the real logger can initialize when a test pulls it in.
process.env.LOG_DIR = process.env.LOG_DIR ?? 'logs';

// ad-role.service.ts reads these group vars at IMPORT time (directly or via
// authorization.service) to build `roleADMapping`; a group seeded after the module
// loads is never mapped.
process.env.DEVELOPER_GROUP = process.env.DEVELOPER_GROUP ?? MOCK_DEVELOPER_GROUP;
process.env.ADMIN_GROUP = process.env.ADMIN_GROUP ?? MOCK_ADMIN_GROUP;
process.env.SUPERADMIN_GROUP = process.env.SUPERADMIN_GROUP ?? MOCK_SUPERADMIN_GROUP;

// authorizeGroups() splits AUTHORIZED_GROUPS at call time; seed it so tests that
// exercise authorization have a known allow-list.
process.env.AUTHORIZED_GROUPS = process.env.AUTHORIZED_GROUPS ?? MOCK_AUTHORIZED_GROUPS;

// config/index.ts destructures process.env into module-level consts at IMPORT time, and
// controllers read them when constructed. Seed the ones the support-errand controller
// builds its URLs from, so tests see stable, non-undefined values. The same constants are
// imported by the tests that assert against these URLs, so the two cannot drift.
process.env.MUNICIPALITY_ID = process.env.MUNICIPALITY_ID ?? mockMunicipalityId;
process.env.SUPPORTMANAGEMENT_NAMESPACE = process.env.SUPPORTMANAGEMENT_NAMESPACE ?? mockSupportNamespace;

// The handler roles are required, and the controllers and services that use them resolve them when constructed.
// The seed registers no measures; a test about measure registration configures its own roles.
process.env.HEALTHCAREDEVIATION_HANDLER_ROLES =
  process.env.HEALTHCAREDEVIATION_HANDLER_ROLES ??
  JSON.stringify([
    { key: 'enhetschef', label: 'Enhetschef', group: MOCK_UNIT_MANAGER_GROUP },
    { key: 'verksamhetschef', label: 'Verksamhetschef', group: MOCK_OPERATIONS_MANAGER_GROUP },
    { key: 'lex-ansvarig', label: 'LEX-ansvarig', group: MOCK_LEX_MANAGER_GROUP },
    { key: 'lex-utredare', label: 'LEX-utredare', group: MOCK_SOL_LSS_INVESTIGATOR_GROUP },
    { key: 'mas-mar', label: 'MAS/MAR', group: MOCK_HSL_INVESTIGATOR_GROUP },
  ]);

// apiURL() prefixes relative urls with API_BASE_URL; without it they start with 'undefined/'.
process.env.API_BASE_URL = process.env.API_BASE_URL ?? 'https://api.test.local';

// app.ts builds the SAML strategy and reads BASE_URL_PREFIX at IMPORT time, so the
// default-deny runtime test cannot import the app without these. The values are dummies -
// no SAML flow is exercised, only the auth guard in front of the routes.
process.env.BASE_URL_PREFIX = process.env.BASE_URL_PREFIX ?? '/api';
process.env.SECRET_KEY = process.env.SECRET_KEY ?? 'test-secret-key';
process.env.SAML_ENTRY_SSO = process.env.SAML_ENTRY_SSO ?? 'https://idp.test.local/sso';
process.env.SAML_CALLBACK_URL = process.env.SAML_CALLBACK_URL ?? 'https://app.test.local/api/saml/login/callback';
process.env.SAML_LOGOUT_CALLBACK_URL = process.env.SAML_LOGOUT_CALLBACK_URL ?? 'https://app.test.local/api/saml/logout/callback';
process.env.SAML_SUCCESS_REDIRECT = process.env.SAML_SUCCESS_REDIRECT ?? 'https://app.test.local';
process.env.SAML_FAILURE_REDIRECT = process.env.SAML_FAILURE_REDIRECT ?? 'https://app.test.local/login';
process.env.SAML_ISSUER = process.env.SAML_ISSUER ?? 'test-issuer';
// node-saml asserts these are present when the Strategy is constructed. They are never
// used to sign or verify anything in tests, so placeholder values are enough.
process.env.SAML_IDP_PUBLIC_CERT = process.env.SAML_IDP_PUBLIC_CERT ?? 'test-idp-cert';
process.env.SAML_PRIVATE_KEY = process.env.SAML_PRIVATE_KEY ?? 'test-private-key';
process.env.SAML_PUBLIC_KEY = process.env.SAML_PUBLIC_KEY ?? 'test-public-key';
