// Round-trip tests for the interaction store and usage roll-up.
// Run with: npm run test:analytics
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const InteractionStore = require('../interaction-store.js');

let failures = 0;
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) console.log(`  PASS  ${name}`);
  else { failures++; console.log(`  FAIL  ${name}\n        expected ${e}\n        actual   ${a}`); }
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'prebot-store-'));
const store = new InteractionStore(tmp);

console.log('\ninteraction-store — persistence');
store.append({ type: 'interaction', question: 'course fee kitni hai', answer: 'Twelve thousand rupees.', companyName: 'Acme' });
store.append({ type: 'interaction', question: 'placement milega', answer: 'Yes, full support.', companyName: 'Acme' });
check('records persist to disk', store.readAll().length, 2);
check('survives a fresh reader (not in-memory)', new InteractionStore(tmp).readAll().length, 2);
check('type defaults are applied', store.readAll()[0].type, 'interaction');
check('records start unsynced', store.getUnsynced().length, 2);

console.log('\ninteraction-store — sync bookkeeping');
const batch = store.getUnsynced(1);
store.markSynced(batch.map((r) => r.id));
check('only the acked record is marked', store.getUnsynced().length, 1);
check('acked record is retained locally', store.readAll().length, 2);

console.log('\ninteraction-store — corruption tolerance');
fs.appendFileSync(path.join(tmp, 'interactions.jsonl'), '{"broken":\n', 'utf8');
check('a torn line is skipped, not fatal', store.readAll().length, 2);

console.log('\ninteraction-store — usage roll-up');
store.append({
  type: 'usage', model: 'gemini-live-2.5-flash', connectedMs: 300000,
  totalTokens: 12000, turns: 8, tokensReported: true,
  modalities: { AUDIO: 11000, TEXT: 1000 }, companyName: 'Acme',
});
store.append({
  type: 'usage', model: 'gemini-live-2.5-flash', connectedMs: 120000,
  totalTokens: 4000, turns: 3, tokensReported: true,
  modalities: { AUDIO: 3800, TEXT: 200 }, companyName: 'Acme',
});
store.append({
  type: 'usage', model: 'gemini-2.5-flash-native-audio-dialog', connectedMs: 600000,
  totalTokens: 0, turns: 5, tokensReported: false, modalities: {}, companyName: 'Acme',
});

const u = store.usageSummary();
check('session count', u.sessions, 3);
check('total minutes across sessions', u.connectedMinutes, 17);
check('total hours', u.connectedHours, 0.28);
check('tokens summed', u.totalTokens, 16000);
check('turns summed', u.turns, 16);
check('per-model split is kept', Object.keys(u.byModel).sort(), ['gemini-2.5-flash-native-audio-dialog', 'gemini-live-2.5-flash']);
check('per-model minutes', u.byModel['gemini-live-2.5-flash'].connectedMs, 420000);
check('modality breakdown merged', u.byModel['gemini-live-2.5-flash'].modalities, { AUDIO: 14800, TEXT: 1200 });
// A partial figure must never be mistaken for a complete one.
check('sessions missing token data are surfaced', u.sessionsMissingTokens, 1);

console.log('\ninteraction-store — interactions are excluded from usage');
check('Q&A rows do not inflate session counts', store.usageSummary().sessions, 3);

fs.rmSync(tmp, { recursive: true, force: true });
console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
