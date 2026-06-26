export const metadata = {
  title: "How this works — QA Work Allotment",
};

export default function HelpPage() {
  return (
    <main style={{ maxWidth: 880, margin: "0 auto", padding: "32px 24px 64px", lineHeight: 1.6 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em" }}>How this works</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-3)" }}>
            Quick reference for terms and behaviour
          </p>
        </div>
        <a href="/" className="btn btn-secondary">← Dashboard</a>
      </header>

      <Card title="What the app does">
        <p>
          Every 15 minutes during IST working hours (06:00 – 22:00), the app reads tickets from Asana
          for the configured <b>sprint projects</b> assigned to the configured <b>source users</b>,
          splits them across the <b>3 target QAs</b>, and stores the result in Supabase.
          The dashboard shows the current state. Asana is <b>never written to</b>.
        </p>
      </Card>

      <Card title="QA Priority (P1 / P2 / P3 / P4)">
        <p>Derived from the Asana <b>"Development Status"</b> custom field:</p>
        <table className="help-table">
          <thead><tr><th>Dev Status</th><th>Priority</th><th>What it means</th></tr></thead>
          <tbody>
            <tr><td>Deployed in Staging - QA to verify</td><td><span className="badge badge-p1">P1</span></td><td>Highest — closest to production</td></tr>
            <tr><td>Deployed to UAT - QA to verify</td><td><span className="badge badge-p2">P2</span></td><td>Second priority</td></tr>
            <tr><td>Deployed in preview - QA verification</td><td><span className="badge badge-p3">P3</span></td><td>Third priority</td></tr>
            <tr><td>Anything else</td><td><span className="badge badge-p4">P4</span></td><td>Not yet QA-ready (or already moved past QA)</td></tr>
          </tbody>
        </table>
      </Card>

      <Card title="Sort order in tables and Excel">
        <ol>
          <li><b>Sprint age</b> — older sprint first. The order is taken from <code>ASANA_SPRINTS</code> (first listed = oldest). Sprint 12 always sits above Sprint 13.</li>
          <li><b>QA priority</b> within each sprint — P1 → P2 → P3 → P4.</li>
          <li>Due date (nearest first), then first-seen time.</li>
        </ol>
        <p className="muted">A P4 from an older sprint still ranks above a P1 from a newer sprint.</p>
      </Card>

      <Card title="How tickets get assigned (the splitter)">
        <p>For each ticket, the splitter picks an assignee using these rules <i>in priority order</i>:</p>
        <ol>
          <li><b>Manual override</b> wins forever — if you reassign on the dashboard, future syncs respect that.</li>
          <li><b>Asana-account lock</b> — if a target has an Asana GID (e.g. Anand) and the ticket is assigned to that person in Asana, it locks to that target. Bypassed if the target is on leave.</li>
          <li><b>Stability</b> — existing tickets keep their previous target. No reshuffling on every sync.</li>
          <li><b>Load balance</b> — brand new tickets go to whoever has the most remaining capacity. Targets on leave are skipped. Distribution happens in this order:
            <span className="example">Sprint 12 P1 → Sprint 12 P2 → Sprint 12 P3 → Sprint 12 P4 → Sprint 13 P1 → …</span>
            so the most-urgent work is spread across the team first.
          </li>
        </ol>
      </Card>

      <Card title="Status: Available / Regression / Leave">
        <table className="help-table">
          <thead><tr><th>Status</th><th>Effect</th></tr></thead>
          <tbody>
            <tr><td><b>Available</b></td><td>Full capacity (8h / day → ~10 tickets at 45 min each)</td></tr>
            <tr><td><b>Regression</b></td><td>Reduced hours (you choose 0–8). Capacity = hours × 60 / 45.</td></tr>
            <tr><td><b>Leave</b></td><td>0 capacity — gets no new tickets. Locks (e.g. Anand) are bypassed; their Asana tickets distribute to others.</td></tr>
          </tbody>
        </table>
        <p>Set status via <b>Edit</b> on each team-status card. Requires the admin password.</p>
      </Card>

      <Card title="Completed = +1 credit">
        <p>
          A <b>completion</b> is recorded when a ticket leaves a QA-verify state — meaning the assignee
          finished testing and the ticket moved on (sent back to dev for review or deployed forward).
        </p>
        <p>Specifically: the ticket's priority changes <i>away from</i> P1, P2, or P3 between syncs.</p>
        <p>
          Each QA phase the ticket passes through counts separately. Preview → UAT → Staging on the
          same ticket in one day = <b>3 credits</b>.
        </p>
      </Card>

      <Card title="Penalties = −1 credit">
        <p>
          If a <b>P1</b> ticket is still open (in <i>"Deployed in Staging - QA to verify"</i>) at
          <b> 22:00 IST</b> on a <b>weekday</b>, the assignee gets <b>−1 credit</b> for that ticket.
          One penalty per ticket per day max — if the same P1 stays open the next working day, it
          gets a fresh −1.
        </p>
        <p>
          <b>Saturdays and Sundays are excluded</b> — the team isn't expected to work, so no
          penalties fire on weekends.
        </p>
        <p>P2 and P3 don't trigger penalties — only P1.</p>
      </Card>

      <Card title="Archived = can't be tested right now">
        <p>A ticket becomes <b>archived</b> when it leaves the scope this app tracks. That happens when:</p>
        <ul>
          <li>It's reassigned in Asana to someone outside the source users</li>
          <li>It moves to a sprint that isn't configured</li>
          <li>It's marked completed in Asana</li>
          <li>It's deleted from Asana</li>
        </ul>
        <p>
          Archived tickets stay in the database forever (history is preserved) but are <b>not shown
          on the dashboard</b> — only the Ledger page and the Excel download show them, with greyed
          formatting.
        </p>
      </Card>

      <Card title="Manual reassignment">
        <p>
          The dropdown in the Reassign column on the dashboard moves a ticket to a different target.
          The first reassign per browser session prompts for HTTP Basic Auth — username can be blank
          or anything, password is the <code>ADMIN_PASSWORD</code> env var.
        </p>
        <p>
          Reassigned tickets show a <span className="badge" style={{ background: "#fff7d6", color: "#854d0e" }}>manual</span> badge
          and are kept on that person across future syncs.
        </p>
      </Card>

      <Card title="Excel download">
        <p>
          <b>⤓ Download xlsx</b> exports a single sheet with every ticket ever seen
          (active + archived). Columns include Priority, Status, Assigned, Task Name, Dev Status,
          Sprint, Original Assignee, Due, First Seen, Last Seen, Manual flag, Link.
        </p>
        <p>
          The header row has Excel's built-in filter buttons; archived rows are dimmed grey.
          Filename: <code>qa-allotment-YYYY-MM-DD.xlsx</code>.
        </p>
      </Card>

      <Card title="Sync schedule">
        <p>
          Runs every <b>15 minutes</b> during <b>06:00 – 22:00 IST</b>, all 7 days. Triggered by a
          GitHub Actions workflow that hits the Vercel endpoint.
        </p>
        <p>Outside that window, no syncs happen and the dashboard shows the last-seen state.</p>
      </Card>

      <style>{`
        .help-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 18px 22px;
          margin-bottom: 16px;
          box-shadow: 0 1px 2px rgba(16,24,40,0.04);
        }
        .help-card h2 {
          margin: 0 0 8px;
          font-size: 16px;
          font-weight: 600;
          color: var(--text);
        }
        .help-card p { margin: 6px 0; font-size: 14px; color: var(--text); }
        .help-card ul, .help-card ol { margin: 6px 0; padding-left: 22px; font-size: 14px; }
        .help-card code {
          background: #f3f4f6;
          padding: 1px 6px;
          border-radius: 4px;
          font-size: 12px;
          font-family: ui-monospace, "SF Mono", Menlo, monospace;
        }
        .help-table {
          border-collapse: collapse;
          width: 100%;
          margin: 8px 0;
          font-size: 13px;
        }
        .help-table th, .help-table td {
          padding: 8px 10px;
          border-bottom: 1px solid #f1f3f5;
          text-align: left;
          vertical-align: top;
        }
        .help-table th {
          font-weight: 600;
          color: var(--text-2);
          background: #fafbfc;
        }
        .example {
          display: block;
          margin: 6px 0 0;
          background: #f3f4f6;
          padding: 8px 12px;
          border-radius: 6px;
          font-size: 12.5px;
          font-family: ui-monospace, "SF Mono", Menlo, monospace;
          color: var(--text-2);
        }
      `}</style>
    </main>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="help-card">
      <h2>{title}</h2>
      {children}
    </div>
  );
}
