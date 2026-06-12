import { requireRole } from "@/lib/session";
import { DashboardShell } from "@/components/dashboard-shell";
import { PageHeader } from "@/components/ui/page-header";
import { DeliveryList } from "@/components/delivery/delivery-list";
import { MuatPanel } from "@/components/delivery/muat-panel";
import { KendalaDriverPanel } from "@/components/delivery/kendala-driver-panel";
import {
  listReadyNotLoaded,
  listLoadedNotDelivered,
  listKendalaForDriver,
} from "@/server/queries";

export default async function DeliveryPage() {
  const user = await requireRole("delivery");
  const [notLoaded, loaded, kendalaItems] = await Promise.all([
    listReadyNotLoaded(user.cabangId),
    listLoadedNotDelivered(user.cabangId),
    listKendalaForDriver(user.cabangId),
  ]);

  return (
    <DashboardShell userName={user.name} roleId={user.roleId} cabangId={user.cabangId}>
      <PageHeader
        title="Pengiriman"
        desc={`${notLoaded.length} perlu dimuat · ${loaded.length} dalam pengiriman`}
      />

      <section className="mb-8">
        <div className="mb-3">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Langkah 1 · Muat dari Gudang
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Cek barang yang disiapkan gudang. Klik &ldquo;Konfirmasi Muat&rdquo; kalau sudah sesuai dan Anda terima.
          </p>
        </div>
        <MuatPanel orders={notLoaded} />
      </section>

      <section className="mb-8">
        <div className="mb-3">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Langkah 2 · Antar ke Toko
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Setelah sampai di toko dan barang diterima, unggah foto bukti terima dan masukkan koordinat GPS.
          </p>
        </div>
        <DeliveryList orders={loaded} />
      </section>

      {kendalaItems.length > 0 && (
        <section className="mb-8">
          <div className="mb-3">
            <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Konfirmasi Barang Kurang ({kendalaItems.length})
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Gudang melaporkan qty barang yang berbeda. Isi qty yang benar-benar Anda antarkan ke toko.
            </p>
          </div>
          <KendalaDriverPanel items={kendalaItems} />
        </section>
      )}
    </DashboardShell>
  );
}
