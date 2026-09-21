import {
  normalizeProductionCorrectionDate as normalizeDate,
  normalizeProductionCorrectionRoles as validateRoles,
  validateProductionCorrectionActor as validateActor
} from './productionCorrectionPrimitives.js';

const PRIVILEGED_VOID_ROLES = new Set(['SAMPLE_ADMIN', 'SAMPLE_SUPERVISOR']);

export const PRODUCTION_VOID_WINDOW_HOURS = 24;
const PRODUCTION_VOID_WINDOW_MS = PRODUCTION_VOID_WINDOW_HOURS * 60 * 60 * 1000;

export function evaluateProductionVoidPolicy({
  actorSubject,
  actorRoles,
  originalActorSubject,
  occurredAt,
  occurredAtField = 'occurred_at',
  lotStatus,
  alreadyVoided = false,
  domainBlockingReason = null,
  now = new Date()
}) {
  const actor = validateActor(actorSubject);
  const roles = validateRoles(actorRoles);
  const originalActor = validateActor(originalActorSubject);
  const occurredDate = normalizeDate(occurredAt, occurredAtField);
  const nowDate = normalizeDate(now, 'now');
  const voidableUntilDate = new Date(occurredDate.getTime() + PRODUCTION_VOID_WINDOW_MS);
  const privileged = roles.some((role) => PRIVILEGED_VOID_ROLES.has(role));
  const isOriginalActor = actor === originalActor;
  const withinWindow = nowDate.getTime() <= voidableUntilDate.getTime();

  let reason = null;
  if (alreadyVoided) reason = 'ALREADY_VOIDED';
  else if (lotStatus !== 'IN_PROGRESS') reason = 'INVALID_LOT_STATE';
  else if (domainBlockingReason) reason = domainBlockingReason;
  else if (!privileged && !isOriginalActor) reason = 'NOT_ORIGINAL_ACTOR';
  else if (!privileged && !withinWindow) reason = 'VOID_WINDOW_EXPIRED';

  return Object.freeze({
    canVoid: reason === null,
    reason,
    privileged,
    isOriginalActor,
    withinWindow,
    voidableUntil: voidableUntilDate.toISOString(),
    windowHours: PRODUCTION_VOID_WINDOW_HOURS
  });
}
