import { User } from '@common/interfaces/user';
import { EMAIL_INFORMATION_TEXT, MessageTemplates } from '@common/services/message-template-body-service';
import { getTemplateRole, getTemplateType } from '@common/utils/template-metadata';
import {
  fetchTemplatesWithMetadata,
  replaceTemplateParameters,
} from '@supportmanagement/services/message-template-service';
import { useEffect, useState } from 'react';

/** The Templating prefix the message templates are read from, beside the internal ones. */
const TEMPLATE_PREFIX = 'default';

/** Signatures and closings are added to a message, never chosen as its template. */
const isSelectableTemplate = (role: string | undefined, excludedRoles: readonly string[]): boolean =>
  !excludedRoles.includes(role || '');

interface UseMessageTemplatesResult {
  templates: MessageTemplates | null;
}

export function useMessageTemplates(user: User, shouldLoad: boolean): UseMessageTemplatesResult {
  const [templates, setTemplates] = useState<MessageTemplates | null>(null);

  useEffect(() => {
    if (!shouldLoad || templates) return;

    const loadTemplates = async () => {
      try {
        const userName = `${user.firstName} ${user.lastName}`;

        const [defaultResult, internalResult] = await Promise.all([
          fetchTemplatesWithMetadata({ prefix: `${TEMPLATE_PREFIX}.` }),
          fetchTemplatesWithMetadata({ prefix: 'internal.' }),
        ]);

        const getContent = (id: string, params: Record<string, string> = {}) => {
          const template = defaultResult.byId[id] || internalResult.byId[id];
          if (!template) return '';
          return replaceTemplateParameters(template.content, params);
        };

        const internalSignature = getContent('internal.signature', { user: userName });
        const smsSignature = getContent(`${TEMPLATE_PREFIX}.sms.signature`, { user: userName });
        const smsTemplate = getContent(`${TEMPLATE_PREFIX}.sms.default`, { user: userName }) + smsSignature;
        const emailSignature = getContent(`${TEMPLATE_PREFIX}.email.signature`, {
          user: userName,
          email_information: EMAIL_INFORMATION_TEXT,
        });

        const emailTemplates = defaultResult.templates.filter(
          (template) =>
            getTemplateType(template) === 'email' &&
            isSelectableTemplate(getTemplateRole(template), ['signature', 'publicdocuments', 'closing'])
        );
        const smsTemplates = defaultResult.templates.filter(
          (template) =>
            getTemplateType(template) === 'sms' &&
            isSelectableTemplate(getTemplateRole(template), ['signature', 'closing'])
        );

        const byId: Record<string, string> = {};
        for (const template of [...defaultResult.templates, ...internalResult.templates]) {
          byId[template.identifier] = template.content;
        }

        setTemplates({
          internalSignature,
          smsTemplate,
          smsSignature,
          emailSignature,
          emailTemplates,
          smsTemplates,
          byId,
          app: TEMPLATE_PREFIX,
        });
      } catch (error) {
        console.error('Failed to load templates', error);
      }
    };

    loadTemplates();
  }, [shouldLoad, templates, user.firstName, user.lastName]);

  return { templates };
}
