"use client";

import { useEffect, useMemo, useState } from "react";

// lastMonths removed — month picker no longer used on the home page.

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

const PRIORITY_RANK: Record<string, number> = { P1: 1, P2: 2, P3: 3, P4: 4 };

function sprintRankOf(sprintName: string | null, sprintOrder: string[]): number {
  if (!sprintName) return sprintOrder.length + 1;
  const idx = sprintOrder.findIndex((s) => s.toLowerCase() === sprintName.toLowerCase());
  return idx === -1 ? sprintOrder.length : idx;
}

function makeComparator(sprintOrder: string[]) {
  return (a: Ticket, b: Ticket): number => {
    const sa = sprintRankOf(a.sprint, sprintOrder);
    const sb = sprintRankOf(b.sprint, sprintOrder);
    if (sa !== sb) return sa - sb;
    const pa = PRIORITY_RANK[a.priority ?? "P4"] ?? 5;
    const pb = PRIORITY_RANK[b.priority ?? "P4"] ?? 5;
    if (pa !== pb) return pa - pb;
    const da = a.due_on ? new Date(a.due_on).getTime() : Infinity;
    const db = b.due_on ? new Date(b.due_on).getTime() : Infinity;
    if (da !== db) return da - db;
    return a.first_seen.localeCompare(b.first_seen);
  };
}

export default function Page() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [targets, setTargets] = useState<Target[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [sprintOrder, setSprintOrder] = useState<string[]>([]);
  const [lastRun, setLastRun] = useState<Run | null>(null);
  const [loading, setLoading] = useState(true);

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

  const byPriority = active.reduce<Record<string, number>>((acc, t) => {
    const p = t.priority ?? "P4";
    acc[p] = (acc[p] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <main style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 24px 64px" }}>
      <Header lastRun={lastRun} />

      <Section title="Team status">
        <TeamStatusPanel team={team} onChanged={refresh} />
      </Section>

      <Section
        title={`Active assignments (${active.length})`}
        right={<PriorityCounts byPriority={byPriority} />}
      >
        <Table rows={active} targets={targets} loading={loading} onReassigned={refresh} canReassign />
      </Section>
    </main>
  );
}

function Header({ lastRun }: { lastRun: Run | null }) {
  return (
    <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em" }}>
          QA Work Allotment
        </h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-3)" }}>
          {lastRun ? (
            <>
              Last sync {new Date(lastRun.started_at).toLocaleString()} ·{" "}
              <span style={{ color: lastRun.ok === true ? "#15803d" : lastRun.ok === false ? "#b91c1c" : "var(--text-3)" }}>
                {lastRun.ok === true
                  ? `OK · seen ${lastRun.seen_count} · new ${lastRun.new_count} · archived ${lastRun.archived_count}`
                  : lastRun.ok === false
                  ? `Failed: ${lastRun.error}`
                  : "running…"}
              </span>
            </>
          ) : (
            "No syncs recorded yet."
          )}
        </p>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <a href="/ledger" className="btn btn-secondary">📊 Live sheet</a>
        <a href="/api/download" className="btn btn-primary">⤓ Download xlsx</a>
      </div>
    </header>
  );
}

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 32 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 16, flexWrap: "wrap" }}>
        <h2 className="section-title" style={{ margin: 0 }}>{title}</h2>
        {right && <div>{right}</div>}
      </div>
      {children}
    </section>
  );
}

function PriorityCounts({ byPriority }: { byPriority: Record<string, number> }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      {(["P1", "P2", "P3", "P4"] as const).map((p) => (
        <div key={p} className={`badge badge-${p.toLowerCase()}`} style={{ padding: "4px 10px", fontSize: 12 }}>
          {p}: {byPriority[p] ?? 0}
        </div>
      ))}
    </div>
  );
}

const STATUS_STYLE: Record<string, { bg: string; fg: string; border: string }> = {
  available:  { bg: "#dcfce7", fg: "#166534", border: "#bbf7d0" },
  regression: { bg: "#fef3c7", fg: "#854d0e", border: "#fde68a" },
  leave:      { bg: "#fee2e2", fg: "#991b1b", border: "#fecaca" },
};

