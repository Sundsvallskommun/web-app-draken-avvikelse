'use client';

import { FormControl, FormLabel, Select } from '@sk-web-gui/react';
import type { SupportRegistrationOption } from '@supportmanagement/services/support-errand-service';
import { FC } from 'react';

interface RegistrationReportTypeFieldProps {
  reportTypes: SupportRegistrationOption[];
  reportTypeLabelId: string;
  onChange: (reportTypeLabelId: string) => void;
}

/** What the errand is about - the report type it is registered as. */
export const RegistrationReportTypeField: FC<RegistrationReportTypeFieldProps> = ({
  reportTypes,
  reportTypeLabelId,
  onChange,
}) => (
  <FormControl id="registration-report-type" className="w-full" required>
    <FormLabel>Vad gäller det?</FormLabel>
    <Select
      className="w-full text-dark-primary"
      data-cy="registration-report-type"
      value={reportTypeLabelId}
      onChange={(event) => onChange(event.target.value)}
    >
      <Select.Option value="">Välj</Select.Option>
      {reportTypes.map((reportType) => (
        <Select.Option key={reportType.labelId} value={reportType.labelId}>
          {reportType.displayName}
        </Select.Option>
      ))}
    </Select>
  </FormControl>
);
