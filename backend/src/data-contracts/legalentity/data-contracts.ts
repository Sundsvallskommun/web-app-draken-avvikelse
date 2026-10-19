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

export interface AnnualRevenue {
  annualRevenueId?: string | null;
  name?: string | null;
}

export interface EmployeeSize {
  employeeSizeId?: string | null;
  name?: string | null;
}

export interface EngagementRole {
  description?: string | null;
  code?: string | null;
}

export interface LEAddress {
  addressArea?: string | null;
  adressNumber?: string | null;
  city?: string | null;
  postalCode?: string | null;
  municipality?: string | null;
  county?: string | null;
}

export interface LEPostAddress {
  coAdress?: string | null;
  country?: string | null;
  postalCode?: string | null;
  city?: string | null;
  address1?: string | null;
  address2?: string | null;
}

export interface LegalEntity2 {
  /** @format uuid */
  legalEntityId?: string | null;
  organizationNumber?: string | null;
  name?: string | null;
  legalForm?: LegalForm;
  postAddress?: LEPostAddress;
  address?: LEAddress;
  eMail?: string | null;
  phoneNumber?: string | null;
  countyMunicipalityCode?: string | null;
  municipality?: string | null;
  county?: string | null;
  acountingPeriodStart?: string | null;
  acountingPeriodEnded?: string | null;
  /**
   * @format date
   * @example "2023-01-01"
   */
  registerDate?: string | null;
  /**
   * @format date
   * @example "2023-01-01"
   */
  unRegisterDate?: string | null;
  unRegisterReason?: string | null;
  unRegisterReasonCode?: string | null;
  liquidationOrRestructuring?: LiquidationOrRestructuring[] | null;
  form?: string | null;
  formShort?: string | null;
  /** @format double */
  shareCapital?: number | null;
  reportingCurrency?: string | null;
  /** @format int64 */
  totalShares?: number | null;
  /** @format int32 */
  totalWorkplaces?: number | null;
  fullSignatureDescription?: string | null;
  businessDescription?: string | null;
  officers?: string | null;
  annualRevenue?: AnnualRevenue;
  /** @format int32 */
  revenueYear?: number | null;
  employeeSize?: EmployeeSize;
  workplaces?: Workplace[] | null;
}

export interface LegalForm {
  legalFormId?: string | null;
  name?: string | null;
}

export interface LiquidationOrRestructuring {
  /** @format uuid */
  legalEntityId?: string | null;
  /**
   * @format date
   * @example "2023-01-01"
   */
  fromDate?: string | null;
  name?: string | null;
  code?: string | null;
}

export interface OrganizationEngagement {
  name?: string | null;
  identity?: OrganizationIdentity;
  relations?: OrganizationEngagementRelation[] | null;
  source?: string | null;
}

export interface OrganizationEngagementRelation {
  description?: string | null;
  code?: string | null;
  type?: string | null;
}

export interface OrganizationEngagements {
  engagements?: OrganizationEngagement[] | null;
  /** @format int32 */
  beneficialOwnershipMarking?: number | null;
}

export interface OrganizationIdentity {
  code?: string | null;
  type?: string | null;
}

/** Håller information om en persons företags engagemang */
export interface PersonEngagement {
  organizationNumber?: string | null;
  name?: string | null;
  form?: string | null;
  formShort?: string | null;
  roles?: EngagementRole[] | null;
  isAuthorizedSignatory?: boolean | null;
  isSoleTrader?: boolean | null;
  source?: string | null;
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

export interface Sni {
  sniId?: string | null;
  name?: string | null;
}

export interface Workplace {
  /** @format uuid */
  legalEntityId?: string | null;
  cfarNumber?: string | null;
  name?: string | null;
  mainWorkplace?: boolean | null;
  postAddress?: LEPostAddress;
  address?: LEAddress;
  phoneNumber?: string | null;
  employeeSize?: EmployeeSize;
  sniCodes?: Sni[] | null;
}
