# Kvar inför prodsättning

Det som återstår innan Draken avvikelse driftsätts i produktion, för IAF och VOF. Bocka av en punkt när den är gjord
och skriv i den berörda README:n vad som gjordes och när, som scheman och mallar redan gör för testmiljön.

## Support Management

- [ ] **Kör bara mot ordinarie Support Management.** Ta bort konfigurationen för sprint-API:t. Förutsättningen är att
      Support Managements ordinarie version har allt som Draken i dag hämtar från sprint: faser och arbetsflöde,
      åtgärder, ärendets åtkomst (`GET …/errands/{errandId}/access`), `X-notify` och sökindexet med
      `…/errands/search/count?groupBy=status`. Därefter:
  - [ ] peka `supportmanagement` i `backend/src/config/api-config.ts` på den versionen och generera om
        `data-contracts` från den (`yarn generate:datacontracts`);
  - [ ] ta bort `supportmanagement-sprint`, `SUPPORTMANAGEMENT_API_TARGET` och valet mellan stable och sprint:
        `resolveSupportManagementApiTarget`, `hasSupportManagementErrandSearch` och utredningsprofilens
        `requiredSupportManagementApiTarget`, med tester;
  - [ ] uppdatera env-exemplen, README:n och CLAUDE.md;
  - [ ] säg upp applikationens prenumeration på sprint-API:t i WSO2.
- [ ] **Sökindexet.** Sidomenyns räknare läser sökindexet. Be API-teamet bygga om indexet för
      `HEALTHCAREDEVIATIONIAF` och `HEALTHCAREDEVIATIONVOF` i produktion, annars räknas inte ärenden som skapades
      innan indexet fanns. Bestäm sedan om översiktens lista också ska svara därifrån
      (`SUPPORTMANAGEMENT_ERRAND_SEARCH=true`).
- [ ] **Namespacens metadata i produktion.** Kontrollera att produktionens namespace har samma metadata som
      testmiljöns: etiketterna (rapporttyp, kategorier, platser, `ACCESS/LEX`, `RISK/HIGH_HSL`, `ANALYSIS/*`), faserna
      och statusarna, rollerna och åtgärdstyperna med sina grupper, och prenumerationsprofilerna för notiserna.
- [ ] **Behörigheter i AccessMapper.** Lägg in dokumenträttigheterna för utredningarnas och beslutens
      `jsonParameters`-nycklar per AD-grupp, och chefernas platser (Administration → Chefer per plats).

## JSON-scheman

- [ ] **Publicera alla utredningsscheman i produktionens JsonSchema-API.** Skicka `*.schema-request.json` till
      `POST /2281/schemas` och motsvarande `*.ui-schema-request.json` till `PUT /2281/schemas/{id}/ui-schema`, läs
      tillbaka båda och kontrollera att `schemas/{name}/versions/latest` pekar på rätt version. Filerna och
      förfarandet finns i
      [`frontend/src/supportmanagement/investigation/avvikelse/schemas/`](../frontend/src/supportmanagement/investigation/avvikelse/schemas/README.md).

  | Schema                 | Version |
  | ---------------------- | ------- |
  | `utredning-enhetschef` | 1.11    |
  | `utredning-sol-lss`    | 2.4     |
  | `utredning-hsl`        | 1.5     |
  | `beslut-hsl`           | 1.2     |
  | `beslut-sol-lss`       | 1.4     |
  | `bedomning-sol-lss`    | 1.0     |
  | `vc-kommentar-hsl`     | 1.0     |

- [ ] **Katlas rapportschema.** Kontrollera att `avvikelse-plats-handelse`, rapporten som Katla skickar in och som
      Draken skriver på ärenden som registreras i Draken, finns i produktionens JsonSchema-API.

## Mallar

