"use client";

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  PointerEvent,
} from "react";
import { Download, Trash2, Pencil, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

// ---- Types ----

type StarRegion = 1 | 2 | 3 | 4;
type AngleRange = { start: number; end: number };
type TimeBucket = "days" | "weeks" | "months" | "years";
type TaskFilter = "all" | "active" | "completed";

interface Task {
  id: string;
  date: string; // yyyy-MM-dd
  deadline: string; // yyyy-MM-dd
  project: string;
  projectTag?: string;
  projectColor?: string;
  task: string;
  region: StarRegion;
  bucket: TimeBucket;
  remainingDays: number;
  createdAt: string;
  finishedAt?: string;
}

// ---- Constants / helpers ----

const STORAGE_KEY = "gplanner_v1_tasks";
const STORAGE_MAX_KEY = "gplanner_v1_max_per_region";
const STORAGE_LAST_CSV_NAME = "gplanner_v1_last_csv_name";

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const DEFAULT_PROJECT_COLOR = "#475569";
const PROJECT_COLOR_PALETTE = [
  "#0ea5e9",
  "#f97316",
  "#22c55e",
  "#a855f7",
  "#ec4899",
  "#facc15",
  "#06b6d4",
  "#ef4444",
  "#4ade80",
  "#c084fc",
];

function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function sanitizeHexColor(input?: string | null): string | undefined {
  if (!input) return undefined;
  const value = input.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value.toLowerCase();
  return undefined;
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function fallbackProjectColor(project: string): string {
  const key = project.trim().toLowerCase();
  if (!key) return DEFAULT_PROJECT_COLOR;
  const hash = hashString(key);
  return PROJECT_COLOR_PALETTE[hash % PROJECT_COLOR_PALETTE.length];
}

function resolveProjectColor(project: string, color?: string): string {
  return sanitizeHexColor(color) ?? fallbackProjectColor(project);
}

function ensureProjectColor(task: Task): Task {
  const projectColor = resolveProjectColor(task.project, task.projectColor);
  return { ...task, projectColor };
}

function textColorForBackground(hex: string): string {
  const sanitized = sanitizeHexColor(hex);
  if (!sanitized) return "#f8fafc";
  const r = parseInt(sanitized.slice(1, 3), 16);
  const g = parseInt(sanitized.slice(3, 5), 16);
  const b = parseInt(sanitized.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? "#0f172a" : "#f8fafc";
}

function diffInDays(fromISO: string, toISO: string): number {
  const from = new Date(fromISO + "T00:00:00");
  const to = new Date(toISO + "T00:00:00");
  return Math.ceil((to.getTime() - from.getTime()) / MS_PER_DAY);
}

function addDays(baseISO: string, days: number): string {
  const d = new Date(baseISO + "T00:00:00");
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateYYYYMMDD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDateMMDDYYYYFromISODate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${m}/${d}/${y}`;
}

function formatDateMMDDYYYYFromISODateTime(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${m}/${day}/${y}`;
}

function normalizeDateInput(value?: string): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const simpleMatch = trimmed.match(
    /^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{2,4})$/
  );
  if (simpleMatch) {
    let month = parseInt(simpleMatch[1], 10);
    let day = parseInt(simpleMatch[2], 10);
    let year = parseInt(simpleMatch[3], 10);
    if (year < 100) year += 2000;
    if (month > 12 && day <= 12) {
      [month, day] = [day, month];
    }
    const candidate = new Date(year, month - 1, day);
    if (
      candidate.getFullYear() === year &&
      candidate.getMonth() === month - 1 &&
      candidate.getDate() === day
    ) {
      return formatDateYYYYMMDD(candidate);
    }
  }

  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return formatDateYYYYMMDD(parsed);
  }
  return null;
}

function bucketFromDays(
  days: number
): { region: StarRegion; bucket: TimeBucket } | null {
  if (days >= 1 && days <= 7) return { region: 4, bucket: "days" };
  if (days >= 8 && days <= 28) return { region: 3, bucket: "weeks" };
  if (days >= 29 && days <= 365) return { region: 2, bucket: "months" };
  if (days >= 366 && days <= 3650) return { region: 1, bucket: "years" };
  return null;
}

function compactLabel(task: Task): string {
  switch (task.bucket) {
    case "days":
      return `${task.remainingDays}d`;
    case "weeks": {
      const w = Math.round(task.remainingDays / 7);
      return `${w}w`;
    }
    case "months": {
      const m = Math.round(task.remainingDays / 30);
      return `${m}m`;
    }
    case "years": {
      const y = Math.round(task.remainingDays / 365);
      return `${y}y`;
    }
  }
}

function regionLabel(region: StarRegion): string {
  switch (region) {
    case 4:
      return "Important – Urgent";
    case 3:
      return "Important – Not urgent";
    case 2:
      return "Not important – Urgent";
    case 1:
      return "Not important – Not urgent";
  }
}

function regionRange(region: StarRegion): string {
  switch (region) {
    case 4:
      return "(1–7 days)";
    case 3:
      return "(1–4 weeks)";
    case 2:
      return "(1–12 months)";
    case 1:
      return "(1–10 years)";
  }
}

function stars(region: StarRegion): string {
  return "★★★★".slice(0, region);
}

interface MaxPerRegion {
  1: number;
  2: number;
  3: number;
  4: number;
}

// ---- CSV helpers ----

