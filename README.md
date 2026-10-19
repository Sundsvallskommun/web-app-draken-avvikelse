# Sundsvalls Kommun Draken - avvikelsehantering

Draken för avvikelsehantering (healthcare deviation). En och samma applikation körs i två driftsättningar,
**IAF** och **VOF**. De fungerar likadant; det enda som skiljer dem åt är backendens konfiguration:
Support Management-namespacet (`SUPPORTMANAGEMENT_NAMESPACE`, `HEALTHCAREDEVIATIONIAF` respektive
`HEALTHCAREDEVIATIONVOF`) och AD-grupperna (`AUTHORIZED_GROUPS`, `ADMIN_GROUP`, `DEVELOPER_GROUP`,
`SUPERADMIN_GROUP`, `HEALTHCAREDEVIATION_HANDLER_ROLES`). Därutöver har varje driftsättning sina egna adresser,
portar, SAML-inställningar och hemligheter.

Applikationen har inga feature-flaggor: allt avvikelsehanteringen använder är alltid på.

## APIer som används

Dessa APIer används i projektet, applikationsanvändaren i WSO2 måste prenumerera på dessa.

| API                        | Version |
| -------------------------- | ------: |
| SupportManagement          |    15.2 |
| SupportManagement (sprint) |    17.1 |
| AccessMapper               |     2.2 |
| ActiveDirectory            |     2.0 |
| Citizen                    |     3.0 |
| Employee                   |     2.0 |
| Templating                 |     2.1 |
| LegalEntity                |     2.0 |
| Party                      |     2.1 |
| Relations                  |     1.1 |
| CaseStatus                 |     4.3 |
| JsonSchema                 |     1.0 |

## Utveckling

### AD-grupper för handläggare och utredning

Backendens `HEALTHCAREDEVIATION_HANDLER_ROLES` anger handläggarrollerna: en post per roll
med den AD-grupp som har den. Inställningen är obligatorisk, backend startar inte utan den. Samma lista fyller
handläggarlistan med rollgruppernas medlemmar, grupperad per roll, styr vilken roll överlämningsstegen kräver
och avgör vem som registrerar och följer upp åtgärder. Formatet beskrivs i
`frontend/src/supportmanagement/measures/README.md`. Medlemmar i `SUPERADMIN_GROUP` har alla
registreringsroller för åtgärder. `/me` anger vilka roller den inloggade har via sina grupper (`roleKeys`) och
om hen är med i `SUPERADMIN_GROUP` (`superadmin`).

Medlemmar i `SUPERADMIN_GROUP` sätter också vilka platser varje enhetschef och verksamhetschef har, under
Administration → Chefer per plats i översiktens sidomeny. Draken skriver bara platserna, som mönster på
personen i AccessMapper. Chefsrollen följer med en AD-grupp som beställs för sig. Se
`frontend/src/supportmanagement/investigation/avvikelse/README.md`.

Ett konto i flera rollgrupper visas en gång per roll men räknas som en handläggare. Handläggarlistan
cachas i backend i en timme; om något gruppanrop misslyckas
returneras ett fel i stället för en ofullständig lista. Starta om backendens
`yarn dev`-process efter en env-ändring och ladda om sidan.

Gruppnamnen anges separat per miljö. Välj de faktiska test- eller produktionsgrupperna i env;
koden ändrar inga suffix. Handläggarrollerna ger inga inloggnings- eller skrivrättigheter:
`AUTHORIZED_GROUPS` styr inloggning och `ADMIN_GROUP`, `SUPERADMIN_GROUP` samt
`DEVELOPER_GROUP` behåller sina befintliga applikationsroller. De tre tar en grupp eller en
kommaseparerad lista med grupper.

Utrednings- och beslutsdokumentens rättigheter hämtas per användare och ärende från
Support Management Sprint 16.0, `GET /{municipalityId}/{namespace}/errands/{errandId}/access`.
Backend erbjuder projektionen som `GET /supporterrands/{municipalityId}/{errandId}/investigation-access`.
Den globala utredningsprofilen beskriver dokument och scheman; den innehåller inga behörigheter.

Draken tolkar endast den nycklade samlingen `jsonParameters` och resursen `errand/json-parameter`
i detta flöde. Explicit skrivrätt ger redigering, läsrätt ger ett skrivskyddat formulär och en
utelämnad nyckel döljer dokumentet. `allKeys` gäller även dokument som ännu inte skapats.
Ärendets nivå gäller ärendet själv, inte dokumenten: `jsonParameters` skrivs genom en egen endpoint,
så en nyckel - eller hela fältet med `allKeys` - och resursen `errand/json-parameter` får ge `RW` även
där ärendets nivå är `R` eller `LR`. Ett dokument kan redigeras när både nyckeln och resursen ger `RW`.
Ärendets egna fält (`PATCH` av ärendet) följer fortfarande ärendets nivå.
Access hämtas när ärendet öppnas, dess version eller etiketter ändras, fönstret återfår fokus,
anslutningen återkommer och efter nekade dokumentanrop. Backend kontrollerar på nytt vid varje
dokumentläsning och skrivning. Felaktiga eller otillgängliga svar ger ingen åtkomst.

