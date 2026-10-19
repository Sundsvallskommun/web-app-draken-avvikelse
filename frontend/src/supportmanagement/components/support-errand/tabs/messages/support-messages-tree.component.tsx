import { Button, cx, Divider } from '@sk-web-gui/react';
import {
  countAllMessages,
  countUnreadMessages,
  MessageNode,
} from '@supportmanagement/services/support-message-service';
import { Dispatch, FC, Fragment, SetStateAction, useState } from 'react';

import { RenderedSupportMessage } from './rendered-support-message.component';

interface MessageTreeProps {
  update: () => void;
  setShowMessageForm: Dispatch<SetStateAction<boolean>>;
  nodes: MessageNode[];
  selected: string;
  onSelect: (node: MessageNode) => void;
}

const getId = (node: MessageNode): string => {
  if (node?.conversationId && node.conversationId !== '') {
    return node?.conversationId;
  }
  if (node?.emailHeaders && node.emailHeaders['MESSAGE_ID'] && node.emailHeaders['MESSAGE_ID'][0]) {
    return node.emailHeaders['MESSAGE_ID'][0];
  }
  return '';
};

const MessageNodeComponent: FC<{
  update: () => void;
  setShowMessageForm: Dispatch<SetStateAction<boolean>>;
  node: MessageNode;
  selected: string;
  onSelect: (node: MessageNode) => void;
  root?: boolean;
}> = ({ update, setShowMessageForm, node, selected, onSelect, root = false }) => {
  const [showChildren, setShowChildren] = useState(true);

  return (
    <>
      <div className="m-md mr-0" id={`node-${getId(node)}`}>
        <RenderedSupportMessage
          update={update}
          message={node}
          setShowMessageForm={setShowMessageForm}
          selected={selected}
          onSelect={onSelect}
          root={root}
        >
          {root && node.children?.length ? (
            <Button
              size="sm"
              className="text-small"
              variant="link"
              onClick={(e) => {
                e.preventDefault();
                setShowChildren(!showChildren);
              }}
            >
              {showChildren
                ? `Dölj svar`
                : `Visa svar (${countAllMessages(node.children)} varav ${countUnreadMessages(node.children)} ${
                    countUnreadMessages(node.children) === 1 ? 'oläst' : 'olästa'
                  })`}
            </Button>
          ) : null}
        </RenderedSupportMessage>
        {showChildren && node.children && node.children.length > 0 && (
          <div className={cx(root ? 'border-l' : 'border-l')}>
            {node.children.map((child, idx) => (
              <MessageNodeComponent
                update={update}
                setShowMessageForm={setShowMessageForm}
                key={`${idx}-${getId(child)}`}
                node={child}
                selected={selected}
                onSelect={onSelect}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
};

const MessageTreeComponent: FC<MessageTreeProps> = ({ update, setShowMessageForm, nodes, selected, onSelect }) => {
  return (
    <div className="my-lg">
      {nodes.map((node, idx) => (
        <Fragment key={`${idx}-${getId(node)}`}>
          <Divider />
          <MessageNodeComponent
            update={update}
            setShowMessageForm={setShowMessageForm}
            node={node}
            selected={selected}
            onSelect={onSelect}
            root={true}
          />
        </Fragment>
      ))}
    </div>
  );
};

export default MessageTreeComponent;
