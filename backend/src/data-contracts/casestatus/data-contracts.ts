/* eslint-disable */
/* tslint:disable */
// @ts-nocheck
/*
 * ---------------------------------------------------------------
 * ## THIS FILE WAS GENERATED VIA SWAGGER-TYPESCRIPT-API        ##
 * ##                                                           ##
 * ## AUTHOR: acacode                                           ##
 * ## SOURCE: https://github.com/acacode/swagger-typescript-api ##
 * ---------------------------------------------------------------
 */

export interface Problem {
  /** @format uri */
  instance?: string;
  /** @format uri */
  type?: string;
  title?: string;
  detail?: string;
  /** @format int32 */
  status?: number;
}

export interface ConstraintViolationProblem {
  /** @format uri */
  type?: string;
  /** @format int32 */
  status?: number;
  violations?: Violation[];
  title?: string;
  /** @format uri */
  instance?: string;
  detail?: string;
  causeAsProblem?: ThrowableProblem;
}

export interface ThrowableProblem {
  /** @format uri */
  type?: string;
  title?: string;
  /** @format int32 */
  status?: number;
  detail?: string;
  /** @format uri */
  instance?: string;
  causeAsProblem?: any;
}

export interface Violation {
  field?: string;
  message?: string;
}

/** Case status response */
export interface CaseStatusResponse {
  /** Case id */
  caseId?: string;
  /** External case id */
  externalCaseId?: string;
  /** Case type */
  caseType?: string;
  /** Status */
  status?: string;
  /** External status */
  externalStatus?: string;
  /** First submitted */
  firstSubmitted?: string;
  /** Last status change */
  lastStatusChange?: string;
  /** The system that the case is in */
  system?: string;
  /** The namespace of the case */
  namespace?: string;
  /** Human readable identifier for the case */
  errandNumber?: string;
  propertyDesignations?: string[];
}

/** Case status response */
export interface CasePdfResponse {
  /** External case id */
  externalCaseId?: string;
  /** Base64 encoded PDF */
  base64?: string;
}

/** Case status response */
export interface OepStatusResponse {
  /** Key */
  key?: string;
  /** Value */
  value?: string;
}
