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

/** The sort order direction */
export enum Direction {
  ASC = "ASC",
  DESC = "DESC",
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

/** Relation between objects */
export interface Relation {
  /** Unique id for the relation */
  id?: string;
  /**
   * Type of relation. Valid types can be fetch via /relation-types
   * @minLength 1
   */
  type: string;
  /**
   * Timestamp when relations was created
   * @format date-time
   */
  created?: string;
  /**
   * Timestamp when relations was last modified
   * @format date-time
   */
  modified?: string;
  /** Source identifiers */
  source: ResourceIdentifier;
  /** Target identifiers */
  target: ResourceIdentifier;
}

/** Resource identifier for source and target */
export interface ResourceIdentifier {
  /**
   * Unique id for the object
   * @minLength 1
   */
  resourceId: string;
  /**
   * Type of object
   * @minLength 1
   */
  type: string;
  /**
   * Name of service where object exists
   * @minLength 1
   */
  service: string;
  /** Namespace of object */
  namespace?: string;
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

/** Type of relation */
export interface RelationType {
  /**
   * Name of type
   * @minLength 1
   */
  name: string;
  /** Display value */
  displayName?: string;
  /** Inverse value of type (if applicable) */
  counterName?: string;
  /** Display value */
  counterDisplayName?: string;
}

/** PagingAndSortingMetaData model */
export interface PagingAndSortingMetaData {
  /**
   * Current page
   * @format int32
   */
  page?: number;
  /**
   * Displayed objects per page
   * @format int32
   */
  limit?: number;
  /**
   * Displayed objects on current page
   * @format int32
   */
  count?: number;
  /**
   * Total amount of hits based on provided search parameters
   * @format int64
   */
  totalRecords?: number;
  /**
   * Total amount of pages based on provided search parameters
   * @format int32
   */
  totalPages?: number;
  sortBy?: string[];
  /** The sort order direction */
  sortDirection?: Direction;
}

/** Paged relation response */
export interface RelationPagedResponse {
  relations?: Relation[];
  /** PagingAndSortingMetaData model */
  _meta?: PagingAndSortingMetaData;
}
