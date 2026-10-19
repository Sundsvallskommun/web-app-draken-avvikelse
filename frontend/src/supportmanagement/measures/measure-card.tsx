import type { Measure } from '@common/data-contracts/supportmanagement/data-contracts';
import { Button, Checkbox, Icon, Label } from '@sk-web-gui/react';
import dayjs from 'dayjs';
import { CalendarClock, ClipboardCheck, FileText, Pencil, Trash2 } from 'lucide-react';

import { measureDecisionPresentation } from './measure-decision';
import { measureFollowUp, measureHasFollowUp } from './measure-follow-up';

const date = (value?: string) => (value ? dayjs(value).format('YYYY-MM-DD') : undefined);

function timing(measure: Measure): { label: string; color: string; dateLine?: string } {
  if (measure.executed)
    return {
      label: measureHasFollowUp(measure) ? 'Utförd' : 'Genomförd',
      color: 'gronsta',
      dateLine: `Genomfört datum: ${date(measure.executed)}`,
    };
  const start = date(measure.plannedStart);
  const complete = date(measure.plannedComplete);
  if (start || complete) {
    const range = start && complete && start !== complete ? `${start} – ${complete}` : start ?? complete;
    return { label: 'Planerad', color: 'vattjom', dateLine: `Planerat datum: ${range}` };
  }
  return { label: 'Ej tidsatt', color: 'bjornstigen' };
}

/** One measure as a card: what it is, where it stands, who registered it, and what the viewer may do with it. */
export function MeasureCard({
  measure,
  title,
  creator,
  role,
  responsible,
  onEdit,
  onRemove,
  onDecide,
  onFollowUp,
  onChangeEndDate,
}: {
  measure: Measure;
  /** The measure type, as the list names it. */
  title: string;
  creator?: string;
  role?: string;
  responsible?: string;
  /** Each action is offered only where the list has decided the viewer may take it. */
  onEdit?: () => void;
  onRemove?: () => void;
  onDecide?: () => void;
  onFollowUp?: () => void;
  onChangeEndDate?: () => void;
}) {
  const status = timing(measure);
  const decision = measureDecisionPresentation(measure);
  const created = measure.created ? dayjs(measure.created).format('YYYY-MM-DD HH:mm:ss') : undefined;
  const followUp = measureFollowUp(measure);
  return (
    <li className="border-1 rounded-12 bg-background-content p-16 sm:p-24 grid grid-cols-[auto_minmax(0,1fr)] sm:grid-cols-[auto_minmax(0,1fr)_auto] gap-16 min-w-0">
      <div
        aria-hidden="true"
        className={`shrink-0 w-40 h-40 rounded-8 flex items-center justify-center ${decision.iconClassName}`}
      >
        <Icon icon={<FileText />} size={20} />
      </div>
      <div className="min-w-0 grow flex flex-col gap-8">
        <div className="flex flex-wrap items-center gap-12">
          <h4 className="font-bold">{title}</h4>
          {measureHasFollowUp(measure) && (measure.plannedStart || measure.plannedComplete) && (
            <Label rounded color="vattjom">
              Planerad
            </Label>
          )}
          <Label rounded color={status.color}>
            {status.label}
          </Label>
          <Label rounded inverted color={decision.color}>
            {decision.label}
          </Label>
        </div>
        {measure.description && <p className="whitespace-pre-wrap break-words">{measure.description}</p>}
        {measure.goal && (
          <p className="whitespace-pre-wrap break-words">
            <strong>Mål:</strong> <span>{measure.goal}</span>
          </p>
        )}
        {status.dateLine && <p className="text-small">{status.dateLine}</p>}
        {measure.executed && (measure.plannedStart || measure.plannedComplete) && (
          <p className="text-small">
            {measure.plannedStart && `Påbörjas: ${date(measure.plannedStart)}`}
            {measure.plannedStart && measure.plannedComplete && ' • '}
            {measure.plannedComplete && `Klar senast: ${date(measure.plannedComplete)}`}
          </p>
        )}
        {responsible && (
          <p className="text-small whitespace-pre-wrap break-words">
            <strong>Ansvarig:</strong> <span>{responsible}</span>
          </p>
        )}
        {measure.acceptMotivation && (
          <div className={`min-w-0 rounded-8 border-l-4 p-12 ${decision.motivationClassName}`}>
            <h5 className="text-label-medium">{decision.motivationLabel}</h5>
            <p className="whitespace-pre-wrap break-words">{measure.acceptMotivation}</p>
          </div>
        )}
        {followUp && (
          <div className="rounded-8 border-1 border-gronsta-surface-primary bg-gronsta-background-100 p-12 flex flex-col gap-8">
            <p>
              <strong>Önskad effekt uppnådd:</strong> {followUp.desiredEffectAchieved ? 'Ja' : 'Nej'}
            </p>
            <p className="whitespace-pre-wrap break-words">
              <strong>Åtgärdens effekt:</strong> {followUp.followUpDescription}
            </p>
          </div>
        )}
        <p className="text-small text-dark-secondary">
          {creator ? `Skapad av ${creator}` : 'Skapad'}
          {role ? ` (${role})` : ''}
          {created ? ` • ${created}` : ''}
        </p>
      </div>
      {(onEdit || onRemove || onDecide || onFollowUp || onChangeEndDate) && (
        <div className="col-start-2 sm:col-start-3 flex flex-wrap sm:flex-col items-start gap-8">
          {onFollowUp && (
            <Checkbox checked={false} aria-label={`Utförd: ${title}`} onChange={onFollowUp}>
              Utförd
            </Checkbox>
          )}
          {onChangeEndDate && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              leftIcon={<CalendarClock />}
              aria-label={`Ändra slutdatum ${title}`}
              onClick={onChangeEndDate}
            >
              Ändra slutdatum
            </Button>
          )}
          {onDecide && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              leftIcon={<ClipboardCheck />}
              aria-label={`Bedöm förslag ${title}`}
              onClick={onDecide}
            >
              Bedöm förslag
            </Button>
          )}
          {onEdit && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              leftIcon={<Pencil />}
              aria-label={`Redigera åtgärd ${title}`}
              onClick={onEdit}
            >
              Redigera
            </Button>
          )}
          {onRemove && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              leftIcon={<Trash2 />}
              aria-label={`Ta bort åtgärd ${title}`}
              onClick={onRemove}
            >
              Ta bort
            </Button>
          )}
        </div>
      )}
    </li>
  );
}
