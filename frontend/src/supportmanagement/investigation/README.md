# Utredning — variantsömmen

Den här katalogen innehåller _sömmen_ mellan Drakens delade kod och en utredningsimplementation.
Själva implementationen ligger i en underkatalog; i dag finns exakt en, `avvikelse/`.

Poängen med uppdelningen: delad kod frågar efter de slots den ritar, inte efter avvikelsens regler.
Registret lämnar ut avvikelsevarianten; delade sidor ritar det varianten fyller och utelämnar resten.

## Vad som ligger här

| Fil                                          | Ansvar                                                                                                                                                                                                      |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `investigation-variant.ts`                   | Kontraktet en variant uppfyller, plus de rena reglerna för flikarna (`isInvestigationTabVisible`, `isDecisionTabVisible`). Importerar avsiktligt inga komponenter, så reglerna kan enhetstestas utan React. |
| `investigation-variant-registry.ts`          | Lämnar ut avvikelsevarianten. Enda stället i den delade koden som känner till `avvikelse/`.                                                                                                               |
| `classification-placement.ts`                | Det delade ordförrådet för var kategorisering redigeras (`owner`) och ur vilket labelträd (`labelTree`). Nämner ingen variant.                                                                              |
| `investigation-classification-ownership.ts`  | Runtimeadaptern delad kod anropar för att få aktuell placement.                                                                                                                                             |
| `investigation-profile{,-service,-store}.ts` | Runtimeprofilen. `registration` och `labelFilter` används också av layout, registrering och filtrering.                                                                                                    |

## Hur en variant kopplas in

En variant fyller de slots delad kod erbjuder:

- `renderTab` — innehållet i Utredningsfliken. Fliken får `revealTab`, som visar den. Den behövs eftersom en
  variant som låter sidomenyns Spara ärende spara sina dokument (`useErrandSaveParticipant`) ska kunna visa ett
  dokument som inte gick att spara, oavsett vilken flik handläggaren står på.
- `renderNotice` — valfri notis ovanför flikraden, så ett trasigt tillstånd syns från vilken flik som helst.
- `renderDetailsHeader` — valfritt innehåll överst i Ärendeuppgifter, för kontroller som gäller hela ärendet (för
  avvikelse: kortet Ärendets plats, rapporten och LEX-ansvarigs initiala bedömning). Den får åtkomsten och, för
  ett utredningsdokument som profilen placerar där (`placement: 'details'`), `onDirtyChange`, `refreshAccess`
  och `revealTab`. Utan slot ser Ärendeuppgifter ut som för alla andra drakar.
- `phaseEntryRequirements` — valfria krav innan ärendet får gå in i en fas, i den ordning de ska uppfyllas. Det
  första ouppfyllda kravet håller fasbytet: fasknappen byter namn till kravets `actionLabel` och gör det i stället
  för fasbytet. För avvikelse: först Tilldela LEX-ansvarig vid misstänkt missförhållande, sedan att utredningen
  ärendet beslutas på är markerad som klar (se avvikelse-README:n). Utan slot byts fas som vanligt.
- `resolveClassificationPlacement` — var kategoriseringen redigeras, och i vilket ordförråd.
- `requiredPhaseName` — valfri fas arbetet utförs i. Fliken erbjuds först när ärendet nått fasen (att vara i den
  räcker, liksom att ha passerat den). `decisionTab` har ett eget `requiredPhaseName`, så beslutet kan vänta på en
  senare fas än utredningen. En variant vars arbete inte hör till någon fas namnger ingen och grindas aldrig.
- `decisionTab` — valfri andra ärendeflik, Beslut, för en utredning som avslutas med ett registrerat beslut
  (för avvikelse: lex Sarah-beslutet vid missförhållande eller IVO-beslutet vid HSL-avvikelse, aldrig båda). Till
  skillnad från Utredningsfliken, som bara väntar på sin fas, avgör varianten själv per ärende och
  runtimeprofil om fliken finns (`isVisible`). Utan slot, ingen flik.
- `followUp` — valfri uppföljning över ärenden i översiktens sidomeny, under en egen rubrik (`heading`) och med
  en egen knapp. Knappens namn (`label`) räknas fram ur den inloggades handläggarroller och administratörsskap
  (`roleKeys`, `superadmin` från `/me`). Knappen byter ut ärendetabellen mot `render()`, som
  Planerade åtgärder gör. Registret lämnar ut den via `getInvestigationFollowUp`. För avvikelse: Verksamhetsuppföljning – Enhet, Enheter eller Verksamhetsområde. Utan slot,
  ingen sektion i sidomenyn.
- `administration` — valfritt avsnitt i översiktens sidomeny för det variantens administratörer ställer in, under
  en egen rubrik (`heading`) och med en egen knapp (`label`). Varianten avgör vem som erbjuds det (`isOfferedTo`,
  ur `roleKeys` och `superadmin` från `/me`); sloten styr bara vad som visas, BFF:en avgör vad som får göras.
  Knappen byter ut ärendetabellen mot `render()`. Regeln ligger i `resolveInvestigationAdministration` och
  registret lämnar ut den via `getInvestigationAdministration`. För
  avvikelse: Chefer per plats, för medlemmar i `SUPERADMIN_GROUP`. Utan slot, ingen sektion i sidomenyn.
