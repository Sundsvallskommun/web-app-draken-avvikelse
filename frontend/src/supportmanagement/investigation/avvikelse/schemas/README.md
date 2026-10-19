# Lokala utredningsscheman

Den här katalogen är den kanoniska lokala källan för den första schema-labben. Filerna är kompletta request bodies för JSON Schema-API:t, men labben läser dem direkt och publicerar ingenting.

| Parameter key / schema name | Lokal version | JSON Schema POST body                      | UI Schema PUT body                            |
| --------------------------- | ------------- | ------------------------------------------ | --------------------------------------------- |
| `utredning-enhetschef`      | 1.11          | `utredning-enhetschef.schema-request.json` | `utredning-enhetschef.ui-schema-request.json` |
| `utredning-sol-lss`         | 2.4           | `utredning-sol-lss.schema-request.json`    | `utredning-sol-lss.ui-schema-request.json`    |
| `utredning-hsl`             | 1.5           | `utredning-hsl.schema-request.json`        | `utredning-hsl.ui-schema-request.json`        |
| `beslut-hsl`                | 1.2           | `beslut-hsl.schema-request.json`           | `beslut-hsl.ui-schema-request.json`           |
| `beslut-sol-lss`            | 1.4           | `beslut-sol-lss.schema-request.json`       | `beslut-sol-lss.ui-schema-request.json`       |
| `bedomning-sol-lss`         | 1.0           | `bedomning-sol-lss.schema-request.json`    | `bedomning-sol-lss.ui-schema-request.json`    |
| `vc-kommentar-hsl`          | 1.0           | `vc-kommentar-hsl.schema-request.json`     | `vc-kommentar-hsl.ui-schema-request.json`     |

Vid publicering skickas `*.schema-request.json` till `POST /2281/schemas`. Det skapade schema-ID:t används sedan med motsvarande `*.ui-schema-request.json` i `PUT /2281/schemas/{id}/ui-schema`.

## Publicerat i test

Version 1.0 publicerades och lästes tillbaka från JsonSchema-API:ts testmiljö den 12 augusti 2026:

- `2281_utredning-enhetschef_1.0`
- `2281_utredning-sol-lss_1.0`
- `2281_utredning-hsl_1.0`

Schema och UI Schema verifierades separat för varje ID. Inget har publicerats i produktionsmiljön.

Den 10 september 2026 publicerades och lästes tillbaka från samma testmiljö:

- `2281_utredning-hsl_1.1`
- `2281_beslut-hsl_1.0`
- `2281_beslut-sol-lss_1.0`

Den 11 september 2026 publicerades version 1.1 av båda besluten (`2281_beslut-hsl_1.1`, `2281_beslut-sol-lss_1.1`),
som ersätter 1.0: beslutsdatumet blev en serverstämplad tidpunkt och Public 360-regeln ändrades. Inga dokument
hade sparats mot 1.0. Samma dag publicerades version 1.2 (`2281_beslut-hsl_1.2`, `2281_beslut-sol-lss_1.2`) med
`updatedAt` och `revisions`; inga dokument hade sparats mot 1.1. `2281_beslut-sol-lss_1.3` publicerades samma dag med
klassificeringsfältet i full bredd; inga dokument hade sparats mot 1.2.

Den 11 september 2026 publicerades också version 1.2 av de tre utredningarna (`2281_utredning-enhetschef_1.2`,
`2281_utredning-sol-lss_1.2`, `2281_utredning-hsl_1.2`) med sektionen Utredningen klar och rapport. Version 1.1 av
enhetschefs- och SoL/LSS-utredningen fanns bara som lokala artefakter och hoppades över. Att en requestartefakt
finns här innebär inte att den har skickats till JsonSchema-API:t. Formulären läser schemana från JsonSchema-API:t
vid körning, så en ny version måste publiceras i varje miljö innan den används där.

Den 17 september 2026 publicerades version 1.3 av enhetschefsutredningen (`2281_utredning-enhetschef_1.3`) i
testmiljön. Den tillåter alla tre lagrum i `legalBases` (tidigare högst två); UI-schemat är oförändrat och lades på
det nya schema-ID:t. Schema och UI Schema lästes tillbaka och var identiska med artefakterna. Inget har publicerats
i produktionsmiljön. Dokument som redan är bundna till 1.2 behåller sin gräns på två lagrum.

