'use client';

import { Alert, Button, cx, Spinner, Tabs } from '@sk-web-gui/react';
import { useConfigStore, useSupportStore, useUserStore } from '@stores/index';
import {
  isSupportErrandLocked,
  isSupportErrandOpenToHandover,
} from '@supportmanagement/services/support-errand-service';
import { useCallback, useMemo, useState } from 'react';

import type { InvestigationDocumentPlacement } from '../investigation-profile';
import { useInvestigationProfileStore } from '../investigation-profile-store';
import type { InvestigationTabProps } from '../investigation-variant';
import { getInvestigationDocumentApplicability } from './investigation-classification';
import {
  configuredInvestigationDocuments,
  type InvestigationDocumentContext,
  type InvestigationTabState,
  isInvestigationDocumentEditable,
  resolveInvestigationTabState,
  selectedInvestigationDocumentKey,
  visibleInvestigationDocuments,
} from './investigation-tab-state';
import { recordSavedInvestigationDocument } from './record-saved-investigation-document';
import { SupportInvestigationDocument } from './support-investigation-document.component';
import type { SupportInvestigationDocument as SavedInvestigationDocument } from './support-investigation-service';

type InvestigationTabNotice = Exclude<InvestigationTabState, 'loading' | 'ready'>;

/** The tabs this component draws. A document placed in Ärendeuppgifter is drawn there, not as a tab. */
type InvestigationTabPlacement = Exclude<InvestigationDocumentPlacement, 'details'>;

interface TabCopy {
  readonly heading: string;
  readonly description: string;
  readonly dataCy: string;
  readonly noticePrefix: string;
  readonly notices: Readonly<Record<InvestigationTabNotice, string>>;
  /**
   * States in which the tab has nothing for this user to do. The tab then shows only one notice, with
   * nothing to document and no permissions to recheck: that nothing applies, or who the work belongs to.
   */
  readonly nothingToDoStates?: readonly InvestigationTabNotice[];
  /** Who the work belongs to, told a handler who reaches none of the documents that apply to the errand. */
  readonly ownerNotice?: (owners: string) => string;
}

/**
 * The same document machinery serves both tabs; only what the handler is told differs. The
 * investigation copy is unchanged from before the decision tab existed.
 */
const tabCopy: Readonly<Record<InvestigationTabPlacement, TabCopy>> = {
  investigation: {
    heading: 'Utredning',
    description:
      'Dokumentera de olika delarna av utredningen och spara med Spara ärende. Varje del sparas separat och behåller sin schemaversion.',
    dataCy: 'support-investigation-tab',
    noticePrefix: 'investigation-tab',
    notices: {
      error: 'Utredningsprofilen kunde inte laddas. Utredningen kan därför inte visas.',
      unavailable: 'Utredningsfunktionen är tillfälligt otillgänglig. Försök igen senare.',
      'not-configured': 'Inga utredningsdokument är konfigurerade för den här applikationen.',
      'not-applicable': 'Inga utredningsdokument gäller för det här ärendet.',
      'access-error': 'Behörigheterna kunde inte kontrolleras. Försök igen för att fortsätta.',
      'no-access': 'Du har inte behörighet till någon del av den här utredningen.',
    },
  },
  decision: {
    heading: 'Beslut',
    description:
      'Dokumentera beslutet som avslutar utredningen, inklusive ställningstagandet till anmälan till IVO, och spara med Spara ärende. Beslutet sparas separat från utredningen och behåller sin schemaversion.',
    dataCy: 'support-decision-tab',
    noticePrefix: 'decision-tab',
    notices: {
      error: 'Utredningsprofilen kunde inte laddas. Beslutet kan därför inte visas.',
      unavailable: 'Utredningsfunktionen är tillfälligt otillgänglig. Försök igen senare.',
      'not-configured': 'Inga beslutsdokument är konfigurerade för den här applikationen.',
      'not-applicable': 'Det finns inget att besluta om. Gå vidare till uppföljning.',
      'access-error': 'Behörigheterna kunde inte kontrolleras. Försök igen för att fortsätta.',
      'no-access': 'Du har inte behörighet till beslutet i det här ärendet.',
    },
    // An errand that calls for no decision, and a decision that is another role's, leave this handler
    // nothing to decide. The second names the role, so a role wrongly refused its own decision shows.
    nothingToDoStates: ['not-applicable', 'no-access'],
    ownerNotice: (owners) => `Beslutet fattas av ${owners}.`,
  },
};

