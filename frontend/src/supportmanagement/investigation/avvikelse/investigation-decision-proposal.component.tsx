'use client';

import { sanitized } from '@common/services/sanitizer-service';

import type { InvestigationDecisionProposal } from './investigation-decision-proposal';

interface InvestigationDecisionProposalProps {
  /** Undefined when the investigation has not been saved on the errand. */
  readonly proposal: InvestigationDecisionProposal | undefined;
  readonly degreeTitle: string | undefined;
}

/**
 * The investigator's proposal, shown read-only above the lex Sarah decision so the decision maker
 * sees what the investigation concluded without opening it. The decision never copies it.
 */
export function InvestigationDecisionProposal({ proposal, degreeTitle }: Readonly<InvestigationDecisionProposalProps>) {
  return (
    <section
      className="mb-24 rounded-12 border-1 border-divider bg-background-content p-16 sm:p-24"
      aria-labelledby="investigation-decision-proposal-heading"
      data-cy="investigation-decision-proposal"
    >
      <h3 id="investigation-decision-proposal-heading" className="text-h4-md">
        Förslag till beslut från utredning SoL/LSS
      </h3>
      {proposal ? (
        <dl className="mt-12 flex flex-col gap-12">
          <div>
            <dt className="text-label-medium font-bold">Utredaren bedömer att rapporten utgjorde</dt>
            <dd className="mt-4" data-cy="investigation-decision-proposal-degree">
              {degreeTitle ?? '—'}
            </dd>
          </div>
          <div>
            <dt className="text-label-medium font-bold">Motivering</dt>
            <dd className="mt-4" data-cy="investigation-decision-proposal-motivation">
              {proposal.motivation ? (
                <div
                  className="[&_p]:mb-8 [&_p:last-child]:mb-0"
                  dangerouslySetInnerHTML={{ __html: sanitized(proposal.motivation) }}
                />
              ) : (
                <span className="italic">Ingen motivering angiven.</span>
              )}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="mt-8" data-cy="investigation-decision-proposal-missing">
          Utredningen SoL/LSS har inte sparats i ärendet ännu, så det finns inget förslag till beslut att visa.
        </p>
      )}
    </section>
  );
}
