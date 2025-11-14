"use client";

import React, { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Download, Trash2 } from "lucide-react";

type QuadKey = "UI" | "NUI" | "UNI" | "NUNI";
type Stars = 1 | 2 | 3 | 4;
type TimeScale = "year" | "month" | "week" | "day" | "hour";

interface TaskItem {
  id: string;
  date: string;
  deadline: string;
  project: string;
  text: string;
  stars: Stars;
  posAngle: number;
  posRadius: number;
  finishDate?: string;
  timeScale: TimeScale;
}

const angleCenter: Record<QuadKey, number> = {
  UI: 135,
  NUI: 45,
  UNI: 225,
  NUNI: 315,
};

const quadLabelByKey: Record<QuadKey, string> = {
  UI: "(1–7 days)",
  NUI: "(1–4 weeks)",
  UNI: "(1–12 months)",
  NUNI: "(1–10 years)",
};

const quadrantForStars = (s: Stars): QuadKey => {
  switch (s) {
    case 1:
      return "NUNI";
    case 2:
      return "UNI";
    case 3:
      return "NUI";
    case 4:
    default:
      return "UI";
  }
};

const starColor = (s: Stars) => {
  switch (s) {
    case 1:
      return "#38bdf8"; // years
    case 2:
      return "#22c55e"; // months
    case 3:
      return "#f97316"; // weeks
    case 4:
    default:
      return "#ef4444"; // days
  }
};

const timeScaleDotRadius = (_ts: TimeScale): number => 24;

function StarSVG({
  size = 14,
  color = "#fbbf24",
}: {
  size?: number;
  color?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="inline-block"
    >
      <path
        d="M12 .587l3.668 7.431 8.2 1.193-5.934 5.787 1.401 8.164L12 18.896l-7.335 3.866 1.401-8.164L.132 9.211l8.2-1.193z"
        fill={color}
        stroke={color}
        strokeWidth={1.5}
      />
    </svg>
  );
}

function StarRow({ stars }: { stars: Stars }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: stars }).map((_, i) => (
        <StarSVG key={i} size={14} />
      ))}
    </span>
  );
}

const clamp = (x: number, min: number, max: number) =>
  Math.max(min, Math.min(max, x));

function daysRemainingNumber(deadline: string): number | null {
  if (!deadline) return null;
  const d = new Date(deadline);
  if (isNaN(d.getTime())) return null;

  const today = new Date();
  const msPerDay = 1000 * 60 * 60 * 24;

  const utcToday = Date.UTC(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );
  const utcDeadline = Date.UTC(
    d.getFullYear(),
    d.getMonth(),
    d.getDate()
  );

  const diff = utcDeadline - utcToday;
  const days = Math.round(diff / msPerDay);
  return days;
}

