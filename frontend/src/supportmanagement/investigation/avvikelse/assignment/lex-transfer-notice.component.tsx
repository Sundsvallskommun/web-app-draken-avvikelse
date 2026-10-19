'use client';

import { Alert } from '@sk-web-gui/react';
import { useSupportStore } from '@stores/index';

import { describeLexTransfer, findLexTransferAction } from './lex-transfer';

/** A reported misconduct that Support Management moves to LEX on its own, and when that happens. */
export function LexTransferNotice() {
  const actions = useSupportStore((state) => state.supportErrand?.actions);
  const action = findLexTransferAction(actions);
  if (!action?.executeAfter) return null;

  return (
    <Alert type="warning" className="mb-16" data-cy="lex-transfer-notice">
      <Alert.Icon />
      <Alert.Content>
        <Alert.Content.Title>{action.displayValue || 'Ärendet flyttas automatiskt till LEX'}</Alert.Content.Title>
        <Alert.Content.Description>{describeLexTransfer(action.executeAfter)}</Alert.Content.Description>
      </Alert.Content>
    </Alert>
  );
}
