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

export enum SchemaFilter {
  OrganizationalUnit = "organizationalUnit",
  Container = "container",
  Group = "group",
  User = "user",
  Computer = "computer",
  All = "all",
}

export interface AddUserToGroupRequest {
  group: string | null;
  user: string | null;
  createdBy: string | null;
}

export interface CreateGroupRequest {
  group: string | null;
  description?: string | null;
  createdBy: string | null;
}

export interface OUChildren {
  name?: string | null;
  displayName?: string | null;
  schemaClassName?: string | null;
  /** @format uuid */
  guid?: string | null;
  ouPath?: string | null;
  description?: string | null;
  domain?: string | null;
  isLinked?: boolean;
  /** @format uuid */
  personId?: string | null;
}

/** Används för att returnera paginerat resultat */
export interface OUChildrenPagedOffsetResponse {
  /**
   * Vilken Sida
   * @format int32
   */
  pageNumber?: number;
  /**
   * Hur många items per sida
   * @format int32
   */
  pageSize?: number;
  /**
   * Antalet
   * @format int32
   */
  totalRecords?: number;
  /**
   * Antal sidor
   * @format int32
   */
  totalPages?: number;
  /** Lista med data */
  data?: OUChildren[] | null;
}

export interface PhoneToGroupRequest {
  group: string | null;
  imei: string | null;
  createdBy: string | null;
}

export interface ProblemDetails {
  type?: string | null;
  title?: string | null;
  /** @format int32 */
  status?: number | null;
  detail?: string | null;
  instance?: string | null;
  [key: string]: any;
}

export interface RemoveUserFromGroupRequest {
  group: string | null;
  user: string | null;
  createdBy: string | null;
}
