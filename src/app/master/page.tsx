import { requireRole } from "@/lib/session";
import { DashboardShell } from "@/components/dashboard-shell";
import { PageHeader } from "@/components/ui/page-header";
import {
  listProdukAll,
  listProdukSatuanAll,
  listCabangAll,
  listTokoAll,
  listHargaAll,
  listDiskonAll,
  listStokAll,
  listUsersAll,
} from "@/server/queries";
import { MasterDataTabs } from "@/components/master/master-client";

export default async function MasterPage() {
  const user = await requireRole("owner");
  const [produks, produkSatuans, cabangs, tokos, harga, diskon, stok, users] = await Promise.all([
    listProdukAll(),
    listProdukSatuanAll(),
    listCabangAll(),
    listTokoAll(),
    listHargaAll(),
    listDiskonAll(),
    listStokAll(),
    listUsersAll(),
  ]);

  return (
    <DashboardShell userName={user.name} roleId={user.roleId} cabangId={user.cabangId}>
      <PageHeader
        title="Master Data"
        desc="Kelola cabang, produk, toko, harga dasar cabang, dan diskon khusus toko."
      />
      <MasterDataTabs
        produks={produks}
        produkSatuans={produkSatuans}
        cabangs={cabangs}
        tokos={tokos}
        harga={harga}
        diskon={diskon}
        stok={stok}
        users={users}
        actorRoleId={user.roleId}
      />
    </DashboardShell>
  );
}