Dokumentutkast behålls i komponenternas minne när access kontrolleras eller nekas. Innehållet
döljs tills en läsrätt har verifierats för ärendet och användaren. Vid en omkontroll av samma ärende visas det
föregående svaret tills det nya kommit, så att en sparning inte tömmer sidan. Omkontroll kan göras utan omladdning. Varningen
för osparade ändringar gäller även dolda utkast. Utkast sparas inte över omladdning och följer
inte med till en annan användare eller ett annat ärende.

`SUPPORT_INVESTIGATION_DOCUMENT_GROUPS` används inte längre. AD-grupper, roller och dokumentgrants
administreras i AccessMapper och Support Management. Utredningen kräver sprint-API:t även för access;
en deployment utan detta kontrakt ska inte falla tillbaka till env-baserade skrivrättigheter.
Kategoriseringen skriver vanliga ärendefält och behåller `canEditSupportManagement` utöver
skrivrätten till ägardokumentet. Dokumentredigerare utan kategoriseringsrätt får ändra dokumentet
när den befintliga kategoriseringen är giltig. Ändringar av lagrum som skulle kräva omklassificering
stoppas direkt med en förklaring; saknad eller ogiltig kategorisering förklaras innan redigering.
Övriga applikationsrättigheter och handläggarlistor migreras separat.

### Tjänsteanteckningar i supportärenden

Sidopanelen visar **Tjänsteanteckningar** före **Kommentarer**. Support Management har ingen typ på
anteckningar, så typen ligger i anteckningens `context`: kommentarer skrivs som tidigare med
`context: SUPPORT` och `role: FIRST_LINE_SUPPORT`, tjänsteanteckningar med `context: SERVICE_NOTE`
och `role: ERRAND_HANDLER`. Varje lista hämtar bara sin egen typ.

Bara ärendets handläggare (`assignedUserId`) en tjänsteanteckning, och bara
medan ärendet tar emot ändringar. En sparad tjänsteanteckning kan inte ändras eller tas bort genom
Draken. AccessMapper ger behörighet till anteckningar som en resurs och kan inte skilja typerna åt,
så reglerna ligger i backenden (`support-note.service.ts`). Texten får vara högst 2048 tecken, vilket
är Support Managements gräns.

### Notiser i supportärenden

Notiserna kommer från Support Managements prenumerationsmodell.

- **Vem får notiser.** Bara ärendets handläggare följer ärendet (profilens `assigneeFollowsErrand`). När
  ärendet tilldelas, lämnas över eller registreras prenumererar BFF:en den nya handläggaren och tar bort
  den förras prenumerationer på ärendet. Därför finns ingen Följ ärendet i sidopanelen.
- **En notis per ärende.** Support Management samlar allt som hänt sedan användaren senast kvitterade
  i en notis per ärende och användare (`GET /supportnotifications/:municipalityId`). Klockan hämtar
  listan en gång i minuten, pausar i en dold flik och hämtar direkt när användaren byter vy.
- **Kvittens.** Ett ärendes notiser kvitteras när ärendet öppnas, hur användaren än kommer dit
  (`PUT /supportnotifications/:municipalityId/:errandId/acknowledge-all`). I panelen går det också att
  markera notiser som lästa. En kvitterad notis ligger kvar tills Support Management låter den gå ut.
  **Senaste aktivitet** i översikten visar den senaste händelse användaren inte har kvitterat, och
  annars när ärendet senast ändrades.
- **En handling blir en notis.** Alla anrop under en användarhandling bär samma `X-Request-Group-Id`,
  så Support Management gör en notis av dem. Frontend sätter id:t med `withRequestGroup`, och
  följdskrivningarna hör till samma handling: statusen efter en tilldelning, självtilldelningen innan
  ett ärende stängs, faserna vid Starta handläggning och statusen efter en kompletteringsbegäran. BFF:en skickar id:t vidare till Support Management, eller ger requesten ett
  eget id om webbläsaren inte skickade något (`utils/request-group.ts`).
- **Tysta skrivningar.** Det systemet skriver på egen hand notifierar ingen. Det gäller läsmarkeringar,
  kvittenser, prenumeranten som skapas vid första besöket, rapportens bokföring runt bilagan, faserna
  ett ärende passerar när det stängs från en tidigare fas. Avvikelsens labels `RISK/HIGH_HSL`, `ANALYSIS/HSL_STARTED` och
  `ANALYSIS/VC_COMMENT_HSL` är aldrig tysta, eftersom prenumerationsprofilerna aviserar från dem. BFF:en skickar då
  `X-notify: false` (`notifySubscribers: false` i `ApiService`). Support Management läser headern från
  17.0 (`SUPPORTMANAGEMENT_API_TARGET=sprint`); äldre versioner ignorerar den. Ändringar användaren själv gör ska aldrig vara tysta.
