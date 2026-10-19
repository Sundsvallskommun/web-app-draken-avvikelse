import { FC, useId } from 'react';

import type { InvestigationDocumentAuthor as DocumentAuthor } from './investigation-document-author';

/**
 * Who the document is by - Beslutsfattare on a decision - shown where the UI schema places it. Read-only by
 * nature: the server records it, so there is nothing here to fill in.
 */
export const InvestigationDocumentAuthor: FC<{ author: DocumentAuthor }> = ({ author }) => {
  const headingId = useId();
  return (
    <section className="my-md w-full" aria-labelledby={headingId} data-cy="investigation-document-author">
      <h3 id={headingId} className="text-h4-md mb-8">
        {author.title}
      </h3>
      <dl className="m-0 flex flex-col gap-4">
        {author.details.map(({ label, value }) => (
          <div key={label} className="flex gap-8">
            <dt className="font-bold">{label}:</dt>
            <dd className="m-0">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
};
