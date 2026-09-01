import db from "@/lib/db";
import { listTasks, taskCount } from "@/lib/tasks";
// Loading the runner here means opening the page also resumes anything a
// previous server process left behind.
import "@/lib/taskRunner";
import TaskList from "./TaskList";

export default async function AdminTasksPage() {
  return <TaskList initialTasks={listTasks(db)} initialTotal={taskCount(db)} />;
}
