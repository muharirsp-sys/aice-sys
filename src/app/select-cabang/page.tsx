import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";
import { requireUser } from "@/lib/session";
import { hasGlobalDataAccess, roleNameFromId } from "@/lib/roles";
import { listCabangAll } from "@/server/queries";
import { setActiveCabangAction } from "@/server/cabang-actions";

async function selectCabang(formData: FormData) {
  "use server";
  const id = Number(formData.get("cabangId"));
  await setActiveCabangAction(id);
  redirect("/owner");
}

export default async function SelectCabangPage() {
  const user = await requireUser();
  if (!hasGlobalDataAccess(roleNameFromId(user.roleId))) redirect("/");

  const cabangs = await listCabangAll();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <span className="mb-4 inline-grid size-12 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Building2 className="size-6" />
          </span>
          <h1 className="font-display text-2xl font-bold">Pilih Cabang</h1>
          <p className="mt-2 text-muted-foreground">
            Selamat datang, {user.name}. Pilih cabang yang ingin Anda kelola.
          </p>
        </div>

        <div className="space-y-3">
          {cabangs.map((c) => (
            <form key={c.id} action={selectCabang}>
              <input type="hidden" name="cabangId" value={c.id} />
              <button
                type="submit"
                className="w-full rounded-lg border bg-card p-4 text-left transition-colors hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <p className="font-semibold">{c.nama}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{c.alamat}</p>
              </button>
            </form>
          ))}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Pilihan ini bisa diubah kapan saja melalui header aplikasi.
        </p>
      </div>
    </div>
  );
}
