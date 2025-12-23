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

type LayoutMode = "spread" | "track";

interface Task {
  id: string;
  date: string; // yyyy-MM-dd
  deadline: string; // yyyy-MM-dd
  project: string;
  projectTag?: string;
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

function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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

function colorForBucket(bucket: TimeBucket): string {
  switch (bucket) {
    case "days":
      return "#ef4444"; // red
    case "weeks":
      return "#ca8a04"; // dark yellow
    case "months":
      return "#16a34a"; // green
    case "years":
      return "#0ea5e9"; // blue
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

function hashStringToInt(input: string): number {
  // deterministic non-crypto hash (good enough for lane assignment)
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
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
    return [
      t.id,
      t.date,
      t.deadline,
      safeProject,
      safeTag,
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
  // Robust, case-insensitive header matching (handles BOM and minor name variants)
  const header = lines[0]
    .split(",")
    .map((h) => h.trim().replace(/^\uFEFF/, ""));
  const headerNorm = header.map((h) => h.toLowerCase());
  const idx = (...names: string[]) => {
    for (const n of names) {
      const j = headerNorm.indexOf(n.toLowerCase());
      if (j >= 0) return j;
    }
    return -1;
  };

  const idxId = idx("id");
  const idxDate = idx("date", "start", "startdate");
  const idxDeadline = idx("deadline", "due", "duedate");
  const idxProject = idx("project", "projectname");
  const idxProjectTag = idx("projecttag", "tag");
  const idxTask = idx("task", "title", "description");
  const idxRegion = idx("region", "starregion", "quadrant");
  const idxBucket = idx("bucket", "timebucket", "horizon");
  const idxRemaining = idx("remainingdays", "remaining", "daysleft");
  const idxCreated = idx("createdat", "created", "created_at");
  const idxFinished = idx("finishedat", "finished", "finished_at");

  const tasks: Task[] = [];

  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim()) continue;
    const cols = splitCSVLine(raw, header.length);
    if (cols.length < header.length) continue;

    const safe = (j: number) => (j >= 0 ? (cols[j] ?? "") : "");

    const id = safe(idxId) || `csv-${i}`;
    const date = safe(idxDate) || todayISO();
    const deadline = safe(idxDeadline) || date;

    // NOTE: We still parse these fields if present, but downstream we recompute
    // region/bucket/remainingDays from (today, deadline) to prevent stale/missing
    // CSV columns from collapsing everything into Region 4.
    const regionRaw = safe(idxRegion);
    const bucketRaw = safe(idxBucket);
    const remainingRaw = safe(idxRemaining);

    const region = ((parseInt(regionRaw || "0", 10) || 0) as StarRegion) || 4;
    const bucket = (bucketRaw as TimeBucket) || "days";
    const remainingDays = parseInt(remainingRaw || "0", 10) || 0;

    const project = safe(idxProject) || "";
    const projectTag = safe(idxProjectTag) || "";
    const task = safe(idxTask) || "";
    const createdAt = safe(idxCreated) || new Date().toISOString();
    const finishedAt = safe(idxFinished) || undefined;

    tasks.push({
      id,
      date,
      deadline,
      region,
      bucket,
      remainingDays,
      project,
      projectTag,
      task,
      createdAt,
      finishedAt,
    });
  }

  return tasks;
}

function normalizeTaskToToday(t: Task, todayISODate: string): Task {
  // Keep finished tasks stable (don’t reshuffle their position on the board).
  if (t.finishedAt) return t;

  // Primary truth: deadline relative to the selected "today".
  // If deadline is missing/malformed, fall back to 1 day.
  const remaining = (() => {
    try {
      const d = diffInDays(todayISODate, t.deadline);
      if (!Number.isFinite(d)) return 1;
      return Math.max(1, d);
    } catch {
      return 1;
    }
  })();

  const inferred = bucketFromDays(remaining);
  if (!inferred) {
    // Out of range: keep prior region/bucket but update remainingDays for labels.
    return { ...t, remainingDays: remaining };
  }

  return {
    ...t,
    remainingDays: remaining,
    region: inferred.region,
    bucket: inferred.bucket,
  };
}

// ---- Planner component ----

const Planner: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const [today, setToday] = useState<string>(todayISO());
  const [newDate, setNewDate] = useState<string>(todayISO());
  const [newDeadline, setNewDeadline] = useState<string>(todayISO());
  const [newProject, setNewProject] = useState("");
  const [newProjectTag, setNewProjectTag] = useState("");
  const [newTask, setNewTask] = useState("");

  // spread = tasks are distributed across lanes by insertion order
  // track  = tasks with the same project share the same lane (so you can see a "project track")
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("spread");

  const [csvText, setCsvText] = useState("");
  const [csvDialogOpen, setCsvDialogOpen] = useState(false);

  const [shareOpen, setShareOpen] = useState(false);
  const [shareText, setShareText] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);

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

