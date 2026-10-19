import type { Label } from '@common/data-contracts/supportmanagement/data-contracts';

/**
 * The access label that moves an avvikelse errand from its unit manager to the LEX roles.
 *
 * Writing it is the backend's job; the client only needs to recognise it, so that a handover it has
 * already performed is not offered again. Support Management's AccessMapper is what actually grants
 * and revokes the access - Draken shows and hides nothing of its own on the strength of this label.
 */
export const ACCESS_LEX_LABEL_PATH = 'ACCESS/LEX';

/**
 * The label the BFF marks the errand with once the unit manager's investigation is saved with a high HSL risk.
 * It is how MAS/MAR reach the errand, and it stays once set.
 */
export const HIGH_HSL_RISK_LABEL_PATH = 'RISK/HIGH_HSL';

/**
 * The label the BFF marks the errand with when MAS/MAR asks the head of operations for their comment on the HSL
 * event analysis. It opens VC kommentar HSL, and Support Management notifies the head of operations from it.
 */
export const VC_COMMENT_REQUESTED_LABEL_PATH = 'ANALYSIS/VC_COMMENT_HSL';

/**
 * The HSL risk value at which the errand is escalated: the warning shown to the unit manager. The BFF marks the
 * errand `RISK/HIGH_HSL` from the same value whenever the investigation is saved, which is how MAS/MAR reach it.
 */
export const HSL_RISK_ESCALATION_THRESHOLD = 4;

const normalizeResourcePath = (value: string | undefined): string =>
  (value ?? '')
    .trim()
    .replace(/^\/+|\/+$/gu, '')
    .toUpperCase();

/**
 * The resource paths an errand's labels stand for.
 *
 * A label on the errand does not always carry its own `resourcePath`, so the metadata tree is the
 * fallback: the id is the identity and the path is looked up from it, never rebuilt by joining the
 * names of the levels it passes through.
 */
const resolveErrandLabelResourcePaths = (
  labels: Label[] | undefined,
  labelStructure: Label[] | undefined
): string[] => {
  const pathsById = new Map<string, string>();
  const visit = (nodes: Label[] | undefined): void => {
    for (const node of nodes ?? []) {
      if (node.id && node.resourcePath?.trim()) pathsById.set(node.id, node.resourcePath);
      visit(node.labels);
    }
  };
  visit(labelStructure);

  return (labels ?? [])
    .map((label) => (label.resourcePath?.trim() ? label.resourcePath : label.id ? pathsById.get(label.id) : undefined))
    .filter((resourcePath): resourcePath is string => typeof resourcePath === 'string');
};

/** Whether the errand already carries a given access label. */
export const hasErrandLabel = (
  labels: Label[] | undefined,
  labelStructure: Label[] | undefined,
  resourcePath: string
): boolean => {
  const wanted = normalizeResourcePath(resourcePath);
  return resolveErrandLabelResourcePaths(labels, labelStructure).some((path) => normalizeResourcePath(path) === wanted);
};
