import { normalizeSupportManagementResourcePath } from '@/config/supportmanagement-path';
import type { Label } from '@/data-contracts/supportmanagement/data-contracts';
import { HttpException } from '@/exceptions/HttpException';

import { indexLabelIdsByPath, resolveInvestigationLocationTarget } from './investigation-handover-label.service';

/** One place a handler may file a new errand under, as the registration form offers it. */
export interface RegistrationLocation {
  readonly labelId: string;
  readonly displayName: string;
  readonly resourcePath: string;
}

/**
 * AccessMapper stores a place as the place's own path plus everything beneath it. Reading the
 * configuration back means undoing exactly that suffix - a pattern written any other way is
 * somebody else's access rule and says nothing about which place this account belongs to.
 */
const ACCESS_PATTERN_SUFFIX = '/**';

const locationPathFromAccessPattern = (pattern: string): string | undefined => {
  const trimmed = pattern.trim();
  if (!trimmed.endsWith(ACCESS_PATTERN_SUFFIX)) return undefined;

  const path = normalizeSupportManagementResourcePath(trimmed.slice(0, -ACCESS_PATTERN_SUFFIX.length));
  return path.length > 0 ? path : undefined;
};

/**
 * The places an account may register an errand for, from its AccessMapper label patterns.
 *
 * A pattern is only offered as a place once `resolveInvestigationLocationTarget` accepts it, which
 * is the same rule the move-location flow applies: the node must exist exactly once, be a unit with
 * no sub-units, and sit on a path classified as a location. A pattern that fails any of those is
 * left out rather than rejected, because an account configured for a department - or for something
 * that is not a place at all - is ordinary configuration, not a broken deployment. The consequence
 * is that such an account is offered nothing here, exactly as it can be moved nothing there.
 */
export const resolveRegistrationLocations = (
  labelStructure: readonly Label[] | undefined,
  accessPatterns: readonly string[],
): RegistrationLocation[] => {
  const idByPath = indexLabelIdsByPath(labelStructure);
  const byLabelId = new Map<string, RegistrationLocation>();

  for (const pattern of accessPatterns) {
    const resourcePath = locationPathFromAccessPattern(pattern);
    if (!resourcePath) continue;

    const labelId = idByPath.get(resourcePath);
    if (!labelId || byLabelId.has(labelId)) continue;

    try {
      const target = resolveInvestigationLocationTarget(labelStructure, labelId);
      byLabelId.set(labelId, { labelId, displayName: target.displayName, resourcePath });
    } catch {
      continue;
    }
  }

  return [...byLabelId.values()].sort((first, second) => first.displayName.localeCompare(second.displayName, 'sv'));
};

const indexLabelsByResourceName = (labelStructure: readonly Label[] | undefined): Map<string, Label[]> => {
  const byName = new Map<string, Label[]>();
  const visit = (nodes: readonly Label[] | undefined): void => {
    for (const node of nodes ?? []) {
      const name = node.resourceName?.trim();
      if (name) byName.set(name, [...(byName.get(name) ?? []), node]);
      visit(node.labels);
    }
  };
  visit(labelStructure);
  return byName;
};

/**
 * The places an account's employments put it at.
 *
 * The location tree mirrors the municipality's organization tree, one label per organization unit,
 * named by the unit's id. A place is therefore the label whose resource name is an employment's
 * organization id: the id itself, not a unit name that may be spelled differently or shared. The
 * label also has to pass `resolveInvestigationLocationTarget`, so an employment at a unit with
 * sub-units, outside the tree or matching a label that is not a place puts nobody anywhere.
 * Employments are taken in the order given, so the main employment's place comes first.
 */