  // ---- Load from storage on mount ----
  useEffect(() => {
    setMounted(true);

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: Task[] = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          // On boot, re-normalize tasks to the current "today" value so
          // stale/missing CSV-derived region fields don't collapse the board.
          setTasks(parsed.map((t) => normalizeTaskToToday(t, todayISO())));
        }
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

  // Whenever the user changes "today" (or on first render), re-derive the
  // time-left fields from (today, deadline). This prevents dots from drifting
  // into the wrong region after a restart or CSV re-import.
  useEffect(() => {
    if (!mounted) return;
    setTasks((prev) => prev.map((t) => normalizeTaskToToday(t, today)));
  }, [today, mounted]);

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

  const projectSummary = useMemo(() => {
    // group by project -> tasks sorted by deadline
    const m = new Map<string, { project: string; tag?: string; tasks: Task[] }>();
    for (const t of tasks) {
      const key = (t.project || "").trim();
      const k = key || "(no project)";
      if (!m.has(k)) m.set(k, { project: k, tag: t.projectTag, tasks: [] });
      const entry = m.get(k)!;
      entry.tasks.push(t);
      if (!entry.tag && t.projectTag) entry.tag = t.projectTag;
    }
    return Array.from(m.values())
      .map((x) => ({
        ...x,
        tasks: x.tasks.slice().sort((a, b) => a.deadline.localeCompare(b.deadline)),
      }))
      .sort((a, b) => a.project.localeCompare(b.project));
  }, [tasks]);

  const handleNewProjectChange = (value: string) => {
    setNewProject(value);
    const key = value.trim().toLowerCase();
    if (!key) {
      setNewProjectTag("");
      return;
    }
    const suggested = projectTagLookup.get(key);
    if (suggested) {
      setNewProjectTag(suggested);
    }
  };

  useEffect(() => {
    if (!activeId && tasks.length > 0) {
      setActiveId(tasks[0].id);
    } else if (activeId && !tasks.some((t) => t.id === activeId)) {
      setActiveId(tasks[0]?.id ?? null);
    }
  }, [tasks, activeId]);

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
    const regionCount = tasks.filter((t) => t.region === region).length;
    if (regionCount >= maxPerRegion[region]) {
      alert(
        `Region ${stars(region)} ${regionLabel(
          region
        )} is at capacity (${maxPerRegion[region]} tasks).`
      );
      return;
    }

    const trimmedTag = newProjectTag.trim();

    const t: Task = {
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      date: newDate,
      deadline: newDeadline,
      project: newProject.trim(),
      projectTag: trimmedTag || undefined,
      task: newTask.trim(),
      region,
      bucket,
      remainingDays: remaining,
      createdAt: new Date().toISOString(),
    };

    setTasks((prev) => [...prev, t]);
    setActiveId(t.id);
    setNewTask("");
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
    setEditTask(task);
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

    setTasks((prev) =>
      prev.map((t) =>
        t.id === editTask.id
          ? { ...editTask, region, bucket, remainingDays: remaining }
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
      setTasks(parsed.map((t) => normalizeTaskToToday(t, today)));
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
      setTasks(parsed.map((t) => normalizeTaskToToday(t, today)));
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
    const size = 900;
    const cx = size / 2;
    const cy = size / 2;
    const padding = 60;
    const maxR = size / 2 - padding;
    const ringRadii = [0.25, 0.5, 0.75].map((p) => p * maxR);
    return { size, cx, cy, maxR, ringRadii };
  }, []);

  const { size, cx, cy, maxR, ringRadii } = geometry;

  const regionAngles = {
    4: { start: 180, end: 270 }, // TL
    3: { start: 270, end: 360 }, // TR
    2: { start: 90, end: 180 }, // BL
    1: { start: 0, end: 90 }, // BR
  } satisfies Record<StarRegion, AngleRange>;
  type RegionAngles = typeof regionAngles;

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

  const dotPositions: Record<string, DotPosition> = useMemo(() => {
    const positions: Record<string, DotPosition> = {};
    const perRegionCounts: Record<StarRegion, number> = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
    };

    for (const t of tasks) {
      const idx = perRegionCounts[t.region]++;
      const lanes = Math.max(1, Math.min(10, maxPerRegion[t.region]));

      // Lane assignment strategy:
      // - spread: fill lanes by insertion order (stable within a session)
      // - track:  hash(project) to keep the same project on the same radial lane
      let laneIndex = idx % lanes;
      if (layoutMode === "track") {
        const key = (t.project || "").trim().toLowerCase();
        if (key) laneIndex = hashStringToInt(key) % lanes;
      }

      const angleRange = regionAngles[t.region];
      const angleDeg =
        angleRange.start +
        ((angleRange.end - angleRange.start) * (laneIndex + 0.5)) / lanes;
      const angleRad = (angleDeg * Math.PI) / 180;

      const nSteps = stepsForBucket[t.bucket];
      const step = remainingToStep(t);
      const frac = step / nSteps;
      const r = maxR * (0.15 + 0.8 * frac);

      const x = cx + r * Math.cos(angleRad);
      const y = cy - r * Math.sin(angleRad);

      positions[t.id] = { x, y, radiusNorm: frac, laneIndex };
    }

    return positions;
  }, [tasks, cx, cy, maxR, regionAngles, stepsForBucket, maxPerRegion, layoutMode]);

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

