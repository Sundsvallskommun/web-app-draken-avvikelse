# Åtgärder i Draken

Support Management äger åtgärdstypernas namn, visningstexter, sortering och
`measureGroups`. Draken hämtar detta via befintlig metadata vid läsning och
sparande. Det finns ingen lokal typkatalog eller lista över tillåtna typnamn.

## Ansvar

- `backend/src/services/support-measure-registration.ts` matchar sessionens
  AD-grupper mot registreringsroller och kopplar rollerna till API:ts typgrupper.
  Samma urval används för formuläret och validering vid sparande.
- `backend/src/services/support-measure.service.ts` använder den skyddade
  measures-resursen, kontrollerar ärendestatus, datum och version samt sätter
  skaparen från den inloggade sessionen. Den äger även beslutsbehörighet,
  beslutets tillåtna övergång och skyddet av beslutat innehåll.
- `measure-decision.ts` äger beslutens etiketter och livscykel i frontend.
  Lista, filter och formulär återanvänder samma tolkning.
- `avvikelse/` äger formuläret, rollval, utkast och användarmeddelanden.
  `avvikelse-measure-decision-dialog.tsx` är en separat beslutsdialog.
- Support Management lagrar metadata och åtgärder. Typgrupper är fria strängar;
  de ger inte användaren en roll eller skrivbehörighet i API:t.

## Konfiguration

Om åtgärderna får skrivas avgör Support Management: BFF:en läser ärendets `/access` och erbjuder
Lägg till, redigering, beslut och uppföljning bara när resursen för åtgärder har nivån `RW`. Listan
går att läsa ändå, och ett misslyckat `/access`-anrop erbjuder inga skrivningar.

Hur en åtgärd registreras avgör Draken. Registreringsrollerna ligger i backendens
`HEALTHCAREDEVIATION_HANDLER_ROLES`, samma lista som handläggarrollerna i Ansvarig-listan. En roll med
`measures` är en registreringsroll; en roll utan `measures`, som Verksamhetschef, registrerar inga
åtgärder. Lokalt används
`backend/.env.iaf.development.local` eller `backend/.env.vof.development.local`. Exempelmallarna har
samma struktur.

| Registreringsroll (`displayName` i metadata) | `Role.name`        | Grupp i `MeasureType.measureGroups` | `decides`     |
| -------------------------------------------- | ------------------ | ----------------------------------- | ------------- |
| Enhetschef                                   | `UNIT_MANAGER`     | `UNIT_MANAGER`                      | ja            |
| MAR/MAS                                      | `MAR_MAS`          | `HSL_MAS_MAR`                       | nej (förslag) |
| Lex Sarah (i metadata ännu "LEX-utredare")   | `LEX_INVESTIGATOR` | `SOL_LSS`                           | nej (förslag) |

Rollnamn och typgrupp är olika begrepp. Tabellen motsvarar den metadata som
lästes från testmiljön den 9 september 2026. Ingen automatisk översättning från
visningsnamn eller delsträngsmatchning används.

```dotenv
HEALTHCAREDEVIATION_HANDLER_ROLES='[{"key":"enhetschef","label":"Enhetschef","group":"{{INSERT_ENHETSCHEF_GROUP}}","measures":{"roleName":"UNIT_MANAGER","measureGroup":"UNIT_MANAGER","decides":true}},{"key":"verksamhetschef","label":"Verksamhetschef","group":"{{INSERT_VERKSAMHETSCHEF_GROUP}}"},{"key":"lex-ansvarig","label":"LEX-ansvarig","group":"{{INSERT_LEX_ANSVARIG_GROUP}}","measures":{"roleName":"LEX_INVESTIGATOR","measureGroup":"SOL_LSS"}},{"key":"lex-utredare","label":"LEX-utredare","group":"{{INSERT_LEX_UTREDARE_GROUP}}","measures":{"roleName":"LEX_INVESTIGATOR","measureGroup":"SOL_LSS"}},{"key":"mas-mar","label":"MAS/MAR","group":"{{INSERT_HSL_GROUP}}","measures":{"roleName":"MAR_MAS","measureGroup":"HSL_MAS_MAR"}}]'
SUPERADMIN_GROUP="{{INSERT_SUPERADMIN_GROUP}}"
```

Grupperna anges per miljö: IAF och VoF har var sin förvaltnings grupper, testmiljön har `_Test` och
produktion inte. Varje roll har en AD-grupp. AD-gruppmatchningen bortser från stora/små bokstäver.
Rollnamn och typgrupp matchas exakt.

