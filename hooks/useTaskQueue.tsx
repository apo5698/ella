"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Job } from "@/lib/jobs";
import type { Notification } from "@/lib/notifications";

type TaskQueueValue = {
  jobs: Job[];
  notifications: Notification[];
  total: number;
  activeCount: number;
  unreadCount: number;
  active: Job[];
  running: Job | undefined;
  connected: boolean;
};

const TaskQueueContext = createContext<TaskQueueValue | null>(null);

/** One live queue shared by the top navigation, dock, and notification center. */
export function TaskQueueProvider({ children }: { children: React.ReactNode }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [total, setTotal] = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const source = new EventSource("/api/tasks/stream");
    source.onmessage = (event) => {
      const data = JSON.parse(event.data) as {
        jobs: Job[];
        notifications: Notification[];
        total: number;
        activeCount: number;
        unreadCount: number;
      };
      setJobs(data.jobs);
      setNotifications(data.notifications);
      setTotal(data.total);
      setActiveCount(data.activeCount);
      setUnreadCount(data.unreadCount);
      setConnected(true);
    };
    source.onerror = () => setConnected(false);
    return () => source.close();
  }, []);

  const value = useMemo<TaskQueueValue>(() => {
    const active = jobs.filter(
      (job) => job.status === "queued" || job.status === "running",
    );
    return {
      jobs,
      notifications,
      total,
      activeCount,
      unreadCount,
      active,
      running: active.find((task) => task.status === "running"),
      connected,
    };
  }, [activeCount, connected, jobs, notifications, total, unreadCount]);

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
export function taskRatio(job: Job): number | null {
  if (job.total <= 0) return null;
  return Math.min(1, job.processed / job.total);
}