    const frac = Math.min(Math.max(dist / maxR, 0.1), 0.95);

    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== draggingId) return t;
        const nSteps = stepsForBucket[t.bucket];
        let step = Math.round(frac * nSteps);
        if (step < 1) step = 1;
        if (step > nSteps) step = nSteps;

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
    const nSteps = stepsForBucket[t.bucket];
    const step = remainingToStep(t);
    const base = 6;
    const maxExtra = 6;
    const frac = step / nSteps;
    return base + maxExtra * frac;
  };

  const buildRadialGuides = () => {
    if (!mounted) return null; // avoid SSR float mismatch
    const lanes = 10;
    const lines: React.ReactElement[] = [];

    Object.entries(regionAngles).forEach(([regionKey, angleRange]) => {
      const regionNum = Number(regionKey);
      if (regionNum !== 1 && regionNum !== 2 && regionNum !== 3 && regionNum !== 4) return;
      const region: StarRegion = regionNum;

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
            stroke="#e5e7eb"
            strokeWidth={1}
            strokeDasharray="3 5"
            opacity={0.7}
          />
        );
      }
    });

    return lines;
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
        <div className="flex items-baseline justify-between mb-6">
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

        <div className="flex gap-4 items-start">
          {/* Left: New + Selected */}
          <div className="w-[340px] flex flex-col gap-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">New task</CardTitle>
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

                  <label htmlFor="date" className="text-xs">
                    Date
                  </label>
                  <Input
                    id="date"
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
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

                  <label htmlFor="projectTag" className="text-xs">
                    Tag
                  </label>
                  <Input
                    id="projectTag"
                    value={newProjectTag}
                    onChange={(e) => setNewProjectTag(e.target.value)}
                    className="h-8 text-xs"
                    placeholder="Optional (e.g., EMT, iCage, LOI)"
                  />

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

            <Card className="flex-1">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Selected task</CardTitle>
                <CardDescription className="text-xs">
                  Details for the currently selected dot.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-1 text-xs space-y-1">
                {selectedTask ? (
                  <>
                    <p className="font-semibold">
                      Remaining Time:{" "}
                      <span className="font-bold">
                        {compactLabel(selectedTask)} (
                        {selectedTask.remainingDays} days remaining)
                      </span>
                    </p>
                    {selectedTask.project && (
                      <p>
                        <span className="font-semibold">Project:</span>{" "}
                        {selectedTask.project}
                      </p>
                    )}
                    {selectedTask.projectTag && (
                      <p>
                        <span className="font-semibold">Tag:</span>{" "}
                        <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px]">
                          {selectedTask.projectTag}
                        </span>
                      </p>
                    )}
                    <p>
                      <span className="font-semibold">Task:</span>{" "}
                      {selectedTask.task}
                    </p>
                    <p>
                      <span className="font-semibold">Date:</span>{" "}
                      {selectedTask.date}
                    </p>
                    <p>
                      <span className="font-semibold">Deadline:</span>{" "}
                      {formatDateMMDDYYYYFromISODate(
                        selectedTask.deadline
                      )}
                    </p>
                    <p>
                      <span className="font-semibold">Region:</span>{" "}
                      <span className="text-amber-400 font-semibold">
                        {stars(selectedTask.region)}
                      </span>{" "}
                      {regionRange(selectedTask.region)}{" "}
                      <span className="text-slate-500">
                        ({regionLabel(selectedTask.region)})
                      </span>
                    </p>
                    {selectedTask.finishedAt && (
                      <p>
                        <span className="font-semibold">Finished:</span>{" "}
                        {formatDateMMDDYYYYFromISODateTime(
                          selectedTask.finishedAt
                        )}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-slate-400 italic text-xs">
                    No task selected. Click a dot or a task card.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Center: geometry planner */}
          <div className="flex-1 flex flex-col items-center">
            <div className="relative flex justify-center items-center">
              <svg
                ref={svgRef}
                width={size}
                height={size}
                className="rounded-3xl bg-slate-100 shadow-inner border border-slate-200"
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
                  stroke="#e5e7eb"
                  strokeWidth={2}
                />

                {/* axes */}
                <line
                  x1={cx - maxR}
                  y1={cy}
                  x2={cx + maxR}
                  y2={cy}
                  stroke="#d1d5db"
                  strokeWidth={1.5}
                />
                <line
                  x1={cx}
                  y1={cy - maxR}
                  x2={cx}
                  y2={cy + maxR}
                  stroke="#d1d5db"
                  strokeWidth={1.5}
                />

                {/* rings */}
                {ringRadii.map((r, i) => (
                  <circle
                    key={i}
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill="none"
                    stroke="#e5e7eb"
                    strokeWidth={1}
                    strokeDasharray="4 4"
                  />
                ))}

                {/* radial guides */}
                {buildRadialGuides()}

                {/* percentage labels on right */}
                {ringRadii.map((r, idx) => {
                  const perc = [25, 50, 75][idx];
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
                <text
                  x={cx - maxR / 2}
                  y={cy - maxR + 20}
                  textAnchor="middle"
                  fontSize={12}
                  fill="#111827"
                >
                  ★★★★ Important · Urgent
                </text>
                <text
                  x={cx + maxR / 2}
                  y={cy - maxR + 20}
                  textAnchor="middle"
                  fontSize={12}
                  fill="#111827"
                >
                  ★★★ Important · Not urgent
                </text>
                <text
                  x={cx - maxR / 2}
                  y={cy + maxR - 16}
                  textAnchor="middle"
                  fontSize={12}
                  fill="#111827"
                >
                  ★★ Not important · Urgent
                </text>
                <text
                  x={cx + maxR / 2}
                  y={cy + maxR - 16}
                  textAnchor="middle"
                  fontSize={12}
                  fill="#111827"
                >
                  ★ Not important · Not urgent
                </text>

                {/* dots */}
                {tasks.map((t) => {
                  const pos = dotPositions[t.id];
                  if (!pos) return null;
                  const r = dotRadius(t);
                  const label = compactLabel(t);
                  const isActive = t.id === activeId;
                  const strokeColor = isActive ? "#f97316" : "#020617";

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
                        fill={colorForBucket(t.bucket)}
                        stroke={strokeColor}
                        strokeWidth={isActive ? 2.5 : 1.5}
                        opacity={t.finishedAt ? 0.4 : 0.95}
                      />
                      <text
                        x={pos.x}
                        y={pos.y + 3}
                        textAnchor="middle"
                        fontSize={Math.max(9, r - 2)}
                        fontWeight={700}
                        fill="#f9fafb"
                      >
                        {label}
                      </text>

                      {t.projectTag && (
                        <g>
                          <rect
                            x={pos.x + r + 6}
                            y={pos.y - 10}
                            rx={6}
                            ry={6}
                            width={Math.max(28, Math.min(70, t.projectTag.length * 7 + 12))}
                            height={18}
                            fill="#ffffff"
                            stroke="#0f172a"
                            strokeWidth={1}
                            opacity={0.9}
                          />
                          <text
                            x={pos.x + r + 12}
                            y={pos.y + 3}
                            fontSize={10}
                            fontWeight={700}
                            fill="#0f172a"
                          >
                            {t.projectTag}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          {/* Right: Geometry legend + tasks */}
          <div className="w-[360px] flex flex-col gap-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Geometry Time</CardTitle>
                <CardDescription className="text-xs">
                  How colors and stars map to time.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-xs space-y-2">
                <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-2 py-1">
                  <span className="text-[11px] text-slate-700">
                    Layout
                  </span>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant={layoutMode === "spread" ? "default" : "outline"}
                      className="h-7 px-2 text-[11px]"
                      onClick={() => setLayoutMode("spread")}
                    >
                      Spread
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={layoutMode === "track" ? "default" : "outline"}
                      className="h-7 px-2 text-[11px]"
                      onClick={() => setLayoutMode("track")}
                    >
                      Track by project
                    </Button>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-red-500 border border-slate-900" />
                    <span>Days (1–7 d) – ★★★★ Important · Urgent</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-yellow-600 border border-slate-900" />
                    <span>Weeks (1–4 w) – ★★★ Important · Not urgent</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-emerald-500 border border-slate-900" />
                    <span>Months (1–12 m) – ★★ Not important · Urgent</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-sky-500 border border-slate-900" />
                    <span>
                      Years (1–10 y) – ★ Not important · Not urgent
                    </span>
                  </div>
                </div>
                <div className="pt-2 border-t border-slate-200 mt-2">
                  <p className="text-[11px] text-slate-600">
                    Inside each dot you see a compact label like{" "}
                    <code className="bg-slate-100 px-1 rounded text-[10px]">
                      3d
                    </code>
                    ,{" "}
                    <code className="bg-slate-100 px-1 rounded text-[10px]">
                      2w
                    </code>
                    ,{" "}
                    <code className="bg-slate-100 px-1 rounded text-[10px]">
                      5m
                    </code>
                    , or{" "}
                    <code className="bg-slate-100 px-1 rounded text-[10px]">
                      4y
                    </code>{" "}
                    indicating remaining time in that scale.
                  </p>
                  <p className="text-[11px] text-slate-600 mt-1">
                    As deadlines approach, dots move toward the outer edge of
                    their region. The percentage labels (25%, 50%, 75%) mark how
                    much of the region’s time range is left.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="flex-1 flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Tasks</CardTitle>
                <CardDescription className="text-xs">
                  Click a card or dot to focus. Edit, mark done, or remove
                  tasks here.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-1 flex flex-col h-full">
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

                <div className="flex-1 border border-slate-200 rounded-lg p-2 overflow-y-auto max-h-[380px]">
                  <div className="space-y-2">
                    {tasks.length === 0 && (
                      <p className="text-[11px] text-slate-400">
                        No tasks yet. Add one on the left to populate the
                        planner.
                      </p>
                    )}
                    {tasks
                      .slice()
                      .sort((a, b) => a.deadline.localeCompare(b.deadline))
                      .map((t, idx) => {
                        const isActive = t.id === activeId;
                        const dl = formatDateMMDDYYYYFromISODate(t.deadline);

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
                          >
                            <div className="flex-1">
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-1">
                                  <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-slate-800 text-[10px] font-semibold text-slate-50">
                                    {idx + 1}
                                  </span>
                                  <span className="font-semibold">
                                    {compactLabel(t)} ({t.remainingDays} d)
                                  </span>
                                </div>
                                <span className="text-[10px] text-slate-500">
                                  dL: {dl}
                                </span>
                              </div>
                              {t.project && (
                                <div className="text-[10px] text-slate-600">
                                  <span className="font-semibold">
                                    Project:
                                  </span>{" "}
                                  {t.project}
                                </div>
                              )}
                              {t.projectTag && (
                                <div className="text-[10px] text-slate-600 mt-0.5">
                                  <span className="font-semibold">Tag:</span>{" "}
                                  <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5">
                                    {t.projectTag}
                                  </span>
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

        {/* Bottom: project overview (non-color tag readout) */}
        <div className="mt-4 grid grid-cols-12 gap-4">
          <Card className="col-span-12">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Project tracks</CardTitle>
              <CardDescription className="text-xs">
                Projects are listed with their tasks ordered by deadline. With
                "Track by project" layout, tasks from the same project are
                aligned on the same radial lane.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-1">
              {projectSummary.length === 0 ? (
                <p className="text-[11px] text-slate-400">
                  Add tasks to populate project tracks.
                </p>
              ) : (
                <div className="space-y-3">
                  {projectSummary.map((p) => (
                    <div
                      key={p.project}
                      className="rounded-xl border border-slate-200 bg-white p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">
                            {p.project}
                          </p>
                          {p.tag && (
                            <p className="text-[11px] text-slate-600 mt-0.5">
                              Tag:{" "}
                              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5">
                                {p.tag}
                              </span>
                            </p>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500">
                          {p.tasks.length} task{p.tasks.length === 1 ? "" : "s"}
                        </p>
                      </div>

                      <div className="mt-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                        {p.tasks.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => setActiveId(t.id)}
                            className={
                              "text-left rounded-lg border px-3 py-2 text-[11px] transition-colors " +
                              (t.id === activeId
                                ? "bg-amber-100 border-amber-400"
                                : "bg-white border-slate-200 hover:bg-slate-50")
                            }
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-semibold">
                                {stars(t.region)} {compactLabel(t)}
                              </span>
                              <span className="text-slate-500">
                                {formatDateMMDDYYYYFromISODate(t.deadline)}
                              </span>
                            </div>
                            <div className="mt-1 text-slate-800 truncate">
                              {t.task}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
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

              <p className="mt-2">Each task is shown as a colored circle:</p>
              <ul className="list-disc list-inside text-sm space-y-1">
                <li>
                  <span className="font-medium text-red-500">Red</span>: days
                  (1–7 d)
                </li>
                <li>
                  <span className="font-medium text-yellow-600">
                    Dark yellow
                  </span>
                  : weeks (1–4 w)
                </li>
                <li>
                  <span className="font-medium text-emerald-500">Green</span>:
                  months (1–12 m)
                </li>
                <li>
                  <span className="font-medium text-sky-500">Blue</span>: years
                  (1–10 y)
                </li>
              </ul>

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