`key`, `label` och `group` krävs för varje roll. I `measures` krävs `roleName` och `measureGroup`.
`decides` är valfritt och betyder att rollen beslutar om åtgärder: en åtgärd som registreras i en
beslutande roll får `accept: "TRUE"` direkt vid skapandet, satt av backend. Roller utan `decides`
registrerar förslag (`accept` lämnas tomt) och formuläret säger då "Lägg till förslag till åtgärd".
Listan visar beslutet som en etikett: Förslag, Godkänd, Avslagen eller Delvis godkänd. Skapa- och
redigeringsanrop kan inte sätta `accept`; beslut sparas genom en separat, behörighetskontrollerad
endpoint. Roller utan `decides` kan bara registrera planerade åtgärder: formuläret erbjuder inte
"Genomförda åtgärder" och backend avvisar `executed` från dem, både vid skapande och vid redigering av
ett förslag som ännu inte är godkänt. Ett godkänt eller delvis godkänt förslag får markeras som
genomfört.

Ett förslag har inga datum. När verksamheten ska påbörja en åtgärd är inte den som föreslår den att
bestämma, så formuläret visar varken valet planerad/genomförd eller datumfälten för en roll utan
`decides` (`measureIsUndatedProposal`). Datumen anges i stället när förslaget bedöms: Godkänn och
Godkänn delvis kräver start- och slutdatum, i dialogen och i backendens beslutsendpoint, medan Avslå
inte frågar efter några. Har ett äldre förslag datum är de ifyllda i dialogen och går att ändra. På
så vis når varje godkänd åtgärd uppföljningen, som bara visar åtgärder med datum.

Startdatumet ändras aldrig när det väl är satt: redigeringen visar det låst (`measurePlannedDateIsLocked`) och
backendens redigering avvisar ett nytt startdatum med 409. En beslutande roll som registrerar en egen åtgärd
godkänner den direkt, så den åtgärdens startdatum låses när den sparas. Slutdatumet kan flyttas, eftersom en
åtgärd kan ta längre tid än planerat, men på en godkänd åtgärd bara av den som följer upp den, med **Ändra
slutdatum** (se Uppföljning). Redigeringen visar det låst och backenden avvisar det där. Samma dag skriven på
ett annat sätt räknas inte som en ändring.

Flera roller får registrera som samma `roleName` - LEX-ansvarig registrerar exakt som
LEX-utredare - om de har samma `measureGroup` och `decides`; rollen visas då en gång och innehas via
någon av gruppernas medlemskap. Okända fält, dubbla nycklar, två roller som registrerar samma
`roleName` på olika sätt och roller som saknas i namespace-metadatan ger konfigurationsfel. `measureTypeNames` stöds inte. Listan ger ingen
inloggning: backend varnar vid start om en rollgrupp eller `SUPERADMIN_GROUP` saknas i
`AUTHORIZED_GROUPS`.

Starta om backend efter ändring av denna konfiguration. Uppdaterat AD-medlemskap
kräver ny inloggning. Nya typer eller ändrade typgrupper i API:t kräver däremot
ingen konfigurationsändring eller omstart av Draken: ladda om åtgärdsfliken.

Medlemmar i `SUPERADMIN_GROUP` har samtliga registreringsroller. I IAF och VoF är det
avvikelseadministratörerna. Gruppen skrivs en gång i `SUPERADMIN_GROUP` i stället för i varje roll,
och den visas inte under rollerna i Ansvarig-listan. Administratören måste välja vilken roll åtgärden
registreras för. Typurvalet följer den valda rollen, som sparas på åtgärden tillsammans med den
faktiska användaren. Vanlig skrivbehörighet och API:ts behörighetskontroller gäller fortfarande.

Verksamhetschef finns i listan för att kunna väljas som ansvarig, men ger ingen registreringsroll
eftersom den saknar `measures`. LEX-ansvarig registrerar i samma roll som LEX-utredare. Rapportör finns
inte i listan. Ärende- och utredningsbehörighet hanteras separat. Personnummer och enskilda testkonton används inte som rollregler.

## Metadata och typurval

Befintliga endpoints:

- `GET /{municipalityId}/{namespace}/metadata` ger samlad metadata och används av
  Drakens åtgärdstjänst.
- `GET /{municipalityId}/{namespace}/metadata/measuretypes` ger typer inklusive
  `measureGroups`. `?measureGroup=SOL_LSS` filtrerar på en grupp.
