import { prettyTime } from '@common/services/helper-service';
import { getReferredFromErrands, ReferredFromErrandResponse } from '@common/services/relations-service';
import { sanitized } from '@common/services/sanitizer-service';
import { Button } from '@sk-web-gui/button';
import { ExternalIdType, getChannelLabel } from '@supportmanagement/services/support-errand-service';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { FC, useEffect, useState } from 'react';

import { PriorityComponent } from '../priority/priority.component';

const DescriptionSection: FC<{ description: string; open: boolean }> = ({ description, open }) => {
  return (
    <div className="flex flex-col">
      <span className="font-bold text-small">Ärendebeskrivning</span>
      <span
        className={`text-small ${open ? '' : 'line-clamp-3'}`}
        dangerouslySetInnerHTML={{ __html: sanitized(description) }}
      />
    </div>
  );
};

interface Props {
  municipalityId: string;
  errandId: string;
}

export const ReferredFromErrandInformation: FC<Props> = ({ municipalityId, errandId }) => {
  const [referredFromErrands, setReferredFromErrands] = useState<ReferredFromErrandResponse[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!municipalityId || !errandId) return;

    getReferredFromErrands(municipalityId, errandId)
      .then((data) => {
        setReferredFromErrands(data);
      })
      .catch((error) => {
        console.error('Error fetching referred from errands:', error);
      });
  }, [municipalityId, errandId]);

  if (referredFromErrands.length === 0) {
    return null;
  }

  const categorization = [
    referredFromErrands[0]?.classificationCategoryDisplayName,
    referredFromErrands[0]?.classificationTypeDisplayName,
  ]
    .filter(Boolean)
    .join(' - ');

  return (
    <div className="py-16 px-24 flex bg-background-color-mixin-1 border rounded-button">
      <div className="flex flex-col gap-24">
        <h4 className="text-h4-sm">Information från överlämning</h4>
        <div className="flex flex-row gap-80">
          <div className="flex flex-col">
            <span className="font-bold text-small">Ärendetyp</span>
            <span className="text-small">{categorization}</span>
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-small">Ärendenummer</span>
            <span className="text-small">{referredFromErrands[0]?.errandNumber}</span>
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-small">Prioritet</span>
            <div className="flex text-small items-center gap-4">
              <PriorityComponent priority={referredFromErrands[0]?.priority} />
            </div>
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-small">Inkom via</span>
            <span className="text-small">{getChannelLabel(referredFromErrands[0]?.channel)}</span>
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-small">Registrerat</span>
            <span className="text-small">{prettyTime(referredFromErrands[0]?.created)}</span>
          </div>
        </div>
        <DescriptionSection description={referredFromErrands[0]?.description} open={open} />
        {open && (
          <div className="flex flex-row gap-60">
            {referredFromErrands[0]?.stakeholders.map((stakeholder, index) => (
              <div key={index} className="flex flex-col gap-8">
                <span className="font-bold text-small">{stakeholder.roleDisplayName}</span>
                <span className="text-small">
                  {stakeholder.externalIdType === ExternalIdType.COMPANY
                    ? `${stakeholder.organizationName}, ${stakeholder.organizationNumber}`
                    : stakeholder.externalIdType === ExternalIdType.PRIVATE
                    ? `${stakeholder.firstName} ${stakeholder.lastName}, ${stakeholder.personNumber}`
                    : 'Okänd part'}
                </span>
                <span className="text-small">
                  {stakeholder.address} {stakeholder.zipCode} {stakeholder.city}
                </span>
                {stakeholder.contactChannels.map((channel, idx) => (
                  <span key={idx} className="text-small">
                    {channel.value}
                  </span>
                ))}
              </div>
            ))}
          </div>
        )}
        <Button
          size="sm"
          className="w-fit"
          variant="tertiary"
          rightIcon={open ? <ChevronUp /> : <ChevronDown />}
          onClick={() => setOpen(!open)}
        >
          {open ? 'Visa mindre' : 'Visa mer'}
        </Button>
      </div>
    </div>
  );
};
