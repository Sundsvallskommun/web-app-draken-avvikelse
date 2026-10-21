/**
 * The errand's facts as the BFF handed the errand out: one fingerprint per fact - its title, its status, its
 * assignee, its routing and so on (the BFF's `errandFacts`). Never computed here; the page only carries them.
 */
export type SupportErrandFacts = Readonly<Record<string, string>>;

/** What the page saw of the errand: the facts it was handed, and the status it shows. */
export interface SeenSupportErrand {
  readonly facts?: SupportErrandFacts;
  readonly status?: string;
}

/**
 * The facts the handler saw, for an errand-level command to send. The BFF checks the ones that command depends on
 * against the errand as it is now and refuses the command when one of them moved: the errand's version is no part of
 * it, so a write of somebody else's beneath the errand - a document, a measure - stops nothing it does not touch.
 */
export const seenSupportErrandFacts = (errand: SeenSupportErrand | undefined): SupportErrandFacts => {
  if (!errand?.facts) throw new Error('The support errand was loaded without its facts');
  return errand.facts;
};

/** The facts read off the errand's labels alone: the labels themselves, and the routing among them. */
export const LABEL_FACTS = ['labels', 'routingLabels'] as const;

/** The facts a classification write moves: the classification, and the labels it is kept as. */
export const CLASSIFICATION_FACTS = [...LABEL_FACTS, 'classification'] as const;

/**
 * Takes the named facts from an errand the handler's own write answered with, alongside the fields the page takes from
 * it. The others stay as the handler saw them: the page shows those fields as they were, so a change somebody else
 * made to one of them is still theirs to find out about.
 */
export const takeSupportErrandFacts = (
  seen: SupportErrandFacts | undefined,
  received: SupportErrandFacts | undefined,
  keys: readonly string[]
): SupportErrandFacts | undefined => {
  if (!seen || !received) return seen;
  const taken = Object.fromEntries(keys.filter((key) => key in received).map((key) => [key, received[key]]));
  return { ...seen, ...taken };
};