function tasksToCSV(tasks: Task[]): string {
  const header = [
    "id",
    "date",
    "deadline",
    "project",
    "projectTag",
    "projectColor",
    "task",
    "region",
    "bucket",
    "remainingDays",
    "createdAt",
    "finishedAt",
  ];
  const rows = tasks.map((t) => {
    const safeProject = t.project.replace(/"/g, '""');
    const safeTask = t.task.replace(/"/g, '""');
    const safeTag = (t.projectTag ?? "").replace(/"/g, '""');
    const colorValue = resolveProjectColor(t.project, t.projectColor);
    const safeColor = colorValue.replace(/"/g, '""');
    return [
      t.id,
      t.date,
      t.deadline,
      safeProject,
      safeTag,
      safeColor,
      safeTask,
      t.region.toString(),
      t.bucket,
      t.remainingDays.toString(),
      t.createdAt,
      t.finishedAt ?? "",
    ];
  });
  const lines = [header.join(",")].concat(
    rows.map((r) =>
      r
        .map((v) => {
          if (v.includes(",") || v.includes('"') || v.includes("\n")) {
            return `"${v}"`;
          }
          return v;
        })
        .join(",")
    )
  );
  return lines.join("\n");
}

function splitCSVLine(line: string, expectedCols: number): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        result.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  while (result.length < expectedCols) result.push("");
  return result;
}

function parseCSV(text: string): Task[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const header = lines[0].split(",");
  const idx = (name: string) => header.indexOf(name);

  const idxId = idx("id");
  const idxDate = idx("date");
  const idxDeadline = idx("deadline");
  const idxProject = idx("project");
  const idxProjectTag = idx("projectTag");
  const idxProjectColor = idx("projectColor");
  const idxTask = idx("task");
  const idxRegion = idx("region");
  const idxBucket = idx("bucket");
  const idxRemaining = idx("remainingDays");
  const idxCreated = idx("createdAt");
  const idxFinished = idx("finishedAt");

  const tasks: Task[] = [];
  const today = todayISO();

  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim()) continue;
    const cols = splitCSVLine(raw, header.length);
    if (cols.length < header.length) continue;

    const id = cols[idxId] || `csv-${i}`;
    const rawDate = idxDate >= 0 ? cols[idxDate] : "";
    const rawDeadline = idxDeadline >= 0 ? cols[idxDeadline] : "";
    const date = normalizeDateInput(rawDate) ?? today;
    const deadline = normalizeDateInput(rawDeadline) ?? date;

    const candidateRemaining = diffInDays(today, deadline);
    const recomputed = bucketFromDays(candidateRemaining);

    const rawRegion = idxRegion >= 0 ? cols[idxRegion] : "";
    const parsedRegion = parseInt(rawRegion || "", 10);
    const region =
      recomputed?.region ??
      ([1, 2, 3, 4].includes(parsedRegion) ? (parsedRegion as StarRegion) : 4);

    const rawBucket = (idxBucket >= 0 ? cols[idxBucket] : "") || "";
    const bucket: TimeBucket =
      recomputed?.bucket ??
      (["days", "weeks", "months", "years"].includes(rawBucket)
        ? (rawBucket as TimeBucket)
        : "days");

    const remainingDays = recomputed
      ? Math.max(1, candidateRemaining)
      : Math.max(
          1,
          parseInt(
            idxRemaining >= 0 ? cols[idxRemaining] || "1" : "1",
            10
          )
        );
    const project = idxProject >= 0 ? cols[idxProject] || "" : "";
    const projectTag =
      (idxProjectTag >= 0 ? cols[idxProjectTag] : "") || "";
    const projectColor =
      (idxProjectColor >= 0 ? cols[idxProjectColor] : "") || "";
    const task = idxTask >= 0 ? cols[idxTask] || "" : "";
    const createdAt =
      idxCreated >= 0 ? cols[idxCreated] || new Date().toISOString() : new Date().toISOString();
    const finishedAt = idxFinished >= 0 ? cols[idxFinished] || undefined : undefined;

    tasks.push({
      id,
      date,
      deadline,
      region,
      bucket,
      remainingDays,
      project,
      projectTag,
      projectColor,
      task,
      createdAt,
      finishedAt,
    });
  }

  return tasks;
}

// ---- Planner component ----

const Planner: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const [today, setToday] = useState<string>(todayISO());
  const [newDeadline, setNewDeadline] = useState<string>(todayISO());
  const [newProject, setNewProject] = useState("");
  const [newProjectTag, setNewProjectTag] = useState("");
  const [newProjectColor, setNewProjectColor] = useState(DEFAULT_PROJECT_COLOR);
  const [projectColorAuto, setProjectColorAuto] = useState(true);
  const [newTask, setNewTask] = useState("");

  const [csvText, setCsvText] = useState("");
  const [csvDialogOpen, setCsvDialogOpen] = useState(false);

  const [shareOpen, setShareOpen] = useState(false);
  const [shareText, setShareText] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [focusedColor, setFocusedColor] = useState<string>("");
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("all");

  const [initialSetupOpen, setInitialSetupOpen] = useState(false);
  const [hasShownInitial, setHasShownInitial] = useState(false);

  const [aboutOpen, setAboutOpen] = useState(false);

  const [maxPerRegion, setMaxPerRegion] = useState<MaxPerRegion>({
    1: 10,
    2: 10,
    3: 10,
    4: 10,
  });

  const [csvFileName, setCsvFileName] = useState<string>("planner_tasks");

  const [mounted, setMounted] = useState(false);
  const [plannerSize, setPlannerSize] = useState(900);

  // ---- Load from storage on mount ----
  useEffect(() => {
    setMounted(true);

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: Task[] = JSON.parse(raw);
        if (Array.isArray(parsed))
          setTasks(parsed.map((task) => ensureProjectColor(task)));
      }
    } catch {}

    try {
      const rawMax = window.localStorage.getItem(STORAGE_MAX_KEY);
      if (rawMax) {
        const parsed = JSON.parse(rawMax) as MaxPerRegion;
        setMaxPerRegion((prev) => ({ ...prev, ...parsed }));
      }
    } catch {}

    try {
      const rawName = window.localStorage.getItem(STORAGE_LAST_CSV_NAME);
      if (rawName) setCsvFileName(rawName);
    } catch {}
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const updateSize = () => {
      const width = window.innerWidth || 0;
      const available = Math.max(width - 820, 740);
      setPlannerSize(Math.min(available, 1080));
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  // Show initial dialog once when empty
  useEffect(() => {
    if (!hasShownInitial && mounted && tasks.length === 0) {
      setInitialSetupOpen(true);
      setHasShownInitial(true);
    }
  }, [mounted, tasks.length, hasShownInitial]);

  // Persist tasks
  useEffect(() => {
    if (!mounted) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch {}
    setCsvText(tasksToCSV(tasks));
  }, [tasks, mounted]);

  // Persist maxPerRegion
  useEffect(() => {
    if (!mounted) return;
    try {
      window.localStorage.setItem(
        STORAGE_MAX_KEY,
        JSON.stringify(maxPerRegion)
      );
    } catch {}
  }, [maxPerRegion, mounted]);

  // Persist CSV name
  useEffect(() => {
    if (!mounted) return;
    try {
      window.localStorage.setItem(STORAGE_LAST_CSV_NAME, csvFileName);
    } catch {}
  }, [csvFileName, mounted]);

  const selectedTask = useMemo(
    () => tasks.find((t) => t.id === activeId) ?? null,
    [tasks, activeId]
  );

  const projectTagLookup = useMemo(() => {
    const lookup = new Map<string, string>();
    for (const t of tasks) {
      const projectKey = t.project.trim().toLowerCase();
      if (!projectKey) continue;
      if (t.projectTag && !lookup.has(projectKey)) {
        lookup.set(projectKey, t.projectTag);
      }
    }
    return lookup;
  }, [tasks]);

  const projectColorLookup = useMemo(() => {
    const lookup = new Map<string, string>();
    for (const t of tasks) {
      const projectKey = t.project.trim().toLowerCase();
      if (!projectKey) continue;
      const color = resolveProjectColor(t.project, t.projectColor);
      if (!lookup.has(projectKey)) lookup.set(projectKey, color);
    }
    return lookup;
  }, [tasks]);

  const handleNewProjectChange = (value: string) => {
    setNewProject(value);
    const key = value.trim().toLowerCase();
    if (!key) {
      setNewProjectTag("");
      setProjectColorAuto(true);
      setNewProjectColor(DEFAULT_PROJECT_COLOR);
      return;
    }
    const suggested = projectTagLookup.get(key);
    if (suggested) {
      setNewProjectTag(suggested);
    }
    const suggestedColor = projectColorLookup.get(key);
    if (suggestedColor) {
      setProjectColorAuto(false);
      setNewProjectColor(suggestedColor);
      return;
    }
    if (projectColorAuto) {
      setNewProjectColor(fallbackProjectColor(value));
    }
  };

  const [colorPickerTarget, setColorPickerTarget] = useState<
    null | "new" | "edit"
  >(null);
  const [colorPickerValue, setColorPickerValue] =
    useState<string>(DEFAULT_PROJECT_COLOR);
  const taskRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const plottedTasks = useMemo(
    () => tasks.filter((t) => !t.finishedAt),
    [tasks]
  );

  const colorOptions = useMemo(() => {
    const map = new Map<
      string,
      { projects: Set<string>; count: number }
    >();
    for (const t of plottedTasks) {
      const color = resolveProjectColor(t.project, t.projectColor);
      if (!map.has(color)) {
        map.set(color, { projects: new Set(), count: 0 });
      }
      const entry = map.get(color)!;
      if (t.project.trim()) entry.projects.add(t.project.trim());
      entry.count += 1;
    }
    return Array.from(map.entries())
      .map(([color, data]) => {
        const names = Array.from(data.projects);
        let label = "No project name";
        if (names.length === 1) label = names[0];
        else if (names.length > 1)
          label = `${names[0]} +${names.length - 1} more`;
        return {
          color,
          label,
          projectNames: names,
          count: data.count,
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [plottedTasks]);

  const focusColorInfo = useMemo(
    () => colorOptions.find((opt) => opt.color === focusedColor),
    [colorOptions, focusedColor]
  );

  const openColorPicker = (target: "new" | "edit") => {
    setColorPickerTarget(target);
    if (target === "new") {
      setColorPickerValue(newProjectColor.toUpperCase());
    } else if (target === "edit" && editTask) {
      setColorPickerValue(
        (
          sanitizeHexColor(editTask.projectColor) ??
          fallbackProjectColor(editTask.project)
        ).toUpperCase()
      );
    } else {
      setColorPickerValue(DEFAULT_PROJECT_COLOR.toUpperCase());
    }
  };

  const applyColorSelection = (color?: string) => {
    const normalized =
      sanitizeHexColor(color ?? colorPickerValue) ??
      (colorPickerTarget === "new"
        ? fallbackProjectColor(newProject)
        : editTask
        ? fallbackProjectColor(editTask.project)
        : DEFAULT_PROJECT_COLOR);
    if (colorPickerTarget === "new") {
      setProjectColorAuto(false);
      setNewProjectColor(normalized);
    } else if (colorPickerTarget === "edit" && editTask) {
      setEditTask({ ...editTask, projectColor: normalized });
    }
    setColorPickerTarget(null);
  };

  const registerTaskRef = (id: string) => (el: HTMLDivElement | null) => {
    if (el) {
      taskRefs.current[id] = el;
    } else {
      delete taskRefs.current[id];
    }
  };

  const displayedTasks = useMemo(() => {
    const filtered = tasks.filter((t) => {
      if (taskFilter === "active") return !t.finishedAt;
      if (taskFilter === "completed") return !!t.finishedAt;
      return true;
    });
    if (!focusedColor) return filtered;
    return filtered.filter(
      (t) => resolveProjectColor(t.project, t.projectColor) === focusedColor
    );
  }, [tasks, focusedColor, taskFilter]);

  const projectSummaries = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        label: string;
        total: number;
        active: number;
        color: string;
      }
    >();

    for (const task of tasks) {
      const trimmed = task.project.trim();
      const key = trimmed.toLowerCase() || "__no_project";
      const color = resolveProjectColor(task.project, task.projectColor);
      if (!map.has(key)) {
        map.set(key, {
          key,
          label: trimmed || "No project name",
          total: 0,
          active: 0,
          color,
        });
      }
      const entry = map.get(key)!;
      entry.total += 1;
      if (!task.finishedAt) entry.active += 1;
      // refresh color to latest non-empty assignment
      entry.color = color;
    }

    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [tasks]);

  const { activeCount, completedCount } = useMemo(() => {
    let active = 0;
    let done = 0;
    for (const t of tasks) {
      if (t.finishedAt) done++;
      else active++;
    }
    return { activeCount: active, completedCount: done };
  }, [tasks]);
  const totalTasks = tasks.length;
  const completionRate =
    totalTasks === 0 ? 0 : Math.round((completedCount / totalTasks) * 100);

  const projectCount = useMemo(() => {
    const projects = new Set<string>();
    for (const t of tasks) {
      const name = t.project.trim().toLowerCase();
      if (name) projects.add(name);
    }
    return projects.size;
  }, [tasks]);

  const activeRegionCounts = useMemo(() => {
    const totals: Record<StarRegion, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const t of tasks) {
      if (!t.finishedAt) {
        totals[t.region] = (totals[t.region] ?? 0) + 1;
      }
    }
    return totals;
  }, [tasks]);

  const dueSoonTasks = useMemo(
    () =>
      tasks
        .filter((t) => !t.finishedAt)
        .slice()
        .sort((a, b) => a.deadline.localeCompare(b.deadline))
        .slice(0, 3),
    [tasks]
  );

  useEffect(() => {
    if (!activeId && tasks.length > 0) {
      setActiveId(tasks[0].id);
    } else if (activeId && !tasks.some((t) => t.id === activeId)) {
      setActiveId(tasks[0]?.id ?? null);
    }
  }, [tasks, activeId]);

  useEffect(() => {
    if (!focusedColor) return;
    const stillExists = plottedTasks.some(
      (t) => resolveProjectColor(t.project, t.projectColor) === focusedColor
    );
    if (!stillExists) setFocusedColor("");
  }, [focusedColor, plottedTasks]);

  useEffect(() => {
    if (!focusedColor) return;
    const current = tasks.find((t) => t.id === activeId);
    if (
      current &&
      resolveProjectColor(current.project, current.projectColor) === focusedColor
    ) {
      return;
    }
    const next = plottedTasks.find(
      (t) => resolveProjectColor(t.project, t.projectColor) === focusedColor
    );
    if (next) {
      setActiveId(next.id);
    }
  }, [focusedColor, plottedTasks, tasks, activeId]);

  useEffect(() => {
    if (!activeId) return;
    const el = taskRefs.current[activeId];
    if (el && el.scrollIntoView) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [activeId]);

  // ---- Add / edit / delete ----

  const addTask = () => {
    if (!newDeadline || !newTask.trim()) return;

    const remaining = diffInDays(today, newDeadline);
    const info = bucketFromDays(remaining);
    if (!info) {
      alert("Deadline must be between 1 day and 10 years from today.");
      return;
    }

    const { region, bucket } = info;
    const regionCount = tasks.filter(
      (t) => t.region === region && !t.finishedAt
    ).length;
    if (regionCount >= maxPerRegion[region]) {
      alert(
        `Region ${stars(region)} ${regionLabel(
          region
        )} is at capacity (${maxPerRegion[region]} tasks).`
      );
      return;
    }

    const trimmedTag = newProjectTag.trim();
    const colorValue = resolveProjectColor(newProject, newProjectColor);

    const t: Task = {
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      date: today,
      deadline: newDeadline,
      project: newProject.trim(),
      projectTag: trimmedTag || undefined,
      projectColor: colorValue,
      task: newTask.trim(),
      region,
      bucket,
      remainingDays: remaining,
      createdAt: new Date().toISOString(),
    };

    setTasks((prev) => [...prev, t]);
    setActiveId(t.id);
    setNewTask("");
    setProjectColorAuto(true);
  };

  const deleteTask = (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    if (activeId === id) setActiveId(null);
  };

  const markDone = (id: string) => {
    const now = new Date().toISOString();
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, finishedAt: now } : t))
    );
  };

  const openEdit = (task: Task) => {
    setEditTask({
      ...task,
      projectColor: resolveProjectColor(task.project, task.projectColor),
    });
    setEditOpen(true);
  };

  const saveEdit = () => {
    if (!editTask) return;

    const remaining = diffInDays(today, editTask.deadline);
    const info = bucketFromDays(remaining);
    if (!info) {
      alert("Edited deadline must be between 1 day and 10 years from today.");
      return;
    }

    const { region, bucket } = info;

    const normalizedColor = resolveProjectColor(
      editTask.project,
      editTask.projectColor
    );

    setTasks((prev) =>
      prev.map((t) =>
        t.id === editTask.id
          ? {
              ...editTask,
              projectColor: normalizedColor,
              region,
              bucket,
              remainingDays: remaining,
            }
          : t
      )
    );
    setEditOpen(false);
  };

  // ---- Share ----

  const openShare = () => {
    if (tasks.length === 0) {
      setShareText("No tasks in gPlanner yet.");
      setShareOpen(true);
      return;
    }

    const sorted = [...tasks].sort((a, b) =>
      a.deadline.localeCompare(b.deadline)
    );
    const lines: string[] = [];

    lines.push("gPlanner schedule");
    lines.push("");

    for (const t of sorted) {
      const dl = formatDateMMDDYYYYFromISODate(t.deadline);
      lines.push(
        `${stars(t.region)} ${regionRange(t.region)} – ${compactLabel(
          t
        )} (${t.remainingDays} days left)`
      );
      if (t.project) lines.push(`  Project: ${t.project}`);
      if (t.projectColor) {
        lines.push(
          `  Project color: ${resolveProjectColor(
            t.project,
            t.projectColor
          )}`
        );
      }
      if (t.projectTag) lines.push(`  Tag: ${t.projectTag}`);
      lines.push(`  Task: ${t.task}`);
      lines.push(`  Date: ${t.date}`);
      lines.push(`  Deadline: ${dl}`);
      if (t.finishedAt) {
        lines.push(
          `  Finished: ${formatDateMMDDYYYYFromISODateTime(t.finishedAt)}`
        );
      }
      lines.push("");
    }

    const text = lines.join("\n");
    setShareText(text);
    setShareOpen(true);

    if (navigator.share) {
      navigator
        .share({
          title: "gPlanner schedule",
          text,
        })
        .catch(() => {});
    } else if (navigator.clipboard && (navigator.clipboard as any).writeText) {
      (navigator.clipboard as any).writeText(text).catch(() => {});
    }
  };

  // ---- CSV import / export ----

  const downloadCSV = () => {
    const csv = csvText || tasksToCSV(tasks);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const todayStr = formatDateYYYYMMDD(new Date());
    const base = csvFileName.trim() || "planner_tasks";
    a.href = url;
    a.download = `${base}_${todayStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCSVFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = (evt.target?.result as string) ?? "";
      const parsed = parseCSV(text);
      if (parsed.length === 0) {
        alert("No tasks found in CSV.");
        return;
      }
      setTasks(parsed.map((task) => ensureProjectColor(task)));
      setCsvText(text);
    };
    reader.readAsText(file);
  };

  const loadFromURL = async () => {
    const url = window.prompt(
      "Enter direct CSV URL (OneDrive, GitHub raw, etc.):"
    );
    if (!url) return;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        alert(`Failed to fetch CSV. Status ${res.status}.`);
        return;
      }
      const text = await res.text();
      const parsed = parseCSV(text);
      if (parsed.length === 0) {
        alert("No tasks found in CSV file.");
        return;
      }
      setTasks(parsed.map((task) => ensureProjectColor(task)));
      setCsvText(text);
    } catch (err) {
      console.error(err);
      alert("Error fetching CSV from URL.");
    }
  };

  // ---- Geometry / drag ----

  interface DotPosition {
    x: number;
    y: number;
    radiusNorm: number;
    laneIndex: number;
  }

  const geometry = useMemo(() => {
    const size = plannerSize;
    const cx = size / 2;
    const cy = size / 2;
    const padding = 60;
    const maxR = size / 2 - padding;
    const ringRadii = [0.25, 0.5, 0.75].map((p) => p * maxR);
    return { size, cx, cy, maxR, ringRadii };
  }, [plannerSize]);

  const { size, cx, cy, maxR, ringRadii } = geometry;

  const regionAngles: Record<StarRegion, AngleRange> = {
    4: { start: 90, end: 180 }, // TL – Important/Urgent (days)
    3: { start: 0, end: 90 }, // TR – Important/Not Urgent (weeks)
    2: { start: 180, end: 270 }, // BL – Not important/Urgent (months)
    1: { start: 270, end: 360 }, // BR – Not important/Not urgent (years)
  };
  type RegionAngles = typeof regionAngles;
  const regionAngleEntries: [StarRegion, RegionAngles[StarRegion]][] = (
    Object.entries(regionAngles) as [string, RegionAngles[StarRegion]][]
  ).map(([region, angleRange]) => [
    Number(region) as StarRegion,
    angleRange,
  ]);
  const regionBackgroundFills: Record<StarRegion, string> = {
    4: "#fee2e2",
    3: "#fef3c7",
    2: "#dcfce7",
    1: "#e0f2fe",
  };

  const stepsForBucket: Record<TimeBucket, number> = {
    days: 7,
    weeks: 4,
    months: 12,
    years: 10,
  };

  const remainingToStep = (t: Task): number => {
    const n = stepsForBucket[t.bucket];
    if (t.bucket === "days") {
      return Math.min(Math.max(t.remainingDays, 1), n);
    }
    if (t.bucket === "weeks") {
      return Math.min(
        Math.max(Math.round(t.remainingDays / 7), 1),
        n
      );
    }
    if (t.bucket === "months") {
      return Math.min(
        Math.max(Math.round(t.remainingDays / 30), 1),
        n
      );
    }
    if (t.bucket === "years") {
      return Math.min(
        Math.max(Math.round(t.remainingDays / 365), 1),
        n
      );
    }
    return 1;
  };

  const urgencyProgress = (t: Task): number => {
    const nSteps = stepsForBucket[t.bucket];
    const step = remainingToStep(t);
    if (nSteps <= 1) return 1;
    const raw = 1 - (step - 1) / (nSteps - 1);
    return Math.min(1, Math.max(0, raw));
  };

  const stepToRemainingDays = (bucket: TimeBucket, step: number): number => {
    const s = Math.max(1, step);
    switch (bucket) {
      case "days":
        return s;
      case "weeks":
        return s * 7;
      case "months":
        return s * 30;
      case "years":
        return s * 365;
    }
  };

  const minRadiusFactor =
    ringRadii.length > 0 ? ringRadii[0] / maxR : 0.25;
  const maxRadiusFactor = 0.97;
  const radiusFactorRange = Math.max(0.01, maxRadiusFactor - minRadiusFactor);

  const dotPositions: Record<string, DotPosition> = useMemo(() => {
    const positions: Record<string, DotPosition> = {};
    const blankLaneNext: Record<StarRegion, number> = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
    };
    const colorLaneMap: Record<StarRegion, Map<string, number>> = {
      1: new Map(),
      2: new Map(),
      3: new Map(),
      4: new Map(),
    };

    const regions: StarRegion[] = [1, 2, 3, 4];
    regions.forEach((region) => {
      const lanes = Math.max(1, Math.min(10, maxPerRegion[region]));
      const uniqueColors = Array.from(
        new Set(
          plottedTasks
            .filter((t) => t.region === region)
            .map((t) => resolveProjectColor(t.project, t.projectColor))
        )
      );
      uniqueColors.forEach((color, idx) => {
        colorLaneMap[region].set(color, idx % lanes);
      });
    });

    for (const t of plottedTasks) {
      const lanes = Math.max(1, Math.min(10, maxPerRegion[t.region]));
      const colorKey = resolveProjectColor(t.project, t.projectColor);
      let laneIndex =
        colorLaneMap[t.region].get(colorKey) ??
        (blankLaneNext[t.region] % lanes);
      if (!colorLaneMap[t.region].has(colorKey)) {
        colorLaneMap[t.region].set(colorKey, laneIndex);
        blankLaneNext[t.region]++;
      }

      const angleRange = regionAngles[t.region];
      const angleDeg =
        angleRange.start +
        ((angleRange.end - angleRange.start) * (laneIndex + 0.5)) / lanes;
      const angleRad = (angleDeg * Math.PI) / 180;

      const progress = urgencyProgress(t);
      const radiusFactor =
        minRadiusFactor + radiusFactorRange * progress;
      const r = maxR * radiusFactor;

      const x = cx + r * Math.cos(angleRad);
      const y = cy - r * Math.sin(angleRad);

      positions[t.id] = { x, y, radiusNorm: progress, laneIndex };
    }

    return positions;
  }, [
    plottedTasks,
    cx,
    cy,
    maxR,
    regionAngles,
    stepsForBucket,
    maxPerRegion,
    minRadiusFactor,
    radiusFactorRange,
  ]);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const handleDotPointerDown = (id: string, e: PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggingId(id);
    setActiveId(id);

    const svg = svgRef.current;
    if (!svg) return;
    (svg as any).setPointerCapture(e.pointerId);
  };

  const handleDotPointerMove = (e: PointerEvent) => {
    if (!draggingId) return;
    e.preventDefault();
    e.stopPropagation();

    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    const dx = px - cx;
    const dy = py - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 5) return;

    const distFactor = Math.min(
      Math.max(dist / maxR, minRadiusFactor),
      maxRadiusFactor
    );
    const progress = Math.min(
      Math.max((distFactor - minRadiusFactor) / radiusFactorRange, 0),
      1
    );

    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== draggingId) return t;
        const nSteps = stepsForBucket[t.bucket];
        let step = 1;
        if (nSteps <= 1) {
          step = 1;
        } else {
          step = Math.round((1 - progress) * (nSteps - 1) + 1);
          if (step < 1) step = 1;
          if (step > nSteps) step = nSteps;
        }

        const newRemaining = stepToRemainingDays(t.bucket, step);
        const newDeadline = addDays(today, newRemaining);

        return {
          ...t,
          remainingDays: newRemaining,
          deadline: newDeadline,
        };
      })
    );
  };

  const handleDotPointerUp = (e: PointerEvent) => {
    if (!draggingId) return;
    e.preventDefault();
    e.stopPropagation();
    const svg = svgRef.current;
    if (svg) {
      try {
        (svg as any).releasePointerCapture(e.pointerId);
      } catch {}
    }
    setDraggingId(null);
  };

  const dotRadius = (t: Task): number => {
    const progress = urgencyProgress(t);
    const base = 9;
    const maxExtra = 9;
    return base + maxExtra * progress;
  };

  const buildRadialGuides = () => {
    if (!mounted) return null; // avoid SSR float mismatch
    const lanes = 10;
    const lines: React.ReactElement[] = [];

    regionAngleEntries.forEach(([region, angleRange]) => {
      for (let lane = 0; lane < lanes; lane++) {
        const angleDeg =
          angleRange.start +
          ((angleRange.end - angleRange.start) * (lane + 0.5)) / lanes;
        const angleRad = (angleDeg * Math.PI) / 180;
        const x2 = cx + maxR * Math.cos(angleRad);
        const y2 = cy - maxR * Math.sin(angleRad);
        const x2r = parseFloat(x2.toFixed(6));
        const y2r = parseFloat(y2.toFixed(6));

        lines.push(
          <line
            key={`${region}-${lane}`}
            x1={cx}
            y1={cy}
            x2={x2r}
            y2={y2r}
            stroke="#cbd5f5"
            strokeWidth={1.4}
            strokeDasharray="3 4"
            opacity={0.9}
          />
        );
      }
    });

    return lines;
  };

  const renderRegionBackgrounds = () => {
    const wedges: React.ReactElement[] = [];
    regionAngleEntries.forEach(([region, { start, end }]) => {
      const startRad = (start * Math.PI) / 180;
      const endRad = (end * Math.PI) / 180;
      const x1 = cx + maxR * Math.cos(startRad);
      const y1 = cy - maxR * Math.sin(startRad);
      const x2 = cx + maxR * Math.cos(endRad);
      const y2 = cy - maxR * Math.sin(endRad);
      const largeArc = Math.abs(end - start) > 180 ? 1 : 0;
      const pathD = [
        `M ${cx} ${cy}`,
        `L ${x1} ${y1}`,
        `A ${maxR} ${maxR} 0 ${largeArc} 0 ${x2} ${y2}`,
        "Z",
      ].join(" ");
      wedges.push(
        <path
          key={`region-bg-${region}`}
          d={pathD}
          fill={regionBackgroundFills[region]}
          opacity={0.5}
          stroke="none"
        />
      );
    });
    return wedges;
  };

  const renderQuadrantLabels = () => {
    const boxWidth = 210;
    const boxHeight = 48;
    const data = [
      {
        key: "q4",
        x: cx - maxR / 2 - 96,
        y: cy - maxR + 20,
        stars: "★★★★",
        label: "Important · Urgent",
      },
      {
        key: "q3",
        x: cx + maxR / 2 + 96,
        y: cy - maxR + 20,
        stars: "★★★",
        label: "Important · Not urgent",
      },
      {
        key: "q2",
        x: cx - maxR / 2 - 96,
        y: cy + maxR - 16,
        stars: "★★",
        label: "Not important · Urgent",
      },
      {
        key: "q1",
        x: cx + maxR / 2 + 96,
        y: cy + maxR - 16,
        stars: "★",
        label: "Not important · Not urgent",
      },
    ];

    return data.map((item) => {
      const boxX = item.x - boxWidth / 2;
      const boxY = item.y - boxHeight / 2;
      return (
        <g key={item.key}>
          <rect
            x={boxX}
            y={boxY}
            width={boxWidth}
            height={boxHeight}
            rx={14}
            fill="white"
            stroke="#e2e8f0"
            strokeWidth={1}
            opacity={0.95}
          />
          <text
            x={item.x}
            y={item.y - 6}
            textAnchor="middle"
            fontSize={13}
            fontWeight={700}
            fill="#d4af37"
          >
            {item.stars}
          </text>
          <text
            x={item.x}
            y={item.y + 12}
            textAnchor="middle"
            fontSize={11}
            fontWeight={600}
            fill="#0f172a"
          >
            {item.label}
          </text>
        </g>
      );
    });
  };

  const handleInitialChoice = (choice: "create" | "load") => {
    if (choice === "load") {
      const input = document.querySelector(
        'input[type="file"][accept=".csv,text/csv"]'
      ) as HTMLInputElement | null;
      input?.click();
    }
    setInitialSetupOpen(false);
  };

  // ---- Render ----

  return (
    <div className="w-full min-h-screen bg-slate-50 text-slate-900 flex justify-center">
      <div className="max-w-[1800px] w-full px-6 py-6">
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              gPlanner
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Geometry Time Planner – urgency and importance encoded on a
              circular map.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => setAboutOpen(true)}
            >
              About gPlanner
            </Button>
          </div>
        </div>
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 mb-6 text-center">
        {[
          {
            label: "Urgent / Important",
            value: tasks.filter(
              (task) => task.region === 4 && !task.finishedAt
            ).length,
            highlight: true,
          },
          { label: "Active", value: activeCount },
          { label: "Completed", value: completedCount },
          {
            label: "Completion",
            value: `${completionRate}%`,
          },
          { label: "Projects", value: projectCount },
          { label: "Total tasks", value: totalTasks },
        ].map((stat) => (
            <div
              key={stat.label}
              className={`rounded-2xl border px-3 py-2.5 shadow-sm ${
                stat.highlight
                  ? "border-red-200 bg-red-50"
                  : "border-slate-200 bg-white"
              }`}
            >
              <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                {stat.label}
              </p>
              <p className="text-xl font-bold text-slate-900 mt-1">
                {stat.value}
              </p>
            </div>
          ))}
        </div>

        <div className="flex gap-4 items-start">
          {/* Left: New */}
          <div
            className="w-[320px] flex flex-col gap-3"
            style={{ minHeight: plannerSize }}
          >
            <Card className="flex-1 flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">New task</CardTitle>
                <CardDescription className="text-xs">
                  Capture the essentials and we will place it on the map.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid grid-cols-[auto,1fr] gap-x-2 gap-y-2 items-center">
                  <label htmlFor="today" className="text-xs">
                    Today
                  </label>
                  <Input
                    id="today"
                    type="date"
                    value={today}
                    onChange={(e) => setToday(e.target.value)}
                    className="h-8 text-xs"
                  />

                  <label htmlFor="deadline" className="text-xs">
                    Deadline
                  </label>
                  <Input
                    id="deadline"
                    type="date"
                    value={newDeadline}
                    onChange={(e) => setNewDeadline(e.target.value)}
                    className="h-8 text-xs"
                  />

                  <label htmlFor="project" className="text-xs">
                    Project
                  </label>
                  <Input
                    id="project"
                    value={newProject}
                    onChange={(e) => handleNewProjectChange(e.target.value)}
                    className="h-8 text-xs"
                    placeholder="Optional"
                  />

                  <label htmlFor="project-tag" className="text-xs">
                    Project tag
                  </label>
                  <Input
                    id="project-tag"
                    value={newProjectTag}
                    onChange={(e) => setNewProjectTag(e.target.value)}
                    className="h-8 text-xs"
                    placeholder="Short label (e.g., LAB)"
                  />

                  <label htmlFor="project-color" className="text-xs">
                    Project color
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      id="project-color"
                      type="button"
                      onClick={() => openColorPicker("new")}
                      className="flex items-center gap-2 rounded-md border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-800 shadow-sm hover:border-slate-500"
                    >
                      <span
                        className="inline-flex h-4 w-4 rounded-full border border-slate-900"
                        style={{ backgroundColor: newProjectColor }}
                      />
                      {newProjectColor.toUpperCase()}
                    </button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-[11px]"
                      onClick={() => {
                        setProjectColorAuto(true);
                        setNewProjectColor(fallbackProjectColor(newProject));
                      }}
                    >
                      Auto
                    </Button>
                  </div>

                  <label htmlFor="task" className="text-xs">
                    Task
                  </label>
                  <Textarea
                    id="task"
                    value={newTask}
                    onChange={(e) => setNewTask(e.target.value)}
                    className="text-xs min-h-[60px]"
                    placeholder="Describe what you need to do."
                  />
                </div>
                <div className="flex justify-between items-center pt-1">
                  <Button size="sm" className="text-xs" onClick={addTask}>
                    Add task
                  </Button>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="h-7 w-7"
                      onClick={() => setCsvDialogOpen(true)}
                    >
                      <span className="sr-only">Preview CSV</span>
                      <span className="text-[10px] font-semibold">CSV</span>
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="h-7 w-7"
                      onClick={downloadCSV}
                    >
                      <Download className="h-3 w-3" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="h-7 w-7"
                      onClick={loadFromURL}
                    >
                      <span className="sr-only">Load URL</span>
                      <span className="text-[10px] font-semibold">URL</span>
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="h-7 w-7"
                      onClick={openShare}
                    >
                      <Share2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <div className="pt-1">
                  <label
                    htmlFor="csvname"
                    className="text-[10px] text-slate-600"
                  >
                    CSV file name (base)
                  </label>
                  <Input
                    id="csvname"
                    value={csvFileName}
                    onChange={(e) => setCsvFileName(e.target.value)}
                    className="h-7 text-[11px] mt-1"
                  />
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-[10px] text-slate-600">
                      LOAD CSV
                    </span>
                    <Input
                      type="file"
                      accept=".csv,text/csv"
                      onChange={handleCSVFile}
                      className="h-7 text-[11px] p-0 border-none"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

          </div>

          {/* Center: geometry planner */}
          <div className="flex-1 flex flex-col items-center w-full px-2">
            <div className="relative flex justify-center items-center w-full">
              <svg
                ref={svgRef}
                width={size}
                height={size}
                className="rounded-3xl bg-slate-100 shadow-inner border border-slate-200 max-w-full"
                onPointerMove={handleDotPointerMove}
                onPointerUp={handleDotPointerUp}
                onPointerLeave={handleDotPointerUp}
              >
                {/* outer circle */}
                <circle
                  cx={cx}
                  cy={cy}
                  r={maxR}
                  fill="#f9fafb"
                  stroke="#94a3b8"
                  strokeWidth={3}
                  strokeDasharray="8 6"
                />

                {/* region backgrounds */}
                {renderRegionBackgrounds()}

                {/* axes */}
                <line
                  x1={cx - maxR}
                  y1={cy}
                  x2={cx + maxR}
                  y2={cy}
                  stroke="#94a3b8"
                  strokeWidth={2}
                />
                <line
                  x1={cx}
                  y1={cy - maxR}
                  x2={cx}
                  y2={cy + maxR}
                  stroke="#94a3b8"
                  strokeWidth={2}
                />

                {/* rings */}
                {ringRadii.map((r, i) => (
                  <circle
                    key={i}
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill="none"
                    stroke="#cbd5f5"
                    strokeWidth={1.6}
                    strokeDasharray="3 6"
                  />
                ))}

                {/* radial guides */}
                {buildRadialGuides()}

                {/* percentage labels on right */}
                {ringRadii.map((r, idx) => {
                  const perc = [75, 50, 25][idx];
                  return (
                    <text
                      key={idx}
                      x={cx + r + 24}
                      y={cy + 4}
                      fontSize={11}
                      fill="#6b7280"
                    >
                      {perc}% time left
                    </text>
                  );
                })}

                {/* quadrant labels – order kept: 4★, 3★, 2★, 1★ */}
                {renderQuadrantLabels()}

                {/* dots */}
                {plottedTasks.map((t) => {
                  const pos = dotPositions[t.id];
                  if (!pos) return null;
                  const r = dotRadius(t);
                  const label = compactLabel(t);
                  const isActive = t.id === activeId;
                  const taskColor = resolveProjectColor(t.project, t.projectColor);
                  const isDimmed = focusedColor
                    ? taskColor !== focusedColor
                    : false;
                  const fillColor = taskColor;
                  const strokeColor = isActive ? "#0f172a" : fillColor;
                  const strokeWidth = isActive ? 3 : 0;
                  const tagLabel = t.projectTag?.trim();
                  const baseOpacity = t.finishedAt ? 0.4 : 0.95;
                  const circleOpacity = isDimmed ? 0.18 : baseOpacity;
                  const labelOpacity = isDimmed ? 0.35 : 1;
                  const tagColor = isDimmed ? "#94a3b8" : "#0f172a";
                  const textColor = isDimmed
                    ? "#f8fafc"
                    : textColorForBackground(fillColor);

                  return (
                    <g
                      key={t.id}
                      onPointerDown={(e) => handleDotPointerDown(t.id, e)}
                      style={{ cursor: "pointer" }}
                    >
                      <circle
                        cx={pos.x}
                        cy={pos.y}
                        r={r}
                        fill={fillColor}
                        stroke={strokeColor}
                        strokeWidth={strokeWidth}
                        opacity={circleOpacity}
                      />
                      <text
                        x={pos.x}
                        y={pos.y + 3}
                        textAnchor="middle"
                        fontSize={Math.max(9, r - 2)}
                        fontWeight={700}
                        fill={textColor}
                        opacity={labelOpacity}
                      >
                        {label}
                      </text>
                      {tagLabel && (
                        <text
                          x={pos.x}
                          y={pos.y + r + 12}
                          textAnchor="middle"
                          fontSize={10}
                          fontWeight={600}
                          fill={tagColor}
                        >
                          {tagLabel}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          {/* Right: Tasks */}
          <div
            className="w-[320px] flex flex-col gap-3"
            style={{ minHeight: plannerSize }}
          >
            <Card className="flex-1 flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Tasks</CardTitle>
                <CardDescription className="text-xs">
                  Select a dot or card to review and edit it right inside this
                  panel.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-1 flex flex-col h-full">
                <div className="mb-3">
                  <p className="text-[11px] font-semibold mb-1">
                    Selected task
                  </p>
                  {selectedTask ? (
                    <div className="rounded-lg border border-slate-200 bg-white/80 p-3 text-[11px] space-y-1">
                      <p className="font-semibold text-slate-900">
                        {selectedTask.task}
                      </p>
                      <p className="text-slate-600">
                        Remaining:{" "}
                        <span className="font-semibold text-slate-900">
                          {compactLabel(selectedTask)} (
                          {selectedTask.remainingDays} days)
                        </span>
                      </p>
                      <p className="text-slate-600">
                        Status:{" "}
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-[1px] text-[10px] font-semibold border ${
                            selectedTask.finishedAt
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-sky-50 text-sky-700 border-sky-200"
                          }`}
                        >
                          {selectedTask.finishedAt ? "Completed" : "Active"}
                        </span>
                      </p>
                      {selectedTask.project && (
                        <p className="text-slate-600">
                          Project:{" "}
                          <span className="font-semibold">
                            {selectedTask.project}
                          </span>
                        </p>
                      )}
                      {selectedTask.projectTag && (
                        <p className="text-slate-600">
                          Tag:{" "}
                          <span className="font-semibold">
                            {selectedTask.projectTag}
                          </span>
                        </p>
                      )}
                      <p className="flex items-center gap-2 text-slate-600">
                        Color:
                        <span
                          className="inline-flex h-3 w-6 rounded border border-slate-400"
                          style={{
                            backgroundColor: resolveProjectColor(
                              selectedTask.project,
                              selectedTask.projectColor
                            ),
                          }}
                        />
                        <span className="font-mono text-[10px]">
                          {resolveProjectColor(
                            selectedTask.project,
                            selectedTask.projectColor
                          )}
                        </span>
                      </p>
                      <p className="text-slate-600">
                        Date:{" "}
                        <span className="font-semibold">
                          {selectedTask.date}
                        </span>
                      </p>
                      <p className="text-slate-600">
                        Deadline:{" "}
                        <span className="font-semibold">
                          {formatDateMMDDYYYYFromISODate(
                            selectedTask.deadline
                          )}
                        </span>
                      </p>
                      <p className="text-slate-600">
                        Region:{" "}
                        <span className="text-amber-500 font-semibold">
                          {stars(selectedTask.region)}
                        </span>{" "}
                        {regionRange(selectedTask.region)}
                      </p>
                      {selectedTask.finishedAt && (
                        <p className="text-emerald-600">
                          Finished:{" "}
                          {formatDateMMDDYYYYFromISODateTime(
                            selectedTask.finishedAt
                          )}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2 pt-2">
                        <Button
                          size="sm"
                          className="h-7 text-[11px]"
                          onClick={() => openEdit(selectedTask)}
                        >
                          Edit selected
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[11px]"
                          onClick={() => markDone(selectedTask.id)}
                        >
                          Mark done
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[11px] text-red-600"
                          onClick={() => deleteTask(selectedTask.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-400 italic">
                      No task selected yet. Click any dot or task card to show
                      its details here.
                    </p>
                  )}
                </div>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Task view
                  </p>
                  <div className="inline-flex rounded-full border border-slate-200 bg-slate-100 p-1">
                    {[
                      { label: "All", value: "all" },
                      { label: "Active", value: "active" },
                      { label: "Done", value: "completed" },
                    ].map((option) => {
                      const isActive = taskFilter === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() =>
                            setTaskFilter(option.value as TaskFilter)
                          }
                          className={`px-3 py-1 text-[11px] font-semibold rounded-full transition ${
                            isActive
                              ? "bg-slate-900 text-white shadow-sm"
                              : "text-slate-600 hover:text-slate-900"
                          }`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="mb-2 text-[11px] space-y-1">
                  <p className="font-semibold">Max tasks / region</p>
                  <div className="grid grid-cols-4 gap-2">
                    <div className="flex flex-col">
                      <span className="text-[11px] text-amber-500">★★★★</span>
                      <Input
                        type="number"
                        className="h-7 text-[11px]"
                        value={maxPerRegion[4]}
                        onChange={(e) =>
                          setMaxPerRegion((prev) => ({
                            ...prev,
                            4: Math.max(1, Number(e.target.value) || 1),
                          }))
                        }
                      />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[11px] text-amber-500">★★★</span>
                      <Input
                        type="number"
                        className="h-7 text-[11px]"
                        value={maxPerRegion[3]}
                        onChange={(e) =>
                          setMaxPerRegion((prev) => ({
                            ...prev,
                            3: Math.max(1, Number(e.target.value) || 1),
                          }))
                        }
                      />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[11px] text-amber-500">★★</span>
                      <Input
                        type="number"
                        className="h-7 text-[11px]"
                        value={maxPerRegion[2]}
                        onChange={(e) =>
                          setMaxPerRegion((prev) => ({
                            ...prev,
                            2: Math.max(1, Number(e.target.value) || 1),
                          }))
                        }
                      />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[11px] text-amber-500">★</span>
                      <Input
                        type="number"
                        className="h-7 text-[11px]"
                        value={maxPerRegion[1]}
                        onChange={(e) =>
                          setMaxPerRegion((prev) => ({
                            ...prev,
                            1: Math.max(1, Number(e.target.value) || 1),
                          }))
                        }
                      />
                    </div>
                  </div>
                </div>
                {focusedColor && focusColorInfo && (
                  <div className="mb-2 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-700">
                    <span>Showing tasks colored</span>
                    <span
                      className="inline-flex h-3 w-6 rounded border border-slate-400"
                      style={{ backgroundColor: focusedColor }}
                    />
                    <span className="font-semibold">
                      {focusColorInfo.label}
                    </span>
                  </div>
                )}

                <div className="flex-1 border border-slate-200 rounded-lg p-2 overflow-y-auto max-h-[380px]">
                  <div className="space-y-2">
                    {displayedTasks.length === 0 && (
                      <p className="text-[11px] text-slate-400">
                        {taskFilter === "completed"
                          ? "No completed tasks yet."
                          : taskFilter === "active"
                          ? "All active tasks are done. Add a new one on the left."
                          : "No tasks yet. Add one on the left to populate the planner."}
                      </p>
                    )}
                    {displayedTasks.length > 0 &&
                      displayedTasks
                        .slice()
                        .sort((a, b) => a.deadline.localeCompare(b.deadline))
                        .map((t, idx) => {
                        const isActive = t.id === activeId;
                        const dl = formatDateMMDDYYYYFromISODate(t.deadline);
                        const projectColor = resolveProjectColor(
                          t.project,
                          t.projectColor
                        );

                        return (
                          <div
                            key={t.id}
                            className={
                              "rounded-xl border text-[11px] p-2 flex items-start justify-between gap-2 cursor-pointer transition-colors " +
                              (isActive
                                ? "bg-amber-100 border-amber-400"
                                : "bg-white border-slate-200 hover:bg-slate-50")
                            }
                            onClick={() => setActiveId(t.id)}
                            ref={registerTaskRef(t.id)}
                          >
                            <div className="flex-1">
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-1">
                                  <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-slate-800 text-[10px] font-semibold text-slate-50">
                                    {idx + 1}
                                  </span>
                                  <span
                                    className="h-3 w-3 rounded-full border border-slate-900"
                                    style={{ backgroundColor: projectColor }}
                                  />
                                  <span className="font-semibold">
                                    {compactLabel(t)} ({t.remainingDays} d)
                                  </span>
                                </div>
                                <span className="text-[10px] text-slate-500">
                                  dL: {dl}
                                </span>
                              </div>
                              {t.project && (
                                <div className="text-[10px] text-slate-600 flex items-center gap-1 flex-wrap">
                                  <span className="font-semibold">
                                    Project:
                                  </span>
                                  <span>{t.project}</span>
                                  {t.projectTag && (
                                    <span className="ml-1 inline-flex items-center rounded-full border border-slate-400 px-1 py-[1px] text-[9px] font-semibold uppercase tracking-wide text-slate-600">
                                      {t.projectTag}
                                    </span>
                                  )}
                                </div>
                              )}
                              {!t.project && t.projectTag && (
                                <div className="text-[10px] text-slate-600">
                                  <span className="font-semibold">Tag:</span>{" "}
                                  {t.projectTag}
                                </div>
                              )}
                              <div className="text-[10px] text-slate-800">
                                <span className="font-semibold">Task:</span>{" "}
                                {t.task}
                              </div>
                              <div className="flex items-center justify-between mt-1">
                                <span className="text-[10px] text-slate-500">
                                  {stars(t.region)} {regionRange(t.region)}
                                </span>
                                {t.finishedAt && (
                                  <span className="text-[10px] text-emerald-600">
                                    Done:{" "}
                                    {formatDateMMDDYYYYFromISODateTime(
                                      t.finishedAt
                                    )}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-col gap-1">
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-6 w-6"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openEdit(t);
                                }}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-6 w-6"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  markDone(t.id);
                                }}
                              >
                                ✓
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-6 w-6"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteTask(t.id);
                                }}
                              >
                                <Trash2 className="h-3 w-3 text-red-500" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="mt-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Workspace activity</CardTitle>
              <CardDescription className="text-xs">
                Key indicators, regional balance, and the latest events.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-xs max-h-[520px] overflow-y-auto pr-2 space-y-4">
              <div className="flex flex-wrap gap-3 text-[11px]">
                {[
                  { label: "Active tasks", value: activeCount },
                  { label: "Completed", value: completedCount },
                  { label: "Projects", value: projectCount },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm"
                  >
                    <span className="font-semibold text-slate-900 text-base leading-none">
                      {stat.value}
                    </span>
                    <span className="text-slate-500">{stat.label}</span>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-[11px] font-semibold text-slate-700 mb-2">
                  Active tasks by region
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {[4, 3, 2, 1].map((region) => (
                    <div
                      key={region}
                      className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                    >
                      <div className="flex flex-col leading-tight">
                        <span className="text-[11px] font-semibold text-amber-500">
                          {stars(region as StarRegion)}
                        </span>
                        <span className="text-[10px] text-slate-600">
                          {regionLabel(region as StarRegion)}
                        </span>
                      </div>
                      <span className="text-sm font-semibold text-slate-900">
                        {activeRegionCounts[region as StarRegion] ?? 0}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-slate-700 mb-2">
                  Upcoming deadlines
                </p>
                {dueSoonTasks.length === 0 ? (
                  <p className="text-[11px] text-slate-400">
                    Nothing on the horizon. Great job staying ahead!
                  </p>
                ) : (
                  <div className="space-y-2">
                    {dueSoonTasks.map((task) => (
                      <div
                        key={task.id}
                        className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2"
                      >
                        <div className="flex flex-col">
                          <span className="text-[11px] font-semibold text-slate-900">
                            {task.task}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {task.project || "Untitled project"}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-[11px] font-semibold text-slate-900 block">
                            {formatDateMMDDYYYYFromISODate(task.deadline)}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {compactLabel(task)} left
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="border border-slate-200 rounded-xl bg-white p-3 space-y-3">
                <p className="text-[11px] font-semibold text-slate-700">
                  Projects overview
                </p>
                {projectSummaries.length === 0 ? (
                  <p className="text-[11px] text-slate-400">
                    Start a project to see breakdowns here.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {projectSummaries.map((project) => (
                      <div
                        key={project.key}
                        className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2"
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className="inline-flex h-4 w-4 rounded-full border border-slate-900"
                            style={{ backgroundColor: project.color }}
                          />
                          <div>
                            <p className="font-semibold text-slate-900">
                              {project.label}
                            </p>
                            <p className="text-[11px] text-slate-600">
                              {project.total} tasks &middot;{" "}
                              {project.active} active
                            </p>
                          </div>
                        </div>
                        <span className="text-[10px] text-slate-500">
                          {project.active === 0
                            ? "All done"
                            : `${project.active} remaining`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Initial setup dialog */}
        <Dialog open={initialSetupOpen} onOpenChange={setInitialSetupOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>First time using gPlanner?</DialogTitle>
              <DialogDescription>
                Start from a blank schedule or import an existing CSV file.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-3 space-y-2 text-sm text-slate-800">
              <p>
                gPlanner stores your tasks locally in your browser and
                optionally in CSV files you download. Nothing is sent to a
                server unless you explicitly upload a CSV somewhere.
              </p>
              <div className="flex gap-2 mt-3">
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={() => handleInitialChoice("create")}
                >
                  Start from empty
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => handleInitialChoice("load")}
                >
                  Load CSV
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* CSV preview */}
        <Dialog open={csvDialogOpen} onOpenChange={setCsvDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>CSV preview</DialogTitle>
              <DialogDescription>
                This is the CSV content that will be downloaded or shared.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-2">
              <Textarea
                readOnly
                value={csvText || tasksToCSV(tasks)}
                className="w-full h-[300px] text-[11px] font-mono"
              />
            </div>
          </DialogContent>
        </Dialog>

        {/* Share dialog */}
        <Dialog open={shareOpen} onOpenChange={setShareOpen}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Share schedule</DialogTitle>
              <DialogDescription>
                Copy this text into email or chat. On some devices, the system
                share sheet will open automatically.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-2">
              <Textarea
                readOnly
                value={shareText}
                className="w-full h-[260px] text-[11px] font-mono"
              />
            </div>
          </DialogContent>
        </Dialog>

        {/* Color picker dialog */}
        <Dialog
          open={colorPickerTarget !== null}
          onOpenChange={(open) => {
            if (!open) setColorPickerTarget(null);
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Select a project color</DialogTitle>
              <DialogDescription>
                Click any swatch or enter a custom hex value.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-3 space-y-3 text-sm">
              <div className="grid grid-cols-5 gap-2">
                {PROJECT_COLOR_PALETTE.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => applyColorSelection(color)}
                    className="flex flex-col items-center gap-1 rounded-lg border border-slate-200 px-2 py-2 hover:border-slate-500"
                  >
                    <span
                      className="inline-flex h-8 w-8 rounded-full border border-slate-900"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-[11px] font-semibold text-slate-800">
                      {color.toUpperCase()}
                    </span>
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Input
                  value={colorPickerValue}
                  onChange={(e) =>
                    setColorPickerValue(e.target.value.toUpperCase())
                  }
                  placeholder="#3366FF"
                  className="text-xs font-mono"
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={() => applyColorSelection(colorPickerValue)}
                  disabled={!sanitizeHexColor(colorPickerValue)}
                >
                  Apply
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit task */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Edit task</DialogTitle>
              <DialogDescription>
                Changing the deadline will recompute region and remaining time.
              </DialogDescription>
            </DialogHeader>
            {editTask && (
              <div className="mt-3 space-y-2 text-sm">
                <div className="grid grid-cols-[auto,1fr] gap-x-2 gap-y-2 items-center">
                  <span className="text-xs">Date</span>
                  <Input
                    type="date"
                    value={editTask.date}
                    onChange={(e) =>
                      setEditTask({ ...editTask, date: e.target.value })
                    }
                    className="h-8 text-xs"
                  />
                  <span className="text-xs">Deadline</span>
                  <Input
                    type="date"
                    value={editTask.deadline}
                    onChange={(e) =>
                      setEditTask({ ...editTask, deadline: e.target.value })
                    }
                    className="h-8 text-xs"
                  />
                  <span className="text-xs">Project</span>
                  <Input
                    value={editTask.project}
                    onChange={(e) =>
                      setEditTask({ ...editTask, project: e.target.value })
                    }
                    className="h-8 text-xs"
                  />
                  <span className="text-xs">Project color</span>
                  <button
                    type="button"
                    onClick={() => openColorPicker("edit")}
                    className="flex items-center gap-2 rounded-md border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-800 shadow-sm hover:border-slate-500"
                  >
                    <span
                      className="inline-flex h-4 w-4 rounded-full border border-slate-900"
                      style={{
                        backgroundColor: resolveProjectColor(
                          editTask.project,
                          editTask.projectColor
                        ),
                      }}
                    />
                    {resolveProjectColor(
                      editTask.project,
                      editTask.projectColor
                    ).toUpperCase()}
                  </button>
                  <span className="text-xs">Project tag</span>
                  <Input
                    value={editTask.projectTag ?? ""}
                    onChange={(e) =>
                      setEditTask({ ...editTask, projectTag: e.target.value })
                    }
                    className="h-8 text-xs"
                  />
                  <span className="text-xs">Task</span>
                  <Textarea
                    value={editTask.task}
                    onChange={(e) =>
                      setEditTask({ ...editTask, task: e.target.value })
                    }
                    className="text-xs min-h-[60px]"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button size="sm" onClick={saveEdit}>
                    Save
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* About dialog */}
        <Dialog open={aboutOpen} onOpenChange={setAboutOpen}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>gPlanner – Geometry Time Planner</DialogTitle>
              <DialogDescription>
                Visual task-planning with urgency and importance encoded directly
                on a circular map.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-3 space-y-3 text-sm text-slate-800">
              <p>
                gPlanner is a visual task-planning app that encodes urgency and
                importance directly on a circular “geometry” map. Tasks are
                represented as colored dots whose position and color encode both
                priority and remaining time to the deadline.
              </p>
              <p>
                The app runs entirely in your browser (local Next.js app) and
                stores data in{" "}
                <code className="px-1 py-0.5 rounded bg-slate-100 text-xs">
                  localStorage
                </code>{" "}
                and optional CSV files. There is no backend: your schedule is
                private to your machine unless you explicitly share CSV or text
                exports.
              </p>

              <h3 className="font-semibold text-slate-900 mt-2">
                1. Concept: How the Geometry Works
              </h3>
              <p>The planner circle is split into four regions (quadrants):</p>
              <ul className="list-disc list-inside text-sm space-y-1">
                <li>
                  Top-left:{" "}
                  <span className="text-amber-400">★★★★</span> Important –
                  Urgent{" "}
                  <span className="text-slate-500">(1–7 days)</span>
                </li>
                <li>
                  Top-right:{" "}
                  <span className="text-amber-400">★★★</span> Important – Not
                  urgent{" "}
                  <span className="text-slate-500">(1–4 weeks)</span>
                </li>
                <li>
                  Bottom-left:{" "}
                  <span className="text-amber-400">★★</span> Not important –
                  Urgent{" "}
                  <span className="text-slate-500">(1–12 months)</span>
                </li>
                <li>
                  Bottom-right:{" "}
                  <span className="text-amber-400">★</span> Not important – Not
                  urgent{" "}
                  <span className="text-slate-500">(1–10 years)</span>
                </li>
              </ul>

              <p className="mt-2">
                Each quadrant now has a soft background tint (rose, amber,
                green, and sky) to reinforce its urgency range. The actual dot
                color is entirely up to you—assign a color per project to group
                related tasks visually across the board.
              </p>

              <p className="mt-2">
                Inside each dot you see a compact label such as{" "}
                <code className="px-1 py-0.5 rounded bg-slate-100 text-xs">
                  3d
                </code>
                ,{" "}
                <code className="px-1 py-0.5 rounded bg-slate-100 text-xs">
                  2w
                </code>
                ,{" "}
                <code className="px-1 py-0.5 rounded bg-slate-100 text-xs">
                  5m
                </code>
                , or{" "}
                <code className="px-1 py-0.5 rounded bg-slate-100 text-xs">
                  4y
                </code>{" "}
                indicating remaining time in that scale. The exact number of
                days remaining is displayed in the Selected Task panel on the
                left.
              </p>

              <p className="mt-2">
                The rings and percentage labels (25%, 50%, 75%) indicate how
                much time is left within each region:
              </p>
              <ul className="list-disc list-inside text-sm space-y-1">
                <li>
                  The center represents the earliest part of that region.
                </li>
                <li>
                  The outer edge represents the most urgent part of that
                  region.
                </li>
                <li>
                  As the deadline moves closer, the dot moves toward the outer
                  edge of its region.
                </li>
              </ul>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default Planner;
