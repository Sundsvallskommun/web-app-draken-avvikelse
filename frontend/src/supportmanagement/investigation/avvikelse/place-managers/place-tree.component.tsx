import { countWithNoun } from '@common/utils/count-with-noun';
import { Button, cx, Label } from '@sk-web-gui/react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { FC } from 'react';

import { countUnitsWithoutHolder, type PlaceTreeNode } from './place-manager-tree';

interface PlaceTreeProps {
  nodes: readonly PlaceTreeNode[];
  /** How many people hold each unit, by the unit's path. */
  holderCounts: ReadonlyMap<string, number>;
  /** The areas shown opened, by label id. */
  expanded: ReadonlySet<string>;
  selectedLabelId: string | undefined;
  onToggle: (labelId: string) => void;
  onSelect: (labelId: string) => void;
  /** The tree's own name, given on the outermost list only. */
  label?: string;
}

/** What stands beside a place: the units nobody holds, which is what the tree is read for. */
const PlaceTreeMark: FC<{ node: PlaceTreeNode; holderCounts: ReadonlyMap<string, number> }> = ({
  node,
  holderCounts,
}) => {
  const unitsWithoutHolder = countUnitsWithoutHolder(node, holderCounts);
  if (unitsWithoutHolder === 0) {
    return node.kind === 'unit' ? (
      <span className="text-small text-dark-secondary shrink-0">
        {countWithNoun(holderCounts.get(node.resourcePath) ?? 0, 'person', 'personer')}
      </span>
    ) : null;
  }
  return (
    <Label rounded inverted color="warning" className="shrink-0">
      {node.kind === 'unit' ? 'Ingen person' : `${unitsWithoutHolder} utan person`}
    </Label>
  );
};

/**
 * The place structure as a tree: areas that open, and the units beneath them. Choosing an area means every unit
 * beneath it; choosing a unit means that unit.
 */
export const PlaceTree: FC<PlaceTreeProps> = ({
  nodes,
  holderCounts,
  expanded,
  selectedLabelId,
  onToggle,
  onSelect,
  label,
}) => (
  <ul
    role={label ? 'tree' : 'group'}
    aria-label={label}
    className={cx('m-0 list-none flex flex-col gap-2', label ? 'p-0' : 'pl-24')}
  >
    {nodes.map((node) => {
      const isArea = node.kind === 'area';
      const isOpen = isArea && expanded.has(node.labelId);
      const isSelected = node.labelId === selectedLabelId;
      return (
        <li
          key={node.labelId}
          role="treeitem"
          aria-expanded={isArea ? isOpen : undefined}
          aria-selected={isSelected}
          data-cy={`place-tree-${node.labelId}`}
        >
          <div className="flex items-center gap-4">
            {isArea ? (
              <Button
                type="button"
                iconButton
                size="sm"
                variant="tertiary"
                aria-label={`${isOpen ? 'Dölj' : 'Visa'} platserna under ${node.name}`}
                onClick={() => onToggle(node.labelId)}
                data-cy={`place-tree-toggle-${node.labelId}`}
              >
                {isOpen ? <ChevronDown /> : <ChevronRight />}
              </Button>
            ) : (
              <span className="w-32 shrink-0" aria-hidden="true" />
            )}
            <button
              type="button"
              className={cx(
                'flex grow min-w-0 items-center justify-between gap-12 rounded-8 px-8 py-4 text-left',
                isSelected ? 'bg-vattjom-surface-accent font-bold' : 'hover:bg-dark-ghost'
              )}
              onClick={() => onSelect(node.labelId)}
              data-cy={`place-tree-select-${node.labelId}`}
            >
              <span className="break-words min-w-0">{node.name}</span>
              <PlaceTreeMark node={node} holderCounts={holderCounts} />
            </button>
          </div>
          {isOpen && (
            <PlaceTree
              nodes={node.children}
              holderCounts={holderCounts}
              expanded={expanded}
              selectedLabelId={selectedLabelId}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          )}
        </li>
      );
    })}
  </ul>
);
