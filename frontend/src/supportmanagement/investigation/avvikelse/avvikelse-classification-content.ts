import type { LabelClassificationContent } from './label-classification/label-classification.component';

/** What the errand reports, which the categorization names its choices after: a deviation or a misconduct. */
export type AvvikelseReportKind = 'deviation' | 'misconduct';

const REPORT_WORDS: Record<
  AvvikelseReportKind,
  { readonly type: string; readonly types: string; readonly it: string }
> = {
  deviation: { type: 'avvikelsetyp', types: 'avvikelsetyper', it: 'avvikelsen' },
  misconduct: { type: 'typ av missförhållande', types: 'typer av missförhållanden', it: 'missförhållandet' },
};

const capitalized = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** What the category and undercategory selectors say, in the words of what the errand reports. */
export const avvikelseClassificationContent = (kind: AvvikelseReportKind): LabelClassificationContent => {
  const words = REPORT_WORDS[kind];
  return {
    typeLabel: `${capitalized(words.type)} (obligatoriskt)`,
    typePlaceholder: `Välj ${words.type}`,
    typeEmptyPlaceholder: `Inga ${words.types} tillgängliga`,
    typeHelperText: `Huvudkategori för ${words.it}`,
    subtypeLabel: 'Underkategori (obligatorisk)',
    subtypePlaceholder: 'Välj underkategori',
    subtypeBeforeTypePlaceholder: `Välj ${words.type} först`,
    subtypeEmptyPlaceholder: 'Saknar underkategorier',
    subtypeHelperText: `Underkategori för ${words.it}`,
  };
};

/** What the categorization says about the legal bases its selectors follow, wherever it is shown. */
export const avvikelseGroupedClassificationContent = (kind: AvvikelseReportKind) => ({
  heading: `Ange ${REPORT_WORDS[kind].type}`,
  noLegalBases: 'Välj lagrum för att kunna kategorisera ärendet.',
  everyLegalBase: `Välj ${REPORT_WORDS[kind].type} och underkategori för varje valt lagrum.`,
  missing: 'Kategoriseringen är inte ifylld. Den krävs innan utredningen kan markeras som klar.',
});
