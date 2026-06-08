import type { ReactNode } from "react";

export type Column<T> = {
  header: string;
  align?: "left" | "right";
  cell: (row: T) => ReactNode;
  // Lebar/utility opsional per kolom.
  className?: string;
};

// Tabel padat (§8.6): header sticky, zebra halus, angka rata kanan tabular,
// baris cukup tinggi untuk disentuh (≥44px) di mobile. Presentational (dipakai
// di server & client component).
export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  empty = "Tidak ada data.",
}: {
  columns: Column<T>[];
  rows: T[];
  getRowKey: (row: T, i: number) => string | number;
  empty?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 bg-surface">
          <tr className="border-b">
            {columns.map((c, i) => (
              <th
                key={i}
                className={`px-3 py-2.5 font-semibold text-muted-foreground ${
                  c.align === "right" ? "text-right" : "text-left"
                } ${c.className ?? ""}`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-3 py-8 text-center text-muted-foreground"
              >
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr
                key={getRowKey(row, i)}
                className="border-b last:border-0 even:bg-muted/40 hover:bg-muted/60"
              >
                {columns.map((c, j) => (
                  <td
                    key={j}
                    className={`px-3 py-3 align-middle ${
                      c.align === "right" ? "text-right tabular" : ""
                    } ${c.className ?? ""}`}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
