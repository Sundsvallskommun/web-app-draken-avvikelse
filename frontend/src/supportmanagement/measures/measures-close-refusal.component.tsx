import { FC } from 'react';

/** Says, beneath a close control it has disabled, what has to happen to the measures first. */
export const MeasuresCloseRefusal: FC<{ refusal: string | undefined }> = ({ refusal }) =>
  refusal ? (
    <p className="text-small text-dark-secondary" data-cy="measures-close-refusal">
      {refusal}
    </p>
  ) : null;