interface SupportErrandInvestigationTabProps extends InvestigationTabProps {
  /** Which tab this is; the investigation tab unless the variant says otherwise. */
  readonly placement?: InvestigationTabPlacement;
}

export function SupportErrandInvestigationTab(props: Readonly<SupportErrandInvestigationTabProps>) {
  const municipalityId = useConfigStore((state) => state.municipalityId);
  const errandId = useSupportStore((state) => state.supportErrand?.id);
  const username = useUserStore((state) => state.user.username);
  // Drafts live only in this user's currently opened errand, never across navigation or logout.
  return <InvestigationDocuments key={JSON.stringify([municipalityId, errandId, username])} {...props} />;
}

/** The document menu's bar: set apart from the form, and with a marker thick enough to be seen at a glance. */
const INVESTIGATION_DOCUMENT_TABLIST_CLASS = [
  'flex-wrap gap-x-32 gap-y-8 bg-vattjom-background-100 px-24 pt-16',
  '[&_.sk-tabs-list-item-divider]:h-[0.4rem] [&_.sk-tabs-list-item-divider]:min-h-[0.4rem]',
].join(' ');

function InvestigationDocuments({
  onDirtyChange,
  access,
  refreshAccess,
  revealTab,
  placement = 'investigation',
}: Readonly<SupportErrandInvestigationTabProps>) {
  const [activeDocumentKey, setActiveDocumentKey] = useState<string>();
  const [dirtyDocuments, setDirtyDocuments] = useState<Readonly<Record<string, boolean>>>({});
  const supportErrand = useSupportStore((state) => state.supportErrand);
  const canEditSupportManagement = useUserStore((state) => state.user.permissions.canEditSupportManagement);
  const profile = useInvestigationProfileStore((state) => state.profile);
  const profileStatus = useInvestigationProfileStore((state) => state.status);
  // Errand-wide readonly. Each document adds its own read-only grant on top of it below.
  const errandReadonly = !supportErrand || isSupportErrandLocked(supportErrand);
  const errandOpenToHandover = supportErrand ? isSupportErrandOpenToHandover(supportErrand) : false;
  const copy = tabCopy[placement];
  const applicability = getInvestigationDocumentApplicability(supportErrand);
  const documentContext = useMemo<InvestigationDocumentContext>(
    () => ({ placement, applicability, access }),
    [placement, applicability, access]
  );

  // Keep a stable panel for each configured document. Access controls its content, not the
  // lifetime of its draft. The tabs library keys panels by index, so filtering here loses drafts.
  const documents = useMemo(
    () => (profile?.documents ?? []).filter((document) => (document.placement ?? 'investigation') === placement),
    [profile, placement]
  );
  const visibleDocuments = useMemo(
    () => visibleInvestigationDocuments(profile, documentContext),
    [documentContext, profile]
  );
  const selectedKey = selectedInvestigationDocumentKey(visibleDocuments, access, activeDocumentKey);
  const activeTab = Math.max(
    0,
    documents.findIndex((document) => document.key === selectedKey)
  );
  const tabState = resolveInvestigationTabState(profileStatus, profile, documentContext);
  const nothingToDo =
    tabState !== 'loading' && tabState !== 'ready' && copy.nothingToDoStates?.includes(tabState) === true;
  // Who the documents this errand calls for belong to, told to a handler who reaches none of them.
  const owners = [
    ...new Set(configuredInvestigationDocuments(profile, documentContext).map((document) => document.ownerLabel)),
  ].join(' eller ');
  const nothingToDoNotice =
    tabState === 'no-access'
      ? copy.ownerNotice && owners
        ? copy.ownerNotice(owners)
        : copy.notices['no-access']
      : copy.notices['not-applicable'];
  const hasHiddenDraft = documents.some(
    (document) => dirtyDocuments[document.key] && !visibleDocuments.some((visible) => visible.key === document.key)
  );

  const recordSavedDocument = useCallback(
    (document: SavedInvestigationDocument) => recordSavedInvestigationDocument(supportErrand?.id, document),
    [supportErrand?.id]
  );

  const dirtyCallbacks = useMemo(() => {
    const callbacks: Record<string, (isDirty: boolean) => void> = {};
    for (const { key } of documents) {
      callbacks[key] = (isDirty: boolean) => {
        setDirtyDocuments((current) => (current[key] === isDirty ? current : { ...current, [key]: isDirty }));
        onDirtyChange(key, isDirty);
      };
    }
    return callbacks;
  }, [documents, onDirtyChange]);

  return (
    <div className="min-w-0 max-w-full p-16 sm:p-24 md:p-32" data-cy={copy.dataCy}>
      {nothingToDo ? (
        <Alert type="info">
          <Alert.Icon />
          <Alert.Content>
            <Alert.Content.Description data-cy={`${copy.noticePrefix}-nothing-to-do`}>
              {nothingToDoNotice}
            </Alert.Content.Description>
          </Alert.Content>
        </Alert>
      ) : (
        <>
          <div className="mb-24">
            <h2 className="text-h2-md">{copy.heading}</h2>
            <p className="mt-8">{copy.description}</p>
          </div>

          {tabState === 'loading' ? (
            <div className="flex justify-center p-24" data-cy={`${copy.noticePrefix}-loading`}>
              <Spinner size={4} aria-label={`${copy.heading} laddas`} />
            </div>
          ) : null}

          {tabState !== 'loading' && tabState !== 'ready' ? (
            <Alert type={tabState === 'not-configured' || tabState === 'not-applicable' ? 'info' : 'warning'}>
              <Alert.Icon />
              <Alert.Content>
                <Alert.Content.Description data-cy={`${copy.noticePrefix}-${tabState}`}>
                  {copy.notices[tabState]}
                </Alert.Content.Description>
              </Alert.Content>
            </Alert>
          ) : null}

          {(tabState === 'access-error' || tabState === 'no-access') && (
            <Button className="my-16" variant="secondary" onClick={refreshAccess}>
              Kontrollera behörigheter igen
            </Button>
          )}
        </>
      )}

      {hasHiddenDraft && (
        <p role="status" className="my-16">
          Du har osparade ändringar i ett dokument som inte kan visas just nu. Ändringarna finns kvar tills du lämnar
          sidan eller laddar om den.
        </p>
      )}

      {documents.length > 0 ? (
        <Tabs
          hidden={tabState !== 'ready'}
          className="w-full min-w-0 max-w-full overflow-hidden rounded-12 border-1 bg-background-content"
          // The documents are a menu of their own inside the tab, and have to read as one: a tinted bar with a line
          // beneath it, and the open document over a marker in the brand colour. As plain text over the form they
          // passed for its heading.
          tabslistClassName={INVESTIGATION_DOCUMENT_TABLIST_CLASS}
          panelsClassName="min-w-0 max-w-full"
          underline
          color="vattjom"
          current={activeTab}
          onTabChange={(index) => {
            if (visibleDocuments.some((document) => document.key === documents[index]?.key))
              setActiveDocumentKey(documents[index].key);
          }}
          size="md"
        >
          {documents.map((definition) => (
            <Tabs.Item key={`${supportErrand?.id}:${definition.key}`}>
              <Tabs.Button
                hidden={!visibleDocuments.some((document) => document.key === definition.key)}
                className={cx(
                  'px-4 text-base',
                  !visibleDocuments.some((document) => document.key === definition.key) && 'hidden'
                )}
                data-cy={`${definition.key}-tab`}
                onKeyDown={(event) => {
                  const index = visibleDocuments.findIndex((document) => document.key === definition.key);
                  const count = visibleDocuments.length;
                  if (!count || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                  event.preventDefault();
                  const next =
                    event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                      ? count - 1
                      : (index + (event.key === 'ArrowRight' ? 1 : -1) + count) % count;
                  setActiveDocumentKey(visibleDocuments[next].key);
                }}
              >
                {definition.tabLabel}
              </Tabs.Button>
              <Tabs.Content className="min-w-0 max-w-full">
                <SupportInvestigationDocument
                  definition={definition}
                  readable={
                    tabState === 'ready' && visibleDocuments.some((document) => document.key === definition.key)
                  }
                  readonly={errandReadonly || !isInvestigationDocumentEditable(definition, access)}
                  canHandBack={errandOpenToHandover && isInvestigationDocumentEditable(definition, access)}
                  classificationReadonly={!canEditSupportManagement}
                  refreshAccess={refreshAccess}
                  onDirtyChange={dirtyCallbacks[definition.key]}
                  onSaved={recordSavedDocument}
                  onReveal={() => {
                    revealTab();
                    setActiveDocumentKey(definition.key);
                  }}
                />
              </Tabs.Content>
            </Tabs.Item>
          ))}
        </Tabs>
      ) : null}
    </div>
  );
}
