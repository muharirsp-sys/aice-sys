import { db } from "@/db";
import { auditLog } from "@/db/schema";

// Audit trail penuh (PRD §2): catat siapa, kapan, apa yang berubah pada aksi kritis.
export async function writeAudit(p: {
  userId: number;
  action: string;
  table: string;
  oldValue?: unknown;
  newValue?: unknown;
}) {
  await db.insert(auditLog).values({
    userId: p.userId,
    action: p.action,
    tableAffected: p.table,
    oldValue: p.oldValue != null ? JSON.stringify(p.oldValue) : null,
    newValue: p.newValue != null ? JSON.stringify(p.newValue) : null,
    timestamp: new Date(),
  });
}
