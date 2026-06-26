import ExcelJS from "exceljs";
import { TicketRow } from "./db";

export async function buildWorkbook(rows: TicketRow[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "QA Work Allotment";
  wb.created = new Date();

  const sheet = wb.addWorksheet("Assignments");
  sheet.columns = [
    { header: "Task ID",            key: "task_gid",          width: 22 },
    { header: "Task Name",          key: "task_name",         width: 50 },
    { header: "Assigned To",        key: "assigned_to",       width: 22 },
    { header: "Original Assignee",  key: "original_assignee", width: 22 },
    { header: "Status",             key: "status",            width: 12 },
    { header: "Due",                key: "due_on",            width: 12 },
    { header: "First Seen",         key: "first_seen",        width: 22 },
    { header: "Last Seen",          key: "last_seen",         width: 22 },
    { header: "Link",               key: "task_url",          width: 40 },
  ];

  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).alignment = { vertical: "middle" };
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  for (const r of rows) {
    sheet.addRow({
      task_gid: r.task_gid,
      task_name: r.task_name,
      assigned_to: r.assigned_to,
      original_assignee: r.original_assignee ?? "",
      status: r.archived ? "Archived" : r.asana_status ?? "open",
      due_on: r.due_on ?? "",
      first_seen: r.first_seen,
      last_seen: r.last_seen,
      task_url: r.task_url ?? "",
    });
  }

  const ab = await wb.xlsx.writeBuffer();
  return Buffer.from(ab);
}
