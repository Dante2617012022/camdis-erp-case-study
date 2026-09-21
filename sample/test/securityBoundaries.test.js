import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateProductionVoidPolicy } from '../src/productionVoidPolicy.js';
const input = () => ({actorSubject:'sample-alice', actorRoles:['SAMPLE_OPERATOR'], originalActorSubject:'sample-alice', occurredAt:'2026-01-01T12:00:00Z', now:'2026-01-01T13:00:00Z', lotStatus:'IN_PROGRESS'});
test('another operator cannot cancel an operation owned by someone else', () => {
  assert.equal(evaluateProductionVoidPolicy({...input(),actorSubject:'sample-bob'}).reason,'NOT_ORIGINAL_ACTOR');
});
test('role names are exact: casing does not grant elevated privileges', () => {
  assert.equal(evaluateProductionVoidPolicy({...input(),actorSubject:'sample-bob',actorRoles:['sample_admin']}).canVoid,false);
});
test('malformed identity or role collection rejects evaluation', () => {
  for (const extra of [{actorSubject:null},{actorRoles:null},{actorRoles:[42]}]) {
    assert.throws(() => evaluateProductionVoidPolicy({...input(),...extra}));
  }
});
test('closed state and domain blockers defeat both privileged roles', () => {
  for (const role of ['SAMPLE_ADMIN','SAMPLE_SUPERVISOR']) {
    for (const extra of [{lotStatus:'CLOSED'},{alreadyVoided:true},{domainBlockingReason:'SAMPLE_STOCK_CONFLICT'}]) {
      assert.equal(evaluateProductionVoidPolicy({...input(),actorRoles:[role],...extra}).canVoid,false);
    }
  }
});
test('evaluation does not mutate the input and returns a frozen decision', () => {
  const value=input(); const before=structuredClone(value);
  assert.equal(Object.isFrozen(evaluateProductionVoidPolicy(value)),true);
  assert.deepEqual(value,before);
});
