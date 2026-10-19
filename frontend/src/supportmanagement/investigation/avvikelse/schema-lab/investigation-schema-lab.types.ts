const localInvestigationDocumentKeys = [
  'utredning-enhetschef',
  'utredning-sol-lss',
  'utredning-hsl',
  'beslut-hsl',
  'beslut-sol-lss',
] as const;

export type LocalInvestigationDocumentKey = (typeof localInvestigationDocumentKeys)[number];

const investigationLabRoles = ['unitManager', 'lexInvestigator', 'masMar', 'decisionMaker', 'reader'] as const;

export type InvestigationLabRole = (typeof investigationLabRoles)[number];

export interface InvestigationSchemaAccess {
  canRead: boolean;
  canWrite: boolean;
}

export interface InvestigationLabRoleOption {
  value: InvestigationLabRole;
  label: string;
  description: string;
}

export interface InvestigationLabNotice {
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
}