export const resolveEmploymentLocations = (
  labelStructure: readonly Label[] | undefined,
  organizationIds: readonly number[],
): RegistrationLocation[] => {
  const labelsByName = indexLabelsByResourceName(labelStructure);
  const byLabelId = new Map<string, RegistrationLocation>();

  for (const organizationId of organizationIds) {
    for (const label of labelsByName.get(String(organizationId)) ?? []) {
      if (!label.id || byLabelId.has(label.id)) continue;
      try {
        const target = resolveInvestigationLocationTarget(labelStructure, label.id);
        byLabelId.set(label.id, {
          labelId: label.id,
          displayName: target.displayName,
          resourcePath: normalizeSupportManagementResourcePath(label.resourcePath),
        });
      } catch {
        continue;
      }
    }
  }

  return [...byLabelId.values()];
};

/** One report type the registration form offers, and the labels an errand gets when it is chosen. */
export interface RegistrationReportType {
  readonly labelId: string;
  readonly displayName: string;
  readonly resourcePath: string;
  /** The whole path from the top of the structure down to the report type, as the errand carries it. */
  readonly chainIds: readonly string[];
}

interface LabelPathMatch {
  readonly node: Label;
  readonly ancestors: readonly Label[];
}

const findByResourcePath = (labelStructure: readonly Label[] | undefined, resourcePath: string): LabelPathMatch[] => {
  const matches: LabelPathMatch[] = [];
  const visit = (nodes: readonly Label[] | undefined, ancestors: readonly Label[]): void => {
    for (const node of nodes ?? []) {
      const path = typeof node.resourcePath === 'string' ? normalizeSupportManagementResourcePath(node.resourcePath) : '';
      if (path === resourcePath) matches.push({ node, ancestors });
      visit(node.labels, [...ancestors, node]);
    }
  };
  visit(labelStructure, []);
  return matches;
};

/**
 * The report types the application configures, resolved against Support Management's metadata.
 *
 * Unlike a place, which comes from one account's configuration, these paths are the deployment's
 * own: one that does not resolve is a broken deployment rather than a handler without access, so it
 * fails here instead of quietly offering a shorter list. That is the same judgement
 * `resolveDefaultLabels` makes about the registration labels it resolves.
 */
export const resolveRegistrationReportTypes = (
  labelStructure: readonly Label[] | undefined,
  resourcePaths: readonly string[],
): RegistrationReportType[] =>
  resourcePaths.map(configuredPath => {
    const resourcePath = normalizeSupportManagementResourcePath(configuredPath);
    const matches = findByResourcePath(labelStructure, resourcePath);
    if (matches.length !== 1) {
      throw new HttpException(502, `Registration report type ${resourcePath} resolved ${matches.length} times`);
    }

    const { node, ancestors } = matches[0];
    const chain = [...ancestors, node];
    const chainIds = chain.map(label => {
      const id = typeof label.id === 'string' ? label.id.trim() : '';
      if (!id) throw new HttpException(502, 'Support Management label metadata contains a label without id');
      return id;
    });

    return {
      labelId: chainIds[chainIds.length - 1],
      displayName: node.displayName || node.resourceName || resourcePath,
      resourcePath,
      chainIds,
    };
  });

/**
 * The metadata labels for a list of ids, in the order given.
 *
 * A new errand carries whole metadata labels, the way `resolveDefaultLabels` has always built them,
 * so the registration form's choices are turned back into labels here rather than sent upstream as
 * bare ids. An id the metadata does not know is a broken deployment: the ids came from that same
 * metadata a moment earlier.
 */
export const resolveRegistrationLabelsByIds = (labelStructure: readonly Label[] | undefined, labelIds: readonly string[]): Label[] => {
  const byId = new Map<string, Label>();
  const visit = (nodes: readonly Label[] | undefined): void => {
    for (const node of nodes ?? []) {
      if (typeof node.id === 'string' && node.id.length > 0) byId.set(node.id, node);
      visit(node.labels);
    }
  };
  visit(labelStructure);

  return labelIds.map(id => {
    const label = byId.get(id);
    if (!label) throw new HttpException(502, `Registration label ${id} is not in Support Management metadata`);
    return label;
  });
};
