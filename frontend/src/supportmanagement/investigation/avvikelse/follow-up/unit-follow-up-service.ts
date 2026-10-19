import { apiService } from '@common/services/api-service';

/** The registration dates the follow-up covers, as calendar days (`YYYY-MM-DD`), inclusive. */
export interface UnitFollowUpPeriod {
  readonly from: string;
  readonly to: string;
}

export interface UnitFollowUpLabel {
  readonly id?: string;
  readonly classification?: string;
  readonly displayName?: string;
  readonly resourcePath?: string;
}

/** The investigation and decision facts the BFF read from the documents the user may read. */
interface UnitFollowUpInvestigation {
  /**
   * The legal bases the investigation that classifies the errand names - LEX's for a misconduct - or, until it names
   * any, the ones the errand was reported under.
   */
  readonly legalBases: string[];
  readonly riskValueHsl?: number;
  readonly riskValueSolLss?: number;
  readonly causeAreas: string[];
  /** The unit manager's answer on a police report, asked where HSL applies, and the lex Sarah investigation's. */
  readonly policeReportHsl?: string;
  readonly policeReportSolLss?: string;
  readonly ivoNotification?: string;
  readonly decidedMisconductDegree?: string;
}

export interface UnitFollowUpMeasure {
  readonly id?: string;
  readonly type?: string;
  readonly addedByUser?: string;
  readonly accept?: string | null;
  readonly plannedStart?: string;
  readonly plannedComplete?: string;
  readonly executed?: string;
  readonly result?: string | null;
  readonly resultText?: string;
  readonly description?: string;
  readonly goal?: string;
}

export interface UnitFollowUpErrand {
  readonly id: string;
  readonly errandNumber: string;
  readonly title?: string;
  readonly status?: string;
  readonly created?: string;
  readonly labels: UnitFollowUpLabel[];
  readonly investigation: UnitFollowUpInvestigation;
  readonly measures: UnitFollowUpMeasure[];
}

export interface UnitFollowUpMeasureType {
  readonly name?: string;
  readonly displayName?: string;
}

export interface UnitFollowUpSnapshot {
  readonly errands: UnitFollowUpErrand[];
  readonly measureTypes: UnitFollowUpMeasureType[];
  /** The period held more errands than the BFF reads; the view says the list is incomplete. */
  readonly truncated: boolean;
}

export const getUnitFollowUp = (municipalityId: string, period: UnitFollowUpPeriod): Promise<UnitFollowUpSnapshot> =>
  apiService
    .get<UnitFollowUpSnapshot>(`supportfollowup/${municipalityId}/units`, {
      params: { from: period.from, to: period.to },
    })
    .then((response) => response.data);
