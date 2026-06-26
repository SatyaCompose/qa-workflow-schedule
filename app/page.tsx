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
  override_at: string | null;
  priority: Priority;
  dev_status: string | null;
  sprint: string | null;
};

type Target = { gid: string; name: string };

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
  updated_at: string;
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

function lastMonths(n: number): string[] {
  const now = new Date();
  const istNow = new Date(now.getTime() + (5 * 60 + 30) * 60_000);
  const months: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth() - i, 1));
    months.push(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
    );
  }
  return months;
}

const PRIORITY_RANK: Record<string, number> = { P1: 1, P2: 2, P3: 3, P4: 4 };

function sprintRankOf(sprintName: string | null, sprintOrder: string[]): number {
  if (!sprintName) return sprintOrder.length + 1;
  const idx = sprintOrder.findIndex((s) => s.toLowerCase() === sprintName.toLowerCase());
  return idx === -1 ? sprintOrder.length : idx;
}

function makeComparator(sprintOrder: string[]) {
  return (a: Ticket, b: Ticket): number => {
    // Older sprint always wins — even over a higher QA priority in a newer sprint.
    const sa = sprintRankOf(a.sprint, sprintOrder);
    const sb = sprintRankOf(b.sprint, sprintOrder);
    if (sa !== sb) return sa - sb;
    // Within the same sprint: P1 → P4.
    const pa = PRIORITY_RANK[a.priority ?? "P4"] ?? 5;
    const pb = PRIORITY_RANK[b.priority ?? "P4"] ?? 5;
    if (pa !== pb) return pa - pb;
    // Then: nearest due date first; null dues last.
    const da = a.due_on ? new Date(a.due_on).getTime() : Infinity;
    const db = b.due_on ? new Date(b.due_on).getTime() : Infinity;
    if (da !== db) return da - db;
    return a.first_seen.localeCompare(b.first_seen);
  };
}

const PRIORITY_STYLE: Record<string, { bg: string; fg: string }> = {
  P1: { bg: "#fde2e2", fg: "#9b1c1c" },
  P2: { bg: "#fef3c7", fg: "#92400e" },
  P3: { bg: "#dbeafe", fg: "#1e3a8a" },
  P4: { bg: "#f3f4f6", fg: "#374151" },
};

export default function Page() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [targets, setTargets] = useState<Target[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [sprintOrder, setSprintOrder] = useState<string[]>([]);
  const [lastRun, setLastRun] = useState<Run | null>(null);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(lastMonths(1)[0]);
  const monthOptions = useMemo(() => lastMonths(12), []);

  const refresh = async () => {
    const r = await fetch("/api/tickets");
    const d = await r.json();
    setTickets(d.tickets ?? []);
    setTargets(d.targets ?? []);
    setTeam(d.teamStatus ?? []);
    setSprintOrder(d.sprints ?? []);
    setLastRun(d.lastRun ?? null);
  };

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  const cmp = useMemo(() => makeComparator(sprintOrder), [sprintOrder]);
  const active = tickets.filter((t) => !t.archived).sort(cmp);
  const archived = tickets.filter((t) => t.archived).sort(cmp);
  const byTarget = active.reduce<Record<string, number>>((acc, t) => {
    acc[t.assigned_to] = (acc[t.assigned_to] ?? 0) + 1;
    return acc;
  }, {});
  const byPriority = active.reduce<Record<string, number>>((acc, t) => {
    const p = t.priority ?? "P4";
    acc[p] = (acc[p] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <main style={{ maxWidth: 1300, margin: "32px auto", padding: "0 16px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>QA Work Allotment</h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label style={{ fontSize: 13, color: "#555" }}>Month:</label>
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid #ddd" }}
          >
            {monthOptions.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <a
            href={`/api/download?month=${month}`}
            style={{ background: "#111", color: "#fff", padding: "8px 14px", borderRadius: 8, textDecoration: "none", fontSize: 14 }}
          >
            Download {month}.xlsx
          </a>
        </div>
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
        <h2 style={{ fontSize: 18 }}>Team status</h2>
        <TeamStatusPanel team={team} onChanged={refresh} />
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 18 }}>Active assignments ({active.length})</h2>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          {(["P1", "P2", "P3", "P4"] as const).map((p) => (
            <PriorityChip key={p} priority={p} count={byPriority[p] ?? 0} />
          ))}
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
          {Object.entries(byTarget).map(([name, count]) => (
            <div key={name} style={{ background: "#fff", padding: "8px 14px", borderRadius: 8, border: "1px solid #e5e5e5" }}>
              <strong>{name}</strong>: {count}
            </div>
          ))}
        </div>

        <Table rows={active} targets={targets} loading={loading} onReassigned={refresh} canReassign />
      </section>

      <section style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 18 }}>Archived ({archived.length})</h2>
        <Table rows={archived} targets={targets} loading={loading} onReassigned={refresh} canReassign={false} />
      </section>
    </main>
  );
}

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  available: { bg: "#dcfce7", fg: "#166534" },
  regression: { bg: "#fef3c7", fg: "#92400e" },
  leave: { bg: "#fee2e2", fg: "#991b1b" },
};