function TeamStatusPanel({ team, onChanged }: { team: TeamMember[]; onChanged: () => void }) {
  const [editing, setEditing] = useState<string | null>(null);

  if (team.length === 0) return <p className="muted">No team configured.</p>;

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
        {team.map((m) => {
          const s = STATUS_STYLE[m.status] ?? STATUS_STYLE.available;
          const usePct = m.capacity > 0 ? Math.min(100, Math.round((m.active / m.capacity) * 100)) : 0;
          const barClass = usePct >= 100 ? "bar-danger" : usePct >= 80 ? "bar-warn" : "bar-ok";
          return (
            <div key={m.name} className="card" style={{ padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{m.name}</div>
                <span style={{ background: s.bg, color: s.fg, border: `1px solid ${s.border}`, padding: "2px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  {m.status}
                </span>
              </div>
              <div style={{ marginTop: 4, fontSize: 12, color: "var(--text-3)" }}>
                {m.hours}h · capacity {m.capacity} tickets
              </div>

              <div className="bar" style={{ marginTop: 12 }}>
                <span className={barClass} style={{ width: `${usePct}%` }} />
              </div>
              <div style={{ marginTop: 4, display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-3)" }}>
                <span>{m.active} / {m.capacity}</span>
                <span>{usePct}%</span>
              </div>

              <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, textAlign: "center" }}>
                <Stat label="Today" value={m.completedToday} />
                <Stat label="Month" value={m.completedMonth} />
                <Stat label="Total" value={m.completedTotal} />
              </div>

              {m.notes && (
                <div style={{ marginTop: 10, padding: "8px 10px", background: "#fafafa", borderRadius: 6, fontSize: 12, color: "var(--text-2)", fontStyle: "italic" }}>
                  {m.notes}
                </div>
              )}

              <button
                onClick={() => setEditing(m.name)}
                className="btn btn-secondary"
                style={{ marginTop: 12, width: "100%", justifyContent: "center" }}
              >
                Edit
              </button>
            </div>
          );
        })}
      </div>
      {editing && (
        <StatusEditor
          member={team.find((m) => m.name === editing)!}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); onChanged(); }}
        />
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ background: "#fafbfc", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 4px" }}>
      <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>{label}</div>
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
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ padding: 24, width: 400, maxWidth: "100%", boxShadow: "0 20px 40px rgba(0,0,0,0.2)" }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 600 }}>Edit {member.name}</h3>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--text-3)" }}>Update availability and capacity</p>

        <Label>Status</Label>
        <select
          value={status}
          onChange={(e) => {
            const v = e.target.value as TeamMember["status"];
            setStatus(v);
            if (v === "leave") setHours(0);
            else if (v === "available") setHours(8);
          }}
          className="qa-select"
          style={{ width: "100%", marginBottom: 14 }}
        >
          <option value="available">Available</option>
          <option value="regression">Regression</option>
          <option value="leave">Leave</option>
        </select>

        <Label>Hours available (0–8)</Label>
        <input
          type="number" min={0} max={8} value={hours}
          onChange={(e) => setHours(parseInt(e.target.value || "0", 10))}
          disabled={status === "leave" || status === "available"}
          style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border-strong)", marginBottom: 14, fontSize: 14 }}
        />

        <Label>Notes (optional)</Label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="e.g. Half day, doctor's appointment"
          style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border-strong)", marginBottom: 14, fontSize: 14, resize: "vertical" }}
        />

        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", padding: "8px 12px", borderRadius: 8, fontSize: 13, marginBottom: 12 }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
          <button onClick={onClose} disabled={saving} className="btn btn-secondary">Cancel</button>
          <button onClick={save} disabled={saving} className="btn btn-primary">
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-2)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>
      {children}
    </label>
  );
}

function Table({
  rows, targets, loading, onReassigned, canReassign,
}: {
  rows: Ticket[]; targets: Target[]; loading: boolean; onReassigned: () => void; canReassign: boolean;
}) {
  if (loading) return <p className="muted">Loading…</p>;
  if (rows.length === 0) return <p className="muted">No tickets.</p>;
  return (
    <div className="table-wrap">
      <div style={{ overflowX: "auto" }}>
        <table className="qa">
          <thead>
            <tr>
              <th style={{ width: 56 }}>Pri</th>
              <th>Task</th>
              <th style={{ width: 200 }}>Dev Status</th>
              <th style={{ width: 140 }}>Assigned</th>
              <th style={{ width: 140 }}>Original</th>
              <th style={{ width: 100 }}>Sprint</th>
              <th style={{ width: 100 }}>Due</th>
              {canReassign && <th style={{ width: 160 }}>Reassign</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <Row key={t.task_gid} t={t} targets={targets} canReassign={canReassign} onReassigned={onReassigned} />
            ))}
          </tbody>
        </table>
      </div>
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
      if (res.status === 401) setError("Auth required.");
      else if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `HTTP ${res.status}`);
      } else onReassigned();
    } catch (e: any) {
      setError(e?.message ?? "Network error");
    } finally {
      setPending(false);
    }
  };

  const p = t.priority ?? "P4";

  return (
    <tr style={{ opacity: pending ? 0.5 : 1 }}>
      <td>
        <span className={`badge badge-${p.toLowerCase()}`}>{p}</span>
      </td>
      <td>
        <div style={{ fontWeight: 500, lineHeight: 1.35 }}>
          {t.task_url ? (
            <a href={t.task_url} target="_blank" rel="noreferrer">{t.task_name}</a>
          ) : (
            t.task_name
          )}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
          first seen {new Date(t.first_seen).toLocaleDateString()}
        </div>
      </td>
      <td style={{ color: "var(--text-2)" }}>{t.dev_status ?? "—"}</td>
      <td>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 500 }}>{t.assigned_to}</span>
          {t.manual_override && (
            <span className="badge" style={{ background: "#fff7d6", color: "#854d0e", borderColor: "#fde68a", fontSize: 10 }}>
              manual
            </span>
          )}
        </div>
      </td>
      <td style={{ color: "var(--text-2)" }}>{t.original_assignee ?? "—"}</td>
      <td>
        {t.sprint ? (
          <span className="chip" style={{ padding: "2px 8px", fontSize: 11 }}>{t.sprint}</span>
        ) : (
          <span className="muted">—</span>
        )}
      </td>
      <td style={{ color: "var(--text-2)" }}>{t.due_on ?? "—"}</td>
      {canReassign && (
        <td>
          <select
            value={t.assigned_to_gid}
            disabled={pending}
            onChange={(e) => reassign(e.target.value)}
            className="qa-select"
          >
            {targets.map((tg) => (
              <option key={tg.gid} value={tg.gid}>{tg.name}</option>
            ))}
          </select>
          {error && <div style={{ color: "#b91c1c", fontSize: 11, marginTop: 4 }}>{error}</div>}
        </td>
      )}
    </tr>
  );
}