Den 18 september 2026 publicerades version 1.4 av enhetschefsutredningen och 1.3 av SoL/LSS- och HSL-utredningarna
(`2281_utredning-enhetschef_1.4`, `2281_utredning-sol-lss_1.3`, `2281_utredning-hsl_1.3`) i testmiljön, med
villkoret för utkast (se nedan). Schema och UI Schema lästes tillbaka för varje ID och var identiska med
artefakterna, och `schemas/{name}/versions/latest` pekar nu på de nya versionerna. Inget har publicerats i
produktionsmiljön. Dokument som redan är bundna till ett äldre schema-ID behåller sina ovillkorade krav — BFF:en
vägrar byta `schemaId` på ett befintligt dokument.

Samma dag publicerades `2281_utredning-enhetschef_1.5`, som ersätter 1.4: även lagrummen krävs först vid
klarmarkering, så en enhetschef kan spara ett helt tomt utkast. 1.4 hann användas några timmar i testmiljön;
utredningar som skapades då sitter kvar på 1.4 och kräver därför fortfarande ett valt lagrum.

Version 1.6 av enhetschefsutredningen och 1.4 av SoL/LSS-utredningen byter titeln på orsaksområdet
`procedures_routines_guidelines` från "Procedurer, rutiner och riktlinjer" till "Processer, rutiner, arbetssätt,
riktlinjer". Värdet är detsamma, så sparade dokument behöver ingen migrering, men de visar titeln från det schema
de är bundna till. Den 5 oktober 2026 publicerades `2281_utredning-enhetschef_1.6` och `2281_utredning-sol-lss_1.4`
i testmiljön, med oförändrade UI-scheman lagda på de nya ID:na. Schema och UI Schema lästes tillbaka och var
identiska med artefakterna, och `versions/latest` pekar på dem. Inget har publicerats i produktionsmiljön.

Den 6 oktober 2026 publicerades `2281_bedomning-sol-lss_1.0`, Lex Sarah-ansvarigs initiala bedömning, i testmiljön.
Schema och UI Schema lästes tillbaka och var identiska med artefakterna, och `versions/latest` pekar på 1.0. Inget
har publicerats i produktionsmiljön. Bedömningen frågar om IVO-anmälan med samma fält som `beslut-sol-lss`
(`ivoNotification`, `ivoCaseNumber`, `public360CaseNumber`), så svaret kan förifylla beslutet, och om ärendet ska
lex-utredas (`lexInvestigationDecision`), med en motivering som krävs när det inte ska det. Samma dag byttes UI-schemat
på samma ID till `PlainTextareaWidget` för motiveringen, som är ren text och inte ska bli HTML; schemat är
oförändrat och UI-schemat lästes tillbaka identiskt med artefakten.

