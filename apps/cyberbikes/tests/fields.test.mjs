import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SPEC_FIELDS } from '../src/specs.js';

// The draft generator writes blocks the parser must read: same labels, same order.
test('draft generator and parser agree on the fields', () => {
  const script = fileURLToPath(new URL('../scripts/draft_spec_blocks.py', import.meta.url));
  const labels = JSON.parse(execFileSync('python3', ['-I', script, '--print-fields'], { encoding: 'utf8' }));
  assert.deepEqual(labels, SPEC_FIELDS.map(f => f.label));
});