function TeamStatusPanel({ team, onChanged }: { team: TeamMember[]; onChanged: () => void }) {
  const [editing, setEditing] = useState<string | null>(null);

  if (team.length === 0) return null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, marginBottom: 16 }}>
      {team.map((m) => {
        const s = STATUS_STYLE[m.status] ?? STATUS_STYLE.available;
        const usePct = m.capacity > 0 ? Math.min(100, Math.round((m.active / m.capacity) * 100)) : 0;
        return (
          <div key={m.name} style={{ background: "#fff", border: "1px solid #e5e5e5", borderRadius: 8, padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong>{m.name}</strong>
              <span style={{ background: s.bg, color: s.fg, padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
                {m.status}
              </span>
            </div>
            <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
              {m.hours}h available · capacity {m.capacity} tickets
            </div>
            <div style={{ marginTop: 8, background: "#f3f4f6", borderRadius: 4, height: 6, overflow: "hidden" }}>
              <div style={{ width: `${usePct}%`, height: "100%", background: usePct >= 100 ? "#dc2626" : usePct >= 80 ? "#f59e0b" : "#10b981" }} />
            </div>
            <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
              {m.active} active / {m.capacity} cap ({usePct}%)
            </div>
            <div style={{ fontSize: 12, color: "#374151", marginTop: 8, display: "flex", gap: 12 }}>
              <span>✓ today: <b>{m.completedToday}</b></span>
              <span>this month: <b>{m.completedMonth}</b></span>
              <span>total: <b>{m.completedTotal}</b></span>
            </div>
            {m.notes && <div style={{ fontSize: 12, color: "#777", marginTop: 6, fontStyle: "italic" }}>{m.notes}</div>}
            <button
              onClick={() => setEditing(m.name)}
              style={{ marginTop: 10, background: "#111", color: "#fff", border: 0, padding: "6px 10px", borderRadius: 6, fontSize: 12, cursor: "pointer" }}
            >
              Edit status
            </button>
          </div>
        );
      })}
      {editing && <StatusEditor member={team.find((m) => m.name === editing)!} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChanged(); }} />}
    </div>
  );
}

