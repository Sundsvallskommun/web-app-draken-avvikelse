/**
 * The Pebble template the Templating API renders investigation reports with, kept in the repo and
 * sent with every render (`render/direct/pdf`) so the report and the code that feeds it are
 * versioned together. Its only input is an `InvestigationReportModel` under `report`.
 */
export const INVESTIGATION_REPORT_TEMPLATE = `<!DOCTYPE html>
<html lang="sv">
<head>
<meta charset="utf-8">
<title>{{ report.title }} {{ report.sequence }} – {{ report.errand.errandNumber }}</title>
<style>
  @page { size: A4; margin: 22mm 18mm 24mm 18mm; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10.5pt; color: #1a1a1a; line-height: 1.45; }
  h1 { font-size: 20pt; margin: 0 0 2mm 0; }
  h2 { font-size: 13pt; margin: 9mm 0 3mm 0; padding-bottom: 1.5mm; border-bottom: 1px solid #b9b9b9; }
  h3 { font-size: 10.5pt; margin: 4mm 0 1mm 0; }
  .meta { color: #555; font-size: 9.5pt; margin: 0 0 6mm 0; }
  .field { margin: 0 0 3.5mm 0; }
  .field .label { font-weight: bold; display: block; margin-bottom: 0.6mm; }
  .field .value p { margin: 0 0 1.5mm 0; }
  .field .value ul, .field .value ol { margin: 0 0 1.5mm 0; padding-left: 5mm; }
  .group { border-left: 2px solid #d9d9d9; padding-left: 3mm; margin: 1mm 0 3mm 0; }
  table.rows { border-collapse: collapse; width: 100%; margin: 1mm 0 2mm 0; }
  table.rows th, table.rows td { border: 1px solid #c8c8c8; padding: 1.2mm 2mm; text-align: left; vertical-align: top; font-size: 9.5pt; }
  table.rows th { background: #f1f1f1; }
  .empty { color: #777; font-style: italic; }
  .footer { margin-top: 10mm; padding-top: 2mm; border-top: 1px solid #b9b9b9; color: #555; font-size: 9pt; }
</style>
</head>
<body>
  <h1>{{ report.title }}</h1>
  <p class="meta">Rapport {{ report.sequence }} · Ärende {{ report.errand.errandNumber }} · Ansvarig roll: {{ report.ownerLabel }}</p>
  <p class="meta">Genererad {{ report.generatedAt }} av {{ report.generatedBy }}</p>

  {% for section in report.sections %}
  <h2>{{ section.title }}</h2>
  {% for field in section.fields %}
    {% include "field" with { "field": field, "level": 0 } %}
  {% endfor %}
  {% endfor %}

  <p class="footer">Rapporten är genererad ur utredningsdokumentet i Draken och återger dess innehåll vid genereringstillfället.</p>
</body>
</html>`;

/**
 * Pebble cannot include a fragment recursively, so the field markup is expanded by the BFF before
 * rendering: every include above becomes the fragment below, nested once per group level with its
 * own loop variable. Groups deeper than the expansion render their label only, which no current
 * schema reaches.
 */
const fieldFragment = (variable: string, nested: string): string => `
    <div class="field">
      <span class="label">{{ ${variable}.label }}</span>
      <div class="value">
      {% if ${variable}.kind == "html" %}{{ ${variable}.html | raw }}
      {% elseif ${variable}.kind == "list" %}{% if ${variable}.items is empty %}<span class="empty">Ej angivet</span>{% else %}<ul>{% for item in ${variable}.items %}<li>{{ item }}</li>{% endfor %}</ul>{% endif %}
      {% elseif ${variable}.kind == "table" %}{% if ${variable}.rows is empty %}<span class="empty">Ej angivet</span>{% else %}<table class="rows"><tr>{% for column in ${variable}.columns %}<th>{{ column }}</th>{% endfor %}</tr>{% for row in ${variable}.rows %}<tr>{% for cell in row %}<td>{{ cell }}</td>{% endfor %}</tr>{% endfor %}</table>{% endif %}
      {% elseif ${variable}.kind == "group" %}<div class="group">${nested}</div>
      {% else %}{% if ${variable}.text == "Ej angivet" %}<span class="empty">{{ ${variable}.text }}</span>{% else %}{{ ${variable}.text }}{% endif %}
      {% endif %}
      </div>
    </div>`;

const INCLUDE_PATTERN = /\{% include "field" with \{ "field": field, "level": 0 \} %\}/gu;

export const renderInvestigationReportTemplate = (depth = 3): string => {
  // Innermost first: a group below the expansion depth shows an ellipsis instead of its fields.
  let fragment = '<span class="empty">…</span>';
  for (let level = depth; level >= 1; level -= 1) {
    const variable = level === 1 ? 'field' : `field${level}`;
    fragment = fieldFragment(variable, `{% for field${level + 1} in ${variable}.fields %}${fragment}{% endfor %}`);
  }
  return INVESTIGATION_REPORT_TEMPLATE.replace(INCLUDE_PATTERN, fragment);
};
