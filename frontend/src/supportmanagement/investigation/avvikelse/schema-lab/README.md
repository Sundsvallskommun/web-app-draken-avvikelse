# Schema-labb (endast lokal utveckling)

Utvecklarsandlåda för att förhandsgranska utrednings- och beslutsformulären (`utredning-enhetschef`,
`utredning-sol-lss`, `utredning-hsl`, `beslut-hsl`, `beslut-sol-lss`) i Drakens riktiga
formulärkomponenter — utan ärende, utan
inloggning och utan nätverksanrop. Ingenting här är en del av produkten.

Syfte, hur du startar den och ansvarsgränserna mot `schemas/` och `common/components/json`
beskrivs i [../README.md](../README.md#lokal-schema-labb).

Labben är utesluten ur produktionsbygget: rutten heter `page.dev.tsx` och `pageExtensions` i
`next.config.js` accepterar den ändelsen bara utanför produktion. Lägg därför inte till kod här
som produktionsflödet behöver — beroendet går bara åt ena hållet, labben konsumerar delade
moduler och ingen produktionsmodul importerar från `schema-lab/`.
