import assert from 'node:assert/strict';

import { test } from 'vitest';

import { plainTextToHtml } from './plain-text-to-html';

test('writes plain text as the editor would, a paragraph per line', () => {
  assert.equal(plainTextToHtml('Brukaren föll.'), '<p>Brukaren föll.</p>');
  assert.equal(plainTextToHtml('Först\n\nSedan'), '<p>Först</p><p><br></p><p>Sedan</p>');
  assert.equal(plainTextToHtml('1 < 2 & 3 > 2'), '<p>1 &lt; 2 &amp; 3 &gt; 2</p>');
});

test('leaves markup as it is', () => {
  assert.equal(plainTextToHtml('<p>Redan <strong>HTML</strong></p>'), '<p>Redan <strong>HTML</strong></p>');
});
