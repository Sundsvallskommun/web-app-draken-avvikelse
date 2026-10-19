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

export interface JsonNode {
  empty?: boolean;
  array?: boolean;
  null?: boolean;
  object?: boolean;
  float?: boolean;
  valueNode?: boolean;
  container?: boolean;
  missingNode?: boolean;
  nodeType?: JsonNodeNodeTypeEnum;
  integralNumber?: boolean;
  pojo?: boolean;
  floatingPointNumber?: boolean;
  short?: boolean;
  int?: boolean;
  long?: boolean;
  double?: boolean;
  bigDecimal?: boolean;
  bigInteger?: boolean;
  /** @deprecated */
  textual?: boolean;
  binary?: boolean;
  number?: boolean;
  string?: boolean;
  boolean?: boolean;
  embeddedValue?: boolean;
}

/** UiSchemaRequest model */
export interface UiSchemaRequest {
  /**
   * The UI schema
   * @example {"firstName":{"ui:widget":"text","ui:placeholder":"Enter first name"},"lastName":{"ui:widget":"text","ui:placeholder":"Enter last name"},"ui:order":["firstName","lastName"]}
   */
  value: JsonNode;
  /** Description of the UI schema purpose */
  description?: string;
}

export interface Problem {
  /** @format uri */
  instance?: string;
  /** @format uri */
  type?: string;
  detail?: string;
  title?: string;
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

/** JsonSchemaRequest model */
export interface JsonSchemaRequest {
  /**
   * Schema name
   * @minLength 1
   */
  name: string;
  /**
   * Schema version on the format [major version].[minor version]
   * @minLength 1
   * @pattern ^(\d+\.)?(\d+)$
   */
  version: string;
  /**
   * The JSON schema, specified by: https://json-schema.org/draft/2020-12/schema
   * @example {"$id":"https://example.com/person.schema.json","$schema":"https://json-schema.org/draft/2020-12/schema","title":"Person","type":"object","properties":{"firstName":{"type":"string","description":"The person's first name."},"lastName":{"type":"string","description":"The person's last name."}}}
   */
  value: JsonNode;
  /** Description of the schema purpose */
  description?: string;
}

/** JsonSchema model */
export interface JsonSchema {
  /** Schema ID. The ID is composed by the municipalityId, schema name and version. I.e.: [municipality_id]_[schema_name]_[schema_version] */
  id?: string;
  /** Schema name */
  name?: string;
  /** Schema version on the format [major version].[minor version] */
  version?: string;
  /**
   * The JSON schema, specified by: https://json-schema.org/draft/2020-12/schema
   * @example {"$id":"https://example.com/person.schema.json","$schema":"https://json-schema.org/draft/2020-12/schema","title":"Person","type":"object","properties":{"firstName":{"type":"string","description":"The person's first name."},"lastName":{"type":"string","description":"The person's last name."}}}
   */
  value?: JsonNode;
  /** Description of the schema purpose */
  description?: string;
  /**
   * Created timestamp
   * @format date-time
   */
  created?: string;
  /**
   * Number of times this schema has been used to validate a JSON instance
   * @format int64
   */
  validationUsageCount?: number;
  /**
   * Timestamp when this schema was last used to validate a JSON instance
   * @format date-time
   */
  lastUsedForValidation?: string;
}

export interface PageJsonSchema {
  /** @format int32 */
  totalPages?: number;
  /** @format int64 */
  totalElements?: number;
  /** @format int32 */
  size?: number;
  content?: JsonSchema[];
  /** @format int32 */
  number?: number;
  sort?: SortObject;
  pageable?: PageableObject;
  /** @format int32 */
  numberOfElements?: number;
  first?: boolean;
  last?: boolean;
  empty?: boolean;
}

export interface PageableObject {
  /** @format int64 */
  offset?: number;
  paged?: boolean;
  /** @format int32 */
  pageNumber?: number;
  /** @format int32 */
  pageSize?: number;
  sort?: SortObject;
  unpaged?: boolean;
}

export interface SortObject {
  empty?: boolean;
  sorted?: boolean;
  unsorted?: boolean;
}

/** UiSchema model */
export interface UiSchema {
  /** UI Schema ID */
  id?: string;
  /**
   * The UI schema
   * @example {"firstName":{"ui:widget":"text","ui:placeholder":"Enter first name"},"lastName":{"ui:widget":"text","ui:placeholder":"Enter last name"},"ui:order":["firstName","lastName"]}
   */
  value?: JsonNode;
  /** Description of the UI schema purpose */
  description?: string;
  /**
   * Created timestamp
   * @format date-time
   */
  created?: string;
}

export enum JsonNodeNodeTypeEnum {
  ARRAY = "ARRAY",
  BINARY = "BINARY",
  BOOLEAN = "BOOLEAN",
  MISSING = "MISSING",
  NULL = "NULL",
  NUMBER = "NUMBER",
  OBJECT = "OBJECT",
  POJO = "POJO",
  STRING = "STRING",
}
