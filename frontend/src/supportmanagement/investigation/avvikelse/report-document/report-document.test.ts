import assert from 'node:assert/strict';

import type { Phase } from '@common/data-contracts/supportmanagement/data-contracts';
import { test } from 'vitest';

import {
  findReportPlaceProperty,
  registeredPlaceName,
  reportSaveErrorMessage,
  resolveReportDocumentEditability,
  withPlainTextAreas,
  withReadonlyPlace,
  withRegisteredPlace,
} from './report-document';

const reportDocument = { editableChannel: 'WEB_UI', lockedFromPhase: 'INVESTIGATION' };

/** The avvikelse workflow as the test namespace declares it. */
const workflow: Phase[] = [
  { id: 'phase-received', name: 'ACTUALIZATION', phaseOrder: 0 },
  { id: 'phase-review', name: 'REVIEW', phaseOrder: 1 },
  { id: 'phase-investigation', name: 'INVESTIGATION', phaseOrder: 2 },
  { id: 'phase-decision', name: 'DECISION', phaseOrder: 3 },
];

const errandIn = (channel: string, phaseId?: string) => ({
  channel,
  phases: phaseId ? [{ phaseId: 'phase-received', ended: '2026-10-01T08:00:00Z' }, { phaseId }] : [],
});

test('opens the report of an errand registered in Draken until it reaches Utredning', () => {
  assert.equal(
    resolveReportDocumentEditability(errandIn('WEB_UI', 'phase-received'), workflow, reportDocument),
    'editable'
  );
  assert.equal(
    resolveReportDocumentEditability(errandIn('WEB_UI', 'phase-review'), workflow, reportDocument),
    'editable'
  );
  assert.equal(
    resolveReportDocumentEditability(errandIn('WEB_UI', 'phase-investigation'), workflow, reportDocument),
    'investigation-started'
  );
  assert.equal(
    resolveReportDocumentEditability(errandIn('WEB_UI', 'phase-decision'), workflow, reportDocument),
    'investigation-started'
  );
});

test('never opens the report Katla brought in', () => {
  assert.equal(
    resolveReportDocumentEditability(errandIn('ESERVICE', 'phase-received'), workflow, reportDocument),
    'arrived-elsewhere'
  );
  assert.equal(
    resolveReportDocumentEditability(errandIn('PHONE', 'phase-received'), workflow, reportDocument),
    'arrived-elsewhere'
  );
});

test('keeps the report locked when nothing shows that the investigation has not started', () => {
  assert.equal(resolveReportDocumentEditability(errandIn('WEB_UI'), workflow, reportDocument), 'investigation-started');
  assert.equal(
    resolveReportDocumentEditability(errandIn('WEB_UI', 'phase-received'), undefined, reportDocument),
    'investigation-started'
  );
  assert.equal(
    resolveReportDocumentEditability(
      errandIn('WEB_UI', 'phase-received'),
      workflow.filter((phase) => phase.name !== 'INVESTIGATION'),
      reportDocument
    ),
    'investigation-started'
  );
});

test('finds the place by the field the UI schema renders it with', () => {
  const uiSchema = {
    'ui:order': ['facilityInfo'],
    eventDate: { 'ui:widget': 'date' },
    facilityInfo: { 'ui:field': 'FacilitySearchWidget' },
  };

  assert.equal(findReportPlaceProperty(uiSchema), 'facilityInfo');
  assert.equal(findReportPlaceProperty({ eventDate: { 'ui:widget': 'date' } }), undefined);
  assert.equal(findReportPlaceProperty(undefined), undefined);
});

test('shows the place without letting it be chosen, since the labels decide it', () => {
  assert.deepEqual(withReadonlyPlace({ facilityInfo: { 'ui:field': 'FacilitySearchWidget' } }, 'facilityInfo'), {
    facilityInfo: { 'ui:field': 'FacilitySearchWidget', 'ui:readonly': true, 'ui:options': { hideDescription: true } },
  });
  assert.deepEqual(withReadonlyPlace({ eventDate: {} }, undefined), { eventDate: {} });
  // Ä4. The place is already chosen, so Katla's instruction on how to choose it is not repeated.
  assert.deepEqual(
    withReadonlyPlace(
      {
        facilityInfo: {
          'ui:field': 'FacilitySearchWidget',
          'ui:help': 'Ange vilken enhet eller avdelning händelsen inträffade',
          'ui:description': 'Välj plats',
          'ui:options': { className: 'w-full' },
        },
      },
      'facilityInfo'
    ),
    {
      facilityInfo: {
        'ui:field': 'FacilitySearchWidget',
        'ui:readonly': true,
        'ui:options': { className: 'w-full', hideDescription: true },
      },
    }
  );
});

test('starts a new report at the registered place, and leaves a written one alone', () => {
  assert.deepEqual(withRegisteredPlace({}, 'facilityInfo', 'Hemtjänst Norr'), {
    facilityInfo: { orgName: 'Hemtjänst Norr' },
  });
  assert.deepEqual(
    withRegisteredPlace({ facilityInfo: { orgName: 'Annan enhet' } }, 'facilityInfo', 'Hemtjänst Norr'),
    {
      facilityInfo: { orgName: 'Annan enhet' },
    }
  );
  assert.deepEqual(withRegisteredPlace({}, undefined, 'Hemtjänst Norr'), {});
  assert.deepEqual(withRegisteredPlace({}, 'facilityInfo', undefined), {});
});

/** A label as an errand carries it, named by the last part of its path. */
const label = (classification: string, resourcePath: string, displayName: string) => ({
  classification,
  resourcePath,
  resourceName: resourcePath.split('/').at(-1) ?? resourcePath,
  displayName,
});

test('names the registered place by the deepest location label the errand carries', () => {
  assert.equal(
    registeredPlaceName([
      label('REPORT_TYPE', 'REPORT_TYPE/DEVIATION', 'Avvikelse'),
      label('location', 'LOCATION/33', 'Äldreboende'),
      label('location', 'LOCATION/33/34/7460', 'Thulegården'),
      label('location', 'LOCATION/33/34', 'Äldreboende'),
    ]),
    'Thulegården'
  );
  assert.equal(registeredPlaceName([label('REPORT_TYPE', 'REPORT_TYPE', 'Rapport')]), undefined);
  assert.equal(registeredPlaceName(undefined), undefined);
});

test('explains why a report could not be saved', () => {
  assert.match(reportSaveErrorMessage(412), /ändrats av någon annan/u);
  assert.match(reportSaveErrorMessage(409), /gått vidare till utredning/u);
  assert.match(reportSaveErrorMessage(403), /behörighet/u);
  assert.match(reportSaveErrorMessage(undefined), /kunde inte sparas/u);
});

test('writes plain report strings as plain text, keeping the editor for declared HTML', () => {
  const schema = {
    type: 'object' as const,
    properties: {
      eventDescription: { type: 'string' as const },
      notes: { type: 'string' as const, contentMediaType: 'text/html' },
    },
  };

  assert.deepEqual(
    withPlainTextAreas(
      {
        eventDescription: { 'ui:widget': 'textarea' },
        notes: { 'ui:widget': 'textarea' },
        eventDate: { 'ui:widget': 'date' },
      },
      schema
    ),
    {
      eventDescription: { 'ui:widget': 'PlainTextareaWidget' },
      notes: { 'ui:widget': 'textarea' },
      eventDate: { 'ui:widget': 'date' },
    }
  );
});
