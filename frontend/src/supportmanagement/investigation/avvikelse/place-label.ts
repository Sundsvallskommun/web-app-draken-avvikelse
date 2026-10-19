const PLACE_CLASSIFICATION = 'LOCATION';

/**
 * Whether a label is a place, as opposed to the top of the place structure or a department beneath a unit. Support
 * Management says so in the label's classification, never in where the label sits in a path.
 */
export const isPlaceLabel = (label: { readonly classification?: string }): boolean =>
  label.classification?.trim().toUpperCase() === PLACE_CLASSIFICATION;