- `GET /{municipalityId}/{namespace}/metadata/roles` ger namespace-roller.

En typ kan ha flera grupper och erbjudas för flera roller utan att kopieras.
Draken erbjuder aktiva typer med ID vars `measureGroups` innehåller den valda
rollens konfigurerade grupp. Avsaknad av grupper, en tom lista eller en grupp utan
matchande typer ger inga val. Det innebär aldrig att alla typer tillåts.
En matchande aktiv typ utan ID ger konfigurationsfel.

Formuläret visar varje typ en gång, sorterad efter `sortOrder` och sedan
`displayName`/`name`. Tekniska gruppnycklar visas inte som rubriker i typfältet.
Avvikelsetyper, lagrum, orsaker och beslutsgrader hör till ärendets kategorisering
och utredning och är inte åtgärdstyper.

## Formulär, sparande och historik

1. Har användaren flera registreringsroller visas ett rollsteg först och
   åtgärdens övriga fält öppnas efter rollvalet. En ensam roll förväljs utan
   rollsteg; formuläret visar då rollen som en upplysning och börjar direkt med
   åtgärdstypen.
2. Formuläret på sidan skapar alltid nya åtgärder. Redigering av en befintlig
   åtgärd öppnas i en modal med samma formulär, så att ny och ändrad åtgärd inte
   kan förväxlas. Stäng-knappen och Avbryt frågar först om det finns ändringar.
   Obligatoriska fält märks med "(Obligatoriskt)" i etiketten, inte med asterisk.
3. Ansvarig för åtgärden är fritext (valfritt) och skickas trimmad i
   `responsibleUser`. API:t beskriver fältet som AD-användarnamn men validerar bara
   sträng; listan visar texten som den är och slår upp visningsnamn bara för äldre
   åtgärder vars värde matchar ett känt AD-konto.
4. Rollbyte nollställer vald typ men bevarar resten av utkastet. Formuläret för en
   ny åtgärd har ingen rensa-knapp; Avbryt redigering frågar först om utkastet
   innehåller ändringar.
   Validerings- och sparfel visas i en felruta (`Alert`) som får fokus och länkar
   till fälten.
5. Vid POST hämtar backend metadata igen och kontrollerar grupp, roll och typ.
   Den sätter `addedByUser` från sessionens `username`, `addedByRole` till
   namespace-rollens `name` och skickar typens metadatanamn i `type`, som är
   typens nyckel i Support Management.
6. Vid PATCH används åtgärdens egen version i `If-Match`. Skapare, registreringsroll
   och beslut kan inte ändras genom DTO:n för grundfält. Innan beslut kan
   förslagets skapare ändra typ; typbytet kontrolleras mot den sparade rollens
   typgrupp, även om skaparens nuvarande registreringsroller har ändrats. Medan
   ärendet är i Utredning får även en beslutad åtgärds typ, beskrivning och mål
   ändras; när ärendet har lämnat Utredning är de låsta (`measureContentIsLocked`,
   och samma regel i BFF:en).
7. Under Utredning kan den som registrerade en åtgärd ta bort den, så länge den
   inte är genomförd (**Ta bort** på kortet, med bekräftelse). Borttagningen går
   genom `DELETE .../measures/:measureId` på åtgärdens egen version, och BFF:en
   avvisar andras åtgärder (403), genomförda åtgärder och borttagning efter
   Utredning (409). Redigera visas bara för åtgärder som den inloggade
   användaren själv har registrerat (`addedByUser` jämfört med sessionens
   användarnamn, skiftlägesokänsligt), och backend avvisar andra med 403. Listan visar varje
   åtgärd som ett kort med status, beskrivning, mål, datum samt skapare och den
   roll åtgärden registrerades i. Ovanför listan finns filtren Genomförande
   (Planerad, Genomförd), Godkännande (Ej bedömd, Godkänd, Avslagen, Delvis godkänd),
   Registrerad av, Åtgärdstyp och fritext (`measure-filters.ts`). De heter efter vad de
   filtrerar på, så att inget av dem tas för ärendets status eller beslutet i ärendet,
   och värdena är samma ord som står på korten. Rollerna och typerna i filtret är de
   som förekommer i listan. Listan visar den senast tillagda
   åtgärden först (`created`), eftersom ärendet har olika handläggare över tid. Med
   "Sortera efter: Person" samlas i stället varje persons åtgärder under personens
   namn, med den senast tillagda först även där, så att det syns vem som har gjort vad
   (`measure-sort.ts`). Sorteringen är inget filter och ligger kvar när filtren rensas.
