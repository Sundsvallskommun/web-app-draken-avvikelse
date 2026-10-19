'use client';

import { FC, ReactNode } from 'react';

interface SupportErrandRegistrationLayoutProps {
  /** The buttons beside the heading, as CaseData places Avbryt and Registrera. */
  actions?: ReactNode;
  children: ReactNode;
  'data-cy'?: string;
}

/**
 * The page a new support errand is registered on, laid out as CaseData lays out its registration: the
 * heading with the page's actions beside it, and the form beneath in the errand page's card. Every
 * state of the form - loading, refused, filling in - keeps this frame, so the page does not jump.
 */
export const SupportErrandRegistrationLayout: FC<SupportErrandRegistrationLayoutProps> = ({
  actions,
  children,
  'data-cy': dataCy,
}) => (
  <div className="grow shrink overflow-y-hidden" data-cy={dataCy}>
    <div className="flex justify-center overflow-y-auto w-full h-full">
      <main className="flex-grow flex justify-center px-24 max-w-errand h-fit w-full pb-40">
        <div className="flex-grow w-full">
          <section className="bg-transparent pt-24 pb-4">
            <div
              data-cy="registerErrandHeading"
              className="flex flex-col md:flex-row gap-16 justify-between md:items-center pt-8 mb-md"
            >
              <h1 className="text-h3-sm md:text-h3-md xl:text-h2-lg mb-0 break-words">Registrera nytt ärende</h1>
              {actions && <div className="flex gap-md">{actions}</div>}
            </div>
          </section>
          <section className="bg-transparent pb-4">
            <div className="bg-transparent py-12">{children}</div>
          </section>
        </div>
      </main>
    </div>
  </div>
);
