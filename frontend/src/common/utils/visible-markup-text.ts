/** The words of a piece of editor markup: tags, non-breaking spaces and runs of whitespace taken out. */
export const visibleMarkupText = (markup: unknown): string =>
  typeof markup === 'string'
    ? markup
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    : '';

/**
 * Whether a rich-text answer holds no words. An editor that was typed in and then emptied leaves
 * markup such as `<p><br></p>` rather than an empty string, which a `required` check takes for an answer.
 */
export const isBlankMarkup = (markup: unknown): boolean =>
  typeof markup === 'string' && visibleMarkupText(markup) === '';