Den 7 oktober 2026 publicerades `2281_utredning-sol-lss_2.0`, Utredning Lex Sarah enligt verksamhetens
utredningsmall (se [Utredning Lex Sarah 2.0–2.4](#utredning-lex-sarah-2024)), i testmiljön. Schema och UI
Schema lästes tillbaka och var identiska med artefakterna, och `versions/latest` pekar på 2.0. Inget har publicerats i
produktionsmiljön. Utredningar som redan är sparade är bundna till 1.4.

Den 9 oktober 2026 publicerades `2281_utredning-sol-lss_2.1` i testmiljön: utan frågan om IVO-anmälan och med lagrum
som LEX-utredaren väljer (se samma avsnitt). Schema och UI Schema lästes tillbaka och var identiska med artefakterna,
och `versions/latest` pekar på 2.1. Inget har publicerats i produktionsmiljön.

Samma dag publicerades `2281_utredning-sol-lss_2.2` i testmiljön: med sammanfattning av rapporten och Ej aktuellt
på ställningstagandena (se samma avsnitt). Schema och UI Schema lästes tillbaka och var identiska med artefakterna,
och `versions/latest` pekar på 2.2. Inget har publicerats i produktionsmiljön.

Den 12 oktober 2026 publicerades `2281_utredning-enhetschef_1.7` och `2281_utredning-sol-lss_2.3` i testmiljön, med
orden som passar både avvikelse och missförhållande (se samma avsnitt). Schema och UI Schema lästes tillbaka för
båda och var identiska med artefakterna, och `versions/latest` pekar på 1.7 respektive 2.3. Inget har publicerats i
produktionsmiljön.

Samma dag publicerades `2281_utredning-enhetschef_1.8` i testmiljön: enhetschefen riskbedömer inte ett
missförhållande (se Utredning enhetschef 1.8). Schema och UI Schema lästes tillbaka och var identiska med
artefakterna, och `versions/latest` pekar på 1.8. Inget har publicerats i produktionsmiljön.

Den 13 oktober 2026 publicerades `2281_utredning-enhetschef_1.9` i testmiljön, med nya hjälptexter (se Utredning
enhetschef 1.9). Schema och UI Schema lästes tillbaka och var identiska med artefakterna, och `versions/latest` pekar
på 1.9. Inget har publicerats i produktionsmiljön.

Samma dag publicerades `2281_beslut-sol-lss_1.4` i testmiljön, med lagrum och beslutsfattare (se Besluten). Schema
och UI Schema lästes tillbaka och var identiska med artefakterna, och `versions/latest` pekar på 1.4. Inget har
publicerats i produktionsmiljön. Schemat publicerades innan BFF:en med stämpeln `x-draken-server-author` var
driftsatt i test. Ett beslut som sparas mot 1.4 genom en äldre BFF får ingen beslutsfattare; den som sparar det
första gången efter driftsättningen bokförs då som beslutsfattare, även om någon annan fattade beslutet.

Samma dag publicerades `2281_utredning-hsl_1.4` och `2281_vc-kommentar-hsl_1.0` i testmiljön: uppdragsgivarens
kommentar i ett eget dokument (se Händelseanalys HSL 1.4 och VC kommentar HSL). Schema och UI Schema lästes
tillbaka för båda och var identiska med artefakterna, och `versions/latest` pekar på 1.4 respektive 1.0. Inget har
publicerats i produktionsmiljön. Nyckeln `vc-kommentar-hsl` stod vid publiceringen inte i någon rolls
`JSON_PARAMETERS` i namespace-konfigurationen, så dokumentet nås ännu inte av den som har en roll.

Den 14 oktober 2026 publicerades `2281_utredning-hsl_1.5` i testmiljön: namn och roll på deltagarna i analysteamet,
MAS/MAR:s initiala bedömning och platsen för knappen Aktivera VC kommentar HSL (se Händelseanalys HSL 1.5). Schema och
UI Schema lästes tillbaka och var identiska med artefakterna, och `versions/latest` pekar på 1.5. Inget har publicerats
i produktionsmiljön. Labels `ANALYSIS/VC_COMMENT_HSL` och `ANALYSIS/HSL_STARTED`, som knappen och den initiala
bedömningen skriver, fanns vid publiceringen inte i namespacens metadata. De lades till samma dag.

Samma dag publicerades `2281_utredning-enhetschef_1.10` i testmiljön: Utredningsmall är borttagen och lagrummen väljer
mallen (se Utredning enhetschef 1.10). Schema och UI Schema lästes tillbaka och var identiska med artefakterna, och
`versions/latest` pekar på 1.10; API:t ordnar versionerna som tal. Inget har publicerats i produktionsmiljön.

Den 15 oktober 2026 publicerades `2281_utredning-sol-lss_2.4` i testmiljön: de fem ställningstagandena besvaras med Ja
eller Ej aktuellt (se Utredning Lex Sarah 2.0–2.4). Schema och UI Schema lästes tillbaka och var identiska med
artefakterna, och `versions/latest` pekar på 2.4. Inget har publicerats i produktionsmiljön.

Samma dag publicerades `2281_utredning-enhetschef_1.11` i testmiljön: frågan om polisanmälan under HSL (se Utredning
enhetschef 1.11). Schema och UI Schema lästes tillbaka och var identiska med artefakterna, och `versions/latest` pekar
på 1.11. Inget har publicerats i produktionsmiljön.

Schema v1.0 innehåller utredningsdata. Åtgärder, handlingsplaner, interna arbetsanteckningar, rapportgenerering och lokala markeringar om kompletta accordionsektioner ligger avsiktligt utanför dokumenten.

## Utredningen klar och rapport

Varje utredning slutar med sektionen Utredningen klar och rapport. Schemat deklarerar
`x-draken-completion: { "field": "completed", "reportsField": "reports" }`:

- `completed` (Ja/Nej, Nej när inget är angivet) är utredarens markering. Ett dokument som sparats med Ja är
  låst: BFF:en avvisar varje skrivning utom den som sätter Nej utan att ändra något annat, och formuläret blir
  skrivskyddat med knappen Lås upp utredningen.
- `reports` är serverägd (`x-draken-server-owned`): en post `{ generatedAt, generatedBy, fileName, attachmentId }`
  per rapport, som BFF:en lägger till när rapporten skapas. Klientens kopia av fältet ignoreras.
- `$external:investigationReport` i UI-schemat är platsen där Draken visar knapparna Skapa rapport,
  Förhandsgranska rapport och Lås upp utredningen samt listan över skapade rapporter.

Rapporten skapas av BFF:en (`POST .../json-parameters/{key}/reports`) ur det sparade dokumentet: sektioner och fält
i UI-schemats ordning, koder översatta till sina titlar, ärendets kategorisering från etiketterna. Den renderas
via Templating-API:ts `render/direct/pdf` med mallen i `backend/src/services/investigation-report.template.ts`,
läggs som bilaga på ärendet med löpnummer (`Utredning_Lex_Sarah_2.pdf`) och registreras i `reports`. Filnamnet
byggs av fliknamnet med ASCII-bokstäver, siffror och understreck (å/ä/ö blir a/a/o), så att multipart-uppladdningen
inte behöver hantera mellanslag eller Unicode i filnamnet. PDF-rubriken följer fortfarande schemats `title`.
Förhandsgranskning
renderar utan att bifoga eller registrera. Efter upplåsning kan utredningen ändras och en ny numrerad rapport
skapas; äldre rapporter ligger kvar som bilagor.

## Utkast och klarmarkering

Ett halvfärdigt utkast är giltigt enligt schemat. Kraven på vad utredningen ska innehålla ligger i ett villkor på
klarmarkeringen:

```json
{
  "if": { "properties": { "completed": { "const": "yes" } }, "required": ["completed"] },
  "then": { "allOf": [{ "...": "det som utredningen måste innehålla" }] }
}
```

Kraven ligger under `then.allOf`, inte direkt under `then`, och det är inte kosmetik: sektionsmallen läser
`then.properties` och `then.required` i rotens `allOf` som en regel för när ett fält ska **visas** — det är så
riskbedömningen dyker upp med sitt lagrum. Skrivs kraven direkt under `then` försvinner varje fält de nämner
ur formuläret tills utredaren markerar utredningen klar. Kontraktstestet "the completion gate decides what is
valid, not which fields the form shows" håller fast det.

Samma schema valideras av formuläret (RJSF), av BFF:en och av Support Management, så det är dokumentets egen
klarmarkering — inte vilket anrop som görs — som avgör vilka regler som gäller. Ingen validering är avstängd
någonstans: API:t upprätthåller kravet på ett komplett dokument även mot ett anrop som inte kommer från Draken.

Det som flyttade in i villkoret är exakt det som krävdes ovillkorat förut, varken mer eller mindre:

| Schema                 | Krav som gäller först vid klarmarkering                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `utredning-enhetschef` | Minst ett lagrum, riskbedömningarnas fält (`assessedWith`, `probability`, `severity`, `calculatedRiskValue`) och att den riskbedömning som valt lagrum kräver finns |
| `utredning-sol-lss`    | 1.x: `eventTypes` måste ha minst ett val om fältet finns. 2.0: varje Nej har sin motivering. 2.1: dessutom minst ett lagrum. 2.2: lagrum och sammanfattning av rapporten, motiveringarna är frivilliga. 2.4: inga motiveringar |
| `utredning-hsl`        | `role` på varje rad i `analysisTeamParticipants`. 1.5: beslutet `analysisDecision`; med `not_analyze` motiveringen, annars `name` och `role` på varje rad          |

Vilka fält verksamheten vill tvinga fram vid klarmarkering utöver detta är ett eget beslut; det läggs i så fall i
`then`-grenen och ingen annanstans.

Ovillkorade står reglerna om dokumentets _form_, inte dess ifyllnadsgrad: att ett fält som inte gäller för valt
lagrum inte får finnas, att utredningsmallen följer lagrummen (till och med enhetschefens 1.9), och att ett
uträknat riskvärde stämmer med sina indata. Lagrummen krävs också först vid klarmarkering: de är formulärets första fråga, men ett utkast där
enhetschefen ännu inte tagit ställning ska gå att lägga ifrån sig.

Ärendets kategorisering följer samma regel, fast utanför schemat: den skrivs genom en egen PATCH och krävs av
`prepareInvestigationClassification` först när utredningen markeras klar. En kategorisering som handläggaren
själv har ändrat skrivs och valideras ändå — ett utkast är ingen licens att lagra en kategorisering som ingen
hade kunnat välja. Följden är att ett ärende kan ligga med en påbörjad utredning helt utan etiketter och då inte
syns i översiktens avvikelsefilter förrän någon kategoriserar det.

Eftersom `required` nu är villkorat markerar RJSF inte längre fälten som obligatoriska i ett utkast. UI-schemana
sätter därför `ui:options.showRequiredIndicator` på dem, så att "(Obligatorisk)" står kvar hela vägen. Fältuppsättningens
egen rubrik (Riskbedömning HSL) får sin markering av RJSF och saknar den i ett utkast.

Besluten (`beslut-hsl`, `beslut-sol-lss`) har ingen klarmarkering och är oförändrat strikta: ett beslut fattas eller
fattas inte.

## Utredning enhetschef 1.8

Version 1.8 lägger till det serverägda fältet `reportedMisconduct` (`x-draken-server-owned`): om ärendet är ett
missförhållande. Draken skriver det från ärendets rapporttyp varje gång utredningen sparas; UI-schemat döljer det.
Två regler läser det:

- **Synlighet.** Riskbedömningen SOL/LSS visas för en avvikelse under SoL eller LSS. För ett missförhållande visas den
  bara om dokumentet redan har en, alltså en bedömning som gjordes medan ärendet var en avvikelse.
- **Klarmarkering.** Riskbedömningen SOL/LSS krävs när utredningen markeras klar, utom för ett missförhållande.

Riskbedömningen är inte förbjuden för ett missförhållande: en som redan finns ligger kvar när ärendet blir ett
missförhållande, och dokumentet kan fortfarande låsas upp och få nya rapporter. Frågan om misstänkt missförhållande
och utredningsmallen följer lagrummen som förut.

## Utredning enhetschef 1.9

Version 1.9 ändrar två texter efter verksamhetens önskemål och inget annat. Lagrumsfrågans hjälptext är "Ange vilket
eller vilka lagrum som gäller för avvikelsen", och Utredningsmall har ingen hjälptext längre. UI-schemat är
oförändrat. Utredningar som redan är sparade är bundna till en äldre version och visar dess texter.

## Utredning enhetschef 1.10

Version 1.10 tar bort Utredningsmall (`investigationTemplate`), både fältet och de tre reglerna som höll valet i takt
med lagrummen. Lagrummen väljer mallen själva: SOL/LSS/HSL när HSL är ett av dem, annars SOL/LSS när SoL eller LSS
är valt, och ingen innan något lagrum är valt. Mallen fyller Utredningstext (se `../templates/README.md`). Ett
dokument med ett lagrat mallval godtas inte av 1.10.

Utredningar som redan är sparade är bundna till en äldre version och behåller sitt mallval, med frågan som förut när
valet ändras.

## Utredning enhetschef 1.11

Version 1.11 ställer frågan **Ska ärendet polisanmälas?** (`requiresPoliceReport`, Ja eller Ej aktuellt) till
enhetschefen när HSL är ett av lagrummen. Den står efter riskbedömningen HSL och följer samma regel: den visas med HSL
och försvinner med HSL, svaret också (`MANAGER_HSL_FIELDS` i `investigation-form-data.ts`). Svaret är
Verksamhetsuppföljningens Polisanmälan HSL, liksom LEX-utredningens svar är Polisanmälan SoL/LSS.

Klarmarkeringens `$comment` säger nu att lagrummen också krävs först vid klarmarkering, som reglerna redan gjorde.

## Händelseanalys HSL 1.5

Deltagarna i analysteamet (`analysisTeamParticipants`) har Namn (`name`, fritext) och Roll (`role`), där rollen väljs
ur en lista: Sjuksköterska (`nurse`), Fysioterapeut (`physiotherapist`), Arbetsterapeut (`occupational_therapist`)
och Omvårdnadspersonal (`care_staff`). Specialistundersköterskor och liknande anges som omvårdnadspersonal. Enhet
(`unit`) finns inte längre. Namn och roll krävs först när analysen markeras som klar, som rollen gjorde förut.

Händelseanalyser som redan är sparade är bundna till sin version och behåller rollen som fritext och sin enhet.
Ingen deltagare flyttas mellan versionerna.

1.5 börjar också med MAS/MAR:s initiala bedömning, sektionen Initial bedömning: Jag beslutar att ärendet
(`analysisDecision`) Ska händelseanalyseras (`analyze`) eller Inte ska händelseanalyseras (`not_analyze`), och en
motivering (`notAnalyzedMotivation`) som bara får finnas, och bara visas, med det senare. Vid klarmarkering krävs
beslutet. Ska ärendet inte händelseanalyseras krävs motiveringen och inget annat, så analysen kan markeras som klar
utan övriga fält. Ska det händelseanalyseras gäller analysens krav som förut. Övriga fält döljs inte av beslutet.

Det finns ingen spärr mot att avsluta ärendet innan analysen är klar, och beslutet att inte händelseanalysera
ändrar inte det.

## Händelseanalys HSL 1.4 och VC kommentar HSL

Uppdragsgivarens kommentar (`commissionerComment`) låg till och med `utredning-hsl` 1.3 i händelseanalysen, som
MAS/MAR skriver. Från 1.4 finns fältet inte där. Det ligger i ett eget dokument, `vc-kommentar-hsl` 1.0, med samma
fält, titel och hjälptext, så att uppdragsgivaren skriver kommentaren utan att få ändra analysen.

`vc-kommentar-hsl` har bara det fältet. Inget krävs, dokumentet klarmarkeras inte och det ger ingen rapport: en
kommentar som inte är skriven är ett tomt dokument. Rapporten från Händelseanalys HSL innehåller därmed inte
kommentaren.

Händelseanalyser som redan är sparade är bundna till 1.3 och behåller fältet där. Ingen kommentar flyttas mellan
dokumenten.

Vem som får läsa och skriva dokumentet avgör Support Managements namespace-konfiguration, där varje roll har sina
nycklar under `JSON_PARAMETERS` (`roleFieldRestrictions`). En nyckel som inte står där når rollen inte alls, så
`vc-kommentar-hsl` måste läggas till för rollerna i både IAF:s och VOF:s namespace innan någon med en roll ser
fliken.

## Utredning Lex Sarah 2.0–2.4

Version 2.4 besvarar de fem ställningstagandena med Ja eller Ej aktuellt (`$defs/yesOrNotApplicable`). Nej finns
inte längre, och därmed inte heller de fem motiveringarna (`individualNotifiedMotivation` med flera), som bara hörde
till ett Nej. Utredningar som redan är sparade är bundna till en äldre version och behåller Nej och motiveringarna.
Verksamhetsuppföljningens filter Polisanmälan har kvar Nej, eftersom äldre utredningar har svarat så.

Version 2.3 ändrar bara beskrivningen av händelsebeskrivningen i Bakgrund, som sa "den inrapporterade avvikelsen":
ett missförhållande kallas inte avvikelse (se avvikelse-README). Samtidigt säger `utredning-enhetschef` 1.7 det
inträffade och händelsen i stället för avvikelsen i orsaken, frågan om misstänkt missförhållande och riskbedömningens
allvarlighetsgrad, och lagrumsfältets beskrivning nämner inte längre de låsta lagrummen, som numera döljs.

Version 2.2 gör två ändringar till efter testrundan:

- **Sammanfattning av rapporten** (`reportSummary`) i Bakgrund: utredarens egen beskrivning av vad rapporten gäller,
  för rapporter som är långa eller flera om samma sak. Den börjar som en kopia av händelsebeskrivningen
  (`prefillNewInvestigationDocument`) och kan skrivas om, medan den inrapporterade texten står kvar låst ovanför.
  Den krävs vid klarmarkering och kommer med i den utskrivna rapporten.
- **Ej aktuellt** på de fem ställningstagandena (`$defs/yesNoNotApplicable`, koden `not_applicable`), till exempel
  när det inte finns någon god man. Motiveringen visas fortfarande bara vid Nej, men är frivillig, även vid
  klarmarkering. Verksamhetsuppföljningens filter Polisanmälan har Ej aktuellt som eget val.

Version 2.1 gör två ändringar efter testrundan den 8 oktober 2026:

- Frågan om anmälan till IVO (`proposedIvoNotification`) är borttagen ur Förslag till beslut. Graden av
  missförhållande visar redan om ärendet ska anmälas, och det formella beslutet fattar LEX-ansvarig.
- LEX-utredaren väljer lagrum (`legalBases`): SoL, LSS eller båda. Tidigare satte Draken SOL och LSS och låste fältet.
  HSL är inget lex Sarah-lagrum och finns inte bland valen, och BFF:en avvisar det i kategoriseringen. Som i
  enhetschefens utredning krävs lagrummen först vid klarmarkering, och kategoriseringen visas när ett lagrum är valt.
  Verksamhetsuppföljningen läser ett missförhållandes lagrum härifrån, så att statistiken skiljer LSS från SoL.

Inga dokument i produktion är bundna till 2.0. I testmiljön behåller ett dokument som redan sparats mot 2.0 sitt
schema, och därmed frågan och de låsta lagrummen.

Version 2.0 av `utredning-sol-lss` följer verksamhetens utredningsmall för lex Sarah, i mallens ordning och med
titeln Utredning Lex Sarah:

| Sektion                            | Innehåll                                                                                                                         |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Bakgrund                           | `investigator`, `reportedEventDescription`, `reportReceivedDate` - ifyllda av Draken och låsta                                   |
| Vad har hänt?                      | Elva textsvar, från vad som rapporterats till händelseanalysen                                                                   |
| Varför har det hänt?               | Orsaker (`causeAreas`), fyra textsvar och fem Ja/Nej-ställningstaganden som motiveras vid Nej                                     |
| Förslag till beslut                | `proposedMisconductDegree` (samma alternativ som förut) och `proposalMotivation`                                                 |
| Kategorisering                     | Lagrum och ärendets kategorisering; från 2.1 väljer LEX-utredaren lagrum                                                         |
| Avsluta utredning och skapa rapport | Klarmarkering och rapport som i alla utredningar                                                                                |

**Bakgrunden** fylls i när en utredning som inte är sparad öppnas (`prefillNewInvestigationDocument`) och sparas
med den. Fälten är `readOnly` i schemat och `ui:readonly` i formuläret:

- `investigator` är ärendets handläggare, LEX-utredaren, med namnet ur handläggarkatalogen.
- `reportedEventDescription` är händelsebeskrivningen i rapportdokumentet profilen pekar ut
  (`avvikelse-plats-handelse`). Katla skickar ren text, som görs om till stycken innan den visas i
  textredigeraren, så att formuläret inte blir ändrat bara av att öppnas.
- `reportReceivedDate` är dagen LEX-utredaren återupptog ärendet efter tilldelningen: den första statusändringen
  bort från `ASSIGNED` efter den senaste tilldelningen till hen. BFF:en läser den ur ärendets händelselogg och
  revisionsdiffar (`GET /supporthistory/:m/:id/assignee-resumed`), och bara så långt bakåt som tilldelningen.

Bara fält som schemaversionen deklarerar fylls i, så ett dokument mot en äldre version får dem aldrig.

**Textsvarens storlek** anges som `ui:options.size` på `TexteditorWidget`: `medium` (cirka 1 000 tecken innan
fältet växer, samma höjd som förut) eller `large` (cirka 3 000 tecken). Klasserna står i
`common/components/json/widgets/text-editor-size.ts`, så de genereras av Tailwind även när UI-schemat bara finns i
JSON Schema-API:t. **Sektionernas informationstexter** anges som `description` (överst) och `footnote` (sist) på
en sektion i `ui:sections`.

**Motiveringen** till ett Nej visas så fort frågan besvaras med Nej och tas bort ur dokumentet när svaret ändras
till Ja (från 2.2 även till Ej aktuellt). I 2.0 och 2.1 krävs den vid klarmarkering; från 2.2 är den frivillig.
Från 2.4 finns varken Nej eller motiveringen.

Fälten Typ av händelse, Utredningsmall, Primär bakomliggande orsak och Dokumentation om samtal finns inte i 2.0.
Utredningar som redan är sparade är bundna till 1.4 och visar sina fält som förut. Polisanmälan finns kvar som
det sista ställningstagandet, Ska ärendet polisanmälas?, under samma fältnamn som förut (`requiresPoliceReport`),
så Verksamhetsuppföljningens filter Polisanmälan fungerar för båda versionerna. Orsakskoderna är också desamma
som förut.

## Besluten

Beslutet om anmälan till IVO är ett eget dokument, skilt från utredningen, och finns i två varianter som aldrig
gäller samma ärende:

- `beslut-hsl` för en vanlig avvikelse med lagrum HSL: ställningstagandet till IVO-anmälan (obligatoriskt),
  IVO-ärendenummer (alltid frivilligt) och Public 360-ärendenummer.
- `beslut-sol-lss` för ett rapporterat missförhållande, oavsett lagrum: samma IVO-del, plus LEX-ansvarigs
  klassificering av rapporten (samma fem grader som utredarens förslag i `utredning-sol-lss`) med obligatorisk
  motivering. Utredarens förslag visas skrivskyddat ovanför beslutet och kopieras inte in i det, och beslutet kan
  inte sparas förrän `utredning-sol-lss` finns i ärendet (`prerequisiteDocumentKey` i runtimeprofilen).

IVO- och Public 360-ärendenummer finns bara när ärendet ska anmälas till IVO: vid Ja visas båda och Public 360
krävs, vid Nej döljs de, rensas ur formuläret och får inte finnas i dokumentet.

Besluten bär tre serverägda egenskaper som formuläret aldrig erbjuder som inmatning, eftersom ett beslut kan
sparas om i efterhand, till exempel när IVO:s ärendenummer kommer:

- `decidedAt` (`x-draken-server-timestamp: "created"`): tidpunkten då beslutet fattades, satt vid första
  sparningen och därefter bevarad från det lagrade dokumentet.
- `updatedAt` (`x-draken-server-timestamp: "updated"`): tidpunkten för den senaste sparningen.
- `revisions` (`x-draken-server-revisions: true`): en post `{ savedAt, savedBy }` per sparning, som BFF:en lägger
  till utifrån det lagrade dokumentet och den inloggades användarnamn.

BFF:en sätter alla tre oavsett vad klienten skickar; formuläret döljer fälten och visar Beslutat och Senast ändrat i
dokumentets huvud. Från `utredning-hsl` 1.1 ligger IVO- och Public 360-fälten inte längre i utredningen; dokument
som redan är bundna till 1.0 behåller sina fält och sin regel.

`beslut-sol-lss` 1.4 lägger till två saker. Beslut som redan är sparade är bundna till 1.3 och har varken lagrum
eller beslutsfattare.

- **Ange lagrum** (`decisionLegalBases`): lagrummen beslutet fattas enligt, 27 kap 5 § SoL och 24 e § LSS, ett eller
  båda. Fältet är frivilligt. Det heter inte `legalBases`, eftersom det inte är lagrummen ärendet kategoriseras
  efter: inget som läser en utrednings lagrum ska läsa dem.
- **Beslutsfattare** (`decisionMaker`, `x-draken-server-author: "created"`): `{ name, role }` för den som sparade
  beslutet första gången. BFF:en sätter namnet ur sessionen och rollen ur dokumentets `ownerLabel` i runtimeprofilen
  (LEX-ansvarig), och behåller värdet vid senare sparningar, vem som än sparar. Formuläret bär aldrig fältet.
  UI-schemat döljer det och placerar `$external:decisionMaker` sist i Beslut om missförhållande, där Draken visar
  det lagrade värdet (`resolveInvestigationDocumentAuthor`). Innan beslutet är sparat ser den som får skriva det sitt
  eget namn och rollen, alltså det som sparningen kommer att bokföra. Dokument bundna till 1.3 har ingen
  beslutsfattare.

I version 1.1 deklarerar enhetschefs- och SOL/LSS-schemana det externa fältet
`x-draken-external-fields.errandClassification`. Respektive UI Schema placerar
`$external:errandClassification` direkt efter `legalBases`. Deklarationen låter schemat styra var klassificeringen
visas och vilket lagrumsfält som filtrerar den, men avvikelsetyp, underkategori och deras UUID:n ägs av ärendets
SupportManagement-labels. De är inte JSON Schema-properties och sparas inte i utredningsdokumentets JSON. På platsen
visar Draken en väljare per vald lagrumsgrupp, HSL respektive SoL/LSS; se [../README.md](../README.md#ansvarsgränser).

Vanliga avvikelser redigerar klassificeringen i enhetschefsutredningen. För `eventType: MISSFORHALLANDE` flyttas
redigeringsansvaret till SOL/LSS-utredningen, med SOL och LSS förvalda och skrivskyddade. Spara ärende samordnar
dokumentets egen PUT med en smal label-PATCH som bär en klassificering per lagrumsgrupp. Om PUT:en lyckas men label-PATCH:en misslyckas rapporteras en delvis
genomförd sparning, och ett nytt försök skickar endast label-PATCH:en.

Redan sparade enhetschefs- och SOL/LSS-dokument som är bundna till schema till och med version 1.0 får samma externa
fältplacering via en runtime-fallback. Det ändrar inte deras bundna schema eller dokumentdata. Utredningsfeaturen är
den centrala ägaren även om ett nyare schema av misstag saknar deklarationen; då används samma säkra placering och
Draken visar en schemavarning, så att kategoriseringen varken försvinner eller får två redigeringsställen.

Riskvärden använder följande stabila sökvägar:

- `riskAssessmentHsl.probability * riskAssessmentHsl.severity = riskAssessmentHsl.calculatedRiskValue`
- `riskAssessmentSolLss.probability * riskAssessmentSolLss.severity = riskAssessmentSolLss.calculatedRiskValue`

Formel och indata finns även som `x-calculation` på respektive riskobjekt. Resultatfälten är skrivskyddade i både JSON Schema och UI Schema.
JSON Schema innehåller dessutom samtliga 16 giltiga kombinationer för skalan 1–4 och avvisar ett lagrat resultat som
inte motsvarar `probability * severity`.

`fixtures/investigation-schema-cases.json` innehåller ett fullständigt giltigt lokalt `formData`-objekt och negativa kontraktsfall för vart och ett av de tre schemana.

Kör kontraktstesterna från `frontend`:

```sh
yarn test src/supportmanagement/investigation/schemas
```

Publicerade schema- och UI-schema-versioner ska behandlas som immutabla. Ändringar av kontrakt eller presentation publiceras med ett nytt versionsnummer.
