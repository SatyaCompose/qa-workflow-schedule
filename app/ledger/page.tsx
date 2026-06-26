"use client";

import { Fragment, useEffect, useMemo, useState } from "react";

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

type TeamMember = {
  name: string;
  gid: string;
  status: "available" | "regression" | "leave";
  hours: number;
  notes: string | null;
  capacity: number;
  active: number;
  completedToday: number;
  completedMonth: number;
  completedTotal: number;
};

const PRIORITY_RANK: Record<string, number> = { P1: 1, P2: 2, P3: 3, P4: 4 };

function sprintRankOf(s: string | null, order: string[]): number {
  if (!s) return Number.MAX_SAFE_INTEGER;
  if (order.length > 0) {
    const i = order.findIndex((x) => x.toLowerCase() === s.toLowerCase());
    if (i !== -1) return i;
  }
  const m = s.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER - 1;
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
  const [team, setTeam] = useState<TeamMember[]>([]);
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
    setTeam(d.teamStatus ?? []);
    setSprintOrder(d.sprints ?? []);
    setLastFetched(new Date());
  };

  useEffect(() => {
    setLoading(true);
    refresh().finally(() => setLoading(false));
    const t = setInterval(refresh, 60_000);
    return () => clearInterval(t);
  }, []);

  // ─── Top-level counts ──────────────────────────────────────────────────
  const active = useMemo(() => tickets.filter((t) => !t.archived), [tickets]);
  const archived = useMemo(() => tickets.filter((t) => t.archived), [tickets]);
  const byPriority = useMemo(() => {
    const m: Record<string, number> = { P1: 0, P2: 0, P3: 0, P4: 0 };
    for (const t of active) {
      const p = t.priority ?? "P4";
      m[p] = (m[p] ?? 0) + 1;
    }
    return m;
  }, [active]);

  const totalCompletedMonth = team.reduce((s, m) => s + m.completedMonth, 0);
  const totalCompletedToday = team.reduce((s, m) => s + m.completedToday, 0);
  const totalCompletedAll = team.reduce((s, m) => s + m.completedTotal, 0);

  // ─── Filtered detail table ─────────────────────────────────────────────
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
      <header className="ledger-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" }}>Live ticket sheet</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-3)" }}>
            Auto-refreshes every 60s · {lastFetched ? `updated ${lastFetched.toLocaleTimeString()}` : "loading…"}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <a href="/" className="btn btn-secondary">← Dashboard</a>
          <a href="/help" className="btn btn-secondary">? Help</a>
          <button onClick={refresh} className="btn btn-secondary">↻ Refresh</button>
          <a href="/api/download" className="btn btn-primary">⤓ Download xlsx</a>
        </div>
      </header>

      {/* ─── Overview tiles ───────────────────────────────────────────── */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
        <Tile label="Pending (active)" value={active.length} accent="#1d4ed8" />
        <Tile label="P1" value={byPriority.P1} accent="#b91c1c" />
        <Tile label="P2" value={byPriority.P2} accent="#a16207" />
        <Tile label="P3" value={byPriority.P3} accent="#1e40af" />
        <Tile label="P4" value={byPriority.P4} accent="#374151" />
        <Tile label="Archived (history)" value={archived.length} accent="#6b7280" />
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 28 }}>
        <Tile label="Completed today" value={totalCompletedToday} accent="#15803d" />
        <Tile label="Completed this month" value={totalCompletedMonth} accent="#0e7490" />
        <Tile label="Completed all-time" value={totalCompletedAll} accent="#1f2937" />
      </section>

      {/* ─── QA performance ───────────────────────────────────────────── */}
      <h2 className="section-title" style={{ margin: "0 0 12px" }}>QA performance</h2>
      <QAPerformanceTable team={team} tickets={active} />

      {/* ─── Filters + detail table ───────────────────────────────────── */}
      <h2 className="section-title" style={{ margin: "28px 0 12px" }}>All tickets ({filtered.length} shown)</h2>

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
        <DetailTable rows={filtered} />
      )}
    </main>
  );
}

