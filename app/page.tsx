"use client";

import { useEffect, useState } from "react";

type Ticket = {
  task_gid: string;
  task_name: string;
  task_url: string | null;
  assigned_to: string;
  original_assignee: string | null;
  asana_status: string | null;
  archived: boolean;
  due_on: string | null;
  first_seen: string;
  last_seen: string;
};

type Run = {
  started_at: string;
  finished_at: string | null;
  ok: boolean | null;
  new_count: number | null;
  seen_count: number | null;
  archived_count: number | null;
  error: string | null;
};

export default function Page() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [lastRun, setLastRun] = useState<Run | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/tickets")
      .then((r) => r.json())
      .then((d) => {
        setTickets(d.tickets ?? []);
        setLastRun(d.lastRun ?? null);
      })
      .finally(() => setLoading(false));
  }, []);

  const active = tickets.filter((t) => !t.archived);
  const archived = tickets.filter((t) => t.archived);
  const byTarget = active.reduce<Record<string, number>>((acc, t) => {
    acc[t.assigned_to] = (acc[t.assigned_to] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <main style={{ maxWidth: 1100, margin: "32px auto", padding: "0 16px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ margin: 0 }}>QA Work Allotment</h1>
        <a
          href="/api/download"
          style={{
            background: "#111",
            color: "#fff",
            padding: "10px 16px",
            borderRadius: 8,
            textDecoration: "none",
          }}
        >
          Download Excel
        </a>
      </header>

      <section style={{ marginTop: 16, fontSize: 14, color: "#555" }}>
        {lastRun ? (
          <span>
            Last sync: {new Date(lastRun.started_at).toLocaleString()} —{" "}
            {lastRun.ok === true
              ? `OK (seen ${lastRun.seen_count}, new ${lastRun.new_count}, archived ${lastRun.archived_count})`
              : lastRun.ok === false
              ? `FAILED: ${lastRun.error}`
              : "running…"}
          </span>
        ) : (
          <span>No syncs recorded yet.</span>
        )}
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 18 }}>Active assignments ({active.length})</h2>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
          {Object.entries(byTarget).map(([name, count]) => (
            <div
              key={name}
              style={{
                background: "#fff",
                padding: "8px 14px",
                borderRadius: 8,
                border: "1px solid #e5e5e5",
              }}
            >
              <strong>{name}</strong>: {count}
            </div>
          ))}
        </div>
        <Table rows={active} loading={loading} />
      </section>

      <section style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 18 }}>Archived ({archived.length})</h2>
        <Table rows={archived} loading={loading} />
      </section>
    </main>
  );
}

function Table({ rows, loading }: { rows: Ticket[]; loading: boolean }) {
  if (loading) return <p>Loading…</p>;
  if (rows.length === 0) return <p style={{ color: "#666" }}>No tickets.</p>;
  return (
    <div style={{ overflowX: "auto", background: "#fff", borderRadius: 8, border: "1px solid #e5e5e5" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}>
        <thead style={{ background: "#fafafa" }}>
          <tr>
            <Th>Task</Th>
            <Th>Assigned To</Th>
            <Th>Original</Th>
            <Th>Status</Th>
            <Th>Due</Th>
            <Th>First Seen</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.task_gid} style={{ borderTop: "1px solid #eee" }}>
              <Td>
                {t.task_url ? (
                  <a href={t.task_url} target="_blank" rel="noreferrer">
                    {t.task_name}
                  </a>
                ) : (
                  t.task_name
                )}
              </Td>
              <Td>{t.assigned_to}</Td>
              <Td>{t.original_assignee ?? "—"}</Td>
              <Td>{t.archived ? "Archived" : t.asana_status ?? "open"}</Td>
              <Td>{t.due_on ?? "—"}</Td>
              <Td>{new Date(t.first_seen).toLocaleDateString()}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 600 }}>{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: "10px 12px", verticalAlign: "top" }}>{children}</td>;
}