function StatusEditor({
  member, onClose, onSaved,
}: { member: TeamMember; onClose: () => void; onSaved: () => void }) {
  const [status, setStatus] = useState(member.status);
  const [hours, setHours] = useState(member.hours);
  const [notes, setNotes] = useState(member.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/target-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: member.name, status, hours, notes: notes || null }),
      });
      if (res.status === 401) setError("Auth required. Refresh and try again.");
      else if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setError(b.error ?? `HTTP ${res.status}`);
      } else onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 8, padding: 20, width: 360, maxWidth: "90vw" }}>
        <h3 style={{ margin: "0 0 12px" }}>Edit: {member.name}</h3>
        <label style={{ display: "block", fontSize: 13, marginBottom: 4 }}>Status</label>
        <select value={status} onChange={(e) => {
          const v = e.target.value as TeamMember["status"];
          setStatus(v);
          if (v === "leave") setHours(0);
          else if (v === "available") setHours(8);
        }} style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ddd", marginBottom: 12 }}>
          <option value="available">Available</option>
          <option value="regression">Regression</option>
          <option value="leave">Leave</option>
        </select>
        <label style={{ display: "block", fontSize: 13, marginBottom: 4 }}>Hours available (0–8)</label>
        <input type="number" min={0} max={8} value={hours} onChange={(e) => setHours(parseInt(e.target.value || "0", 10))}
               disabled={status === "leave" || status === "available"}
               style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ddd", marginBottom: 12 }} />
        <label style={{ display: "block", fontSize: 13, marginBottom: 4 }}>Notes (optional)</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                  style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ddd", marginBottom: 12, resize: "vertical" }} />
        {error && <div style={{ color: "#c00", fontSize: 12, marginBottom: 8 }}>{error}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose} disabled={saving} style={{ padding: "8px 14px", borderRadius: 6, border: "1px solid #ddd", background: "#fff", cursor: "pointer" }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ padding: "8px 14px", borderRadius: 6, border: 0, background: "#111", color: "#fff", cursor: "pointer" }}>{saving ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

function PriorityChip({ priority, count }: { priority: "P1" | "P2" | "P3" | "P4"; count: number }) {
  const s = PRIORITY_STYLE[priority];
  return (
    <div style={{ background: s.bg, color: s.fg, padding: "8px 14px", borderRadius: 8, fontWeight: 600 }}>
      {priority}: {count}
    </div>
  );
}

function PriorityBadge({ priority }: { priority: Priority }) {
  const p = priority ?? "P4";
  const s = PRIORITY_STYLE[p];
  return (
    <span style={{ background: s.bg, color: s.fg, padding: "2px 8px", borderRadius: 4, fontSize: 12, fontWeight: 700 }}>
      {p}
    </span>
  );
}

function Table({
  rows, targets, loading, onReassigned, canReassign,
}: {
  rows: Ticket[]; targets: Target[]; loading: boolean; onReassigned: () => void; canReassign: boolean;
}) {
  if (loading) return <p>Loading…</p>;
  if (rows.length === 0) return <p style={{ color: "#666" }}>No tickets.</p>;
  return (
    <div style={{ overflowX: "auto", background: "#fff", borderRadius: 8, border: "1px solid #e5e5e5" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}>
        <thead style={{ background: "#fafafa" }}>
          <tr>
            <Th>Pri</Th>
            <Th>Task</Th>
            <Th>Dev Status</Th>
            <Th>Assigned To</Th>
            <Th>Original</Th>
            <Th>Sprint</Th>
            <Th>Due</Th>
            <Th>First Seen</Th>
            {canReassign && <Th>Reassign</Th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <Row key={t.task_gid} t={t} targets={targets} canReassign={canReassign} onReassigned={onReassigned} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({
  t, targets, canReassign, onReassigned,
}: {
  t: Ticket; targets: Target[]; canReassign: boolean; onReassigned: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reassign = async (target_gid: string) => {
    if (target_gid === t.assigned_to_gid) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/reassign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ task_gid: t.task_gid, target_gid }),
      });
      if (res.status === 401) {
        setError("Auth required — refresh and try again.");
      } else if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `HTTP ${res.status}`);
      } else {
        onReassigned();
      }
    } catch (e: any) {
      setError(e?.message ?? "Network error");
    } finally {
      setPending(false);
    }
  };

  return (
    <tr style={{ borderTop: "1px solid #eee", opacity: pending ? 0.5 : 1 }}>
      <Td><PriorityBadge priority={t.priority} /></Td>
      <Td>
        {t.task_url ? (
          <a href={t.task_url} target="_blank" rel="noreferrer">{t.task_name}</a>
        ) : (
          t.task_name
        )}
      </Td>
      <Td style={{ color: "#555", fontSize: 13 }}>{t.dev_status ?? "—"}</Td>
      <Td>
        {t.assigned_to}
        {t.manual_override && (
          <span style={{ marginLeft: 6, fontSize: 11, color: "#a67500", background: "#fff7d6", padding: "1px 6px", borderRadius: 4 }}>
            manual
          </span>
        )}
      </Td>
      <Td>{t.original_assignee ?? "—"}</Td>
      <Td style={{ color: "#555", fontSize: 13 }}>{t.sprint ?? "—"}</Td>
      <Td>{t.due_on ?? "—"}</Td>
      <Td>{new Date(t.first_seen).toLocaleDateString()}</Td>
      {canReassign && (
        <Td>
          <select
            value={t.assigned_to_gid}
            disabled={pending}
            onChange={(e) => reassign(e.target.value)}
            style={{ padding: "4px 6px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13 }}
          >
            {targets.map((tg) => (
              <option key={tg.gid} value={tg.gid}>{tg.name}</option>
            ))}
          </select>
          {error && <div style={{ color: "#c00", fontSize: 12, marginTop: 4 }}>{error}</div>}
        </Td>
      )}
    </tr>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 600 }}>{children}</th>;
}
function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <td style={{ padding: "10px 12px", verticalAlign: "top", ...style }}>{children}</td>;
}