function formatDeadlineMMDDYYYY(deadline: string): string {
  if (!deadline) return "—";
  const d = new Date(deadline);
  if (isNaN(d.getTime())) return deadline;
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

interface TimeBucket {
  stars: Stars;
  unitIndex: number;
  label: string;
}

function unitsPerStars(stars: Stars): number {
  switch (stars) {
    case 4:
      return 7;
    case 3:
      return 4;
    case 2:
      return 12;
    case 1:
    default:
      return 10;
  }
}

function bucketFromDays(days: number | null): TimeBucket {
  let d = days;
  if (d == null || isNaN(d)) {
    return { stars: 1, unitIndex: 1, label: "1y" };
  }
  if (d <= 0) d = 1;

  if (d <= 7) {
    const N = 7;
    const dMin = 1;
    const dMax = 7;
    const local = (d - dMin) / (dMax - dMin || 1);
    const idxFloat = local * (N - 1);
    const idx = clamp(Math.round(idxFloat) + 1, 1, N);
    return { stars: 4, unitIndex: idx, label: `${idx}d` };
  }

  if (d <= 28) {
    const N = 4;
    const dMin = 8;
    const dMax = 28;
    const local = (d - dMin) / (dMax - dMin || 1);
    const idxFloat = local * (N - 1);
    const idx = clamp(Math.round(idxFloat) + 1, 1, N);
    return { stars: 3, unitIndex: idx, label: `${idx}w` };
  }

  if (d <= 365) {
    const N = 12;
    const dMin = 29;
    const dMax = 365;
    const local = (d - dMin) / (dMax - dMin || 1);
    const idxFloat = local * (N - 1);
    const idx = clamp(Math.round(idxFloat) + 1, 1, N);
    return { stars: 2, unitIndex: idx, label: `${idx}m` };
  }

  {
    const N = 10;
    const dMin = 366;
    const dMax = 3650;
    const clamped = Math.min(Math.max(d, dMin), dMax);
    const local = (clamped - dMin) / (dMax - dMin || 1);
    const idxFloat = local * (N - 1);
    const idx = clamp(Math.round(idxFloat) + 1, 1, N);
    return { stars: 1, unitIndex: idx, label: `${idx}y` };
  }
}

function daysFromBucket(b: TimeBucket): number {
  let N: number;
  let dMin: number;
  let dMax: number;

  switch (b.stars) {
    case 4:
      N = 7;
      dMin = 1;
      dMax = 7;
      break;
    case 3:
      N = 4;
      dMin = 8;
      dMax = 28;
      break;
    case 2:
      N = 12;
      dMin = 29;
      dMax = 365;
      break;
    case 1:
    default:
      N = 10;
      dMin = 366;
      dMax = 3650;
      break;
  }

  const idx = clamp(b.unitIndex, 1, N);
  const localCenter = (idx - 0.5) / N;
  const dFloat = dMin + localCenter * (dMax - dMin);
  const d = Math.round(dFloat);
  return d;
}

function timeScaleFromBucket(b: TimeBucket): TimeScale {
  switch (b.stars) {
    case 4:
      return "day";
    case 3:
      return "week";
    case 2:
      return "month";
    case 1:
    default:
      return "year";
  }
}

function bucketFromStarsAndIndex(stars: Stars, unitIndex: number): TimeBucket {
  const N = unitsPerStars(stars);
  const idx = clamp(unitIndex, 1, N);
  switch (stars) {
    case 4:
      return { stars, unitIndex: idx, label: `${idx}d` };
    case 3:
      return { stars, unitIndex: idx, label: `${idx}w` };
    case 2:
      return { stars, unitIndex: idx, label: `${idx}m` };
    case 1:
    default:
      return { stars, unitIndex: idx, label: `${idx}y` };
  }
}

function daysToRadius(days: number | null): number {
  const b = bucketFromDays(days);
  const N = unitsPerStars(b.stars);
  const idx = clamp(b.unitIndex, 1, N);
  const radiusFrac = (idx - 0.5) / N;
  return radiusFrac;
}

function radiusFromDeadline(deadline: string): number {
  const d = daysRemainingNumber(deadline);
  return daysToRadius(d);
}

function starsFromDeadline(deadline: string): Stars {
  const d = daysRemainingNumber(deadline);
  return bucketFromDays(d).stars;
}

function timeScaleFromDeadline(deadline: string): TimeScale {
  const d = daysRemainingNumber(deadline);
  return timeScaleFromBucket(bucketFromDays(d));
}

function parseTasksFromCSV(text: string): TaskItem[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) return [];

  const header = lines[0].split(",");
  const idx = (name: string) => header.indexOf(name);

  const iId = idx("id");
  const iDate = idx("date");
  const iDeadline = idx("deadline");
  const iProject = idx("project");
  const iTask = idx("task");
  const iFinish = idx("finishDate");

  const tasks: TaskItem[] = [];

  for (let li = 1; li < lines.length; li++) {
    const cols = lines[li].split(",");
    const get = (i: number) =>
      i >= 0 && i < cols.length ? cols[i] : "";

    const rawDeadline = get(iDeadline);
    const deadline = rawDeadline || "";
    const date = get(iDate) || new Date().toISOString().slice(0, 10);
    const project = get(iProject) || "";
    const text = get(iTask) || "";
    const finishDate = get(iFinish) || undefined;

    const stars = starsFromDeadline(deadline);
    const quad = quadrantForStars(stars);
    const posRadius = radiusFromDeadline(deadline);
    const timeScale = timeScaleFromDeadline(deadline);
    const posAngle = angleCenter[quad];

    const id = get(iId) || `import-${li}-${Date.now()}`;

    tasks.push({
      id,
      date,
      deadline,
      project,
      text,
      stars,
      posAngle,
      posRadius,
      timeScale,
      finishDate,
    });
  }

  return tasks;
}

