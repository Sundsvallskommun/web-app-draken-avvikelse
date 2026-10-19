import { Button, cx, Header } from '@sk-web-gui/react';
import { Mail, X } from 'lucide-react';
import { FC } from 'react';

export const MessageWrapper: FC<{
  show: boolean;
  label: string;
  closeHandler: () => void;
  children: any;
}> = ({ show, label = '', closeHandler, children }) => (
  <>
    <div className={cx(show ? 'sk-modal-wrapper' : 'fixed')}></div>
    <section
      className={cx(
        `border-1 border-t-0 absolute right-0 bottom-0 top-0 bg-background-content transition-all ease-in-out duration-150 overflow-auto z-[20] shadow-100`,
        show ? 'w-full md:min-w-[50rem] md:w-[50vw] lg:w-[38vw]' : 'w-0 px-0'
      )}
    >
      <Header className="h-[64px] flex justify-between" wrapperClasses="py-4 px-40">
        <div className="text-h4-sm flex items-center gap-12">
          <Mail /> {label}
        </div>
        <Button
          tabIndex={show ? 0 : -1}
          aria-label="Stäng meddelande"
          iconButton
          variant="tertiary"
          onClick={() => {
            closeHandler();
          }}
          data-cy="close-message-wrapper"
        >
          <X data-cy="close-message-wrapper-icon" />
        </Button>
      </Header>
      {show && children}
    </section>
  </>
);
