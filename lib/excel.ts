import ExcelJS from "exceljs";
import { SnapshotRow } from "./db";

const HEADER_FILL: ExcelJS.FillPattern = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFEFEFEF" },
};

const ASSIGNEE_FILL: ExcelJS.FillPattern = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFFF7CC" },
};

const PRIORITY_FILLS: Record<string, ExcelJS.FillPattern> = {
  P1: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDE2E2" } },
  P2: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } },
  P3: { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } },
  P4: { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } },
};

const PRIORITY_RANK: Record<string, number> = { P1: 1, P2: 2, P3: 3, P4: 4 };

function sprintRankOf(sprint: string | null, order: string[]): number {
  if (!sprint) return order.length + 1;
  const idx = order.findIndex((s) => s.toLowerCase() === sprint.toLowerCase());
  return idx === -1 ? order.length : idx;
}

function compareRows(sprintOrder: string[]) {
  return (a: SnapshotRow, b: SnapshotRow): number => {
    // Older sprint always wins — sprint age outranks QA priority.
    const sa = sprintRankOf(a.sprint, sprintOrder);
    const sb = sprintRankOf(b.sprint, sprintOrder);
    if (sa !== sb) return sa - sb;
    const pa = PRIORITY_RANK[a.priority ?? "P4"] ?? 5;
    const pb = PRIORITY_RANK[b.priority ?? "P4"] ?? 5;
    if (pa !== pb) return pa - pb;
    const da = a.due_on ? new Date(a.due_on).getTime() : Infinity;
    const db = b.due_on ? new Date(b.due_on).getTime() : Infinity;
    if (da !== db) return da - db;
    return a.task_gid.localeCompare(b.task_gid);
  };
}

// Build a monthly workbook with one worksheet per snapshot_date in the given
// rows. Sheets are ordered chronologically. Within each sheet, rows are
// grouped by assignee; within each assignee block, sorted by priority then
// sprint age.
export async function buildMonthlyWorkbook(
  month: string,
  snapshots: SnapshotRow[],
  sprintOrder: string[],
): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "QA Work Allotment";
  wb.created = new Date();

  const byDate = new Map<string, SnapshotRow[]>();
  for (const r of snapshots) {
    if (!byDate.has(r.snapshot_date)) byDate.set(r.snapshot_date, []);
    byDate.get(r.snapshot_date)!.push(r);
  }

  const dates = [...byDate.keys()].sort();

  if (dates.length === 0) {
    const ws = wb.addWorksheet(`${month} (no data)`);
    ws.addRow(["No snapshots recorded for this month yet."]);
  } else {
    for (const date of dates) {
      addDailySheet(wb, date, byDate.get(date)!, sprintOrder);
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  const src = buf as unknown as Uint8Array;
  const out = new Uint8Array(src.byteLength);
  out.set(src);
  return out.buffer;
}

function addDailySheet(
  wb: ExcelJS.Workbook,
  date: string,
  rows: SnapshotRow[],
  sprintOrder: string[],
) {
  const ws = wb.addWorksheet(date);
  ws.columns = [
    { header: "Priority",          key: "priority",          width: 8 },
    { header: "Assigned To",       key: "assigned_to",       width: 22 },
    { header: "Task ID",           key: "task_gid",          width: 22 },
    { header: "Task Name",         key: "task_name",         width: 50 },
    { header: "Dev Status",        key: "dev_status",        width: 32 },
    { header: "Sprint",            key: "sprint",            width: 14 },
    { header: "Original Assignee", key: "original_assignee", width: 22 },
    { header: "Status",            key: "asana_status",      width: 12 },
    { header: "Due",               key: "due_on",            width: 12 },
    { header: "Link",              key: "task_url",          width: 40 },
  ];

  const header = ws.getRow(1);
  header.font = { bold: true };
  header.alignment = { vertical: "middle" };
  header.eachCell((c) => (c.fill = HEADER_FILL));
  ws.views = [{ state: "frozen", ySplit: 1 }];

  // Group by assignee, alphabetical. Within each group, sort by priority+sprint.
  const groups = new Map<string, SnapshotRow[]>();
  for (const r of rows) {
    if (!groups.has(r.assigned_to)) groups.set(r.assigned_to, []);
    groups.get(r.assigned_to)!.push(r);
  }
  const assignees = [...groups.keys()].sort();
  const sortRows = compareRows(sprintOrder);

  for (const assignee of assignees) {
    const group = groups.get(assignee)!.sort(sortRows);
    const subheader = ws.addRow({ assigned_to: `${assignee} (${group.length})` });
    subheader.font = { bold: true };
    subheader.eachCell((c) => (c.fill = ASSIGNEE_FILL));

    for (const r of group) {
      const added = ws.addRow({
        priority: r.priority ?? "P4",
        assigned_to: r.assigned_to,
        task_gid: r.task_gid,
        task_name: r.task_name,
        dev_status: r.dev_status ?? "",
        sprint: r.sprint ?? "",
        original_assignee: r.original_assignee ?? "",
        asana_status: r.asana_status ?? "",
        due_on: r.due_on ?? "",
        task_url: r.task_url ?? "",
      });
      const p = r.priority ?? "P4";
      const fill = PRIORITY_FILLS[p];
      if (fill) added.getCell("priority").fill = fill;
    }
  }
}