export default function Planner() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [deadline, setDeadline] = useState("");
  const [project, setProject] = useState("");
  const [text, setText] = useState("");
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const [maxPerQuad, setMaxPerQuad] = useState<{
    UI: number;
    NUI: number;
    UNI: number;
    NUNI: number;
  }>({
    UI: 10,
    NUI: 10,
    UNI: 10,
    NUNI: 10,
  });

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editDeadline, setEditDeadline] = useState("");
  const [editProject, setEditProject] = useState("");
  const [editText, setEditText] = useState("");

  const [csvOpen, setCsvOpen] = useState(false);
  const [csvFileName, setCsvFileName] = useState(
    `planner_tasks_${new Date().toISOString().slice(0, 10)}`
  );

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    try {
      const savedTasks = localStorage.getItem("planner_simple_v3");
      if (savedTasks) {
        const parsed = JSON.parse(savedTasks) as TaskItem[];
        setTasks(parsed);
      } else {
        const savedCSV = localStorage.getItem("planner_simple_v3_csv");
        if (savedCSV) {
          const imported = parseTasksFromCSV(savedCSV);
          if (imported.length > 0) {
            setTasks(imported);
          }
        }
      }

      const savedMax = localStorage.getItem("planner_simple_v3_max");
      if (savedMax) {
        const parsedMax = JSON.parse(savedMax) as {
          UI: number;
          NUI: number;
          UNI: number;
          NUNI: number;
        };
        setMaxPerQuad((prev) => ({
          UI: parsedMax.UI ?? prev.UI,
          NUI: parsedMax.NUI ?? prev.NUI,
          UNI: parsedMax.UNI ?? prev.UNI,
          NUNI: parsedMax.NUNI ?? prev.NUNI,
        }));
      }
    } catch {
      //
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("planner_simple_v3", JSON.stringify(tasks));
    } catch {
      //
    }
  }, [tasks]);

  useEffect(() => {
    try {
      localStorage.setItem("planner_simple_v3_max", JSON.stringify(maxPerQuad));
    } catch {
      //
    }
  }, [maxPerQuad]);

  const quadCounts: Record<QuadKey, number> = {
    UI: 0,
    NUI: 0,
    UNI: 0,
    NUNI: 0,
  };
  tasks.forEach((t) => {
    const s = starsFromDeadline(t.deadline);
    const q = quadrantForStars(s);
    quadCounts[q] += 1;
  });

  const addTask = () => {
    if (!text.trim()) return;

    const derivedStars = starsFromDeadline(deadline);
    const quad = quadrantForStars(derivedStars);

    if (quadCounts[quad] >= maxPerQuad[quad]) {
      setWarning(
        `${quadLabelByKey[quad]} is full (${quadCounts[quad]}/${maxPerQuad[quad]}). Consider finishing or moving a task before adding more.`
      );
      return;
    }

    const posRadius = radiusFromDeadline(deadline);
    const derivedScale = timeScaleFromDeadline(deadline);

    const t: TaskItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      date,
      deadline,
      project,
      text: text.trim(),
      stars: derivedStars,
      posAngle: angleCenter[quad],
      posRadius,
      timeScale: derivedScale,
    };
    setTasks((prev) => [t, ...prev]);
    setActiveId(t.id);
    setText("");
    setProject("");
    setDeadline("");
    setWarning(null);
    setTimeout(() => {
      const el = itemRefs.current[t.id];
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 40);
  };

  const markDone = (id: string) => {
    const today = new Date().toISOString().slice(0, 10);
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, finishDate: today } : t))
    );
  };

  const removeTask = (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    if (activeId === id) setActiveId(null);
  };

  const openEdit = (t: TaskItem) => {
    setEditingTask(t);
    setEditDate(t.date);
    setEditDeadline(t.deadline);
    setEditProject(t.project);
    setEditText(t.text);
  };

  const saveEdit = () => {
    if (!editingTask) return;

    const derivedStars = starsFromDeadline(editDeadline);
    const quad = quadrantForStars(derivedStars);
    const currentQuad = quadrantForStars(
      starsFromDeadline(editingTask.deadline)
    );
    const nextCount = quadCounts[quad] + (quad === currentQuad ? 0 : 1);

    if (nextCount > maxPerQuad[quad]) {
      setWarning(
        `${quadLabelByKey[quad]} is full (${quadCounts[quad]}/${maxPerQuad[quad]}). Cannot move this task here.`
      );
      return;
    }

    const posRadius = radiusFromDeadline(editDeadline);
    const derivedScale = timeScaleFromDeadline(editDeadline);

    setTasks((prev) =>
      prev.map((t) =>
        t.id === editingTask.id
          ? {
              ...t,
              date: editDate,
              deadline: editDeadline,
              project: editProject,
              text: editText,
              stars: derivedStars,
              posAngle: angleCenter[quad],
              posRadius,
              timeScale: derivedScale,
            }
          : t
      )
    );
    setEditingTask(null);
    setWarning(null);
  };

  const csvText = (() => {
    const header = [
      "index",
      "id",
      "date",
      "deadline",
      "project",
      "task",
      "stars",
      "quadrant",
      "timeScale",
      "posAngle_deg",
      "posRadius_fraction",
      "finishDate",
    ];
    const rows = tasks.map((t, i) => {
      const s = starsFromDeadline(t.deadline);
      const q = quadLabelByKey[quadrantForStars(s)];
      const ts = timeScaleFromDeadline(t.deadline);
      return [
        String(i + 1),
        t.id,
        t.date,
        t.deadline || "",
        t.project.replaceAll('"', '""'),
        t.text.replaceAll('"', '""'),
        String(s),
        q,
        ts,
        String(t.posAngle),
        String(t.posRadius.toFixed(3)),
        t.finishDate || "",
      ];
    });
    return [header, ...rows].map((r) => r.join(",")).join("\n");
  })();

  useEffect(() => {
    try {
      localStorage.setItem("planner_simple_v3_csv", csvText);
    } catch {
      //
    }
  }, [csvText]);

  const downloadCSV = () => {
    const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeName =
      (csvFileName || "planner_tasks").replace(/[^a-zA-Z0-9_\-]/g, "_") +
      ".csv";
    a.download = safeName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const imported = parseTasksFromCSV(text);
      if (imported.length > 0) {
        setTasks(imported);
        setActiveId(imported[0].id);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // Planner size
  const size = 900;
  const r = size * 0.48;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = r - 16;

  const dots = (() => {
    const byQuad: Record<QuadKey, TaskItem[]> = {
      UI: [],
      NUI: [],
      UNI: [],
      NUNI: [],
    };

    tasks.forEach((t) => {
      const s = starsFromDeadline(t.deadline);
      const q = quadrantForStars(s);
      byQuad[q].push(t);
    });

    const placed: {
      id: string;
      x: number;
      y: number;
      color: string;
      idx: number;
      timeScale: TimeScale;
      label: string;
    }[] = [];
    let globalIndex = 1;

    (["UI", "NUI", "UNI", "NUNI"] as QuadKey[]).forEach((q) => {
      const list = byQuad[q];
      list.forEach((t, i) => {
        const s = starsFromDeadline(t.deadline);
        const base = angleCenter[q];
        const angle = base + (i - (list.length - 1) / 2) * 12;
        const radFrac = radiusFromDeadline(t.deadline);
        const rad = radFrac * maxR;
        const angRad = (angle * Math.PI) / 180;
        const x = cx + rad * Math.cos(angRad);
        const y = cy - rad * Math.sin(angRad);
        const dNum = daysRemainingNumber(t.deadline);
        const bucket = bucketFromDays(dNum);
        const computedScale = timeScaleFromBucket(bucket);

        placed.push({
          id: t.id,
          x,
          y,
          color: starColor(s),
          idx: globalIndex++,
          timeScale: computedScale,
          label: bucket.label,
        });
      });
    });
    return placed;
  })();

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) : null;
  let activeBucket: TimeBucket | null = null;
  let activeDaysNumber: number | null = null;
  if (activeTask) {
    activeDaysNumber = daysRemainingNumber(activeTask.deadline);
    activeBucket = bucketFromDays(activeDaysNumber);
  }

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
    if (!dragId) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const dx = mx - cx;
    const dy = my - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const radiusFrac = Math.max(0, Math.min(1, dist / maxR));

    let newQuad: QuadKey;
    if (mx <= cx && my <= cy) {
      newQuad = "UI";
    } else if (mx >= cx && my <= cy) {
      newQuad = "NUI";
    } else if (mx <= cx && my >= cy) {
      newQuad = "UNI";
    } else {
      newQuad = "NUNI";
    }

    const newStars: Stars =
      newQuad === "UI" ? 4 : newQuad === "NUI" ? 3 : newQuad === "UNI" ? 2 : 1;

    const currentTask = tasks.find((t) => t.id === dragId);
    if (currentTask) {
      const currentStars = starsFromDeadline(currentTask.deadline);
      const currentQuad = quadrantForStars(currentStars);
      if (newQuad !== currentQuad && quadCounts[newQuad] >= maxPerQuad[newQuad]) {
        return;
      }
    }

    const N = unitsPerStars(newStars);
    const idx = clamp(Math.floor(radiusFrac * N) + 1, 1, N);
    const newBucket = bucketFromStarsAndIndex(newStars, idx);
    const newDaysRemaining = daysFromBucket(newBucket);

    const today = new Date();
    const base = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    );
    const msPerDay = 1000 * 60 * 60 * 24;
    const deadlineMs = base.getTime() + newDaysRemaining * msPerDay;
    const newDeadlineDate = new Date(deadlineMs);
    const iso = newDeadlineDate.toISOString().slice(0, 10);

    const dyPolar = cy - my;
    const angleRaw = (Math.atan2(dyPolar, dx) * 180) / Math.PI;
    let angle = angleRaw;
    if (angle < 0) angle += 360;

    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== dragId) return t;

        const derivedStars = starsFromDeadline(iso);
        const newScale = timeScaleFromDeadline(iso);
        const newRadiusFromDeadline = radiusFromDeadline(iso);

        return {
          ...t,
          posAngle: angle,
          posRadius: newRadiusFromDeadline,
          stars: derivedStars,
          deadline: iso,
          timeScale: newScale,
        };
      })
    );
  };

  const handleCapacityChange = (key: QuadKey, value: string) => {
    const parsed = parseInt(value, 10);
    if (Number.isNaN(parsed) || parsed < 1) return;
    setMaxPerQuad((prev) => ({ ...prev, [key]: parsed }));
  };

  // ---- RENDER ----
  return (
    <div className="w-full min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-200">
      <div className="max-w-[1800px] mx-auto px-4 py-6 lg:px-8 lg:py-8">
        <div className="flex items-baseline justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              gPlanner
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Geometry-based priority planner with time-to-deadline encoding.
            </p>
          </div>
        </div>

        <div className="flex flex-row gap-6 items-start">
          {/* LEFT COLUMN */}
          <div
            className="flex flex-col w-[360px] justify-between"
            style={{ height: size }}
          >
            <Card className="shadow-md border border-slate-200/80 bg-white/90 backdrop-blur-sm">
              <CardContent className="p-4 space-y-3">
                <div className="text-xl font-semibold text-slate-900">
                  New task
                </div>
                {warning && (
                  <div className="text-xs bg-red-50 text-red-700 border border-red-200 rounded-md px-2 py-1">
                    {warning}
                  </div>
                )}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">
                    Date
                  </label>
                  <Input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">
                    Deadline
                  </label>
                  <Input
                    type="date"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">
                    Project
                  </label>
                  <Input
                    value={project}
                    onChange={(e) => setProject(e.target.value)}
                    placeholder="Project name"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">
                    Task
                  </label>
                  <Textarea
                    rows={3}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Describe the task…"
                  />
                </div>
                <div className="text-xs text-slate-600 space-y-1 border-t border-slate-100 pt-2">
                  <div>★★★★ Important – Urgent</div>
                  <div>★★★ Important – Not urgent</div>
                  <div>★★ Not important – Urgent</div>
                  <div>★ Not important – Not urgent</div>
                </div>
                <Button
                  className="w-full mt-2 bg-slate-900 hover:bg-slate-800"
                  onClick={addTask}
                >
                  Add task
                </Button>
              </CardContent>
            </Card>

            {/* SELECTED TASK – UPDATED FORMAT */}
            <Card className="shadow-md border border-slate-200/80 bg-white/90 backdrop-blur-sm">
              <CardContent className="p-4 space-y-2">
                <div className="text-lg font-semibold text-slate-900">
                  Selected task
                </div>
                {activeTask ? (
                  <div className="text-sm space-y-1 text-slate-800">
                    {activeBucket && (
                      <div>
                        <span className="font-medium">Remaining Time:</span>{" "}
                        {activeBucket.label}
                        {activeDaysNumber != null &&
                          ` (${activeDaysNumber} days remaining)`}
                      </div>
                    )}
                    <div>
                      <span className="font-medium">Project:</span>{" "}
                      {activeTask.project || "Untitled"}
                    </div>
                    <div>
                      <span className="font-medium">Task:</span>{" "}
                      {activeTask.text}
                    </div>
                    <div>
                      <span className="font-medium">Date:</span>{" "}
                      {activeTask.date}
                    </div>
                    <div>
                      <span className="font-medium">Deadline:</span>{" "}
                      {formatDeadlineMMDDYYYY(activeTask.deadline)}
                    </div>
                    <div>
                      <span className="font-medium">Region:</span>{" "}
                      {"★".repeat(
                        starsFromDeadline(activeTask.deadline) || 1
                      )}{" "}
                      {
                        quadLabelByKey[
                          quadrantForStars(
                            starsFromDeadline(activeTask.deadline)
                          )
                        ]
                      }
                    </div>
                    {activeTask.finishDate && (
                      <div>
                        <span className="font-medium">Finished:</span>{" "}
                        {activeTask.finishDate}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-slate-500">
                    Click a dot in the planner or a task on the right.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* CENTER – PLANNER */}
          <div
            className="relative flex-shrink-0"
            style={{ width: size, height: size }}
          >
            {/* Top urgency labels */}
            <div
              className="absolute bg-slate-900 text-white rounded-md py-1 text-center text-base font-semibold shadow-sm"
              style={{ left: cx - r, top: cy - r - 32, width: r }}
            >
              <div className="flex items-center justify-center gap-1">
                <StarSVG size={14} />
                <StarSVG size={14} />
                <span>Urgent</span>
              </div>
            </div>
            <div
              className="absolute bg-slate-900 text-white rounded-md py-1 text-center text-base font-semibold shadow-sm"
              style={{ left: cx, top: cy - r - 32, width: r }}
            >
              <div className="flex items-center justify-center gap-1">
                <StarSVG size={14} />
                <span>Not urgent</span>
              </div>
            </div>

            {/* 25/50/75 labels */}
            {(() => {
              const specs: { label: string; frac: number }[] = [
                { label: "75%", frac: 0.25 },
                { label: "50%", frac: 0.5 },
                { label: "25%", frac: 0.75 },
              ];
              return specs.map(({ label, frac }) => {
                const rr = maxR * frac;
                const yRing = cy - rr;
                const top = yRing - 14;
                return (
                  <div
                    key={label}
                    className="absolute flex items-center justify-center"
                    style={{
                      left: cx - 40,
                      top,
                      width: 80,
                    }}
                  >
                    <span
                      className="px-3 py-0.5 rounded-full text-white font-semibold text-base shadow-sm"
                      style={{ backgroundColor: "#8b5cf6" }}
                    >
                      {label}
                    </span>
                  </div>
                );
              });
            })()}

            {/* Importance labels */}
            <div
              className="absolute bg-slate-900 text-white rounded-md px-2 py-1 flex items-center justify-center text-base font-semibold shadow-sm"
              style={{ left: cx - r - 52, top: cy - r, height: r }}
            >
              <div className="flex flex-col items-center gap-1">
                <div className="flex flex-col items-center gap-0.5">
                  <StarSVG size={14} />
                  <StarSVG size={14} />
                </div>
                <div
                  style={{
                    writingMode: "vertical-rl",
                    transform: "rotate(180deg)",
                  }}
                >
                  Important
                </div>
              </div>
            </div>
            <div
              className="absolute bg-slate-900 text-white rounded-md px-2 py-1 flex items-center justify-center text-base font-semibold shadow-sm"
              style={{ left: cx - r - 52, top: cy, height: r }}
            >
              <div className="flex flex-col items-center gap-1">
                <div className="flex flex-col items-center gap-0.5">
                  <StarSVG size={14} color="#ffffff" />
                </div>
                <div
                  style={{
                    writingMode: "vertical-rl",
                    transform: "rotate(180deg)",
                  }}
                >
                  Not important
                </div>
              </div>
            </div>

            <svg
              ref={svgRef}
              width={size}
              height={size}
              className="rounded-3xl shadow-xl bg-white"
              style={{ touchAction: "none" }}
              onMouseMove={handleMouseMove}
              onMouseUp={() => setDragId(null)}
              onMouseLeave={() => setDragId(null)}
            >
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill="#d1d5db"
                stroke="#e5e7eb"
                strokeWidth={2}
              />
              <line
                x1={cx}
                y1={cy - r}
                x2={cx}
                y2={cy + r}
                stroke="#e5e7eb"
                strokeWidth={2}
              />
              <line
                x1={cx - r}
                y1={cy}
                x2={cx + r}
                y2={cy}
                stroke="#e5e7eb"
                strokeWidth={2}
              />

              {[0.25, 0.5, 0.75].map((frac, idx) => {
                const rr = maxR * frac;
                return (
                  <circle
                    key={idx}
                    cx={cx}
                    cy={cy}
                    r={rr}
                    fill="none"
                    stroke="#f9fafb"
                    strokeWidth={1.5}
                    strokeDasharray="6 6"
                  />
                );
              })}

              {dots.map((d) => {
                const dotR = timeScaleDotRadius(d.timeScale);
                return (
                  <g
                    key={d.id}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setDragId(d.id);
                      setActiveId(d.id);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveId(d.id);
                      setTimeout(() => {
                        const el = itemRefs.current[d.id];
                        el?.scrollIntoView({
                          behavior: "smooth",
                          block: "center",
                        });
                      }, 40);
                    }}
                    style={{ cursor: "grab" }}
                  >
                    <circle
                      cx={d.x}
                      cy={d.y}
                      r={dotR}
                      fill={d.color}
                      stroke={d.color}
                      strokeWidth={1.5}
                    />
                    <text
                      x={d.x}
                      y={d.y + 6}
                      textAnchor="middle"
                      fontSize={18}
                      fill="#ffffff"
                      fontWeight="bold"
                      stroke="#111827"
                      strokeWidth={1.2}
                      paintOrder="stroke"
                      style={{ pointerEvents: "none", userSelect: "none" }}
                    >
                      {d.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* RIGHT COLUMN */}
          <div
            className="flex flex-col w-[360px] justify-between"
            style={{ height: size }}
          >
            <Card className="shadow-md border border-slate-200/80 bg-white/95 backdrop-blur-sm">
              <CardContent className="p-3 text-xs text-slate-800 space-y-1">
                <div className="font-semibold text-[11px] mb-1 tracking-wide text-slate-700">
                  Geometry Time
                </div>
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="7" fill="#38bdf8" />
                  </svg>
                  <span>Years (1y–10y)</span>
                </div>
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="7" fill="#22c55e" />
                  </svg>
                  <span>Months (1m–12m)</span>
                </div>
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="7" fill="#f97316" />
                  </svg>
                  <span>Weeks (1w–4w)</span>
                </div>
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="7" fill="#ef4444" />
                  </svg>
                  <span>Days (1d–7d)</span>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-md border border-slate-200/80 bg-white/90 backdrop-blur-sm flex-1">
              <CardContent className="p-4 space-y-3 h-full flex flex-col">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="text-lg font-semibold text-slate-900">
                    Tasks
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      title="Load CSV"
                      onClick={() => fileInputRef.current?.click()}
                      className="h-7 w-10 border-slate-300"
                    >
                      <span className="text-[10px] font-bold">LOAD</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      title="Preview CSV"
                      onClick={() => setCsvOpen(true)}
                      className="h-7 w-10 border-slate-300"
                    >
                      <span className="text-xs font-bold">CSV</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      title="Download CSV"
                      onClick={downloadCSV}
                      className="h-7 w-10 border-slate-300"
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      ref={fileInputRef}
                      className="hidden"
                      onChange={handleImportCSV}
                    />
                  </div>
                </div>

                <div className="space-y-1 text-xs">
                  <div className="font-semibold text-slate-700">
                    Max tasks / region
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center gap-1">
                      <span>★★★★</span>
                      <Input
                        type="number"
                        min={1}
                        max={99}
                        value={maxPerQuad.UI}
                        onChange={(e) =>
                          handleCapacityChange("UI", e.target.value)
                        }
                        className="h-7 w-16 text-xs"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <span>★★★</span>
                      <Input
                        type="number"
                        min={1}
                        max={99}
                        value={maxPerQuad.NUI}
                        onChange={(e) =>
                          handleCapacityChange("NUI", e.target.value)
                        }
                        className="h-7 w-16 text-xs"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <span>★★</span>
                      <Input
                        type="number"
                        min={1}
                        max={99}
                        value={maxPerQuad.UNI}
                        onChange={(e) =>
                          handleCapacityChange("UNI", e.target.value)
                        }
                        className="h-7 w-16 text-xs"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <span>★</span>
                      <Input
                        type="number"
                        min={1}
                        max={99}
                        value={maxPerQuad.NUNI}
                        onChange={(e) =>
                          handleCapacityChange("NUNI", e.target.value)
                        }
                        className="h-7 w-16 text-xs"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-1 text-xs text-slate-700 border-t border-slate-100 pt-2">
                  <div
                    className={
                      quadCounts.UI > maxPerQuad.UI
                        ? "text-red-600"
                        : "text-slate-700"
                    }
                  >
                    ★★★★ (1–7 d): {quadCounts.UI}/{maxPerQuad.UI}
                  </div>
                  <div
                    className={
                      quadCounts.NUI > maxPerQuad.NUI
                        ? "text-red-600"
                        : "text-slate-700"
                    }
                  >
                    ★★★ (1–4 w): {quadCounts.NUI}/{maxPerQuad.NUI}
                  </div>
                  <div
                    className={
                      quadCounts.UNI > maxPerQuad.UNI
                        ? "text-red-600"
                        : "text-slate-700"
                    }
                  >
                    ★★ (1–12 m): {quadCounts.UNI}/{maxPerQuad.UNI}
                  </div>
                  <div
                    className={
                      quadCounts.NUNI > maxPerQuad.NUNI
                        ? "text-red-600"
                        : "text-slate-700"
                    }
                  >
                    ★ (1–10 y): {quadCounts.NUNI}/{maxPerQuad.NUNI}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-slate-500">
                    CSV file name (folder is chosen by your browser / system)
                  </label>
                  <Input
                    value={csvFileName}
                    onChange={(e) => setCsvFileName(e.target.value)}
                    placeholder="planner_tasks"
                    className="h-8 text-xs"
                  />
                </div>

                <div className="space-y-2 max-h-[260px] overflow-auto flex-1">
                  {tasks.length === 0 && (
                    <div className="text-sm text-slate-500">
                      No tasks yet.
                    </div>
                  )}
                  {tasks.map((t, i) => {
                    const s = starsFromDeadline(t.deadline);
                    const dNum = daysRemainingNumber(t.deadline);
                    const b = bucketFromDays(dNum);
                    return (
                      <div
                        key={t.id}
                        ref={(el) => (itemRefs.current[t.id] = el)}
                        onClick={() => setActiveId(t.id)}
                        className={
                          "rounded-xl border p-2 text-sm flex items-start justify-between gap-2 cursor-pointer transition-colors " +
                          (t.id === activeId
                            ? "border-slate-900 bg-slate-50"
                            : "border-slate-200 hover:bg-slate-50/60")
                        }
                      >
                        <div>
                          <div className="text-[11px] text-slate-700">
                            rD: {b.label}
                            {dNum != null && ` (${dNum}d)`}
                          </div>
                          <div className="text-[11px] text-slate-700">
                            dL: {formatDeadlineMMDDYYYY(t.deadline)}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="inline-flex items-center justify-center w-5 h-5 text-[11px] font-bold rounded-full bg-slate-900 text-white">
                              {i + 1}
                            </span>
                            <div className="font-medium truncate text-slate-900">
                              {t.text}
                            </div>
                          </div>
                          <div className="text-xs text-slate-500 truncate">
                            {t.project || "Untitled"} · {t.date}
                          </div>
                          <div className="text-xs text-slate-500 flex items-center gap-2">
                            <span>Region:</span>
                            <StarRow stars={s} />
                            <span className="truncate">
                              {
                                quadLabelByKey[
                                  quadrantForStars(
                                    starsFromDeadline(t.deadline)
                                  )
                                ]
                              }
                            </span>
                          </div>
                          {t.finishDate && (
                            <div className="text-[11px] text-slate-500 truncate">
                              Done: {t.finishDate}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col gap-1 items-end">
                          <button
                            className="px-2 py-0.5 text-[11px] border border-slate-300 rounded hover:bg-slate-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEdit(t);
                            }}
                          >
                            Edit
                          </button>
                          <button
                            className="px-2 py-0.5 text-[11px] border border-slate-300 rounded hover:bg-slate-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              markDone(t.id);
                            }}
                          >
                            Done
                          </button>
                          <button
                            className="p-1 hover:bg-rose-50 rounded"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeTask(t.id);
                            }}
                            title="Delete"
                          >
                            <Trash2 className="w-3 h-3 text-rose-500" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* CSV Preview dialog */}
        <Dialog open={csvOpen} onOpenChange={setCsvOpen}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>CSV preview</DialogTitle>
              <DialogDescription>
                This is exactly what will be saved when you download.
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[60vh] overflow-auto mt-2">
              <pre className="text-xs whitespace-pre bg-slate-50 p-3 rounded border border-slate-200">
                {csvText}
              </pre>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit task dialog */}
        <Dialog
          open={!!editingTask}
          onOpenChange={(open) => {
            if (!open) setEditingTask(null);
          }}
        >
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit task</DialogTitle>
            </DialogHeader>
            {editingTask && (
              <div className="space-y-3 mt-2">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">
                    Date
                  </label>
                  <Input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">
                    Deadline
                  </label>
                  <Input
                    type="date"
                    value={editDeadline}
                    onChange={(e) => setEditDeadline(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">
                    Project
                  </label>
                  <Input
                    value={editProject}
                    onChange={(e) => setEditProject(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">
                    Task
                  </label>
                  <Textarea
                    rows={3}
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditingTask(null)}
                  >
                    Cancel
                  </Button>
                  <Button type="button" onClick={saveEdit}>
                    Save
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
