import { hasDirtyFields } from '@common/services/helper-service';
import WarnIfUnsavedChanges from '@common/utils/warnIfUnsavedChanges';
import { cx, Tabs } from '@sk-web-gui/react';
import { useMetadataStore, useSupportStore, useUserStore } from '@stores/index';
import { concealInvestigationDocuments } from '@supportmanagement/investigation/investigation-access';
import { useInvestigationProfileStore } from '@supportmanagement/investigation/investigation-profile-store';
import {
  isDecisionTabVisible,
  isInvestigationTabVisible,
} from '@supportmanagement/investigation/investigation-variant';
import {
  getInvestigationConcealedDocumentKeys,
  getInvestigationVariant,
} from '@supportmanagement/investigation/investigation-variant-registry';
import { useInvestigationAccess } from '@supportmanagement/investigation/use-investigation-access';
import { useInvestigationNextStep } from '@supportmanagement/investigation/use-investigation-next-step';
import { MEASURE_FOLLOW_UP_PHASE_NAME, MEASURES_PHASE_NAME } from '@supportmanagement/measures/measure-phases';
import { SupportMeasuresTab } from '@supportmanagement/measures/support-measures-tab';
import { countAttachment, getSupportAttachments } from '@supportmanagement/services/support-attachment-service';
import {
  ConversationReadByCount,
  getConversationMessageCountSummary,
  getSupportConversationMessages,
  getSupportConversationReadByCounts,
  getSupportConversations,
} from '@supportmanagement/services/support-conversation-service';
import { getSupportErrandById, SupportErrand } from '@supportmanagement/services/support-errand-service';
import {
  buildTree,
  countUnreadMessages,
  fetchSupportMessages,
  groupByConversationIdSortedTree,
  MessageNode,
} from '@supportmanagement/services/support-message-service';
import {
  getActiveSupportPhaseId,
  hasReachedSupportPhase,
  type SupportPhaseContext,
} from '@supportmanagement/services/support-phase-service';
import { FC, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFormContext, UseFormReturn, useFormState } from 'react-hook-form';

import { resolvePhaseTabKey } from './support-phase-tab';
import { SupportMessagesTab } from './tabs/messages/support-messages-tab';
import { SupportErrandAttachmentsTab } from './tabs/support-errand-attachments-tab';
import { SupportErrandBasicsTab } from './tabs/support-errand-basics-tab';
import { SupportErrandDetailsTab } from './tabs/support-errand-details-tab';

