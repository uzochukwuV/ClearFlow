import { db } from "@/api/db";
/**
 * Append an activity event to the ActivityLog entity.
 * Best-effort: never throws — logging must not break the calling flow.
 */
export async function logActivity({
  entityType,
  entityId,
  action,
  label,
  actorAddress,
  actorRole,
  status,
  meta,
}) {
  try {
    await db.entities.ActivityLog.create({
      entityType,
      entityId,
      action,
      label,
      actorAddress: actorAddress || '',
      actorRole: actorRole || 'SYSTEM',
      status: status || '',
      meta: meta ? JSON.stringify(meta) : '',
    });
  } catch (e) {
    // swallow — activity log is non-critical
  }
}

export async function fetchActivity(entityType, entityId) {
  try {
    return await db.entities.ActivityLog.filter(
      { entityType, entityId },
      '-created_date',
      100
    );
  } catch {
    return [];
  }
}