import { normalizeSupportManagementResourcePath } from './supportmanagement-path';

/**
 * The label that moves an avvikelse errand from its unit manager to the LEX roles.
 *
 * This is an access label, not classification: Support Management's AccessMapper matches a user's
 * configured label patterns against an errand's labels, so adding `ACCESS/LEX` is what actually
 * hands the errand over — the unit manager stops seeing it and the LEX roles start. Draken
 * therefore implements no visibility rule of its own; it only writes the label.
 *
 * The `ACCESS` tree currently holds exactly this one label. MAS/MAR reach HSL errands some other
 * way, so an HSL risk value has no label to write and no handover step.
 *
 * Fixed rather than configurable, for the same reason the IAF/VOF label tree is fixed: it is a
 * business rule, and a deployment that could rename it could silently strand an errand where no
 * role can reach it.
 */
const INVESTIGATION_ACCESS_LABEL_ROOT = 'ACCESS';

/** Set when a unit manager assesses an avvikelse as a suspected misconduct and hands it to LEX. */
export const INVESTIGATION_ACCESS_LEX_LABEL = 'ACCESS/LEX';

/**
 * The report type an errand is registered with, and the one it gets when the unit manager assesses
 * it as a suspected misconduct. A report type is single-valued, so the handover swaps one for the
 * other rather than adding to it.
 *
 * Note what the swap means beyond the label itself: `REPORT_TYPE/ABUSE` is one of the paths
 * `resolveIafVofInvestigationClassificationOwner` reads, so setting it moves classification
 * ownership from the unit manager's investigation to the SoL/LSS one and forces SOL and LSS as
 * legal bases. The errand's `eventType` parameter is deliberately left alone.
 */
export const INVESTIGATION_DEVIATION_REPORT_LABEL = 'REPORT_TYPE/DEVIATION';
export const INVESTIGATION_MISCONDUCT_REPORT_LABEL = 'REPORT_TYPE/ABUSE';

/**
 * Set when MAS/MAR asks the head of operations for their comment on the HSL event analysis. It moves no access:
 * the errand stays with its handler, and the head of operations already reaches it through its place. It opens VC
 * kommentar HSL, and Support Management's subscription profile for the head of operations notifies them from it.
 */
export const INVESTIGATION_VC_COMMENT_REQUESTED_LABEL = 'ANALYSIS/VC_COMMENT_HSL';

const ACCESS_LABEL_ROOT_PREFIX = `${normalizeSupportManagementResourcePath(INVESTIGATION_ACCESS_LABEL_ROOT)}/`;

const HANDOVER_REPORT_LABELS: ReadonlySet<string> = new Set(
  [INVESTIGATION_DEVIATION_REPORT_LABEL, INVESTIGATION_MISCONDUCT_REPORT_LABEL].map(normalizeSupportManagementResourcePath),
);

const HANDOVER_REQUEST_LABELS: ReadonlySet<string> = new Set([normalizeSupportManagementResourcePath(INVESTIGATION_VC_COMMENT_REQUESTED_LABEL)]);

/**
 * Whether a resource path is one a handover step may write.
 *
 * The paths come from the step table rather than from the request, so this is a backstop rather than
 * input validation: it keeps an added step from turning the handover route into a second, unguarded
 * way to reclassify an errand. Three label families qualify - the access labels that move the errand
 * between roles, the report type the misconduct assessment changes, and the request that brings the head
 * of operations in to comment on the HSL analysis.
 */
export const isInvestigationHandoverLabelPath = (resourcePath: string): boolean => {
  const normalized = normalizeSupportManagementResourcePath(resourcePath);
  return normalized.startsWith(ACCESS_LABEL_ROOT_PREFIX) || HANDOVER_REPORT_LABELS.has(normalized) || HANDOVER_REQUEST_LABELS.has(normalized);
};

/**
 * The classification marking a label as a place, in the hierarchy describing where an errand
 * happened.
 *
 * The place is identified by classification rather than by where it sits in the path, because the
 * hierarchy mixes kinds: the levels above a place are classified `DEPARTMENT`, and a department is
 * not something AccessMapper's patterns are written against. Matching on the path prefix instead
 * would accept those ancestors and resolve a manager for a whole department.
 */
const INVESTIGATION_LOCATION_LABEL_CLASSIFICATION = 'LOCATION';

/**
 * Normalizes a label classification for comparison, matching how Support Management classifications
 * are compared elsewhere in the BFF: case and the `_`/`-` spelling are presentation, not identity.
 */
const normalizeLabelClassification = (classification: string | undefined): string => (classification ?? '').trim().replaceAll('_', '-').toUpperCase();

const LOCATION_LABEL_CLASSIFICATION = normalizeLabelClassification(INVESTIGATION_LOCATION_LABEL_CLASSIFICATION);

/** Whether a metadata label is a place, as opposed to a department or the root above them. */
export const isInvestigationLocationLabelClassification = (classification: string | undefined): boolean =>
  normalizeLabelClassification(classification) === LOCATION_LABEL_CLASSIFICATION;
