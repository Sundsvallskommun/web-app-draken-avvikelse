const escapeHtml = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/** Whether the text is markup already rather than plain text. */
const isMarkup = (text: string): boolean => /<\/?[a-z][^>]*>/iu.test(text);

/**
 * Plain text the way the rich text editor writes it - a paragraph per line, an empty line as `<p><br></p>` - so
 * an editor shown the text does not rewrite it and mark the form changed. Markup is returned as it is.
 */
export const plainTextToHtml = (text: string): string =>
  isMarkup(text)
    ? text
    : text
        .split(/\r?\n/u)
        .map((line) => `<p>${line ? escapeHtml(line) : '<br>'}</p>`)
        .join('');
