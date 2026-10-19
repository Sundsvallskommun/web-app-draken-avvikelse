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

/**
 * The sort order direction
 * @example "ASC"
 */
export enum Direction {
  ASC = 'ASC',
  DESC = 'DESC',
}

export interface Problem {
  /** @format uri */
  instance?: string;
  /** @format uri */
  type?: string;
  parameters?: Record<string, object>;
  status?: StatusType;
  title?: string;
  detail?: string;
}

export interface StatusType {
  /** @format int32 */
  statusCode?: number;
  reasonPhrase?: string;
}

/** Relation between objects */
export interface Relation {
  /**
   * Unique id for the relation
   * @example "f4de6b8b-f727-4ed1-9959-b9d5bde1922f"
   */
  id?: string;
  /**
   * Type of relation. Valid types can be fetch via /relation-types
   * @minLength 1
   */
  type: string;
  /**
   * Timestamp when relations was created
   * @format date-time
   * @example "2000-10-31T01:30:00+02:00"
   */
  created?: string;
  /**
   * Timestamp when relations was last modified
   * @format date-time
   * @example "2000-10-31T01:30:00+02:00"
   */
  modified?: string;
  /** Resource identifier for source and target */
  source: ResourceIdentifier;
  /** Resource identifier for source and target */
  target: ResourceIdentifier;
}

/** Resource identifier for source and target */
export interface ResourceIdentifier {
  /**
   * Unique id for the object
   * @minLength 1
   * @example "some-id"
   */
  resourceId: string;
  /**
   * Type of object
   * @minLength 1
   * @example "case"
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
  cause?: ThrowableProblem;
  stackTrace?: {
    classLoaderName?: string;
    moduleName?: string;
    moduleVersion?: string;
    methodName?: string;
    fileName?: string;
    /** @format int32 */
    lineNumber?: number;
    className?: string;
    nativeMethod?: boolean;
  }[];
  /** @format uri */
  type?: string;
  status?: StatusType;
  violations?: Violation[];
  title?: string;
  message?: string;
  /** @format uri */
  instance?: string;
  parameters?: Record<string, object>;
  detail?: string;
  suppressed?: {
    stackTrace?: {
      classLoaderName?: string;
      moduleName?: string;
      moduleVersion?: string;
      methodName?: string;
      fileName?: string;
      /** @format int32 */
      lineNumber?: number;
      className?: string;
      nativeMethod?: boolean;
    }[];
    message?: string;
    localizedMessage?: string;
  }[];
  localizedMessage?: string;
}

export interface ThrowableProblem {
  cause?: ThrowableProblem;
  stackTrace?: {
    classLoaderName?: string;
    moduleName?: string;
    moduleVersion?: string;
    methodName?: string;
    fileName?: string;
    /** @format int32 */
    lineNumber?: number;
    className?: string;
    nativeMethod?: boolean;
  }[];
  message?: string;
  /** @format uri */
  instance?: string;
  /** @format uri */
  type?: string;
  parameters?: Record<string, object>;
  status?: StatusType;
  title?: string;
  detail?: string;
  suppressed?: {
    stackTrace?: {
      classLoaderName?: string;
      moduleName?: string;
      moduleVersion?: string;
      methodName?: string;
      fileName?: string;
      /** @format int32 */
      lineNumber?: number;
      className?: string;
      nativeMethod?: boolean;
    }[];
    message?: string;
    localizedMessage?: string;
  }[];
  localizedMessage?: string;
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
   * @example "DUPLICATES"
   */
  name: string;
  /**
   * Display value
   * @example "Duplicates"
   */
  displayName?: string;
  /**
   * Inverse value of type (if applicable)
   * @example "IS DUPLICATED BY"
   */
  counterName?: string;
  /**
   * Display value
   * @example "Is duplicated by"
   */
  counterDisplayName?: string;
}

/** PagingAndSortingMetaData model */
export interface PagingAndSortingMetaData {
  /**
   * Current page
   * @format int32
   * @example 5
   */
  page?: number;
  /**
   * Displayed objects per page
   * @format int32
   * @example 20
   */
  limit?: number;
  /**
   * Displayed objects on current page
   * @format int32
   * @example 13
   */
  count?: number;
  /**
   * Total amount of hits based on provided search parameters
   * @format int64
   * @example 98
   */
  totalRecords?: number;
  /**
   * Total amount of pages based on provided search parameters
   * @format int32
   * @example 23
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
