export interface SupportRevisionDifference {
  op: string;
  path: string;
  value: string;
  fromValue: string;
}

export interface ParsedSupportRevisionDifference extends SupportRevisionDifference {
  title: string;
  description: string;
}

export interface RevisionDifferenceData {
  operations: SupportRevisionDifference[];
}
