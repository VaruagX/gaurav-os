import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, missingRequirements, canEnable, CALL_LANGS, OUTCOME_LABEL } from '../src/services/caller/callAssistant.js';
import { callLogRepository } from '../src/database/repositories/index.js';

test('config is clamped and validated', () => {
  assert.deepEqual(normalizeConfig({ callAssistantEnabled: '1', callLang: 'english', callTimeoutSec: '12', userName: ' Gaurav ' }),
    { enabled: true, lang: 'english', timeoutSec: 12, user: 'Gaurav', speaker: true, duckRing: true });
  assert.equal(normalizeConfig({ callTimeoutSec: '1' }).timeoutSec, 4);
  assert.equal(normalizeConfig({ callTimeoutSec: '999' }).timeoutSec, 20);
  assert.equal(normalizeConfig({ callTimeoutSec: 'abc' }).timeoutSec, 8);
  assert.equal(normalizeConfig({ callLang: 'klingon' }).lang, 'both');
  assert.equal(normalizeConfig({}).enabled, false);
  assert.equal(normalizeConfig({ userName: '  ' }).user, 'Gaurav');
});

test('speaker and ring-lowering default on and can be turned off', () => {
  assert.equal(normalizeConfig({}).speaker, true);
  assert.equal(normalizeConfig({ callSpeaker: '0', callDuckRing: '0' }).speaker, false);
  assert.equal(normalizeConfig({ callSpeaker: '0', callDuckRing: '0' }).duckRing, false);
});

test('enabling requires phone-state, answer-calls and microphone permissions', () => {
  assert.equal(canEnable(null), false);
  assert.deepEqual(missingRequirements({ phoneState: true, answerCalls: false, microphone: true }), ['Answer calls']);
  assert.equal(canEnable({ phoneState: true, answerCalls: true, microphone: true, contacts: false }), true); // contacts optional
});

test('languages and outcome labels cover every native outcome', () => {
  assert.ok(CALL_LANGS.find((l) => l.id === 'hinglish-hi').sample.includes('ka call aaya hai. Kya aap call uthana chahte ho?'));
  for (const o of ['answered', 'rejected', 'no_response', 'call_ended', 'tts_failed', 'failed', 'sim_answer', 'sim_reject']) assert.ok(OUTCOME_LABEL[o], o);
});

test('call log persistence', async () => {
  await callLogRepository.add('Rahul', 'answered', '', 1000);
  await callLogRepository.add(null, 'no_response', '', 2000);
  const rows = await callLogRepository.recent();
  assert.equal(rows[0].outcome, 'no_response');
  assert.equal(rows[1].name, 'Rahul');
});