export const SupportTabsWrapper: FC<{
  onUnsavedChangesChange: (hasUnsavedChanges: boolean) => void;
}> = ({ onUnsavedChangesChange }) => {
  const [messages, setMessages] = useState<any>([]);
  const [supportConversations, setSupportConversations] = useState<any>([]);
  const [messageTree, setMessageTree] = useState<MessageNode[]>([]);
  const [conversationMessageTree, setConversationMessageTree] = useState<MessageNode[]>([]);
  const [conversationReadByCounts, setConversationReadByCounts] = useState<ConversationReadByCount[]>([]);
  const investigationVariant = getInvestigationVariant();
  const investigationProfile = useInvestigationProfileStore((state) => state.profile);
  const supportMetadata = useMetadataStore((s) => s.supportMetadata);
  const { supportErrand, setSupportErrand, supportAttachments, setSupportAttachments } = useSupportStore();
  // Where the errand stands in the workflow, for the tabs that wait for a phase. The access request
  // is deliberately not gated on it: what the handler may read of an already written document does
  // not change with the phase, and Ärendeuppgifter asks the same answer from any phase.
  const errandPhases: SupportPhaseContext = useMemo(
    () => ({ metadataPhases: supportMetadata?.phases, errandPhases: supportErrand?.phases }),
    [supportErrand?.phases, supportMetadata?.phases]
  );
  const { access: grantedInvestigationAccess, refresh: refreshInvestigationAccess } = useInvestigationAccess(
    investigationProfile?.state === 'active' && investigationProfile.documents.length > 0
  );
  // What the variant keeps out of this viewer's sight is concealed once, here, so every tab drawing the
  // documents - Utredning, Beslut and Ärendeuppgifter's own JSON view - hides the same ones.
  const viewer = useUserStore((s) => s.user);
  // Joined, so the access below is only rebuilt when the keys change: the slot answers a new array each render.
  const concealedDocumentKeys = (
    getInvestigationConcealedDocumentKeys()?.({
      errand: supportErrand,
      profile: investigationProfile,
      labelStructure: supportMetadata?.labels?.labelStructure,
      viewer,
    }) ?? []
  ).join('\n');
  const investigationAccess = useMemo(
    () =>
      concealInvestigationDocuments(
        grantedInvestigationAccess,
        concealedDocumentKeys ? concealedDocumentKeys.split('\n') : []
      ),
    [grantedInvestigationAccess, concealedDocumentKeys]
  );

  const [tabUnsavedChanges, setTabUnsavedChanges] = useState(false);
  const [measuresDirty, setMeasuresDirty] = useState(false);
  const [followUpDirty, setFollowUpDirty] = useState(false);
  const [investigationDirty, setInvestigationDirty] = useState<Partial<Record<string, boolean>>>({});

  const methods: UseFormReturn<SupportErrand, any, undefined> = useFormContext();
  const { dirtyFields } = useFormState({ control: methods.control });

  const { activeTabKey, setActiveTabKey } = useSupportStore();

  const unsavedChanges =
    hasDirtyFields(dirtyFields) ||
    tabUnsavedChanges ||
    measuresDirty ||
    followUpDirty ||
    Object.values(investigationDirty).some(Boolean);

  useEffect(() => {
    onUnsavedChangesChange(unsavedChanges);
    return () => onUnsavedChangesChange(false);
  }, [onUnsavedChangesChange, unsavedChanges]);

  const setInvestigationDocumentDirty = useCallback((key: string, isDirty: boolean) => {
    setInvestigationDirty((current) => (current[key] === isDirty ? current : { ...current, [key]: isDirty }));
  }, []);

  const getMessagesAndConversations = () => {
    getSupportAttachments(supportErrand!.id!).then(setSupportAttachments);
    fetchSupportMessages(supportErrand!.id!).then((res) => {
      const tree = buildTree(res);
      setMessageTree(tree);
      setMessages(res);
    });
    getSupportConversationReadByCounts(supportErrand!.id!)
      .then(setConversationReadByCounts)
      .catch(() => setConversationReadByCounts([]));
    getSupportConversations(supportErrand!.id!).then((res) => {
      Promise.all(
        res.data.map((conversation: any) =>
          getSupportConversationMessages(supportErrand!.id!, conversation.id).then((messages) => {
            return messages.data.map((msgRes) => (Array.isArray(msgRes) ? msgRes : msgRes ? [msgRes] : [])).flat();
          })
        )
      ).then((allMessageGroups) => {
        const allMessages = allMessageGroups.flat();
        const conversationTree = groupByConversationIdSortedTree(allMessages);

        setConversationMessageTree(conversationTree);
        setSupportConversations(allMessages);
      });
    });
  };

  const update = () => {
    if (supportErrand?.id) {
      getSupportErrandById(supportErrand.id).then((res) => setSupportErrand(res.errand));
      getMessagesAndConversations();
    }
  };

  useEffect(() => {
    if (supportErrand?.id) {
      getMessagesAndConversations();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supportErrand]);

  const conversationMessageCountSummary = useMemo(
    () => getConversationMessageCountSummary(conversationReadByCounts, supportErrand?.errandNumber ?? ''),
    [conversationReadByCounts, supportErrand?.errandNumber]
  );
  const totalMessageCount = messages.length + conversationMessageCountSummary.total;
  const unreadMessageCount = countUnreadMessages(messages) + conversationMessageCountSummary.unread;
  const messageTabLabel = `Meddelanden (${totalMessageCount}${
    unreadMessageCount > 0 ? `, ${unreadMessageCount} ${unreadMessageCount === 1 ? 'oläst' : 'olästa'}` : ''
  })`;

  const tabs: {
    key: string;
    label: string;
    content: ReactNode;
    disabled: boolean;
    visibleFor: boolean;
    /** The workflow phase the tab belongs to; an errand opened in, or moved into, that phase lands on it. */
    phaseName?: string;
  }[] = useMemo(
    () => [
      {
        key: 'basics',
        label: 'Grundinformation',
        content: supportErrand && <SupportErrandBasicsTab setUnsaved={setTabUnsavedChanges} />,
        disabled: false,
        visibleFor: true,
      },
      {
        key: 'details',
        label: 'Ärendeuppgifter',
        content: supportErrand && (
          <SupportErrandDetailsTab
            access={investigationAccess}
            header={investigationVariant.renderDetailsHeader?.({
              access: investigationAccess,
              disabled: unsavedChanges,
              onDirtyChange: setInvestigationDocumentDirty,
              refreshAccess: refreshInvestigationAccess,
              revealTab: () => setActiveTabKey('details'),
            })}
          />
        ),
        disabled: false,
        visibleFor: true,
      },
      {
        key: 'messages',
        label: messageTabLabel,
        content: supportErrand && (
          <SupportMessagesTab
            messages={messages}
            messageTree={messageTree}
            supportConversations={supportConversations}
            conversationMessageTree={conversationMessageTree}
            setUnsaved={setTabUnsavedChanges}
            update={update}
          />
        ),
        disabled: false,
        visibleFor: true,
      },
      {
        key: 'attachments',
        label: `Bilagor (${countAttachment(supportAttachments ?? [])})`,
        content: supportErrand && <SupportErrandAttachmentsTab update={update} />,
        disabled: false,
        visibleFor: true,
      },
      {
        key: 'investigation',
        label: investigationVariant.label,
        content:
          supportErrand &&
          investigationVariant.renderTab({
            onDirtyChange: setInvestigationDocumentDirty,
            access: investigationAccess,
            refreshAccess: refreshInvestigationAccess,
            revealTab: () => setActiveTabKey('investigation'),
          }),
        disabled: false,
        phaseName: investigationVariant.requiredPhaseName,
        visibleFor: isInvestigationTabVisible(investigationVariant, errandPhases),
      },
      {
        key: 'measures',
        label: 'Åtgärder',
        content: supportErrand && (
          <SupportMeasuresTab
            key={supportErrand.id}
            errand={supportErrand}
            onDirtyChange={setMeasuresDirty}
            isActive={activeTabKey === 'measures'}
          />
        ),
        disabled: false,
        phaseName: MEASURES_PHASE_NAME,
        visibleFor: hasReachedSupportPhase(MEASURES_PHASE_NAME, errandPhases),
      },
      {
        key: 'decision',
        label: investigationVariant.decisionTab?.label ?? 'Beslut',
        content:
          supportErrand &&
          investigationVariant.decisionTab?.render({
            onDirtyChange: setInvestigationDocumentDirty,
            access: investigationAccess,
            refreshAccess: refreshInvestigationAccess,
            revealTab: () => setActiveTabKey('decision'),
          }),
        disabled: false,
        phaseName: investigationVariant.decisionTab?.requiredPhaseName,
        visibleFor:
          isDecisionTabVisible(
            investigationVariant,
            supportErrand,
            investigationProfile,
            errandPhases,
            investigationAccess,
            { labelStructure: supportMetadata?.labels?.labelStructure, viewer }
          ) ||
          investigationProfile?.documents.some(
            (document) => document.placement === 'decision' && investigationDirty[document.key]
          ) === true,
      },
      {
        key: 'follow-up',
        label: 'Uppföljning',
        content: supportErrand && (
          <SupportMeasuresTab
            key={supportErrand.id}
            errand={supportErrand}
            onDirtyChange={setFollowUpDirty}
            isActive={activeTabKey === 'follow-up'}
            followUp
          />
        ),
        disabled: false,
        phaseName: MEASURE_FOLLOW_UP_PHASE_NAME,
        visibleFor: hasReachedSupportPhase(MEASURE_FOLLOW_UP_PHASE_NAME, errandPhases),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      activeTabKey,
      conversationMessageTree,
      messageTabLabel,
      messageTree,
      messages,
      investigationVariant,
      investigationProfile,
      investigationAccess,
      investigationDirty,
      errandPhases,
      refreshInvestigationAccess,
      supportAttachments,
      supportConversations,
      supportErrand,
      supportMetadata,
      setInvestigationDocumentDirty,
      unsavedChanges,
      viewer,
    ]
  );

  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    const index = tabs.filter((tab) => tab.visibleFor).findIndex((tab) => tab.key === activeTabKey);
    setActiveTab(index >= 0 ? index : 0);
  }, [activeTabKey, tabs]);

  // An errand lands on the tab of the phase it is in: Utredning while it is investigated, Beslut once it
  // is decided. It lands when it is opened and again when its phase changes, so a completed phase change
  // takes the handler to the new phase's tab - and at no other time, so a tab the handler picks is never
  // taken from them. It waits for the investigation profile and access to settle, since the decision tab
  // is only offered once they have, and access is read anew after every phase change. Where the variant
  // names the handler's next step, the errand lands where that step is taken instead - the report before
  // the handling starts, say - as long as the page offers that tab.
  const investigationProfileStatus = useInvestigationProfileStore((state) => state.status);
  const nextStep = useInvestigationNextStep();
  const landedPhaseTab = useRef<string | undefined>(undefined);
  const activePhaseId = getActiveSupportPhaseId(supportErrand?.phases);
  const phaseTabsSettled =
    investigationProfileStatus !== 'idle' &&
    investigationProfileStatus !== 'loading' &&
    investigationAccess.status !== 'loading';
  useEffect(() => {
    if (!supportErrand?.id || !supportMetadata?.phases || !phaseTabsSettled) return;
    const landing = `${supportErrand.id}|${activePhaseId ?? ''}`;
    if (landedPhaseTab.current === landing) return;
    landedPhaseTab.current = landing;
    const nextStepTabKey = tabs.some((tab) => tab.visibleFor && tab.key === nextStep?.tab?.key)
      ? nextStep?.tab?.key
      : undefined;
    const phaseTabKey = nextStepTabKey ?? resolvePhaseTabKey(tabs, errandPhases);
    if (phaseTabKey) setActiveTabKey(phaseTabKey);
  }, [
    activePhaseId,
    errandPhases,
    nextStep?.tab?.key,
    phaseTabsSettled,
    setActiveTabKey,
    supportErrand?.id,
    supportMetadata?.phases,
    tabs,
  ]);

  return (
    <>
      <div className="mb-xl">
        {investigationVariant.renderNotice?.()}
        <WarnIfUnsavedChanges showWarning={unsavedChanges}>
          <Tabs
            className="border-1 rounded-12 bg-background-content pt-22 pl-5"
            tabslistClassName="border-0 border-red-500 -m-b-12 flex-wrap ml-10"
            panelsClassName="border-t-1"
            current={activeTab}
            onTabChange={(e) => {
              setActiveTabKey(tabs.filter((tab) => tab.visibleFor)[e].key);
            }}
            size={'sm'}
          >
            {tabs
              .filter((tab) => tab.visibleFor)
              .map((tab, index) => (
                <Tabs.Item key={tab.key}>
                  <Tabs.Button disabled={tab.disabled} className={cx('text-base', index === 0 && 'ml-8')}>
                    {tab.label}
                  </Tabs.Button>
                  <Tabs.Content>{tab.content}</Tabs.Content>
                </Tabs.Item>
              ))}
          </Tabs>
        </WarnIfUnsavedChanges>
      </div>
    </>
  );
};