8. En oförändrad historisk typ behålls även om den är utgången eller inte längre
   erbjuds för rollen. Fel behåller utkastet; versionskonflikter kräver omläsning.

Saknad eller felaktig konfiguration stoppar nyregistrering, typbyten och nya
beslut. Läsning och tillåtna ändringar av befintliga åtgärder fungerar fortfarande;
beslutade förslags typ, beskrivning och mål förblir låsta när ärendet har lämnat Utredning.
Formuläret skiljer på saknad konfiguration, felaktig konfiguration, avsaknad av
egen roll och att vald roll inte har några aktiva typer. Tekniska feldetaljer
stannar i backendloggen. Skrivbehörighet och ärendestatus gäller alltid.

Statistik ska utgå från sparad `addedByRole`, `type` och `addedByUser`.
Härled inte den ursprungliga rollen från typens nuvarande grupper. Ändrade grupper
skriver inte om befintliga åtgärder. Behåll använda typer och markera dem vid behov
utgångna i API:t så att historiken behåller sina referenser.

[API-PR #740](https://github.com/Sundsvallskommun/api-service-support-management/pull/740)
innehåller separat förstärkning av skaparattribution och historikskydd. Stödet
för flera typgrupper är ett befintligt metadata-kontrakt på `avvikelse-sprint`.
Draken inför ingen egen API-behörighet genom gruppfiltreringen.

Åtgärder är alltid på. Flikens synlighet styrs av fasen, oberoende av utredningsfliken.

## Uppföljning

`useMeasures` visar även **Uppföljning** direkt efter **Beslut** i flikordningen.
Uppföljningen är tillgänglig direkt och kräver inte ett sparat beslutsdokument
eller behörighet till beslutsfliken. Åtgärdernas befintliga besluts- och
skrivregler avgör fortfarande vad användaren får göra.

`SupportMeasuresTab`, `AvvikelseMeasures` och åtgärdskorten återanvänds.
Uppföljning visar bara åtgärder med planerat start- eller slutdatum och beslut
`TRUE` eller `REWORK`. `measure-follow-up.ts` äger detta urval i frontend.
Ingen registrering, redigering eller bedömning erbjuds i denna vy.

Den som följer upp kan, med vanlig skrivrätt till ett öppet ärende, kryssa i **Utförd**. Det är
enhetschefen och verksamhetschefen, vem som än föreslog åtgärden (`backend/src/config/measure-follow-up-roles.ts`);
BFF:en svarar `mayFollowUp` i åtgärdslistan.
En separat dialog kräver ett aktivt Ja/Nej-val på **Har åtgärd lett till önskad
effekt?** och text i **Beskriv åtgärdens effekt** (högst 4000 tecken). Avbryt sparar inget.
Svaren och genomförandet sparas i samma skrivning. Kortet behåller
åtgärdens original, planering och beslut och visar sedan Utförd, önskad effekt
och åtgärdens effekt. En sparad uppföljning kan inte ändras i detta flöde. Planerade
åtgärder som redan har ett genomförandedatum men saknar svar kan följas upp;
datumet bevaras.

Den som följer upp en åtgärd kan också flytta dess slutdatum med **Ändra slutdatum**, så länge
åtgärden inte är uppföljd. Knappen finns både här och under Åtgärder, och det är det enda sättet att flytta
slutdatumet på en godkänd åtgärd. Dialogen visar startdatumet men erbjuder det inte, och slutdatumet får
inte ligga före startdatumet. Åtgärdens beskrivning, som annars är låst när åtgärden är godkänd, går att
skriva om i samma steg: det är där den som flyttar datumet skriver varför. Beskrivningen sparas bara
tillsammans med ett ändrat slutdatum. Skrivningen går genom `PATCH .../measures/:measureId/planned-complete`,
som tar `plannedComplete` och en valfri `description`. Den gäller samma regler som uppföljningen: samma roll, en planerad och
godkänd åtgärd och åtgärdens `If-Match`. Därför kan enhetschefen flytta
slutdatumet på ett förslag från LEX som enhetschefen själv har godkänt.

Drakens `PATCH .../measures/:measureId/follow-up` tar endast
`desiredEffectAchieved: boolean` och `followUpDescription: string`.
`SupportMeasureService` kontrollerar rollen, ärendestatus, planering, beslut
och åtgärdens `If-Match`. Uppföljningen sparas på åtgärden själv i SM 16.0,
med en enda `PATCH .../measures/:measureId` villkorad på åtgärdens version:

| Fält          | Innehåll                                                                               |
| ------------- | -------------------------------------------------------------------------------------- |
| `result`      | `COMPLETED` (Ja) eller `NOT_COMPLETED` (Nej) - svaret på om åtgärden gav önskad effekt |
| `resultText`  | Vad som har hänt, trimmat och högst 4000 tecken                                        |
| `completedAt` | När uppföljningen sparades                                                             |
| `executed`    | Samma tidpunkt, men bara om åtgärden inte redan har ett genomförandedatum              |

Support Management har ingen metadata för åtgärdsresultat men godtar bara
`COMPLETED`, `PARTIALLY_COMPLETED`, `NOT_COMPLETED` och `NOT_APPLICABLE` i
`result` (enum i API:ts kod, inte i OpenAPI-specen; andra värden ger 400).
Drakens Ja/Nej använder de två yttre värdena, och översättningen finns i
`support-measure-follow-up.ts` i backend och `measure-follow-up.ts` i frontend.
Innehåll, planering och beslut bevaras.
Ett Nej är ett sparat svar, inte ett saknat värde.

Uppföljningen är antingen sparad eller inte: det finns inga halvsparade svar att
slutföra. En uppföljning vars svar gick förlorat känns igen på att den omlästa
åtgärden har exakt de svaren; dialogen stängs då som sparad, och ett identiskt
återförsök från en äldre version godtas av backend. Andra svar på en redan
uppföljd åtgärd avvisas med 409. Vanlig redigering kan inte ändra
genomförandedatumet på en uppföljd åtgärd.

Den aktiva fliken läser om när den öppnas och när fönstret återfår fokus.
Sparfel behåller dialogens svar och läser om åtgärden. Flikarnas osparade
ändringar registreras separat i den gemensamma varningen. Ändras föräldraärendets
version flera steg behålls formulärets gamla version för att skydda mot
överskrivning av samtidiga ändringar; ärendet kan behöva laddas om före nästa
ändring i det övergripande formuläret.

**Behörighet:** att läsa och göra uppföljningar styrs av resursen
`errand/measure` i AccessMapper, samma som för åtgärderna i övrigt (`RW` krävs
för att följa upp). Inget JSON-schema och ingen nyckel för JSON-parametrar
behöver registreras. AccessMapper ger nivåer per resurs, inte per fält på en
åtgärd, så den som når åtgärderna når också svaren.

`support-measure-follow-up.service.test.ts` testar skrivningen mot en simulerad
åtgärdsresurs: Ja/Nej, bevarat genomförandedatum, avbrott före och efter
skrivning, identiska återförsök, avvisade nya svar, versionskonflikter och
samtidiga uppföljningar. Service- och HTTP-tester skyddar det smala kontraktet
och behörigheterna. Komponenttesterna täcker urval, obligatoriska svar, avbryt,
Ja/Nej, omläsning och en uppföljning vars svar gick förlorat.

## Beslut om förslag

Användaren behöver vanlig skrivbehörighet till ett öppet ärende och medlemskap
som ger en aktiv namespace-roll med `decides: true`. Enhetschef är konfigurerad
så. Admin omfattas genom samma AD-gruppmappning. Backend kontrollerar sessionens
grupper på nytt vid varje beslut; det räcker inte att en beslutande roll finns
i metadata. Beslut är oberoende av rollvalet i formuläret för en ny åtgärd och
begränsas inte till chefens egna åtgärdstyper eller egna förslag.

På ett obeslutat förslag visas **Bedöm förslag**. Dialogen visar originalet och
kräver ett uttryckligt beslut:

| Val            | API-värde i `accept` | Kommentar    | Följd                                            |
| -------------- | -------------------- | ------------ | ------------------------------------------------ |
| Godkänn        | `TRUE`               | Valfri       | Förslaget får genomföras i sin helhet.           |
| Avslå          | `FALSE`              | Obligatorisk | Förslaget ska inte genomföras.                   |
| Godkänn delvis | `REWORK`             | Obligatorisk | Angivna delar får genomföras enligt kommentaren. |

För delvis godkännande ska kommentaren ange vad som godkänns och ska göras,
vilka delar som utgår och varför. `REWORK` är ett fattat beslut, inte en begäran
om ett omarbetat förslag. Kommentaren sparas i `acceptMotivation`, visas på kortet och
vid redigering och ingår i fritextsökningen.

Drakens `PATCH /supporterrands/:municipalityId/:errandId/measures/:measureId/decision`
tar `accept` och `acceptMotivation`, och vid `TRUE` och `REWORK` även `plannedStart` och
`plannedComplete`: den som godkänner anger när åtgärden ska genomföras, och saknas datumen
svarar Draken 400. Vid `FALSE` skickas inga datum. Den använder åtgärdens `If-Match` och
skickar bara dessa fält till den befintliga skyddade measure-resursen i Support Management.
Skapare, registreringsroll, typ, beskrivning och mål bevaras.

Ett beslut eller en redan genomförd åtgärd kan inte bedömas igen i detta flöde.
Efter beslut låses typ, beskrivning och mål även i backend. Skaparen kan fortsatt
redigera ansvarig och planering och rapportera genomförande efter `TRUE` eller
`REWORK`. Beslutsbehörighet ger ingen rätt att skriva om någon annans förslag.
Ett ändrat innehåll behöver ett nytt förslag. Någon funktion för omprövning eller
beslutshistorik införs inte här.

Vid valideringsfel eller versionskonflikt behålls beslut och kommentar i dialogen.
Felrutan får fokus och länkar till berörda fält. Vid konflikt behöver användaren
stänga dialogen och läsa om åtgärden innan ett nytt försök. En bekräftad skrivning
stänger dialogen före omläsning, så ett läsfel inte återanvänder det sparade utkastet.

**Begränsning i API-kontraktet:** åtgärden saknar separata fält för beslutsfattare
och beslutstid (`decidedBy`/`decidedAt`). Draken hittar inte på dessa och ändrar
inte `addedByUser` eller `addedByRole` när chefen beslutar. De fälten avser alltid
registreringen. Beslutsutfall kan summeras från `accept`, men statistik över
vem som beslutade och när kräver stöd i API:t. API:t behöver också äga samma
validering om andra konsumenter ska kunna skriva åtgärder med likvärdiga garantier.

Ändringen använder befintligt `accept`, `acceptMotivation` och versionsstöd;
ingen ny feature-flagga eller API-tabell krävs för detta beslutsflöde. Vid
återställning av Draken bevaras sparade beslut i API:t. Kontrollera att den
återställda versionen tolkar `REWORK` som delvis godkänd och skyddar beslutat
innehåll; en äldre klient med annan tolkning är inte en säker återställning.

## Fasbyte till beslut

Vid byte till fasen med namnet `DECISION` (`isDecisionPhase` i
`support-phase-service.ts`) läser fasväxlaren ärendets åtgärder på nytt i
klickögonblicket. Saknas åtgärder frågar Draken först om användaren verkligen
vill gå till beslutsfasen utan åtgärder; Nej lämnar fasen orörd. Kan åtgärderna
inte läsas ändras fasen inte heller, och ett fel visas. Kontrollen görs bara när
`useMeasures` är på; utan åtgärdsfliken finns inget att fråga om. Fasnamnet
matchas exakt mot metadatans `name`, aldrig mot visningsnamnet, så ett namespace
utan en sådan fas berörs inte.

## Fasbyte till uppföljning

Uppföljningen följer upp det som godkändes, så ärendet går inte till fasen
`FOLLOW_UP` medan något förslag väntar på bedömning. BFF:en äger regeln:
`assertProposalsDecidedBeforeFollowUp` vägrar fasbytet med 422, och samma text
följer med åtgärdsläsningen som `followUpRefusal` (`undecidedProposalsMessage`).
Regeln gäller de applikationer som också kräver hanterade åtgärder före avslut
(`closeRequiresHandledMeasures`); övriga får aldrig något `followUpRefusal`.

I klienten läser `useMeasuresFollowUpRefusal` svaret när ärendet har en väg till
uppföljningen. Fasknappen heter då Bedöm åtgärdsförslagen och öppnar en dialog
med BFF:ens text och en väg till Åtgärder, och Nästa steg-kortet säger samma sak.
Åtgärdsfliken lämnar varje läsning till `measure-summary.ts`, så knappen följer
med så snart förslagen är bedömda.

## Verifiering och införande

Testkällor täcker explicit gruppmatchning, delade typer, dynamiska metadataändringar,
tomma urval, sparande, historik, datum, versioner och rollbyte. Beslutstesterna
omfattar rollbehörighet, obligatorisk kommentar, bevarat original, delvis
godkännande, genomförande, konflikter och HTTP-svar efter sparande. De körs inte på
användarens begäran. App, bygge och typkontroll har inte heller körts.
Manuell kontroll återstår för formulär, tangentbord, skärmläsare och zoom.

API-läsningen den 9 september 2026 visade åtta aktiva typer i båda namespace
`2281/HEALTHCAREDEVIATIONIAF` och `2281/HEALTHCAREDEVIATIONVOF`, fördelade på fyra
för Enhetschef och sju vardera för de två utredarrollerna. Detta är en observation,
inte ett fast krav eller en lokal typkatalog.

Inför kodändringen tillsammans med den nya backendkonfigurationen. Gamla
`measureGroup: string`-svar stöds inte. Vid återställning måste klientkontrakt,
backendkonfiguration och API-version hållas samordnade; återställ inte bara
klientens gamla typfält mot API:ts nya svar.

## Planerade åtgärder utanför ärendet

Sidomenyn i översikten har knappen **Planerade åtgärder** (`main-errands-sidebar.component.tsx`,
visas med `useMeasures`). Den byter ut ärendetabellen mot `planned-measures-overview.tsx`: en
agenda över alla godkända (`TRUE`) eller delvis godkända (`REWORK`) åtgärder som har planerat
start- eller slutdatum och ännu inte är genomförda, från alla ärenden användaren har tillgång
till. Förslag som inte har bedömts, avslagna förslag, åtgärder utan datum och genomförda
åtgärder visas inte. Ett statusklick i sidomenyn tar tillbaka ärendetabellen.

Vyn är en agenda, inte ett register. Åtgärderna ligger i tidsfack efter slutdatum (startdatum
när slutdatum saknas), närmast först: **Försenade** (passerat slutdatum), **Kommande två veckor**
och **Senare**. Ett passerat startdatum gör inte en åtgärd försenad. Tomma fack visas inte.
Reglerna är rena funktioner i `planned-measures.ts` (`plannedMeasureBucket`,
`groupPlannedMeasures`, `formatDeadlineDay`, `describeDeadlineDistance`).

- Raden visar datumet störst ("10 sep", med år bara när det inte är innevarande år) och
  avståndet i dagar under, åtgärdstyp, ärendenummer som länk till ärendet (ny flik), ansvarig
  och beslutet som etikett. Ärendets rubrik visas inte och följer inte med från BFF:en. Försenade
  rader har rött datum; hela raden färgas inte.
- Raden är ett `details`-element som fälls ut på plats till hela åtgärden: beskrivning, mål,
  planerade datum, ansvarig, registrerad av (roll och datum), beslutsmotiveringen i samma ruta
  som på åtgärdskortet, och knappen **Öppna ärendet**. Flera rader kan vara utfällda samtidigt.
  Länken i raden följs utan att raden fälls ut.
- Vyn erbjuder ingen registrering, bedömning eller uppföljning; det görs i ärendet. Listan läses
  om när fönstret återfår fokus, så att en uppföljning som gjorts i ärendefliken syns direkt.
- Fritextsökningen i filterbandet matchar ärendenummer, åtgärdstyp, beskrivning, mål och
  ansvarig; sammanfattningen bredvid anger antal och antal försenade.
- Fälten **Slutdatum från** och **Slutdatum till** begränsar listan till åtgärder vars datum i
  agendan (slutdatum, annars startdatum) ligger inom spannet, med båda ändar inräknade
  (`filterPlannedMeasuresByDate`). Ett tomt fält begränsar ingenting, och Rensa datum tar bort
  spannet. Urvalet görs i klienten på det som redan är inläst.

Valet av agenda framför en tabell med detaljpanel eller ärendegrupper med kort gjordes den
14 september 2026 utifrån tre skisser; agendan träffar frågan "vad ska vara klart, och när?"
direkt. Panelen och grupperingen kan läggas till senare utan att datat eller BFF:en ändras.

BFF:en svarar på `GET /supportmeasures/:municipalityId/planned` (`support-measure.controller.ts`,
kräver `canEditSupportManagement` som ärendelistan). `SupportMeasureService.readPlanned` läser
Support Managements ärendelista med filtret i `support-planned-measures.ts`:

```text
(measures.accept:'TRUE' or measures.accept:'REWORK') and measures.executed is null
and (measures.plannedStart is not null or measures.plannedComplete is not null) and status!'SOLVED'
```

Filtret gäller samma åtgärdsrad (Spring Filter återanvänder en join per sökväg). Avslutade
ärenden (`SOLVED`) utelämnas eftersom ingen åtgärd kan följas upp där. API:t tillämpar sin
vanliga åtkomstkontroll på listan, så användaren ser åtgärder på precis de ärenden översikten
redan visar; `MEASURES` ingår i alla rollernas fältåtkomst i namespace-konfigurationen. Listan
är sidindelad per ärende (100 per sida, sorterad på `created` så att sidorna är stabila under
samtidiga skrivningar) och läses upp till tio sidor; därefter markerar svaret `truncated` och
vyn säger att listan är ofullständig. Ärendets åtgärder filtreras igen i BFF:en, eftersom
listan returnerar ärendets samtliga åtgärder. Uppföljningsdokumenten läses inte in här (en
läsning per åtgärd); en åtgärd utan genomförandedatum är planerad oavsett om svar sparats.

`support-planned-measures.test.ts`, `support-measure.service.test.ts` och
`support-measure.controller.http.test.ts` täcker urval, sortering, sidvandring, avhuggning och
routen. `planned-measures.test.ts`, `planned-measures-overview.test.tsx` och e2e-specen
`planned-measures-overview.spec.ts` täcker vyn, länkarna, sökningen och felen.

**Bättre lösning på sikt, utanför scope:** Support Management saknar en åtgärdsfråga över
ärenden, så vyn lånar ärendelistan. En egen `GET /{municipalityId}/{namespace}/measures` i API:t
skulle ge sidindelning och sortering per åtgärd i stället för per ärende (inget tak, inget
`truncated`), en smal payload i stället för hela ärenden, en räknare till sidomenyn och ett
filter skrivet på åtgärdsentiteten i stället för att vila på hur biblioteket joinar. Den byggs
inte nu: åtgärdsmodellen är inte färdigbestämd, och ett API-kontrakt som skärs i dag skulle
behöva skäras om. Bytet är begränsat till `readPlanned`; svaret till frontend behöver inte ändras.

## Handlingsplan

Knappen **Skapa handlingsplan** på fliken Åtgärder samlar ärendets samtliga sparade åtgärder i en
PDF och lägger den som bilaga på ärendet. Planen byggs av BFF:en
(`POST /supporterrands/:municipalityId/:errandId/measures/action-plan`,
`support-measure-action-plan.controller.ts`) ur det Support Management håller i anropsögonblicket:
åtgärderna, typ- och rollnamn ur namespace-metadatan och visningsnamn ur handläggarkatalogen.
Listan i webbläsaren skickas aldrig med. Renderingen går via Templating `render/direct/pdf` med
mallen i `backend/src/services/measure-action-plan.template.ts`, genom samma
render-och-bifoga-steg som utredningsrapporten (`support-pdf-attachment.service.ts`).

- Ordning, status (Planerad, Genomförd, Ej tidsatt) och beslutsetiketter (Förslag, Godkänd,
  Avslagen, Delvis godkänd) är desamma som i fliken; `measure-action-plan.service.ts` speglar
  `measure-decision.ts` och listans tidsangivelser. Datum visas i svensk lokal tid.
- Alla åtgärder tas med oavsett beslut och genomförande. Beslut och beslutskommentar redovisas
  per åtgärd; avslagna förslag är alltså med, märkta som avslagna.
- Filnamnet är `Handlingsplan_<ärendenummer>_<n>.pdf`. Löpnumret läses ur bilagorna som redan
  finns på ärendet (högsta befintliga nummer plus ett); ingen separat räknare lagras.
- Knappen visas bara med skrivbehörighet på ett öppet ärende och är inaktiv utan åtgärder.
  Backend följer samma statusregel som övriga åtgärdsskrivningar och svarar 409 utan åtgärder.
- Uppföljningsfliken visar samma lista men erbjuder ingen handlingsplan.
- Visningsnamn slås upp i samma handläggarkatalog som fliken (`/users/admins`). Kan katalogen
  inte läsas visas kontonamnet; planen skapas ändå.

Efter en skapad plan läses ärendets bilagor om så att fliken Bilagor visar den direkt.
`measure-action-plan-button.test.tsx` täcker knappens tillstånd och felmeddelanden;
`support-measures.spec.ts` täcker flödet i webbläsaren och `support-measure-action-plan.controller.test.ts`
BFF:ens läsning, rendering, bifogning och avvisningar.
