import { MessageWrapper } from '@common/components/message/message-wrapper.component';
import { useSupportStore } from '@stores/index';
import { SupportMessageForm } from '@supportmanagement/components/support-message-form/support-message-form.component';
import { isSupportErrandLocked } from '@supportmanagement/services/support-errand-service';
import { useEffect, useState } from 'react';

export const MessagePortal: React.FC = () => {
  const supportErrand = useSupportStore((s) => s.supportErrand);
  const setSupportErrand = useSupportStore((s) => s.setSupportErrand);
  const [show, setShow] = useState(false);

  const close = () => setShow(false);

  useEffect(() => {
    const handler = () => {
      setShow(true);
    };
    window.addEventListener('openMessage', handler);
    return () => window.removeEventListener('openMessage', handler);
  }, []);

  useEffect(() => {
    const handler = () => setShow(true);
    window.addEventListener('openMessage', handler);
    return () => window.removeEventListener('openMessage', handler);
  }, []);

  if (!supportErrand) return null;

  return (
    <MessageWrapper show={show} label="Nytt meddelande" closeHandler={close}>
      <SupportMessageForm
        locked={isSupportErrandLocked(supportErrand)}
        showMessageForm={show}
        setShowMessageForm={setShow}
        prefillEmail={supportErrand?.customer?.[0]?.emails?.[0]?.value}
        prefillPhone={supportErrand?.customer?.[0]?.phoneNumbers?.[0]?.value}
        setUnsaved={() => {}}
        message={undefined as any}
        update={() => setSupportErrand({ ...supportErrand })}
      />
    </MessageWrapper>
  );
};
