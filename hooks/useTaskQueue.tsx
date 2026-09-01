"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Task } from "@/lib/tasks";

type TaskQueueValue = {
  tasks: Task[];
  total: number;
  activeCount: number;
  active: Task[];
  running: Task | undefined;
  connected: boolean;
};

const TaskQueueContext = createContext<TaskQueueValue | null>(null);

/** One live queue shared by the sidebar, dock, and task page. */
export function TaskQueueProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [total, setTotal] = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const source = new EventSource("/api/tasks/stream");
    source.onmessage = (event) => {
      const data = JSON.parse(event.data) as {
        tasks: Task[];
        total: number;
        activeCount: number;
      };
      setTasks(data.tasks);
      setTotal(data.total);
      setActiveCount(data.activeCount);
      setConnected(true);
    };
    source.onerror = () => setConnected(false);
    return () => source.close();
  }, []);

  const value = useMemo<TaskQueueValue>(() => {
    const active = tasks.filter(
      (task) => task.status === "queued" || task.status === "running",
    );
    return {
      tasks,
      total,
      activeCount,
      active,
      running: active.find((task) => task.status === "running"),
      connected,
    };
  }, [activeCount, connected, tasks, total]);

  return (
    <TaskQueueContext.Provider value={value}>
      {children}
    </TaskQueueContext.Provider>
  );
}

export function useTaskQueue(): TaskQueueValue {
  const value = useContext(TaskQueueContext);
  if (!value) {
    throw new Error("useTaskQueue must be used within TaskQueueProvider");
  }
  return value;
}

/** 0-1, or null when the task has not reported a total yet. */
export function taskRatio(task: Task): number | null {
  if (task.total <= 0) return null;
  return Math.min(1, task.processed / task.total);
}
