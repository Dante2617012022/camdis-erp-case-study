import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateProductionVoidPolicy,
  PRODUCTION_VOID_WINDOW_HOURS
} from '../src/productionVoidPolicy.js';

const occurredAt = '2026-08-19T12:00:00.000Z';

function base(overrides = {}) {
  return {
    actorSubject: 'operator-a',
    actorRoles: ['SAMPLE_OPERATOR'],
    originalActorSubject: 'operator-a',
    occurredAt,
    lotStatus: 'IN_PROGRESS',
    alreadyVoided: false,
    now: '2026-08-20T11:59:59.000Z',
    ...overrides
  };
}

test('original production actor can void within the canonical window', () => {
  const policy = evaluateProductionVoidPolicy(base());
  assert.equal(policy.canVoid, true);
  assert.equal(policy.reason, null);
  assert.equal(policy.privileged, false);
  assert.equal(policy.isOriginalActor, true);
  assert.equal(policy.withinWindow, true);
  assert.equal(policy.windowHours, PRODUCTION_VOID_WINDOW_HOURS);
});

test('canonical privileged roles can override actor and time while operation stays open', () => {
  for (const role of ['SAMPLE_ADMIN', 'SAMPLE_SUPERVISOR']) {
    const policy = evaluateProductionVoidPolicy(base({
      actorSubject: `${role.toLowerCase()}-actor`,
      actorRoles: [role],
      originalActorSubject: 'operator-a',
      now: '2026-08-21T12:00:00.000Z'
    }));
    assert.equal(policy.canVoid, true);
    assert.equal(policy.privileged, true);
  }
});

test('unrecognized ADMIN is never privileged by production correction policy', () => {
  const policy = evaluateProductionVoidPolicy(base({
    actorSubject: 'legacy-admin',
    actorRoles: ['ADMIN'],
    originalActorSubject: 'operator-a'
  }));
  assert.equal(policy.canVoid, false);
  assert.equal(policy.reason, 'NOT_ORIGINAL_ACTOR');
  assert.equal(policy.privileged, false);
});

test('closed operation blocks even canonical privileged roles', () => {
  const policy = evaluateProductionVoidPolicy(base({
    actorSubject: 'manager',
    actorRoles: ['SAMPLE_SUPERVISOR'],
    originalActorSubject: 'operator-a',
    lotStatus: 'CLOSED'
  }));
  assert.equal(policy.canVoid, false);
  assert.equal(policy.reason, 'INVALID_LOT_STATE');
});

test('domain blocker remains authoritative before actor and time overrides', () => {
  const policy = evaluateProductionVoidPolicy(base({
    actorSubject: 'manager',
    actorRoles: ['SAMPLE_SUPERVISOR'],
    originalActorSubject: 'operator-a',
    domainBlockingReason: 'FINISHED_OUTPUT_EXISTS'
  }));
  assert.equal(policy.canVoid, false);
  assert.equal(policy.reason, 'FINISHED_OUTPUT_EXISTS');
});

test('already voided evidence always remains non-voidable', () => {
  const policy = evaluateProductionVoidPolicy(base({
    actorSubject: 'manager',
    actorRoles: ['SAMPLE_SUPERVISOR'],
    originalActorSubject: 'operator-a',
    alreadyVoided: true,
    domainBlockingReason: 'FINISHED_OUTPUT_EXISTS'
  }));
  assert.equal(policy.canVoid, false);
  assert.equal(policy.reason, 'ALREADY_VOIDED');
});

test('non privileged original actor expires exactly after 24 hours', () => {
  const atBoundary = evaluateProductionVoidPolicy(base({ now: '2026-08-20T12:00:00.000Z' }));
  assert.equal(atBoundary.canVoid, true);
  assert.equal(atBoundary.withinWindow, true);

  const afterBoundary = evaluateProductionVoidPolicy(base({ now: '2026-08-20T12:00:00.001Z' }));
  assert.equal(afterBoundary.canVoid, false);
  assert.equal(afterBoundary.reason, 'VOID_WINDOW_EXPIRED');
  assert.equal(afterBoundary.withinWindow, false);
});
