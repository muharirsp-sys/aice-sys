/*
Tujuan: Membuat atau menyelaraskan satu akun super admin tanpa mereset database.
Caller: Operator Coolify melalui pnpm dlx tsx src/db/create-super-admin.ts.
Dependensi: Drizzle DB, Better Auth, dan tabel role/user/cabang.
Main Functions: main.
Side Effects: Insert/update role dan user serta membuat akun password Better Auth bila belum ada.
*/

import { eq } from "drizzle-orm";
import { db } from "./index";
import { auth } from "../lib/auth";
import { cabang, role, user } from "./schema";

const SUPER_ADMIN_ROLE_ID = 7;
const SUPER_ADMIN_ROLE_NAME = "super_admin";
const email = (process.env.SUPER_ADMIN_EMAIL ?? "superadmin@aice.test")
  .trim()
  .toLowerCase();
const password =
  process.env.SUPER_ADMIN_PASSWORD ??
  (process.env.NODE_ENV === "production" ? "" : "password123");
const name = (process.env.SUPER_ADMIN_NAME ?? "Super Admin").trim();
const cabangId = Number(process.env.SUPER_ADMIN_CABANG_ID ?? "1");

async function main() {
  if (!email.includes("@") || !name) {
    throw new Error("SUPER_ADMIN_EMAIL dan SUPER_ADMIN_NAME tidak valid.");
  }
  if (!Number.isInteger(cabangId) || cabangId <= 0) {
    throw new Error("SUPER_ADMIN_CABANG_ID harus berupa bilangan bulat positif.");
  }

  const [targetCabang] = await db
    .select({ id: cabang.id, nama: cabang.nama })
    .from(cabang)
    .where(eq(cabang.id, cabangId))
    .limit(1);
  if (!targetCabang) {
    throw new Error(`Cabang ID ${cabangId} tidak ditemukan.`);
  }

  await db
    .insert(role)
    .values({ id: SUPER_ADMIN_ROLE_ID, roleName: SUPER_ADMIN_ROLE_NAME })
    .onConflictDoUpdate({
      target: role.id,
      set: { roleName: SUPER_ADMIN_ROLE_NAME },
    });

  const [existing] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);

  if (existing) {
    await db
      .update(user)
      .set({ nama: name, roleId: SUPER_ADMIN_ROLE_ID, cabangId })
      .where(eq(user.id, existing.id));
    console.log(`Super admin diselaraskan: ${email} (${targetCabang.nama}).`);
    console.log("Password akun yang sudah ada tidak diubah.");
    return;
  }

  if (password.length < 12) {
    throw new Error(
      "SUPER_ADMIN_PASSWORD minimal 12 karakter untuk membuat akun baru.",
    );
  }

  await auth.api.signUpEmail({
    body: {
      name,
      email,
      password,
      roleId: SUPER_ADMIN_ROLE_ID,
      cabangId,
    },
  });

  console.log(`Super admin dibuat: ${email} (${targetCabang.nama}).`);
}

main().catch((error) => {
  console.error("Gagal membuat super admin:", error);
  process.exitCode = 1;
});
