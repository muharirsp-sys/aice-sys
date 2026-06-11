// Diff JSON old→new dari audit_log (datanya sudah ada di DB, hanya tak ditampilkan).
// Memunculkan "status sebelumnya → sesudah" per-field agar perubahan kritis (mis.
// harga, diskon, status order, nominal bayar) bisa diaudit tanpa query DB manual.

function parse(json: string | null): Record<string, unknown> | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json);
    return v && typeof v === "object" && !Array.isArray(v) ? v : { value: v };
  } catch {
    return { raw: json };
  }
}

function fmt(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function AuditDiff({
  oldValue,
  newValue,
}: {
  oldValue: string | null;
  newValue: string | null;
}) {
  const before = parse(oldValue);
  const after = parse(newValue);

  if (!before && !after) {
    return <p className="text-xs text-muted-foreground">Tidak ada detail perubahan.</p>;
  }

  // Gabungkan semua key dari before & after.
  const keys = Array.from(
    new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]),
  );

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-muted-foreground">
          <th className="py-1 pr-3 font-semibold">Field</th>
          <th className="py-1 pr-3 font-semibold">Sebelum</th>
          <th className="py-1 font-semibold">Sesudah</th>
        </tr>
      </thead>
      <tbody>
        {keys.map((k) => {
          const b = before?.[k];
          const a = after?.[k];
          const berubah = fmt(b) !== fmt(a) && before != null && after != null;
          return (
            <tr key={k} className="border-t align-top">
              <td className="py-1 pr-3 font-mono font-semibold">{k}</td>
              <td
                className={`py-1 pr-3 font-mono ${berubah ? "bg-critical/10 text-critical" : "text-muted-foreground"}`}
              >
                {fmt(b)}
              </td>
              <td
                className={`py-1 font-mono ${berubah ? "bg-ok/10 font-semibold text-ok" : "text-muted-foreground"}`}
              >
                {fmt(a)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
