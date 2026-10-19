'use client';

import { Alert } from '@sk-web-gui/react';
import { FC } from 'react';

/** Says why every field of the errand is locked: the user may know of the errand, not work in it. */
export const SupportErrandLimitedAccessAlert: FC<{ notice: string }> = ({ notice }) => (
  <Alert type="warning" data-cy="limited-access-errand">
    <Alert.Icon />
    <Alert.Content>
      <Alert.Content.Description>{notice}</Alert.Content.Description>
    </Alert.Content>
  </Alert>
);
