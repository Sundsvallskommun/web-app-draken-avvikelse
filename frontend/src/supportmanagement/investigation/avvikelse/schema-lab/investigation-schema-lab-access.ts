import {
  InvestigationLabRole,
  InvestigationLabRoleOption,
  InvestigationSchemaAccess,
  LocalInvestigationDocumentKey,
} from './investigation-schema-lab.types';

export const investigationLabRoleOptions: readonly InvestigationLabRoleOption[] = [
  {
    value: 'unitManager',
    label: 'Enhetschef',
    description: 'Kan redigera enhetschefens utredning.',
  },
  {
    value: 'lexInvestigator',
    label: 'Lex Sarah',
    description: 'Kan redigera utredningen enligt SoL/LSS.',
  },
  {
    value: 'masMar',
    label: 'MAS/MAR',
    description: 'Kan redigera utredningen och beslutet enligt HSL.',
  },
  {
    value: 'decisionMaker',
    label: 'LEX-ansvarig',
    description: 'Kan redigera beslutet enligt lex Sarah om ett missförhållande.',
  },
  {
    value: 'reader',
    label: 'Läsare',
    description: 'Kan läsa samtliga utredningar men inte redigera.',
  },
];

const schemaOwnerByKey: Record<LocalInvestigationDocumentKey, Exclude<InvestigationLabRole, 'reader'>> = {
  'utredning-enhetschef': 'unitManager',
  'utredning-sol-lss': 'lexInvestigator',
  'utredning-hsl': 'masMar',
  'beslut-hsl': 'masMar',
  'beslut-sol-lss': 'decisionMaker',
};

/**
 * The lab uses this narrow adapter instead of coupling forms to role names.
 * A future SupportManagement authorization response can replace this mapping
 * while the form continues to consume only canRead/canWrite.
 */
export function getInvestigationSchemaAccess(
  role: InvestigationLabRole,
  schemaKey: LocalInvestigationDocumentKey
): InvestigationSchemaAccess {
  return {
    canRead: true,
    canWrite: schemaOwnerByKey[schemaKey] === role,
  };
}
