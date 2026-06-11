"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { db } from "@/db";
import { user, account, session } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { canAccessRole, roleNameFromId, type RoleName } from "@/lib/roles";
import { auth } from "@/lib/auth";
import { writeAudit } from "./audit";

type Result = { ok: true } | { ok: false; error: string };

async function ownerActor(): Promise<
  { error: string } | { userId: number; actorRole: RoleName }
> {
  const u = await getCurrentUser();
  if (!u) return { error: "Sesi berakhir." };
  const role = roleNameFromId(u.roleId);
  if (!canAccessRole(role, "owner")) return { error: "Hanya Owner atau Super Admin." };
  return { userId: Number(u.id), actorRole: role! };
}

function validatePassword(pw: string): string | null {
  if (pw.length < 8) return "Password minimal 8 karakter.";
  if (!/[A-Z]/.test(pw)) return "Harus ada minimal 1 huruf kapital.";
  if (!/[0-9]/.test(pw)) return "Harus ada minimal 1 angka.";
  return null;
}

// roleId yang boleh di-assign oleh actor: owner hanya 1-5, super_admin semua 1-7.
function allowedRoleIds(actorRole: RoleName): number[] {
  return actorRole === "super_admin" ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5];
}

export async function createUser(input: {
  nama: string;
  email: string;
  password: string;
  roleId: number;
  cabangId: number;
}): Promise<Result> {
  const a = await ownerActor();
  if ("error" in a) return { ok: false, error: a.error };
  if (!input.nama.trim() || !input.email.trim())
    return { ok: false, error: "Nama dan email wajib diisi." };
  const pwErr = validatePassword(input.password);
  if (pwErr) return { ok: false, error: pwErr };
  if (!allowedRoleIds(a.actorRole).includes(input.roleId))
    return { ok: false, error: "Anda tidak berwenang mengassign role tersebut." };

  try {
    await auth.api.signUpEmail({
      body: {
        name: input.nama,
        email: input.email.toLowerCase().trim(),
        password: input.password,
        roleId: input.roleId,
        cabangId: input.cabangId,
      },
    });
    await writeAudit({
      userId: a.userId,
      action: "master_data",
      table: "user",
      newValue: { op: "create", email: input.email, roleId: input.roleId, cabangId: input.cabangId },
    });
    revalidatePath("/master");
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.toLowerCase().includes("unique") || msg.toLowerCase().includes("exist"))
      return { ok: false, error: "Email sudah digunakan." };
    return { ok: false, error: `Gagal membuat user: ${msg}` };
  }
}

export async function updateUser(input: {
  id: number;
  nama: string;
  email: string;
  roleId: number;
  cabangId: number;
  password?: string;
}): Promise<Result> {
  const a = await ownerActor();
  if ("error" in a) return { ok: false, error: a.error };
  if (!input.nama.trim() || !input.email.trim())
    return { ok: false, error: "Nama dan email wajib diisi." };
  if (!allowedRoleIds(a.actorRole).includes(input.roleId))
    return { ok: false, error: "Anda tidak berwenang mengassign role tersebut." };
  if (input.password) {
    const pwErr = validatePassword(input.password);
    if (pwErr) return { ok: false, error: pwErr };
  }

  try {
    await db
      .update(user)
      .set({
        nama: input.nama.trim(),
        email: input.email.toLowerCase().trim(),
        roleId: input.roleId,
        cabangId: input.cabangId,
        updatedAt: new Date(),
      })
      .where(eq(user.id, input.id));

    if (input.password) {
      const hashed = await hashPassword(input.password);
      await db
        .update(account)
        .set({ password: hashed })
        .where(eq(account.userId, input.id));
    }

    await writeAudit({
      userId: a.userId,
      action: "master_data",
      table: "user",
      newValue: { op: "update", targetId: input.id, roleId: input.roleId, cabangId: input.cabangId },
    });
    revalidatePath("/master");
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.toLowerCase().includes("unique"))
      return { ok: false, error: "Email sudah digunakan oleh user lain." };
    return { ok: false, error: `Gagal memperbarui user: ${msg}` };
  }
}

export async function deleteUser(id: number): Promise<Result> {
  const a = await ownerActor();
  if ("error" in a) return { ok: false, error: a.error };
  if (a.userId === id) return { ok: false, error: "Tidak bisa menghapus akun sendiri." };

  try {
    // Hapus urutan: session → account → user (FK constraint).
    await db.delete(session).where(eq(session.userId, id));
    await db.delete(account).where(eq(account.userId, id));
    await db.delete(user).where(eq(user.id, id));
    await writeAudit({
      userId: a.userId,
      action: "master_data",
      table: "user",
      newValue: { op: "delete", targetId: id },
    });
    revalidatePath("/master");
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Gagal menghapus user: ${msg}` };
  }
}
