/**
 * The Pebble template the Templating API renders measure action plans with, kept in the repo and
 * sent with every render (`render/direct/pdf`) so the plan and the code that feeds it are
 * versioned together. Its only input is a `MeasureActionPlanModel` under `plan`. Every value is
 * pre-formatted by the BFF; the template only places text, so Pebble's escaping applies throughout.
 */
export const MEASURE_ACTION_PLAN_TEMPLATE = `<!DOCTYPE html>
<html lang="sv">
<head>
<meta charset="utf-8">
<title>{{ plan.title }} {{ plan.sequence }} – {{ plan.errand.errandNumber }}</title>
<style>
  @page { size: A4; margin: 22mm 18mm 24mm 18mm; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10.5pt; color: #1a1a1a; line-height: 1.45; }
  h1 { font-size: 20pt; margin: 0 0 2mm 0; }
  h2 { font-size: 13pt; margin: 9mm 0 3mm 0; padding-bottom: 1.5mm; border-bottom: 1px solid #b9b9b9; }
  h3 { font-size: 11.5pt; margin: 6mm 0 2mm 0; page-break-after: avoid; }
  .meta { color: #555; font-size: 9.5pt; margin: 0 0 2mm 0; }
  .field { margin: 0 0 3mm 0; }
  .field .label { font-weight: bold; display: block; margin-bottom: 0.6mm; }
  .field .value { white-space: pre-wrap; }
  .measure { page-break-inside: avoid; margin-bottom: 4mm; padding-bottom: 3mm; border-bottom: 1px dotted #c8c8c8; }
  table.rows { border-collapse: collapse; width: 100%; margin: 1mm 0 2mm 0; }
  table.rows th, table.rows td { border: 1px solid #c8c8c8; padding: 1.2mm 2mm; text-align: left; vertical-align: top; font-size: 9.5pt; }
  table.rows th { background: #f1f1f1; }
  .small { color: #555; font-size: 9pt; margin: 1mm 0 0 0; }
  .footer { margin-top: 10mm; padding-top: 2mm; border-top: 1px solid #b9b9b9; color: #555; font-size: 9pt; }
</style>
</head>
<body>
  <h1>{{ plan.title }}</h1>
  <p class="meta">Ärende {{ plan.errand.errandNumber }}{% if plan.errand.title != "" %} · {{ plan.errand.title }}{% endif %} · Handlingsplan {{ plan.sequence }}</p>
  <p class="meta">Genererad {{ plan.generatedAt }} av {{ plan.generatedBy }}</p>
  <p class="meta">{{ plan.counts.total }} åtgärder: {{ plan.counts.planned }} planerade, {{ plan.counts.executed }} genomförda, {{ plan.counts.unscheduled }} ej tidsatta</p>

  <h2>Översikt</h2>
  <table class="rows">
    <tr><th>Nr</th><th>Åtgärd</th><th>Status</th><th>Datum</th><th>Beslut</th><th>Ansvarig</th></tr>
    {% for measure in plan.measures %}
    <tr><td>{{ measure.number }}</td><td>{{ measure.type }}</td><td>{{ measure.status }}</td><td>{{ measure.dates }}</td><td>{{ measure.decision }}</td><td>{{ measure.responsible }}</td></tr>
    {% endfor %}
  </table>

  <h2>Åtgärder</h2>
  {% for measure in plan.measures %}
  <div class="measure">
    <h3>{{ measure.number }}. {{ measure.type }}</h3>
    <div class="field"><span class="label">Status</span><div class="value">{{ measure.status }} · {{ measure.dates }}</div></div>
    <div class="field"><span class="label">Beslut</span><div class="value">{{ measure.decision }}</div></div>
    {% if measure.decisionComment != "" %}<div class="field"><span class="label">{{ measure.decisionCommentLabel }}</span><div class="value">{{ measure.decisionComment }}</div></div>{% endif %}
    <div class="field"><span class="label">Beskrivning</span><div class="value">{{ measure.description }}</div></div>
    <div class="field"><span class="label">Mål</span><div class="value">{{ measure.goal }}</div></div>
    <div class="field"><span class="label">Ansvarig</span><div class="value">{{ measure.responsible }}</div></div>
    <p class="small">Registrerad av {{ measure.registeredBy }}{% if measure.created != "" %} · {{ measure.created }}{% endif %}</p>
  </div>
  {% endfor %}

  <p class="footer">Handlingsplanen är genererad ur ärendets åtgärder i Draken och återger dem vid genereringstillfället.</p>
</body>
</html>`;
