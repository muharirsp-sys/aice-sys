"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/session";
import { hasGlobalDataAccess, roleNameFromId } from "@/lib/roles";
import { writeAudit } from "./audit";

export async function setActiveCabangAction(cabangId: number | null) {
  const user = await getCurrentUser();
  if (!user || !hasGlobalDataAccess(roleNameFromId(user.roleId))) return;
  const cookieStore = await cookies();
  if (cabangId == null) {
    cookieStore.delete("active_cabang_id");
  } else {
    cookieStore.set("active_cabang_id", String(cabangId), {
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  await writeAudit({
    userId: Number(user.id),
    action: "switch_cabang",
    table: "session",
    newValue: { cabangId },
  });
  revalidatePath("/owner");
}
