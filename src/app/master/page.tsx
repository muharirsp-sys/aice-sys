import { requireRole } from "@/lib/session";
import { DashboardShell } from "@/components/dashboard-shell";
import { PageHeader } from "@/components/ui/page-header";
import {
  listProdukAll,
  listCabangAll,
  listTokoAll,
  listHargaAll,
  listDiskonAll,
} from "@/server/queries";
import {
  MasterProduk,
  MasterCabang,
  MasterToko,
  MasterHarga,
  MasterDiskon,
} from "@/components/master/master-client";

export default async function MasterPage() {
  const user = await requireRole("owner");
  const [produks, cabangs, tokos, harga, diskon] = await Promise.all([
    listProdukAll(),
    listCabangAll(),
    listTokoAll(),
    listHargaAll(),
    listDiskonAll(),
  ]);

  const produkOpts = produks.map((p) => ({ id: p.id, nama: p.nama }));
  const cabangOpts = cabangs.map((c) => ({ id: c.id, nama: c.nama }));
  const tokoOpts = tokos.map((t) => ({ id: t.id, nama: t.nama }));

  return (
    <DashboardShell userName={user.name} roleId={user.roleId} cabangId={user.cabangId}>
      <PageHeader
        title="Master Data"
        desc="Kelola cabang, produk, toko, harga dasar cabang, dan diskon khusus toko."
      />
      <div className="space-y-8">
        <MasterCabang rows={cabangs} />
        <MasterProduk rows={produks} />
        <MasterToko rows={tokos} cabangs={cabangOpts} />
        <MasterHarga rows={harga} produks={produkOpts} cabangs={cabangOpts} />
        <MasterDiskon rows={diskon} tokos={tokoOpts} produks={produkOpts} />
      </div>
    </DashboardShell>
  );
}