function Tile({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="card" style={{ padding: 14, borderLeft: `4px solid ${accent}` }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.1, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function QAPerformanceTable({ team, tickets }: { team: TeamMember[]; tickets: Ticket[] }) {
  // Per-person breakdown of currently active tickets by priority
  const byPerson: Record<string, Record<string, number>> = {};
  for (const m of team) byPerson[m.name] = { P1: 0, P2: 0, P3: 0, P4: 0 };
  for (const t of tickets) {
    const p = t.priority ?? "P4";
    if (!byPerson[t.assigned_to]) byPerson[t.assigned_to] = { P1: 0, P2: 0, P3: 0, P4: 0 };
    byPerson[t.assigned_to][p] = (byPerson[t.assigned_to][p] ?? 0) + 1;
  }

  if (team.length === 0) return <p className="muted">No team configured.</p>;

  return (
    <div className="table-wrap">
      <div style={{ overflowX: "auto" }}>
        <table className="qa">
          <thead>
            <tr>
              <th>Person</th>
              <th style={{ width: 90 }}>Status</th>
              <th style={{ width: 90 }}>Capacity</th>
              <th style={{ width: 80 }}>Pending</th>
              <th style={{ width: 60 }}>P1</th>
              <th style={{ width: 60 }}>P2</th>
              <th style={{ width: 60 }}>P3</th>
              <th style={{ width: 60 }}>P4</th>
              <th style={{ width: 100 }}>✓ Today</th>
              <th style={{ width: 110 }}>✓ Month</th>
              <th style={{ width: 110 }}>✓ Total</th>
            </tr>
          </thead>
          <tbody>
            {team.map((m) => {
              const bp = byPerson[m.name] ?? { P1: 0, P2: 0, P3: 0, P4: 0 };
              const usePct = m.capacity > 0 ? Math.min(100, Math.round((m.active / m.capacity) * 100)) : 0;
              const barClass = usePct >= 100 ? "bar-danger" : usePct >= 80 ? "bar-warn" : "bar-ok";
              const sBg = m.status === "leave" ? "#fee2e2" : m.status === "regression" ? "#fef3c7" : "#dcfce7";
              const sFg = m.status === "leave" ? "#991b1b" : m.status === "regression" ? "#854d0e" : "#166534";
              return (
                <tr key={m.name}>
                  <td style={{ fontWeight: 600 }}>{m.name}</td>
                  <td>
                    <span style={{ background: sBg, color: sFg, padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      {m.status}
                    </span>
                  </td>
                  <td>
                    <div style={{ fontSize: 13 }}>{m.active} / {m.capacity}</div>
                    <div className="bar" style={{ marginTop: 4 }}>
                      <span className={barClass} style={{ width: `${usePct}%` }} />
                    </div>
                  </td>
                  <td style={{ fontWeight: 700 }}>{m.active}</td>
                  <td>{bp.P1 > 0 ? <span className="badge badge-p1">{bp.P1}</span> : <span className="muted">—</span>}</td>
                  <td>{bp.P2 > 0 ? <span className="badge badge-p2">{bp.P2}</span> : <span className="muted">—</span>}</td>
                  <td>{bp.P3 > 0 ? <span className="badge badge-p3">{bp.P3}</span> : <span className="muted">—</span>}</td>
                  <td>{bp.P4 > 0 ? <span className="badge badge-p4">{bp.P4}</span> : <span className="muted">—</span>}</td>
                  <td style={{ fontWeight: 600, color: "#15803d" }}>{m.completedToday}</td>
                  <td style={{ fontWeight: 600 }}>{m.completedMonth}</td>
                  <td style={{ fontWeight: 600, color: "var(--text-2)" }}>{m.completedTotal}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DetailTable({ rows }: { rows: Ticket[] }) {
  // Group rows by sprint, preserving input order.
  const groups: { sprint: string; rows: Ticket[] }[] = [];
  for (const t of rows) {
    const sprintLabel = t.archived ? "Archived" : (t.sprint ?? "No sprint");
    const last = groups[groups.length - 1];
    if (last && last.sprint === sprintLabel) last.rows.push(t);
    else groups.push({ sprint: sprintLabel, rows: [t] });
  }

  return (
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
            {groups.map((g) => (
              <Fragment key={g.sprint}>
                <tr className="sprint-group">
                  <td colSpan={9}>
                    {g.sprint}<span className="count">({g.rows.length})</span>
                  </td>
                </tr>
                {g.rows.map((t) => {
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
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
