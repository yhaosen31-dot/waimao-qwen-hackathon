import { promises as fs } from "node:fs";
import path from "node:path";
import type { EmailDraft, LeadTask, LocalDatabase, TaskBundle, WorkflowRunResult } from "@/lib/types";

const dataDir = path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "db.json");

function emptyDb(): LocalDatabase {
  return {
    tasks: [],
    customers: [],
    drafts: [],
    updatedAt: new Date().toISOString()
  };
}

async function ensureDb() {
  await fs.mkdir(dataDir, { recursive: true });

  try {
    await fs.access(dbPath);
  } catch {
    await fs.writeFile(dbPath, JSON.stringify(emptyDb(), null, 2), "utf8");
  }
}

export async function readDb(): Promise<LocalDatabase> {
  await ensureDb();
  const content = await fs.readFile(dbPath, "utf8");
  return JSON.parse(content) as LocalDatabase;
}

export async function writeDb(db: LocalDatabase) {
  const nextDb = {
    ...db,
    updatedAt: new Date().toISOString()
  };

  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(dbPath, JSON.stringify(nextDb, null, 2), "utf8");
  return nextDb;
}

export async function resetDb() {
  return writeDb(emptyDb());
}

export async function persistWorkflowResult(result: WorkflowRunResult) {
  const db = await readDb();

  const taskIds = new Set([result.task.id]);
  const customerIds = new Set(result.customers.map((customer) => customer.id));
  const draftIds = new Set(result.drafts.map((draft) => draft.id));

  const nextDb: LocalDatabase = {
    tasks: [...db.tasks.filter((task) => !taskIds.has(task.id)), result.task],
    customers: [
      ...db.customers.filter((customer) => !customerIds.has(customer.id)),
      ...result.customers
    ],
    drafts: [...db.drafts.filter((draft) => !draftIds.has(draft.id)), ...result.drafts],
    updatedAt: new Date().toISOString()
  };

  return writeDb(nextDb);
}

export async function listTasks() {
  const db = await readDb();
  return db.tasks.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getTaskBundle(taskId: string): Promise<TaskBundle | null> {
  const db = await readDb();
  const task = db.tasks.find((item) => item.id === taskId);

  if (!task) return null;

  const customerIdSet = new Set(task.customerIds);
  const draftIdSet = new Set(task.draftIds);

  return {
    task,
    customers: db.customers.filter((customer) => customerIdSet.has(customer.id)),
    drafts: db.drafts.filter((draft) => draftIdSet.has(draft.id))
  };
}

export async function listCustomers() {
  const db = await readDb();
  return db.customers.sort((a, b) => b.buyerFitScore - a.buyerFitScore);
}

export async function getCustomer(customerId: string) {
  const db = await readDb();
  return db.customers.find((customer) => customer.id === customerId) ?? null;
}

export async function listDrafts(taskId?: string) {
  const db = await readDb();
  const drafts = taskId ? db.drafts.filter((draft) => draft.taskId === taskId) : db.drafts;
  return drafts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function approveTaskKeywords(taskId: string, keywords: string[]) {
  const db = await readDb();
  const tasks = db.tasks.map((task) =>
    task.id === taskId
      ? {
          ...task,
          keywords,
          keywordReviewStatus: "approved" as const,
          updatedAt: new Date().toISOString()
        }
      : task
  );

  await writeDb({ ...db, tasks });
}

export async function approveDraft(draftId: string) {
  const db = await readDb();
  const drafts = db.drafts.map((draft) =>
    draft.id === draftId
      ? {
          ...draft,
          status: "approved" as const,
          updatedAt: new Date().toISOString()
        }
      : draft
  );

  const taskId = db.drafts.find((draft) => draft.id === draftId)?.taskId;
  const tasks = markTaskEmailApprovalIfComplete(db.tasks, drafts, taskId);

  await writeDb({ ...db, tasks, drafts });
}

export async function approveAllDrafts(taskId: string) {
  const db = await readDb();
  const drafts = db.drafts.map((draft) =>
    draft.taskId === taskId
      ? {
          ...draft,
          status: "approved" as const,
          updatedAt: new Date().toISOString()
        }
      : draft
  );

  const tasks = markTaskEmailApprovalIfComplete(db.tasks, drafts, taskId);

  await writeDb({ ...db, tasks, drafts });
}

function markTaskEmailApprovalIfComplete(
  tasks: LeadTask[],
  drafts: EmailDraft[],
  taskId?: string
) {
  if (!taskId) return tasks;

  const taskDrafts = drafts.filter((draft) => draft.taskId === taskId);
  const allApproved =
    taskDrafts.length > 0 && taskDrafts.every((draft) => draft.status === "approved");

  return tasks.map((task) =>
    task.id === taskId && allApproved
      ? {
          ...task,
          emailReviewStatus: "approved" as const,
          status: "completed" as const,
          updatedAt: new Date().toISOString()
        }
      : task
  );
}
