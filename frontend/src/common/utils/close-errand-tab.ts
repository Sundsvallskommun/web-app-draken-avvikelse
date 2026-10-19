/** How long the toast saying what happened to the errand stays readable before its tab closes. */
const TOAST_READING_TIME_MS = 2000;

/**
 * Closes the tab the errand was opened in, once the toast saying why has been read: an errand that has been
 * closed or passed on is done with here. A tab the browser will not let a script close stays on the errand.
 */
export const closeErrandTabSoon = (): void => {
  setTimeout(() => {
    window.close();
  }, TOAST_READING_TIME_MS);
};
