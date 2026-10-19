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

export enum IncrementMode {
  MAJOR = "MAJOR",
  MINOR = "MINOR",
}

/** Template default value */
export interface DefaultValue {
  /** Field name */
  fieldName?: string;
  /** Value */
  value?: string;
}

export interface Metadata {
  key?: string;
  value?: string;
}

/** Template request */
export interface TemplateRequest {
  /** Identifier. May contain letters, digits, dashes and dots */
  identifier: string;
  /** Version increment mode */
  versionIncrement?: IncrementMode;
  /** Name */
  name: string;
  /** Description */
  description?: string | null;
  /** Content, as a BASE64-encoded string */
  content: string;
  metadata?: Metadata[];
  defaultValues?: DefaultValue[];
  /** A changelog */
  changeLog?: string;
}

/** Template */
export interface TemplateResponse {
  /** Identifier */
  identifier?: string;
  /** Version */
  version?: string;
  /** Type */
  type?: TemplateResponseTypeEnum;
  /** Name */
  name?: string;
  /** Description */
  description?: string;
  metadata?: Metadata[];
  defaultValues?: DefaultValue[];
  /** Changelog */
  changeLog?: string;
  /**
   * Last modification timestamp
   * @format date-time
   */
  lastModifiedAt?: string;
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

/** Search filter expression */
export type Expression = any;

export interface KeyValue {
  /** @minLength 1 */
  key: string;
  /** @minLength 1 */
  value: string;
}

/** Request to render a template */
export interface RenderRequest {
  /** Template identifier */
  identifier?: string | null;
  /** Template version */
  version?: string | null;
  metadata?: KeyValue[];
  /** Parameters (string values may be BASE64-encoded, and in that case they should be on the form "BASE64:<base64-encoded-value>") */
  parameters?: Record<string, any> | string | null;
}

export interface RenderResponse {
  /** Output, as a BASE64-encoded string */
  output?: string;
}

/** Request to render a template directly */
export interface DirectRenderRequest {
  /**
   * The template content, as a BASE64-encoded string
   * @minLength 1
   */
  content: string;
  /** Parameters (string values may be BASE64-encoded, and in that case they should be on the form "BASE64:<base64-encoded-value>") */
  parameters?: Record<string, any> | string | null;
}

export interface DirectRenderResponse {
  /** Output, as a BASE64-encoded string */
  output?: string;
}

export type JsonPatch = any;

/** Detailed template */
export interface DetailedTemplateResponse {
  /** Identifier */
  identifier?: string;
  /** Version */
  version?: string;
  /** Type */
  type?: DetailedTemplateResponseTypeEnum;
  /** Name */
  name?: string;
  /** Description */
  description?: string;
  metadata?: Metadata[];
  defaultValues?: DefaultValue[];
  /** Changelog */
  changeLog?: string;
  /**
   * Last modification timestamp
   * @format date-time
   */
  lastModifiedAt?: string;
  /** Content, as a BASE64-encoded string */
  content?: string;
}

/** Type */
export enum TemplateResponseTypeEnum {
  PEBBLE = "PEBBLE",
  WORD = "WORD",
}

/** Type */
export enum DetailedTemplateResponseTypeEnum {
  PEBBLE = "PEBBLE",
  WORD = "WORD",
}