- `messagesIntroduction` — valfri text som säger vad meddelandena är till för, överst i fliken Meddelanden. Registret
  lämnar ut den via `getInvestigationMessagesIntroduction`. För avvikelse: att inhämta kompletterande uppgifter om
  ärendet med berörda parter. Utan slot behåller fliken sin egen text.
- `notificationChannels` — valfri lista över de kanaler (`EMAIL`, `SMS`) en användare själv får välja att bli
  notifierad på utöver notiserna i Draken. Med sloten får användarmenyn valet Notiser (`useUserMenu` i
  `common/components/layout/userMenuGroups.tsx`), som öppnar `NotificationSettingsDialog`. Registret lämnar ut
  listan via `getInvestigationNotificationChannels`. För
  avvikelse: e-post och SMS. Utan slot, ingen rad i användarmenyn.
- `limitedAccessNotice` — valfri text för ett ärende där Support Management bara ger användaren begränsad
  läsning (`LR` i `/access`): hen får veta att ärendet finns, inte arbeta i det. Med sloten frågar ärendesidan
  efter nivån (`GET /supporterrands/:id/errand-access`), låser vid `LR` hela ärendet (`limitedAccess` i
  `isSupportErrandLocked` och `validateAction`) och visar texten som en varning. Utan slot frågar sidan ingenting.
- `overviewAssignee` — valfri: vem översikten anger som Ansvarig när ärendets labels säger mer än den
  tilldelade handläggaren. Utan slot, eller när den svarar `undefined`, visas handläggaren som i dag.
- `renderHandlerFields` — valfria fält under Ansvarig i sidopanelen, för handläggare som ärendet bokför vid
  sidan av den tilldelade (för avvikelse: MAS/MAR). Sloten får bara veta om ärendet är låst (`locked`), inte
  om användaren är dess handläggare: vem som får fylla i fältet avgör varianten. Fälten sparas med Spara
  ärende genom att registrera sig som deltagare (`useErrandSaveParticipant`). Utan slot ser sidopanelen ut
  som för alla andra drakar.
- `overviewFilterToggle` — valfri kryssruta bredvid Mina ärenden i översikten, som smalnar av listan till
  ärendena med en etikett. Den lägger sitt val (`selection`) till begärans `labelFilter` och lagras inte bland
  etikettfiltren utan som en egen inställning (`overviewFilterToggleChecked`), ikryssad tills användaren kryssar
  ur. Den erbjuds den som sloten säger, och bara när profilens `labelFilter` har gruppen; gruppen visas aldrig
  bland de vanliga etikettfiltren (`overviewLabelFilterGroups`, `resolveOverviewFilterToggle`). Utan slot ser
  översikten ut som för alla andra drakar.
- `earlyClose` — valfri: från vilken fas (`fromPhaseName`) ett ärende får avslutas innan flödet är slut. Avsluta
  ärendet visas först från den fasen och frågar då efter en orsak, som BFF:en sparar som tjänsteanteckning
  (`getInvestigationEarlyClose`). För avvikelse: `REVIEW`. Utan slot avslutas ärendet i förtid som i dag.
- `rolesWithoutEmployeeSearch` — valfri lista över intressentroller som aldrig är anställda, så att Grunduppgifter
  inte erbjuder Anställd för dem (`getInvestigationRolesWithoutEmployeeSearch`). För avvikelse: `PRIMARY`, brukaren.
  Övriga parter behåller sökningen. Utan slot erbjuds sökningen för alla roller.
- `concealedDocumentKeys` — valfri: de dokument, per nyckel, som sidan håller utom synhåll för användaren på
  ärendet trots att åtkomsten skulle visa dem. Flikwrappern tillämpar den en gång på åtkomsten
  (`concealInvestigationDocuments`) innan den delas ut, så Utredning, Beslut och Ärendeuppgifters JSON-vy döljer
  samma dokument. Den kan bara dölja, aldrig visa mer, och ändrar inget i vad BFF:en tillåter. Utan slot visas
  allt som åtkomsten visar.

Fliken styrs av fasgrinden (`hasReachedSupportPhase` i `services/support-phase-service.ts`, delad med Åtgärder och Uppföljning):
faserna kommer ur namespacets `supportmetadata`, och vilken fas ärendet är i läses
ur dess `phases`-historik — `activePhaseId` är skrivvägen och kommer aldrig tillbaka vid läsning. Grinden
jämför `phaseOrder`, matchar fasen på `name` eller `displayName`, och släpper igenom när det inte finns något
att jämföra: en deployment utan fasmodell, eller med andra fasnamn, behåller de flikar den alltid haft. Det som
däremot grindas är ett ärende som inte gått in i flödet — det ligger före varje fas.

## Regler som håller sömmen tät

- **Delad kod importerar aldrig ur en variantkatalog.** Enda undantaget är registret.
- **En variant löser sin egen placement** i stället för att fråga registeradaptern. Att fråga vilken variant som är
  aktiv, inifrån den variant som skulle vara svaret, sluter en modulcykel och tappar den konkreta policytypen på
  vägen ut.
- **Cykler syns inte för `tsc`, ESLint eller enhetstesterna** — bara för bundlern. Det är därför fliken laddas med
  `next/dynamic`. Kontrollera importgrafen när modulerna flyttas.
- **Det en slot ritar är ett renderingsbeslut, aldrig ett skrivskydd.** Backend äger behörighet.
