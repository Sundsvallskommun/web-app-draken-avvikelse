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

/** Access model */
export interface Access {
  /** Access pattern */
  pattern?: string;
  /** Access level */
  accessLevel?: AccessAccessLevelEnum;
}

/** Access type model */
export interface AccessType {
  /** Access type */
  type?: string;
  /** Access by type */
  access?: Access[];
}

/** Access user model */
export interface AccessUser {
  /**
   * Access user ID
   * @example "81471222-5798-11e9-ae24-57fa13b361e1"
   */
  id?: string;
  /**
   * User identifier
   * @example "joe01doe"
   */
  userId?: string;
  /**
   * How the entity was created
   * @example "MANUAL"
   */
  origin?: string;
  /** Access by type */
  accessByType?: AccessType[];
}

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

/** Access group model */
export interface AccessGroup {
  /** Access group id */
  id?: string;
  /** Access group */
  groupId?: string;
  /** Access by type */
  accessByType?: AccessType[];
}

/** Access level */
export enum AccessAccessLevelEnum {
  RW = "RW",
  R = "R",
  LR = "LR",
}
