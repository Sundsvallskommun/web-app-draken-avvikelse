import { IAF_VOF_HIGH_HSL_RISK_LABEL } from './iaf-vof-high-hsl-risk';
import { IAF_VOF_HSL_ANALYSIS_STARTED_LABEL } from './iaf-vof-hsl-analysis';
import { INVESTIGATION_VC_COMMENT_REQUESTED_LABEL } from './investigation-handover-labels';

/**
 * The labels an IAF/VOF errand keeps for good once it carries them. They decide who reaches the errand and who is
 * told about it - MAS/MAR through the high HSL risk, the head of operations through the two analysis labels - so
 * Draken only ever adds them: no rule takes one off, no handover step names one to remove, and a generic errand
 * write that leaves one out has it put back. They are written like any action of the user's, never silently.
 */
export const IAF_VOF_PERMANENT_LABELS: readonly string[] = Object.freeze([
  IAF_VOF_HIGH_HSL_RISK_LABEL,
  IAF_VOF_HSL_ANALYSIS_STARTED_LABEL,
  INVESTIGATION_VC_COMMENT_REQUESTED_LABEL,
]);
