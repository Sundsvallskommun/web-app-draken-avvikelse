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

export enum SortDirection {
  ASC = "ASC",
  DESC = "DESC",
}

export enum ManagerEmployeesDetailOrderBy {
  FullName = "FullName",
  Birthdate = "Birthdate",
  EmploymentId = "EmploymentId",
  Title = "Title",
  IsMainEmployment = "IsMainEmployment",
  OrgName = "OrgName",
}

export interface Account {
  domain?: string | null;
  loginname?: string | null;
  /** @format int32 */
  companyId?: number;
  emailAddress?: string | null;
}

export interface Employeev2 {
  /** @format uuid */
  personId?: string;
  personNumber?: string | null;
  isClassified?: boolean;
  givenname?: string | null;
  middlename?: string | null;
  lastname?: string | null;
  accounts?: Account[] | null;
  referenceNumbers?: ReferenceNumberCompany[] | null;
  employments?: EmploymentV2[] | null;
}

export interface EmploymentV2 {
  /** @format int32 */
  companyId?: number;
  /** @format date-time */
  startDate?: string;
  /** @format date-time */
  endDate?: string | null;
  /** @format int32 */
  employmentType?: number;
  title?: string | null;
  managerCode?: string | null;
  /** @format int32 */
  orgId?: number;
  orgName?: string | null;
  /** @format int32 */
  topOrgId?: number;
  topOrgName?: string | null;
  /** @format int32 */
  benefitGroupId?: number | null;
  formOfEmploymentId?: string | null;
  isManual?: boolean;
  paTeam?: string | null;
  isMainEmployment?: boolean;
  isManager?: boolean | null;
  manager?: Manager;
  hiringManager?: Manager;
  aid?: string | null;
  empRowId?: string | null;
  /** @format int32 */
  employmentId?: number;
}

export interface EndedEmploymentEvent {
  title?: string | null;
  /** @format int32 */
  orgId?: number;
  orgName?: string | null;
  /** @format int32 */
  topOrgId?: number;
  topOrgName?: string | null;
  /** @format int32 */
  benefitGroupId?: number;
  /**
   * @format date
   * @example "2023-01-01"
   */
  hireDate?: string;
  /**
   * @format date
   * @example "2023-01-01"
   */
  retireDate?: string;
  eventType?: string | null;
  eventInfo?: string | null;
  /** @format int32 */
  companyId?: number;
  companyName?: string | null;
  /** @format int32 */
  empId?: number | null;
  businessKey?: string | null;
}

export interface Manager {
  /** @format uuid */
  personId?: string;
  givenname?: string | null;
  middlename?: string | null;
  lastname?: string | null;
  loginname?: string | null;
  emailAddress?: string | null;
  referenceNumber?: string | null;
}

export interface ManagerEmployee {
  /** @format uuid */
  personId?: string;
  /** @format date-time */
  hireDate?: string | null;
  /** @format date-time */
  retireDate?: string | null;
}

export interface ManagerEmployeeDetail {
  /** @format uuid */
  personId?: string;
  fullName?: string | null;
  birthdate?: string | null;
  employments?: ManagerEmployeeEmploymentDetail[] | null;
}

/** Används för att returnera paginerat resultat */
export interface ManagerEmployeeDetailPagedOffsetResponse {
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
  data?: ManagerEmployeeDetail[] | null;
}

export interface ManagerEmployeeEmploymentDetail {
  /** @format int32 */
  employmentId?: number;
  title?: string | null;
  isMainEmployment?: boolean;
  orgName?: string | null;
}

export interface ModelPostPersonImage {
  title?: string | null;
  imageData?: string | null;
}

export interface NewEmployee {
  /** @format uuid */
  personId?: string;
  personNumber?: string | null;
  isClassified?: boolean;
  givenname?: string | null;
  middlename?: string | null;
  lastname?: string | null;
  accounts?: Account[] | null;
  referenceNumbers?: ReferenceNumberCompany[] | null;
  employments?: NewEmployment[] | null;
}

export interface NewEmployment {
  /** @format int32 */
  companyId?: number;
  /** @format date-time */
  startDate?: string;
  /** @format date-time */
  endDate?: string | null;
  /** @format int32 */
  employmentType?: number;
  title?: string | null;
  managerCode?: string | null;
  /** @format int32 */
  orgId?: number;
  orgName?: string | null;
  /** @format int32 */
  topOrgId?: number;
  topOrgName?: string | null;
  /** @format int32 */
  benefitGroupId?: number | null;
  formOfEmploymentId?: string | null;
  isManual?: boolean;
  paTeam?: string | null;
  isMainEmployment?: boolean;
  isManager?: boolean | null;
  manager?: Manager;
  hiringManager?: Manager;
  aid?: string | null;
  empRowId?: string | null;
  /** @format int32 */
  employmentId?: number;
  eventType?: string | null;
  eventInfo?: string | null;
}

export interface PortalPersonData {
  /** @format uuid */
  personid?: string;
  givenname?: string | null;
  lastname?: string | null;
  fullname?: string | null;
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
  workPhone?: string | null;
  mobilePhone?: string | null;
  extraMobilePhone?: string | null;
  aboutMe?: string | null;
  email?: string | null;
  mailNickname?: string | null;
  company?: string | null;
  /** @format int32 */
  companyId?: number;
  orgTree?: string | null;
  referenceNumber?: string | null;
  isManager?: boolean;
  loginName?: string | null;
  fullOrgTree?: string | null;
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

export interface ReferenceNumberCompany {
  referenceNumber?: string | null;
  /** @format int32 */
  companyId?: number;
}

export interface UserProfile {
  /** @format uuid */
  userId?: string;
  /** @format uuid */
  personId?: string;
  personNumber?: string | null;
  givenname?: string | null;
  lastname?: string | null;
  workMobile?: string | null;
  workPhone?: string | null;
  /** @format int32 */
  companyId?: number;
  company?: string | null;
  title?: string | null;
  /** @format uuid */
  managerPersonId?: string;
  managerCode?: string | null;
  /**
   * @format date
   * @example "2023-01-01"
   */
  hireDate?: string;
  /**
   * @format date
   * @example "2023-01-01"
   */
  retiredate?: string | null;
  /** @format int32 */
  orgId?: number;
  orgName?: string | null;
  /** @format int32 */
  topOrgId?: number;
  topOrgName?: string | null;
  isExternal?: boolean;
  loginname?: string | null;
  displayname?: string | null;
  emailAddress?: string | null;
  /** @format int32 */
  accountTypeId?: number;
  accountType?: string | null;
  /** @format int32 */
  mcId?: number;
  municipalityId?: string | null;
  isActive?: boolean;
  /** @format date-time */
  createdDT?: string;
  /** @format date-time */
  updatedDT?: string;
}