- **E-post och SMS väljer användaren själv.** Användarmenyn har valet **Notiser**, där
  användaren kryssar i om notiserna också ska komma med e-post eller SMS. Valet lagras som kanaler på
  användarens prenumerant i Support Management (`GET`/`PATCH /supportsubscribers/:municipalityId/me`),
  och dialogen visar det som ligger där; Draken har inget eget förval.
  - Notiserna i Draken går inte att välja bort: BFF:en lägger alltid till kanalen `INTERNAL`.
  - BFF:en tar bara emot kanalens typ. En egen adress eller ett eget nummer (`destination`) avvisas, så
    e-post och SMS går till det som hör till kontot.
  - Menyvalet kommer ur utredningsvariantens slot `notificationChannels`.
  - **Rollprofilerna går före.** En prenumeration som pekar på en prenumerationsprofil (rollnotiserna)
    levereras på profilens kanaler så länge profilen har några. Användarens eget val gäller då
    bara övriga prenumerationer, till exempel ärenden hen följer. Först när en profil saknar kanaler
    levereras dess händelser på användarens egna.

### Krav

- Node >= 20 LTS
- Yarn

### Steg för steg

1. Klona ner repot.

2. Installera dependencies för både `backend` och `frontend`

```
cd frontend
yarn install

cd backend
yarn install
```

3. Skapa .env-filer

Frontend (kör från `frontend/`):

```bash
cp .env.local-example .env.local
```

Backend (kör från `backend/`):

```bash
cp .env.example.local .env.development.local
```

Exempelfilerna är skrivna för IAF. För VOF byts namespace, AD-grupper och `/iaf` mot `/vof` i adresserna.

Utredningen kräver Support Managements sprintkontrakt, så backendmiljön väljer det uttryckligen:

```env
SUPPORTMANAGEMENT_API_TARGET=sprint
```

Tillåtna värden är `stable` och `sprint`. Ett okänt värde stoppar backend vid uppstart, så att en felstavad
deploymentinställning inte tyst byter API-kontrakt. Utredningsprofilen kräver `sprint`; en felaktig
stable-deployment annonserar därför utredningen och dess registrering som otillgängliga i stället för att
försöka använda ett inkompatibelt API.

Sprintkontraktet (`supportmanagement-sprint/17.0`) har ett sökindex för ärenden. En sprintdeployment kan låta
översiktens lista och sidomenyns räknare svara därifrån i stället för från filter-endpointen:

```env
SUPPORTMANAGEMENT_ERRAND_SEARCH=true
```

Slå på flaggan först när API-teamet har byggt om indexet för namespacet; ärenden som skapades innan sök infördes finns
annars inte i indexet. Flaggan kräver `SUPPORTMANAGEMENT_API_TARGET=sprint` och stoppar annars backend vid uppstart.
Söken matchar samma fält och på samma sätt (delsträng) som filtret gjorde. Filter-endpointen svarar fortfarande när
indexet inte kan svara likadant: när sökklustret är nere (503), när frågan blir längre än indexets 2000 tecken och när
en vald etikett saknas i metadatan. Ett sök som indexet ger upp efter tio sekunder (504) visas som ett fel.

Drakens ärende-, handläggar- och statuskommandon kräver en exakt stark `If-Match` och skickar samma
version vidare till Support Management. Den 2 september 2026 verifierades de publicerade OpenAPI-kontrakten för både
`supportmanagement/15.1` och `supportmanagement-sprint/15.1`: båda deklarerar `If-Match`, svaren 409/412 och
versionsfält på ärenden och JSON Parameters. Därmed använder stable- och sprintdeploymenterna samma atomiska
skrivkontrakt utan en svag kompatibilitetsväg i Draken. Kontrollera kontrakten på nytt när någon prenumeration byter
version; Drakens förkontroll av version och status ersätter inte atomisk versionskontroll i upstream.

Statuskommandot validerar klientens källstatus och version mot ett färskt ärende samt målstatusen mot live metadata.
Support Management 15.1 exponerar däremot ingen source→target-graf eller exekveringsroute för statusövergångar, så
Draken kan inte auktorisera själva kanten utan att införa appspecifika regler. Den domänregeln behöver ägas av
Support Management innan starkare generell transitionvalidering kan införas.

Läs- och skrivrättigheter för utredningsdokumentens JSON Parameter-nycklar konfigureras i Support Managements
AccessMapper för aktuellt namespace. Draken skickar den inloggades AD-identitet i `X-Sent-By` och låter Support
Management vara enda ägare till åtkomstbeslutet.

