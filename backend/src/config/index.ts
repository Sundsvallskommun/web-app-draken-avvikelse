import { config } from 'dotenv';

import { APIS } from './api-config';

export { APIS };

config({ path: `.env.${process.env.NODE_ENV || 'development'}.local` });

export const CREDENTIALS = process.env.CREDENTIALS === 'true';
export const SWAGGER_ENABLED = process.env.SWAGGER_ENABLED === 'true';

// Single source of truth for environment configuration: every consumer imports the constant
// from here instead of reaching into `process.env`, so a missing key is a compile-time error
// rather than a silent `undefined`. `validateEnv` checks these same constants at startup.
export const {
  NODE_ENV,
  PORT,
  API_BASE_URL,
  LOG_FORMAT,
  LOG_DIR,
  ORIGIN,
  SECRET_KEY,
  CLIENT_KEY,
  CLIENT_SECRET,
  BASE_URL_PREFIX,
  SAML_CALLBACK_URL,
  SAML_LOGOUT_CALLBACK_URL,
  SAML_LOGOUT_URL,
  SAML_SUCCESS_REDIRECT,
  SAML_FAILURE_REDIRECT,
  SAML_ENTRY_SSO,
  SAML_ISSUER,
  SAML_IDP_PUBLIC_CERT,
  SAML_PRIVATE_KEY,
  SAML_PUBLIC_KEY,
  SUPPORTMANAGEMENT_NAMESPACE,
  AUTHORIZED_GROUPS,
  ADMIN_GROUP,
  SUPERADMIN_GROUP,
  DEVELOPER_GROUP,
  DOMAIN,
  SUPPORTMANAGEMENT_SENDER_EMAIL,
  SUPPORTMANAGEMENT_SENDER_SMS,
} = process.env;

/**
 * The municipality this deployment serves. The BFF reads it from its own configuration alone, never from the client,
 * and `validateEnv` stops the backend without it.
 */
export const MUNICIPALITY_ID: string = process.env.MUNICIPALITY_ID?.trim() ?? '';
