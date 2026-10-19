/** A support errand's status, as Support Management names it. Kept apart from the errand service so pure rules can
 * read it without loading the service. */
export enum Status {
  NEW = 'NEW',
  ONGOING = 'ONGOING',
  /** IAF/VOF's working status. Their namespaces have no ONGOING. */
  INQUIRY = 'INQUIRY',
  PENDING = 'PENDING',
  SUSPENDED = 'SUSPENDED',
  ASSIGNED = 'ASSIGNED',
  SOLVED = 'SOLVED',
  AWAITING_INTERNAL_RESPONSE = 'AWAITING_INTERNAL_RESPONSE',
  UPSTART = 'UPSTART',
  PUBLISH_SELECTION = 'PUBLISH_SELECTION',
  INTERNAL_CONTROL_AND_INTERVIEWS = 'INTERNAL_CONTROL_AND_INTERVIEWS',
  REFERENCE_CHECK = 'REFERENCE_CHECK',
  REVIEW = 'REVIEW',
  /** IAF/VOF: the status of the decision phase. */
  DECISION = 'DECISION',
  /** IAF/VOF: the status of the follow-up phase. */
  FOLLOW_UP = 'FOLLOW_UP',
  /** IAF/VOF: waiting for a requested completion, from whichever party was asked. */
  AWAITING_RESPONSE = 'AWAITING_RESPONSE',
  SECURITY_CLEARENCE = 'SECURITY_CLEARENCE',
  FEEDBACK_CLOSURE = 'FEEDBACK_CLOSURE',
  SUBPACKAGE_HANDLED = 'SUBPACKAGE_HANDLED',
  REOPENED = 'REOPENED',
}
