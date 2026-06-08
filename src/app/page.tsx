import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { dashboardPathForRoleId } from "@/lib/roles";

// Root hanya mengarahkan ke dashboard sesuai peran (atau /login bila belum masuk).
export default async function Home() {
  const user = await requireUser();
  redirect(dashboardPathForRoleId(user.roleId) ?? "/login");
}
