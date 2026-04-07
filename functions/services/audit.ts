export async function logAudit(
  db: D1Database,
  userId: number,
  action: string,
  targetType: string,
  targetId: number | null,
  details: string | null
) {
  try {
    await db.prepare(
      `INSERT INTO audit_log (user_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)`
    ).bind(userId, action, targetType, targetId, details).run();
  } catch {
    // Don't let audit failures break the main operation
  }
}
