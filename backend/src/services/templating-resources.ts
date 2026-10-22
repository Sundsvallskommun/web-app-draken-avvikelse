/**
 * Sundsvalls kommun's logo as Templating keeps it, shared by every document the municipality renders. A template the
 * BFF renders directly (`render/direct/pdf`) includes it by this identifier: Templating reads the direct template from
 * the request and every other name from its own store, for the municipality the request is made for.
 *
 * Templating holds the logo, not this repo, so a missing resource fails the whole render rather than leaving a gap.
 */
export const SUNDSVALL_LOGO_RESOURCE = 'resource.image.logo.sundsvallskommun-medium';

/** The logo at the top of a document the BFF renders, above its title. The document's own style places it. */
export const SUNDSVALL_LOGO_HEADER = `<div class="logo">{% include "${SUNDSVALL_LOGO_RESOURCE}" %}</div>`;

/**
 * The logo flush with the text's left edge and the top of the page. Shown as a block, so no line box adds space around
 * it, and with no margin of its own whatever the resource's markup gives the image.
 */
export const SUNDSVALL_LOGO_STYLE = `.logo { margin: 0 0 6mm 0; }
  .logo img { display: block; margin: 0; }`;

/**
 * The page every document the BFF renders is laid out on: A4 with narrow margins, so the text uses most of the sheet's
 * width and the logo sits near its top edge. The body adds nothing to the page's margins - the renderer's own default
 * would indent everything a few millimetres more.
 */
export const PDF_PAGE_STYLE = `@page { size: A4; margin: 10mm 12mm 14mm 12mm; }
  body { margin: 0; padding: 0; }`;
