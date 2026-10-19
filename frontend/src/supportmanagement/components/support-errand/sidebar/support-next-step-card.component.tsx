import { Button } from '@sk-web-gui/react';
import { useSupportStore } from '@stores/index';
import type { InvestigationNextStep } from '@supportmanagement/investigation/investigation-variant';
import { ArrowRight } from 'lucide-react';
import { useId } from 'react';

/**
 * The handler's next step, above the handling controls it often points to: what to do, and a way to the tab it is
 * done in. It sits in Handläggning rather than above the errand so that the page's own header stays as it is.
 */
export function SupportNextStepCard({ step }: Readonly<{ step: InvestigationNextStep }>) {
  const headingId = useId();
  const setActiveTabKey = useSupportStore((state) => state.setActiveTabKey);
  return (
    <section
      aria-labelledby={headingId}
      data-cy="support-next-step"
      className="rounded-12 border-1 border-vattjom-surface-primary bg-vattjom-background-100 p-12 flex flex-col gap-8"
    >
      <h3 id={headingId} className="text-label-medium">
        Nästa steg
      </h3>
      <p className="text-small" data-cy="support-next-step-text">
        {step.text}
      </p>
      {step.tab && (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="self-start"
          rightIcon={<ArrowRight />}
          onClick={() => setActiveTabKey(step.tab!.key)}
          data-cy="support-next-step-tab"
        >
          Gå till {step.tab.label}
        </Button>
      )}
    </section>
  );
}
