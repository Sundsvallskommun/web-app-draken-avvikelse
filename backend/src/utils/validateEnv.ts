import {
  ADMIN_GROUP,
  API_BASE_URL,
  AUTHORIZED_GROUPS,
  BASE_URL_PREFIX,
  CLIENT_KEY,
  CLIENT_SECRET,
  DEVELOPER_GROUP,
  DOMAIN,
  LOG_DIR,
  MUNICIPALITY_ID,
  NODE_ENV,
  PORT,
  SAML_CALLBACK_URL,
  SAML_ENTRY_SSO,
  SAML_FAILURE_REDIRECT,
  SAML_IDP_PUBLIC_CERT,
  SAML_ISSUER,
  SAML_LOGOUT_CALLBACK_URL,
  SAML_PRIVATE_KEY,
  SAML_PUBLIC_KEY,
  SAML_SUCCESS_REDIRECT,
  SECRET_KEY,
  SUPERADMIN_GROUP,
  SUPPORTMANAGEMENT_NAMESPACE,
  SUPPORTMANAGEMENT_SENDER_EMAIL,
  SUPPORTMANAGEMENT_SENDER_SMS,
} from '@config';

import { resolveSupportManagementApiTarget, resolveSupportManagementErrandSearch } from '@/config/api-config';
import { findUnauthorizedHandlerRoleGroups, HANDLER_ROLES_SETTING, HandlerGroupRole, resolveHandlerGroupRoles } from '@/config/handler-group-roles';
import { logger } from '@/utils/logger';

type EnvType = 'str' | 'port' | 'url';

// The spec carries the value the app will actually use (the constant exported from `@config`),
// not a re-read of `process.env`, so what is validated here is exactly what consumers get.
type EnvSpec = Record<string, { value: string | undefined; type: EnvType }>;

function warnMissingEnv(spec: EnvSpec): void {
  const missing: string[] = [];
  const invalid: string[] = [];

  for (const [key, { value, type }] of Object.entries(spec)) {
    if (!value) {
      missing.push(key);
      continue;
    }

    if (type === 'port') {
      const port = Number(value);
      if (isNaN(port) || port < 1 || port > 65535) {
        invalid.push(`${key} (invalid port: "${value}")`);
      }
    }

    if (type === 'url') {
      try {
        new URL(value);
      } catch {
        invalid.push(`${key} (invalid url: "${value}")`);
      }
    }
  }

  if (missing.length > 0) {
    console.error(`\nMissing environment variables:\n${missing.map(k => `   - ${k}`).join('\n')}\n`);
  }
  if (invalid.length > 0) {
    console.error(`\nInvalid environment variables:\n${invalid.map(k => `   - ${k}`).join('\n')}\n`);
  }
  if (missing.length === 0 && invalid.length === 0) {
    console.info('✅ All required environment variables are set.');
    return;
  }
  process.exit(1);
}

const s = (value: string | undefined, type: EnvType = 'str') => ({ value, type });

const EXAMPLE_SECRET = 'foobar'; // shipped in .env.*.example.local
const RECOMMENDED_SECRET_LENGTH = 32; // ~256-bit when base64/hex

function validateSecretStrength(): void {
  // Enforce only in deployed envs (TEST/prod run NODE_ENV=production); local dev may keep the template value.
  if (NODE_ENV !== 'production') {
    return;
  }
  const secret = (SECRET_KEY ?? '').trim();
  if (secret === EXAMPLE_SECRET) {
    console.error('\nInsecure SECRET_KEY: it is the shipped example value; set a strong unique secret.\n');
    process.exit(1);
  }
  if (secret.length < RECOMMENDED_SECRET_LENGTH) {
    console.warn(`⚠️  SECRET_KEY is shorter than the recommended ${RECOMMENDED_SECRET_LENGTH} characters.`);
  }
}

const validateEnv = () => {
  // Every request to the APIs is for this municipality; the client never names one.
  if (!MUNICIPALITY_ID) {
    console.error('\nMUNICIPALITY_ID must be set\n');
    process.exit(1);
  }

  let handlerRoles: readonly HandlerGroupRole[];
  try {
    handlerRoles = resolveHandlerGroupRoles();
  } catch (error) {
    console.error(`\n${error instanceof Error ? error.message : 'Invalid handler role configuration'}\n`);
    process.exit(1);
  }

  // A role group whose members cannot log in holds a role nobody reaches; say so rather than let it look configured.
  const unauthorizedRoleGroups = findUnauthorizedHandlerRoleGroups(handlerRoles, SUPERADMIN_GROUP, AUTHORIZED_GROUPS);
  if (unauthorizedRoleGroups.length > 0) {
    logger.warn(
      `${HANDLER_ROLES_SETTING} names groups missing from AUTHORIZED_GROUPS, whose members cannot log in: ${unauthorizedRoleGroups.join(', ')}`,
    );
  }

  try {
    resolveSupportManagementApiTarget();
    resolveSupportManagementErrandSearch();
  } catch (error) {
    console.error(`\n${error instanceof Error ? error.message : 'Invalid Support Management runtime configuration'}\n`);
    process.exit(1);
  }

  warnMissingEnv({
    NODE_ENV: s(NODE_ENV),
    SECRET_KEY: s(SECRET_KEY),
    API_BASE_URL: s(API_BASE_URL),
    CLIENT_KEY: s(CLIENT_KEY),
    CLIENT_SECRET: s(CLIENT_SECRET),
    PORT: s(PORT, 'port'),
    BASE_URL_PREFIX: s(BASE_URL_PREFIX),
    SAML_CALLBACK_URL: s(SAML_CALLBACK_URL, 'url'),
    SAML_LOGOUT_CALLBACK_URL: s(SAML_LOGOUT_CALLBACK_URL, 'url'),
    SAML_SUCCESS_REDIRECT: s(SAML_SUCCESS_REDIRECT, 'url'),
    SAML_FAILURE_REDIRECT: s(SAML_FAILURE_REDIRECT, 'url'),
    SAML_ENTRY_SSO: s(SAML_ENTRY_SSO, 'url'),
    SAML_ISSUER: s(SAML_ISSUER),
    SAML_IDP_PUBLIC_CERT: s(SAML_IDP_PUBLIC_CERT),
    SAML_PRIVATE_KEY: s(SAML_PRIVATE_KEY),
    SAML_PUBLIC_KEY: s(SAML_PUBLIC_KEY),
    AUTHORIZED_GROUPS: s(AUTHORIZED_GROUPS),
    LOG_DIR: s(LOG_DIR),
    ADMIN_GROUP: s(ADMIN_GROUP),
    DEVELOPER_GROUP: s(DEVELOPER_GROUP),
    SUPERADMIN_GROUP: s(SUPERADMIN_GROUP),
    DOMAIN: s(DOMAIN),
    SUPPORTMANAGEMENT_NAMESPACE: s(SUPPORTMANAGEMENT_NAMESPACE),
    SUPPORTMANAGEMENT_SENDER_EMAIL: s(SUPPORTMANAGEMENT_SENDER_EMAIL),
    SUPPORTMANAGEMENT_SENDER_SMS: s(SUPPORTMANAGEMENT_SENDER_SMS),
  });
  validateSecretStrength();
};

export default validateEnv;