4. Konfigurera env-filer

Redigera env-filer efter behov. URLer, nycklar och cert behöver fyllas i korrekt.

- `CLIENT_KEY` och `CLIENT_SECRET` måste fyllas i för att APIerna ska fungera, du måste ha en applikation från WSO2-portalen
- `SAML_ENTRY_SSO` behöver pekas till en SAML IDP
- `SAML_IDP_PUBLIC_CERT` ska stämma överens med IDPens cert
- `SAML_PRIVATE_KEY` och `SAML_PUBLIC_KEY` behöver bara fyllas i korrekt om man kör mot en riktig IDP

I testmiljöer där CaseStatus inte ser applikationens rapporter kan frontend visa exempelrapporter under
Relaterade rapporter med `NEXT_PUBLIC_USE_RELATED_REPORTS_MOCK=true`. Aldrig i produktion.

### Starta utvecklingsserver

Backend (kör från `backend/`):

```bash
yarn dev
```

Frontend (kör från `frontend/`):

```bash
yarn dev
```

### Kodkvalitet

Kör från repots rot:

```bash
yarn verify # Typkontroll, strikt lint, formatkontroll, Knip och backendtester
yarn knip   # Dödkod, oanvända exporter och oanvända dependencies
```

Utvecklingsrouten `src/app/**/page.dev.{ts,tsx}` deklareras som entry i Knip, eftersom Next konfigurerar dessa sidändelser endast i utvecklingsläge. Labbet och dess beroenden analyseras därför också.

Knip körs även vid `pre-push` och som en blockerande GitHub Actions-kontroll för pull requests samt push till `develop` och `main`.

Undantag i `backend/knip.json` och `frontend/knip.json`:

- `src/data-contracts/**` (samt `src/common/data-contracts/**` i frontend) — ägs av kodgeneratorn,
  inte av handskriven kod.
- `enumMembers` — enumvärden kan vara externa API-kontrakt även när varje medlem inte refereras lokalt.
- `backend/src/tests/helpers/mock-data.ts` — registret över testidentifierare (personnummer,
  organisationsnummer, telefonnummer) med dokumenterad proveniens. Värden ska ligga kvar även när
  inget test råkar använda dem just nu, så att nästa test importerar därifrån i stället för att
  hårdkoda ett nytt nummer.

Backend har dessutom taggen `@openapi`. En DTO-klass som bara existerar för att hamna i
OpenAPI-specen (och därmed i frontendens genererade `data-contracts`) har ingen importör i
backend, men får inte tas bort. Märk den i så fall så här:

```ts
/** @openapi */
export class MinResponseDto { ... }
```

Behöver klassen inte exporteras räcker det att ta bort `export` — schemat byggs av
class-validator-metadatan när modulen laddas, inte av exporten.

### Tester

**Backend** (Vitest, kör från `backend/`):

```bash
yarn test           # Kör enhetstesterna en gång
yarn test:watch     # Watch-läge
yarn test:coverage  # Med täckningsrapport (v8)
yarn type-check:test # Typkontroll av testerna
```

Testerna ligger i `backend/src/tests/` (`*.service.test.ts`).

**Frontend** (kör från `frontend/`):

```bash
yarn test                       # Enhetstester (Vitest)
yarn test:watch                 # Vitest i watch-läge
yarn test:coverage              # Med täckningsrapport (v8)
yarn type-check:test            # Typkontroll av testerna
yarn test:e2e                   # Playwright E2E (kräver att `yarn dev` körs)
yarn test:e2e:schema-lab        # Playwright E2E för utvecklingslabbet
yarn test:e2e:ui                # Playwright interaktivt
```

Enhetstesterna ligger bredvid modulen de testar (`<modul>.test.ts`) och körs med Vitest,
samma testkörare som backend. Assertions skrivs med `node:assert/strict` i stället för
`expect`, och `globals` är avstängt — allt importeras explicit. Alias som `@common/*` löses
upp av Vite direkt ur `tsconfig.json`, så även moduler med beroenden går att enhetstesta;
allt som kräver rendering hör fortfarande hemma i Playwright. Testerna omfattas inte av
`yarn type-check` utan av `yarn type-check:test` (se CLAUDE.md för varför).

### Övriga kommandon

| Kommando                      | Beskrivning                                               |
| ----------------------------- | --------------------------------------------------------- |
| `yarn build`                  | Bygger för produktion                                     |
| `yarn start`                  | Startar produktionsserver                                 |
| `yarn test:e2e`               | Kör Playwright E2E-tester                                 |
| `yarn generate:datacontracts` | Genererar TypeScript-typer från API:erna (backend)        |
| `yarn generate:contracts`     | Genererar TypeScript-typer från backendens API (frontend) |
