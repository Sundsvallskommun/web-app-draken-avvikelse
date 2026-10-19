# Gemensamma JSON-formulär

`SchemaForm` äger rendering och validering av formulär från JSON Schema och UI Schema.
Komponenterna används både för visning av JSON-parametrar och för ärendenas insatser.
De innehåller inga utredningsprofiler eller nya skriv-endpoints.

- `schema/schema-form-ui-schema.ts` väljer standardwidget när ett UI Schema saknas.
  Ett uttryckligen angivet widgetnamn gäller före standardvalet.
- `widgets/index.componant.tsx` registrerar designsystemets widgets, inklusive tidsfält
  och kryssrutegrupper. `TextareaWidget` och `TexteditorWidget` sparar HTML via samma
  editoradapter; `TextareaWidget` är inte ett vanligt textfält för flera rader.
- `fields/array-object-field-template.componant.tsx` är standardmallen för redigerbara
  listor. En anropare kan ersätta list- eller objektmallen genom formulärets props.
- `fields/sections-object-field-template.componant.tsx` äger sektioner, fältrader och
  villkorsstyrd synlighet. `FieldTemplate` äger etiketter, beskrivningar och fältfel.

## Formulärkontrakt

`readonly` och `disabled` låser kontrollerna och döljer sparaknappen. Eventuella
`submitButtonActions` visas fortfarande, även när formuläret använder `extraContent`.
Ett dolt fält ska inte ta plats i layouten, men dess sparade data behålls vid submit.

Använd ett unikt `idPrefix` när flera formulär visas på samma sida. `getSchemaFormErrors`
översätter RJSF:s fel till en lista med fält-ID, etikett och meddelande. Skicka listan som
`validationErrors` för att visa en felsammanfattning med navigering till rätt fält och
öppning av dess sektion. Anroparen äger listans livscykel. Ett fel bär även `ancestorIds`,
id:na för de objekt och listor som omsluter fältet; det avgör vilken sektion som öppnas,
eftersom ett fält-ID inte kan skilja `risk.level` från ett fält som heter `risk_level`.
Ett fel som byggs för hand, till exempel för en extern kontroll, anger en tom lista.

UI Schema kan använda `ui:sections`, `ui:rows` och `ui:order` för layout. Observera att
vår `ui:rows` beskriver fältrader och skiljer sig från RJSF-typens numeriska textarea-option.
Externa komponenter skickas genom `externalFields` och placeras med `$external:<namn>`.
De hör inte till formulärets JSON-data. Placeringen följer dessa regler:

1. Ett uttryckligt `$external:<namn>` i objektets `ui:order` styr ordningen inom
   objektet eller den sektion fältet tillhör. Jokertecknet `*` är inte en uttrycklig placering.
2. Annars används positionen i `ui:sections[].fields`, relativt sektionens övriga fält.
3. Externa fält utan placering någonstans i UI-schemat visas sist på formulärets rot,
   efter eventuella sektioner. De upprepas inte automatiskt i nästlade objekt eller listposter.

En uttrycklig placering i ett nästlat objekts UI-schema gäller bara där. Placering i
en listas `items` gäller per listpost. Sådana fält får ingen extra kopia på roten.
Anroparen ansvarar för att inte deklarera samma externa kontroll på flera oavsiktliga platser.

De JSON-specifika layoutreglerna finns i
`src/styles/tailwind.scss`. Klasser som bara förekommer i UI-scheman från API:et läggs i
Tailwinds `safelist` i `tailwind.config.ts`, eftersom de inte kan hittas av innehållsskanningen.

## Platsval

`FacilitySearchField` använder den befintliga metadatastore:ns labelstruktur. Tolkning,
sökning och matchning mot anställningar ägs av `utils/place-structure.ts`.
`orgName` är vald nod och `parentOrgName` dess förälder. Organisations-ID och chef hämtas
bara från matchande anställning. Sparade namn går att läsa även när strukturen saknas;
en sen anställningshämtning får inte skriva över ett nyare platsval.

## Verifiering

`yarn test:json` kör de fokuserade testerna med en worker. `yarn type-check:test`
typkontrollerar testerna utan en genererad Next-byggnad. CI kör samma tester och
typkontroll. Komponenttesterna använder jsdom och verifierar inte visuell layout i en
riktig webbläsare.
