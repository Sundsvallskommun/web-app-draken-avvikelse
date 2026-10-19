import { getLatestRjsfSchema } from '@common/components/json/utils/schema-utils';
import type { RJSFSchema } from '@rjsf/utils';

import {
  LEX_DECISION_SCHEMA_NAME,
  LEX_INVESTIGATION_SCHEMA_NAME,
  UNIT_MANAGER_INVESTIGATION_SCHEMA_NAME,
} from '../avvikelse-schema-names';

/** The schemas the follow-up reads its vocabulary from, by their fixed avvikelse schema roles. */
const VOCABULARY_SCHEMAS = Object.freeze({
  managerInvestigation: UNIT_MANAGER_INVESTIGATION_SCHEMA_NAME,
  lexInvestigation: LEX_INVESTIGATION_SCHEMA_NAME,
  lexDecision: LEX_DECISION_SCHEMA_NAME,
});

/**
 * What the follow-up's codes are called, and which risk values an investigation can arrive at. Read from
 * the latest published schemas, so a renamed cause area shows its current name on every errand.
 */
export interface UnitFollowUpVocabulary {
  readonly legalBases: ReadonlyMap<string, string>;
  readonly causeAreas: ReadonlyMap<string, string>;
  readonly misconductDegrees: ReadonlyMap<string, string>;
  readonly riskValuesHsl: readonly number[];
  readonly riskValuesSolLss: readonly number[];
}

export const EMPTY_UNIT_FOLLOW_UP_VOCABULARY: UnitFollowUpVocabulary = Object.freeze({
  legalBases: new Map<string, string>(),
  causeAreas: new Map<string, string>(),
  misconductDegrees: new Map<string, string>(),
  riskValuesHsl: [],
  riskValuesSolLss: [],
});

type SchemaNode = Record<string, unknown>;

const isNode = (value: unknown): value is SchemaNode =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Follows a local `#/$defs/...` reference, keeping any sibling keywords. */
const resolve = (node: unknown, root: SchemaNode): SchemaNode | undefined => {
  if (!isNode(node)) return undefined;
  if (typeof node.$ref !== 'string' || !node.$ref.startsWith('#/$defs/')) return node;
  const definitions = isNode(root.$defs) ? root.$defs : {};
  const definition = definitions[node.$ref.slice('#/$defs/'.length)];
  const { $ref: _reference, ...siblings } = node;
  return isNode(definition) ? { ...definition, ...siblings } : siblings;
};

const property = (schema: RJSFSchema | undefined, name: string): SchemaNode | undefined => {
  const root = schema as SchemaNode | undefined;
  if (!root || !isNode(root.properties)) return undefined;
  return resolve(root.properties[name], root);
};

const choices = (node: SchemaNode | undefined): SchemaNode[] =>
  Array.isArray(node?.oneOf) ? node.oneOf.filter(isNode) : [];

/** The `const` → `title` pairs of a choice property, or of an array's items when it is a multi-choice. */
export const readChoiceTitles = (schema: RJSFSchema | undefined, name: string): Map<string, string> => {
  const root = schema as SchemaNode | undefined;
  const node = property(schema, name);
  const options = node?.type === 'array' && root ? resolve(node.items, root) : node;
  return new Map(
    choices(options)
      .filter((choice) => typeof choice.const === 'string' && typeof choice.title === 'string')
      .map((choice) => [choice.const as string, choice.title as string])
  );
};

/**
 * Every value a calculated risk can take: the products of its inputs' choices, as the assessment's
 * `x-calculation` declares them. A schema without that declaration offers no values to filter on.
 */
export const readRiskValues = (schema: RJSFSchema | undefined, assessment: string): number[] => {
  const root = schema as SchemaNode | undefined;
  const node = property(schema, assessment);
  const calculation = isNode(node?.['x-calculation']) ? node['x-calculation'] : undefined;
  if (!root || !node || !calculation || !Array.isArray(calculation.inputs) || !isNode(node.properties)) return [];

  const inputValues = calculation.inputs.map((input) =>
    choices(resolve((node.properties as SchemaNode)[String(input)], root))
      .map((choice) => choice.const)
      .filter((value): value is number => typeof value === 'number')
  );
  if (inputValues.length === 0 || inputValues.some((values) => values.length === 0)) return [];

  const products = inputValues.reduce<number[]>(
    (accumulated, values) => accumulated.flatMap((product) => values.map((value) => product * value)),
    [1]
  );
  return [...new Set(products)].sort((left, right) => left - right);
};

interface VocabularySchemas {
  readonly managerInvestigation?: RJSFSchema;
  readonly lexInvestigation?: RJSFSchema;
  readonly lexDecision?: RJSFSchema;
}

export const buildUnitFollowUpVocabulary = ({
  managerInvestigation,
  lexInvestigation,
  lexDecision,
}: VocabularySchemas): UnitFollowUpVocabulary => ({
  // The unit manager's investigation offers every legal base; LEX's offers the two of lex Sarah.
  legalBases: new Map([
    ...readChoiceTitles(lexInvestigation, 'legalBases'),
    ...readChoiceTitles(managerInvestigation, 'legalBases'),
  ]),
  causeAreas: new Map([
    ...readChoiceTitles(lexInvestigation, 'causeAreas'),
    ...readChoiceTitles(managerInvestigation, 'causeAreas'),
  ]),
  misconductDegrees: readChoiceTitles(lexDecision, 'decidedMisconductDegree'),
  riskValuesHsl: readRiskValues(managerInvestigation, 'riskAssessmentHsl'),
  riskValuesSolLss: readRiskValues(managerInvestigation, 'riskAssessmentSolLss'),
});

/**
 * Reads the vocabulary. A schema that cannot be read leaves its part empty, and the follow-up then shows
 * the stored codes instead of failing as a whole.
 */
export const loadUnitFollowUpVocabulary = async (municipalityId: string): Promise<UnitFollowUpVocabulary> => {
  const read = (schemaName: string) =>
    getLatestRjsfSchema(municipalityId, schemaName).then(
      (latest) => latest.schema,
      () => undefined
    );
  const [managerInvestigation, lexInvestigation, lexDecision] = await Promise.all([
    read(VOCABULARY_SCHEMAS.managerInvestigation),
    read(VOCABULARY_SCHEMAS.lexInvestigation),
    read(VOCABULARY_SCHEMAS.lexDecision),
  ]);
  return buildUnitFollowUpVocabulary({ managerInvestigation, lexInvestigation, lexDecision });
};
