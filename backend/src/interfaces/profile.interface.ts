import { Profile as SamlProfile } from '@node-saml/passport-saml';

export interface Profile extends SamlProfile {
  // Field names depend on federation system used
  givenName?: string;
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname'?: string;
  sn?: string;
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname'?: string;
  email?: string;
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'?: string;
  groups?: string;
  'http://schemas.xmlsoap.org/claims/Group'?: string[];
  attributes?: { [key: string]: any };
  'urn:oid:0.9.2342.19200300.100.1.1'?: string;
}
