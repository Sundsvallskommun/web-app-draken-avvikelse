import {
  getLabelCategory,
  getLabelSubType,
  getLabelType,
  SupportErrand,
} from '@supportmanagement/services/support-errand-service';
import { getLabelDisplayName } from '@supportmanagement/services/support-label-service';
import type { SupportMetadata } from '@supportmanagement/services/support-metadata-service';

interface ErrandLabelCategorizationCellProps {
  errand: SupportErrand;
  metadata: SupportMetadata | undefined;
}

/** The overview's category, named in the investigation's label tree. */
export const ErrandLabelCategoryCell: React.FC<ErrandLabelCategorizationCellProps> = ({ errand, metadata }) => (
  <>{getLabelDisplayName(getLabelCategory(errand, metadata), metadata)}</>
);

/** The overview's type and subtype, named in the investigation's label tree. */
export const ErrandLabelTypeCell: React.FC<ErrandLabelCategorizationCellProps> = ({ errand, metadata }) => (
  <div>
    <div>{getLabelDisplayName(getLabelType(errand), metadata)}</div>
    <div>{getLabelDisplayName(getLabelSubType(errand), metadata)}</div>
  </div>
);
