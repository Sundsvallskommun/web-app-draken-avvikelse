'use client';

import type { RJSFSchema } from '@rjsf/utils';
import { useConfirm } from '@sk-web-gui/react';
import { fetchTemplatesWithMetadata, type TemplateResult } from '@supportmanagement/services/message-template-service';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { InvestigationFormData } from './investigation-document';
import {
  type InvestigationTemplateOverwriteChoice,
  InvestigationTemplateOverwriteDialog,
} from './investigation-template-overwrite-dialog.component';
import {
  chosenInvestigationTemplate,
  INVESTIGATION_TEXT_TEMPLATE_PREFIX,
  investigationTextIsReplaceable,
  investigationTextTemplateIdentifier,
  readInvestigationText,
} from './investigation-text-template';

/** The document as the template hook reads it: its schema decides what chooses the template. */
interface InvestigationTextTemplateDraft {
  readonly schema: RJSFSchema;
  readonly formData: InvestigationFormData;
}

export interface InvestigationTextTemplate {
  /** Fills the text when the investigator chooses a template, asking before written text is replaced. */
  offer: (template: string) => Promise<void>;
  /**
   * Fills the text with the template a change of the legal bases calls for. Written text is only replaced after
   * asking, and the investigator may instead keep it, or undo the change of the legal bases (`undo`).
   */
  follow: (template: string, undo: () => void) => Promise<void>;
  /**
   * The text a new document starts with when its template is known from the start: its legal bases call for one
   * before the investigator does anything that would fill it. It is part of the document's start, not an edit, and
   * a later template replaces it without asking, as text a template put there.
   */
  startingText: (template: string) => Promise<string | undefined>;
  /** The question `follow` asks, rendered where the document is. */
  dialog: ReactNode;
}

/**
 * Fills the investigation text from the Templating API, from the template the investigator chooses or the legal
 * bases call for. Text that someone has written is only replaced after asking; text that is still exactly a
 * template's is replaced straight away, so trying legal bases before writing anything needs no confirmation. The
 * templates are read once per document, on the first need.
 */
export function useInvestigationTextTemplate(
  draft: InvestigationTextTemplateDraft | undefined,
  applyTemplateText: (template: string, text: string) => void
): InvestigationTextTemplate {
  const confirm = useConfirm();
  const latestDraft = useRef(draft);
  const insertedTemplateText = useRef<string | undefined>(undefined);
  const templates = useRef<Promise<TemplateResult> | undefined>(undefined);
  const [answerOverwrite, setAnswerOverwrite] = useState<(choice: InvestigationTemplateOverwriteChoice) => void>();

  useEffect(() => {
    latestDraft.current = draft;
  }, [draft]);

  const readTemplates = useCallback(() => {
    templates.current ??= fetchTemplatesWithMetadata(INVESTIGATION_TEXT_TEMPLATE_PREFIX);
    return templates.current;
  }, []);

  const readTemplateText = useCallback(
    async (template: string): Promise<string | undefined> =>
      (await readTemplates()).byId[investigationTextTemplateIdentifier(template)]?.content,
    [readTemplates]
  );

  /** Whether the text is empty, or still exactly a template's: what the last one put there, or any of them. */
  const textIsReplaceable = useCallback(async (): Promise<boolean> => {
    const templateTexts = (await readTemplates()).templates.map(({ content }) => content);
    return investigationTextIsReplaceable(readInvestigationText(latestDraft.current?.formData), [
      insertedTemplateText.current,
      ...templateTexts,
    ]);
  }, [readTemplates]);

  // The template may have moved on while the templates were on their way, or while the investigator was asked.
  const stillChosen = useCallback(
    (template: string) =>
      chosenInvestigationTemplate(latestDraft.current?.schema, latestDraft.current?.formData) === template,
    []
  );

  const fill = useCallback(
    (template: string, text: string) => {
      insertedTemplateText.current = text;
      applyTemplateText(template, text);
    },
    [applyTemplateText]
  );

  const startingText = useCallback(
    async (template: string) => {
      const text = await readTemplateText(template);
      if (text) insertedTemplateText.current = text;
      return text;
    },
    [readTemplateText]
  );

  const offer = useCallback(
    async (template: string) => {
      const text = await readTemplateText(template);
      if (!text || !stillChosen(template)) return;

      if (!(await textIsReplaceable())) {
        const replace = await confirm.showConfirmation(
          'Använda mallens text?',
          'Utredningstexten ersätts med texten i den valda mallen. Det som står där nu försvinner.',
          'Ja, ersätt',
          'Nej, behåll texten',
          'info',
          'question'
        );
        if (!replace || !stillChosen(template)) return;
      }
      fill(template, text);
    },
    [confirm, fill, readTemplateText, stillChosen, textIsReplaceable]
  );

  const askOverwrite = useCallback(
    () =>
      new Promise<InvestigationTemplateOverwriteChoice>((resolve) => {
        setAnswerOverwrite(() => resolve);
      }),
    []
  );

  const follow = useCallback(
    async (template: string, undo: () => void) => {
      const text = await readTemplateText(template);
      if (!text || !stillChosen(template)) return;

      if (!(await textIsReplaceable())) {
        const choice = await askOverwrite();
        if (choice === 'cancel') {
          undo();
          return;
        }
        if (choice === 'keep' || !stillChosen(template)) return;
      }
      fill(template, text);
    },
    [askOverwrite, fill, readTemplateText, stillChosen, textIsReplaceable]
  );

  const dialog = useMemo(
    () => (
      <InvestigationTemplateOverwriteDialog
        show={answerOverwrite !== undefined}
        onChoose={(choice) => {
          answerOverwrite?.(choice);
          setAnswerOverwrite(undefined);
        }}
      />
    ),
    [answerOverwrite]
  );

  return useMemo(() => ({ offer, follow, startingText, dialog }), [offer, follow, startingText, dialog]);
}
