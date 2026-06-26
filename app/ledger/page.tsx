"use client";

import { useEffect, useMemo, useState } from "react";

type Priority = "P1" | "P2" | "P3" | "P4" | null;

type Ticket = {
  task_gid: string;
  task_name: string;
  task_url: string | null;
  assigned_to: string;
  assigned_to_gid: string;
  original_assignee: string | null;
  asana_status: string | null;
  archived: boolean;
  due_on: string | null;
  first_seen: string;
  last_seen: string;
  manual_override: boolean;
  priority: Priority;
  dev_status: string | null;
  sprint: string | null;
};

const PRIORITY_RANK: Record<string, number> = { P1: 1, P2: 2, P3: 3, P4: 4 };

function sprintRankOf(s: string | null, order: string[]): number {
  if (!s) return order.length + 1;
  const i = order.findIndex((x) => x.toLowerCase() === s.toLowerCase());
  return i === -1 ? order.length : i;
}

function cmp(a: Ticket, b: Ticket, sprintOrder: string[]): number {
  if (a.archived !== b.archived) return a.archived ? 1 : -1;
  const sa = sprintRankOf(a.sprint, sprintOrder);
  const sb = sprintRankOf(b.sprint, sprintOrder);
  if (sa !== sb) return sa - sb;
  const pa = PRIORITY_RANK[a.priority ?? "P4"] ?? 5;
  const pb = PRIORITY_RANK[b.priority ?? "P4"] ?? 5;
  if (pa !== pb) return pa - pb;
  return a.first_seen.localeCompare(b.first_seen);
}

export default function LedgerPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [sprintOrder, setSprintOrder] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [filterSprint, setFilterSprint] = useState("");
  const [filterAssignee, setFilterAssignee] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "archived">("all");
  const [search, setSearch] = useState("");

  const refresh = async () => {
    const r = await fetch("/api/tickets");
    const d = await r.json();
    setTickets(d.tickets ?? []);
    setSprintOrder(d.sprints ?? []);
    setLastFetched(new Date());
  };

  useEffect(() => {
    setLoading(true);
    refresh().finally(() => setLoading(false));
    // Live: refresh every 60 seconds so the page stays current.
    const t = setInterval(refresh, 60_000);
    return () => clearInterval(t);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tickets
      .filter((t) => {
        if (filterSprint && (t.sprint ?? "") !== filterSprint) return false;
        if (filterAssignee && t.assigned_to !== filterAssignee) return false;
        if (filterPriority && (t.priority ?? "P4") !== filterPriority) return false;
        if (filterStatus === "active" && t.archived) return false;
        if (filterStatus === "archived" && !t.archived) return false;
        if (q && !`${t.task_name} ${t.task_gid} ${t.dev_status ?? ""} ${t.assigned_to}`.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => cmp(a, b, sprintOrder));
  }, [tickets, sprintOrder, filterSprint, filterAssignee, filterPriority, filterStatus, search]);

  const uniqueAssignees = useMemo(
    () => [...new Set(tickets.map((t) => t.assigned_to).filter(Boolean))].sort(),
    [tickets],
  );
  const uniqueSprints = useMemo(
    () => [...new Set(tickets.map((t) => t.sprint).filter(Boolean) as string[])].sort(),
    [tickets],
  );

  return (
    <main style={{ maxWidth: 1400, margin: "0 auto", padding: "32px 24px 64px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" }}>Live ticket sheet</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-3)" }}>
            {filtered.length} of {tickets.length} tickets · auto-refresh every 60s ·{" "}
            {lastFetched ? `updated ${lastFetched.toLocaleTimeString()}` : "loading…"}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <a href="/" className="btn btn-secondary">← Dashboard</a>
          <button onClick={refresh} className="btn btn-secondary">↻ Refresh</button>
          <a href="/api/download" className="btn btn-primary">⤓ Download xlsx</a>
        </div>
      </header>

      <div className="card" style={{ padding: 12, marginBottom: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="text"
          placeholder="Search task name / id / status / person…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: "1 1 280px", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border-strong)", fontSize: 13 }}
        />
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as any)} className="qa-select">
          <option value="all">All status</option>
          <option value="active">Active only</option>
          <option value="archived">Archived only</option>
        </select>
        <select value={filterSprint} onChange={(e) => setFilterSprint(e.target.value)} className="qa-select">
          <option value="">All sprints</option>
          {uniqueSprints.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterAssignee} onChange={(e) => setFilterAssignee(e.target.value)} className="qa-select">
          <option value="">All assignees</option>
          {uniqueAssignees.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} className="qa-select">
          <option value="">All priorities</option>
          {["P1", "P2", "P3", "P4"].map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="muted">No tickets match the current filters.</p>
      ) : (
        <div className="table-wrap">
          <div style={{ overflowX: "auto", maxHeight: "calc(100vh - 260px)" }}>
            <table className="qa">
              <thead>
                <tr>
                  <th style={{ width: 56 }}>Pri</th>
                  <th style={{ width: 90 }}>Status</th>
                  <th style={{ width: 120 }}>Assigned</th>
                  <th>Task</th>
                  <th style={{ width: 220 }}>Dev Status</th>
                  <th style={{ width: 100 }}>Sprint</th>
                  <th style={{ width: 120 }}>Original</th>
                  <th style={{ width: 100 }}>Due</th>
                  <th style={{ width: 100 }}>First seen</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => {
                  const p = t.priority ?? "P4";
                  return (
                    <tr key={t.task_gid} style={{ opacity: t.archived ? 0.55 : 1 }}>
                      <td><span className={`badge badge-${p.toLowerCase()}`}>{p}</span></td>
                      <td>
                        {t.archived ? (
                          <span className="badge" style={{ background: "#f3f4f6", color: "#6b7280", borderColor: "#e5e7eb" }}>
                            Archived
                          </span>
                        ) : (
                          <span className="badge" style={{ background: "#dcfce7", color: "#166534", borderColor: "#bbf7d0" }}>
                            {t.asana_status ?? "open"}
                          </span>
                        )}
                      </td>
                      <td>
                        <span style={{ fontWeight: 500 }}>{t.assigned_to}</span>
                        {t.manual_override && (
                          <span className="badge" style={{ marginLeft: 6, background: "#fff7d6", color: "#854d0e", borderColor: "#fde68a", fontSize: 10 }}>
                            manual
                          </span>
                        )}
                      </td>
                      <td>
                        <div style={{ fontWeight: 500 }}>
                          {t.task_url ? <a href={t.task_url} target="_blank" rel="noreferrer">{t.task_name}</a> : t.task_name}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-3)" }}>{t.task_gid}</div>
                      </td>
                      <td style={{ color: "var(--text-2)" }}>{t.dev_status ?? "—"}</td>
                      <td>{t.sprint ? <span className="chip" style={{ padding: "2px 8px", fontSize: 11 }}>{t.sprint}</span> : <span className="muted">—</span>}</td>
                      <td style={{ color: "var(--text-2)" }}>{t.original_assignee ?? "—"}</td>
                      <td style={{ color: "var(--text-2)" }}>{t.due_on ?? "—"}</td>
                      <td style={{ color: "var(--text-3)" }}>{new Date(t.first_seen).toLocaleDateString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
}
