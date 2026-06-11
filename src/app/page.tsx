import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { dashboardPathForRoleId, hasGlobalDataAccess, roleNameFromId } from "@/lib/roles";

// Root mengarahkan ke dashboard peran. Global-access user tanpa pilihan cabang aktif
// diarahkan ke /select-cabang terlebih dahulu.
export default async function Home() {
  const user = await requireUser();
  const role = roleNameFromId(user.roleId);
  if (hasGlobalDataAccess(role)) {
    const hasCookie = (await cookies()).get("active_cabang_id")?.value;
    if (!hasCookie) redirect("/select-cabang");
  }
  redirect(dashboardPathForRoleId(user.roleId) ?? "/login");
}
