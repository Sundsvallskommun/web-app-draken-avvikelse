# Utredningsmallar för enhetschefens utredningstext

Den här katalogen är den kanoniska källan för texterna som fyller i Utredningstext i `utredning-enhetschef`. Texterna
läses från Templating-API:t vid körning; filerna här är vad som publiceras dit, så att innehållet kan granskas och
versioneras i repot.

| Lagrum                        | Mall (`investigationTemplate`) | Identifierare i Templating-API:t      | Innehåll                                   |
| ----------------------------- | ------------------------------ | ------------------------------------- | ------------------------------------------ |
| SoL, LSS eller båda           | `sol_lss`                      | `avvikelse.investigation.sol-lss`     | `avvikelse.investigation.sol-lss.html`     |
| HSL, ensamt eller med SoL/LSS | `sol_lss_hsl`                  | `avvikelse.investigation.sol-lss-hsl` | `avvikelse.investigation.sol-lss-hsl.html` |

`investigation-text-templates.json` håller namn, beskrivning och metadata för varje mall. Innehållet är HTML-filen
utan omgivande blanktecken, Base64-kodad i `content` när mallen publiceras.

## Hur mallen väljs

Från `utredning-enhetschef` 1.10 väljer lagrummen mallen: SOL/LSS/HSL så snart HSL är ett av dem, annars SOL/LSS när
SoL eller LSS är valt, och ingen innan något lagrum är valt (`investigationTemplateForLegalBases`). Handläggaren väljer
ingen mall själv. Identifieraren härleds ur mallen enligt repots konvention `{app}.{typ}.{variant}`, med bindestreck i
stället för understreck eftersom identifierare inte får innehålla understreck. Formuläret hämtar alla mallar med
prefixet `avvikelse.investigation.` en gång per dokument, första gången en mall behövs.

När en ändring av lagrummen byter mall fylls Utredningstext i:

- direkt, om texten är tom eller fortfarande är exakt någon av mallarnas text;
- annars efter en fråga: "Du har uppdaterat lagrummet och mallen kommer att skrivas över." **Ja, skriv över mallen**
  fyller i den nya mallen. **Nej** behåller texten och de nya lagrummen. **Avbryt** ångrar ändringen, så att lagrummen
  och resten av utkastet blir som före den.

En ändring som inte byter mall, till exempel att LSS läggs till SoL, rör inte texten. Ett befintligt dokument fylls
aldrig i när det öppnas, bara när lagrummen ändras. Ett nytt dokument vars lagrum redan är satta när det öppnas
startar med mallens text: för ett missförhållande låser Draken lagrummet till SoL och LSS innan handläggaren hunnit
göra något. Texten är då en del av dokumentets start, som förifyllningen, och räknas inte som en osparad ändring.

Dokument som är bundna till 1.9 eller äldre har kvar sitt mallval Utredningsmall. Där fylls texten i när
handläggaren väljer mall, med frågan "Använda mallens text?" om någon har skrivit i texten.

Texten läses rå och renderas aldrig, så den får inte innehålla Pebble-syntax. Den får bara använda den markup som
editorn behåller: `h2`, `p`, `br`, `strong` och `em`. Rubrikerna är `h2` eftersom `h1` är rapportens titel i PDF:en.
Kontraktstestet `investigation-text-templates.contract.test.ts` håller fast båda reglerna och att det finns precis en
mall för varje mall lagrummen kan välja.

## Metadata

Metadatan följer de befintliga skeletten (`sbk.ft.investigation.skeleton`): `templateType=Investigation`,
`templateRole=skeleton` och `editor=richtexteditor`, plus `schemaName` och `investigationTemplate` som pekar ut
vilket val mallen hör till.

`namespace` måste finnas, en gång per namespace (`HEALTHCAREDEVIATIONIAF` och `HEALTHCAREDEVIATIONVOF`): BFF:ens
`GET /templates` frågar Templating-API:t med `?namespace=<SUPPORTMANAGEMENT_NAMESPACE>`, och API:t filtrerar på
den metadatan. En mall utan den syns inte i IAF eller VOF.

## Publicerat

Den 5 oktober 2026 publicerades version 1.0 av båda mallarna i testmiljöns Templating-API. Innehåll, namn och
metadata lästes tillbaka och var identiska med filerna, och båda hittas med prefixet för både IAF- och
VOF-namespacet. Inget har publicerats i produktionsmiljön.

En ändrad text publiceras som en ny version av samma identifierare (`POST /2281/templates`); formuläret använder
alltid den senaste versionen. Redan ifyllda utredningstexter påverkas inte.

Den 12 oktober 2026 publicerades version 1.1 av `avvikelse.investigation.sol-lss` i testmiljön. Den frågar "Varför
inträffade händelsen?" i stället för "Varför uppstod avvikelsen?", eftersom ett missförhållande också får mallen.
Innehåll, namn och metadata lästes tillbaka och var identiska med filerna. `avvikelse.investigation.sol-lss-hsl` är
oförändrad på 1.0. Inget har publicerats i produktionsmiljön.

Den 14 oktober 2026 publicerades version 1.1 av `avvikelse.investigation.sol-lss-hsl` i testmiljön. Den frågar också
"Varför inträffade händelsen?". Innehåll, namn och metadata lästes tillbaka och var identiska med filerna. Inget har
publicerats i produktionsmiljön.
