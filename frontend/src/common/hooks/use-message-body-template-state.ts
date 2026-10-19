import { useRef, useState } from 'react';

export const useMessageBodyTemplateState = () => {
  const [bodyEdited, setBodyEdited] = useState(false);
  const bodyEditedRef = useRef(false);
  const lastAppliedTemplateRef = useRef('');
  const replyHistoryRef = useRef('');
  const lastSetupKeyRef = useRef('');

  const setBodyEditedState = (edited: boolean) => {
    bodyEditedRef.current = edited;
    setBodyEdited(edited);
  };

  const shouldSkipAutoApply = (setupKey: string): boolean => {
    return bodyEditedRef.current && lastSetupKeyRef.current === setupKey;
  };

  const markAutoApplied = (setupKey: string) => {
    lastSetupKeyRef.current = setupKey;
  };

  return {
    bodyEdited,
    lastAppliedTemplateRef,
    replyHistoryRef,
    setBodyEditedState,
    shouldSkipAutoApply,
    markAutoApplied,
  };
};
