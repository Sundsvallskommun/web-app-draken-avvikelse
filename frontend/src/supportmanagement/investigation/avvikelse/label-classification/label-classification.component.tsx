'use client';

import { FormControl, FormErrorMessage, FormHelperText, FormLabel, Select } from '@sk-web-gui/react';
import { type ChangeEvent, type FC, useId } from 'react';

import type {
  LabelClassificationCatalog,
  LabelClassificationSelection,
  LabelClassificationTypeOption,
} from './label-classification.types';

export interface LabelClassificationProps {
  catalog: LabelClassificationCatalog;
  value: LabelClassificationSelection;
  onChange: (value: LabelClassificationSelection) => void;
  disabled?: boolean;
  content?: Partial<LabelClassificationContent>;
  errors?: {
    type?: string;
    subtype?: string;
  };
}

export interface LabelClassificationContent {
  typeLabel: string;
  typePlaceholder: string;
  typeEmptyPlaceholder: string;
  typeHelperText?: string;
  subtypeLabel: string;
  subtypePlaceholder: string;
  subtypeBeforeTypePlaceholder: string;
  subtypeEmptyPlaceholder: string;
  subtypeHelperText?: string;
}

const defaultContent: LabelClassificationContent = {
  typeLabel: 'Avvikelsetyp',
  typePlaceholder: 'Välj ärendekategori',
  typeEmptyPlaceholder: 'Inga avvikelsetyper tillgängliga',
  subtypeLabel: 'Detaljerad typ av avvikelse',
  subtypePlaceholder: 'Välj detaljerad typ av avvikelse',
  subtypeBeforeTypePlaceholder: 'Välj ärendekategori först',
  subtypeEmptyPlaceholder: 'Saknar detaljerade typer',
};

const getSubtypePlaceholder = (
  selectedType: LabelClassificationTypeOption | undefined,
  content: LabelClassificationContent
): string => {
  if (!selectedType) return content.subtypeBeforeTypePlaceholder;
  return selectedType.subtypes.length > 0 ? content.subtypePlaceholder : content.subtypeEmptyPlaceholder;
};

export const LabelClassification: FC<LabelClassificationProps> = ({
  catalog,
  value,
  onChange,
  disabled = false,
  content,
  errors,
}) => {
  const id = useId();
  const resolvedContent = { ...defaultContent, ...content };
  const selectedType = catalog.types.find((type) => type.code === value.typeCode);
  const selectedSubtype = selectedType?.subtypes.find((subtype) => subtype.code === value.subtypeCode);
  const hasTypes = catalog.types.length > 0;
  const hasSubtypes = (selectedType?.subtypes.length ?? 0) > 0;

  const handleTypeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const typeCode = event.currentTarget.value || undefined;

    onChange({
      typeCode,
      subtypeCode: typeCode === value.typeCode ? value.subtypeCode : undefined,
    });
  };

  const handleSubtypeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    onChange({
      typeCode: selectedType?.code,
      subtypeCode: event.currentTarget.value || undefined,
    });
  };

  const subtypePlaceholder = getSubtypePlaceholder(selectedType, resolvedContent);

  return (
    <div className="grid grid-cols-1 gap-lg md:grid-cols-2">
      <FormControl
        id={`${id}-type`}
        className="w-full"
        disabled={disabled || !hasTypes}
        invalid={Boolean(errors?.type)}
      >
        <FormLabel>{resolvedContent.typeLabel}</FormLabel>
        <Select
          className="w-full"
          data-cy="label-classification-type"
          disabled={disabled || !hasTypes}
          value={selectedType?.code ?? ''}
          onChange={handleTypeChange}
        >
          <Select.Option value="">
            {hasTypes ? resolvedContent.typePlaceholder : resolvedContent.typeEmptyPlaceholder}
          </Select.Option>
          {catalog.types.map((type) => (
            <Select.Option key={type.code} value={type.code}>
              {type.displayName}
            </Select.Option>
          ))}
        </Select>
        {resolvedContent.typeHelperText && <FormHelperText>{resolvedContent.typeHelperText}</FormHelperText>}
        {errors?.type && <FormErrorMessage data-cy="label-classification-type-error">{errors.type}</FormErrorMessage>}
      </FormControl>

      <FormControl
        id={`${id}-subtype`}
        className="w-full"
        disabled={disabled || !hasSubtypes}
        invalid={Boolean(errors?.subtype)}
      >
        <FormLabel>{resolvedContent.subtypeLabel}</FormLabel>
        <Select
          className="w-full"
          data-cy="label-classification-subtype"
          disabled={disabled || !hasSubtypes}
          value={selectedSubtype?.code ?? ''}
          onChange={handleSubtypeChange}
        >
          <Select.Option value="">{subtypePlaceholder}</Select.Option>
          {selectedType?.subtypes.map((subtype) => (
            <Select.Option key={subtype.code} value={subtype.code}>
              {subtype.displayName}
            </Select.Option>
          ))}
        </Select>
        {resolvedContent.subtypeHelperText && <FormHelperText>{resolvedContent.subtypeHelperText}</FormHelperText>}
        {errors?.subtype && (
          <FormErrorMessage data-cy="label-classification-subtype-error">{errors.subtype}</FormErrorMessage>
        )}
      </FormControl>
    </div>
  );
};
