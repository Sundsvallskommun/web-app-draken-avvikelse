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

export interface CitizenAddress {
  status?: string | null;
  /** @format date-time */
  nrDate?: string | null;
  realEstateDescription?: string | null;
  co?: string | null;
  address?: string | null;
  addressArea?: string | null;
  addressNumber?: string | null;
  addressLetter?: string | null;
  appartmentNumber?: string | null;
  postalCode?: string | null;
  city?: string | null;
  county?: string | null;
  municipality?: string | null;
  country?: string | null;
  emigrated?: boolean | null;
  addressType?: string | null;
  /** @format double */
  xCoordLocal?: number | null;
  /** @format double */
  yCoordLocal?: number | null;
}

export interface CitizenExtended {
  /** @format uuid */
  personId?: string;
  givenname?: string | null;
  lastname?: string | null;
  gender?: string | null;
  civilStatus?: string | null;
  nrDate?: string | null;
  classified?: string | null;
  protectedNR?: string | null;
  addresses?: CitizenAddress[] | null;
}

export interface CitizenWithChangedAddress {
  /** @format uuid */
  personId?: string;
  personNumber?: string | null;
  classified?: string | null;
  unRegCode?: string | null;
  /** @format date-time */
  unRegDate?: string | null;
  gender?: string | null;
  givenname?: string | null;
  lastname?: string | null;
  typeOfSchool?: string | null;
  custodianFor?: CustodyChildrenPupil[] | null;
  addresses?: CitizenAddress[] | null;
}

export interface CustodyChild {
  /** @format uuid */
  personId?: string;
  personNumber?: string | null;
  givenname?: string | null;
  middlename?: string | null;
  lastname?: string | null;
  notNR?: string | null;
  classified?: string | null;
  protectedNR?: string | null;
}

export interface CustodyChildrenPupil {
  personnumber?: string | null;
  typeOfSchool?: string | null;
  unRegCode?: string | null;
  /** @format date-time */
  unRegDate?: string | null;
}

export interface PersonGuidBatch {
  personNumber?: string | null;
  /** @format uuid */
  personId?: string | null;
  success?: boolean;
  errorMessage?: string | null;
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
