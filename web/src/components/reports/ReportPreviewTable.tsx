'use client';

export interface ReportColumn {
  key: string;
  label: string;
  type?: 'string' | 'number' | 'date' | 'boolean' | 'enum';
}

const formatDate = (value: string) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

function Cell({ value, type }: { value: unknown; type?: ReportColumn['type'] }) {
  if (value === null || value === undefined || value === '') {
    return <span style={{ color: 'var(--text-3)' }}>—</span>;
  }
  if (type === 'boolean' || typeof value === 'boolean') {
    const on = value === true || value === 'true';
    return (
      <span className={`badge ${on ? 'badge-green' : 'badge-gray'}`}>{on ? 'Yes' : 'No'}</span>
    );
  }
  if (type === 'number' || (typeof value === 'number' && type !== 'enum')) {
    const num = typeof value === 'number' ? value : Number(value);
    if (!Number.isNaN(num)) {
      return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{num.toLocaleString()}</span>;
    }
  }
  const text = String(value);
  if (type === 'date') return <>{formatDate(text)}</>;
  if (type === 'enum') {
    return <span className="badge badge-blue">{text.replace(/_/g, ' ')}</span>;
  }
  return <>{text}</>;
}

/**
 * Generic report result table — sticky header, horizontal scroll for wide
 * column sets, and type-aware cell formatting (dates, numbers, booleans,
 * enums). Used by the report builder preview and standard-report previews.
 */
export default function ReportPreviewTable({
  columns,
  rows,
  total,
}: {
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  total?: number;
}) {
  if (!rows.length) {
    return (
      <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px' }}>
        No records match the current selection.
      </div>
    );
  }
  return (
    <div>
      <div style={{ overflowX: 'auto', maxHeight: '480px', overflowY: 'auto' }}>
        <table className="data-table">
          <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <tr>
              <th style={{ width: 40, color: 'var(--text-3)' }}>#</th>
              {columns.map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                <td style={{ color: 'var(--text-3)', fontSize: '11px', fontVariantNumeric: 'tabular-nums' }}>{i + 1}</td>
                {columns.map((c) => (
                  <td key={c.key} style={{ whiteSpace: 'nowrap' }}>
                    <Cell value={row[c.key]} type={c.type} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '10px 14px', borderTop: '1px solid var(--border-subtle)',
          fontSize: '12px', color: 'var(--text-3)',
        }}
      >
        <span>
          Showing <strong style={{ color: 'var(--text-2)' }}>{rows.length.toLocaleString()}</strong>
          {total !== undefined && total > rows.length && (
            <> of <strong style={{ color: 'var(--text-2)' }}>{total.toLocaleString()}</strong> matching records — export includes up to 10,000</>
          )}
          {total !== undefined && total <= rows.length && <> records</>}
        </span>
      </div>
    </div>
  );
}