- [ ] **Publicera alla mallar i produktionens Templating-API.** Varje mall behöver metadatan `namespace`, en gång för
      `HEALTHCAREDEVIATIONIAF` och en gång för `HEALTHCAREDEVIATIONVOF`; BFF:en hämtar mallarna per namespace, och en
      mall utan den syns inte.

  - [ ] Utredningsmallarna `avvikelse.investigation.sol-lss` (1.1) och `avvikelse.investigation.sol-lss-hsl` (1.1),
        från
        [`frontend/src/supportmanagement/investigation/avvikelse/templates/`](../frontend/src/supportmanagement/investigation/avvikelse/templates/README.md).
  - [ ] Meddelandemallarna med prefixen `default.` och `internal.`.
  - [ ] Exportmallen `singlesupporterrand.export`.

  Utredningsrapporten och handlingsplanen behöver inte publiceras: BFF:en skickar deras mall med varje rendering
  (`render/direct/pdf`).

## Konfiguration och drift

- [ ] **Produktionens env för båda driftsättningarna**, med produktionens AD-grupper: `AUTHORIZED_GROUPS`,
      `ADMIN_GROUP`, `DEVELOPER_GROUP`, `SUPERADMIN_GROUP` och `HEALTHCAREDEVIATION_HANDLER_ROLES`, som är obligatorisk.
      Varje roll- och superadmingrupp ska också finnas i `AUTHORIZED_GROUPS`. `MUNICIPALITY_ID` är också obligatorisk:
      det är den enda källan till kommunkoden, och frontend har ingen.
- [ ] **Frontendens env i produktion.** `NEXT_PUBLIC_ENVIRONMENT` får inte vara `TEST` (då visas utredningens
      felsökningspaneler och TEST-märkningen), och `NEXT_PUBLIC_USE_RELATED_REPORTS_MOCK` ska vara `false`.
- [ ] **`docker-compose.override.yml`** kräver bara en del av backendens inställningar; bland annat saknas
      `SUPPORTMANAGEMENT_NAMESPACE` och `SUPERADMIN_GROUP`. Komplettera den eller ta bort den.
- [ ] **Det nya repot.** Kontrollera att GitHub Actions går igenom på `develop` och `main`, att bygget och
      driftsättningen hämtar från `web-app-draken-avvikelse` i stället för `web-app-draken-public`, och gå igenom
      Dependabots varningar.

## Funktionalitet

- [ ] **HSL-mall för personalens egen redogörelse** (HSL-rundan Ä1/D1). Väntar på innehållet. I dag fylls
      utredningen med SOL/LSS/HSL-mallen.
- [ ] **Fasen Beslut i HSL-ärenden** (HSL D3). MAS/MAR når redan Beslut HSL i alla faser. Kvar är att enhetschefen
      fortfarande kan flytta ärendet till Beslut utan att ha något att besluta.
- [ ] **Sparande i Händelseanalys HSL** (HSL D4): autospar eller en tydligare påminnelse. I dag varnar sidan bara när
      den stängs.
- [ ] **Personuppgifter i fritext** (HSL D5). Ska det bli en hjälptext, eller räcker utbildning?
- [ ] **Relaterade rapporter med riktig data.** Antingen fortsätter vi via CaseStatus, som visar alla brukarens
      rapporter men inte ser VOF i test, eller så frågar BFF:en Support Management direkt, som bara visar rapporter
      man har behörighet till men ger underkategorin. Med CaseStatus blir Underkategori tom på riktiga rapporter.
- [ ] **Placeringen av återkopplingstexten** (missförhållande-rundan Ä5). Den behöver bekräftas med Edwin, och det
      behöver bestämmas om texten också ska stå vid förtida avslut.

## Kända fel

- [ ] **Upplåsning av HSL-utredningen.** E2e-testet "markerar HSL-utredningen klar, låser den, skapar numrerade
      rapporter och låser upp igen" (`frontend/e2e/avvikelse/support-errand-investigation.spec.ts`) fallerar, och
      gjorde det redan i `web-app-draken-public`. Troligen skriver formulärets `onChange` tillbaka innehållet från före
      upplåsningen.
- [ ] **Instabilt e2e-test.** "namnger LEX som ansvarig för ärenden som bär ACCESS/LEX"
      (`frontend/e2e/avvikelse/oversikt-lex-ansvarig.spec.ts`) fallerar ibland när hela sviten körs parallellt, med en
      tom översiktstabell, men går igenom när det körs ensamt.
