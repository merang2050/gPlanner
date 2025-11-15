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
import { ChevronDown, Download, Trash2, Share2 } from "lucide-react";

type QuadKey = "UI" | "NUI" | "UNI" | "NUNI";
type Stars = 1 | 2 | 3 | 4;
type TimeScale = "year" | "month" | "week" | "day";

type TaskRaw = {
  id: string;
  date: string;
  deadline: string;
  project: string;
  text: string;
  quad: QuadKey;
  rDay: string;
  deadlineShort: string;
  posAngle: number;
  posRadius: number;
  stars: Stars;
  timeScale: TimeScale;
  finishDate?: string;
};

type TaskItem = TaskRaw;

type QuadCounts = {
  UI: number;
  NUI: number;
  UNI: number;
  NUNI: number;
};

const defaultQuadCounts: QuadCounts = {
  UI: 0,
  NUI: 0,
  UNI: 0,
  NUNI: 0,
};

const quadAngles: Record<QuadKey, number> = {
  UI: 45,
  UNI: 135,
  NUNI: 225,
  NUI: 315,
};

// All displayed stars should be golden
const starColor = (_stars: Stars): string => "#facc15";

const quadLabelByKey: Record<QuadKey, string> = {
  UI: "Urgent · Important",
  NUI: "Not urgent · Important",
  UNI: "Urgent · Not important",
  NUNI: "Not urgent · Not important",
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
      return "UI";
  }
};

const starsForQuadrant = (q: QuadKey): Stars => {
  switch (q) {
    case "UI":
      return 4;
    case "NUI":
      return 3;
    case "UNI":
      return 2;
    case "NUNI":
      return 1;
  }
};

const timeScaleLabel: Record<TimeScale, string> = {
  year: "Year-scale",
  month: "Month-scale",
  week: "Week-scale",
  day: "Day-scale",
};

const timeScaleDotRadius = (ts: TimeScale): number => {
  switch (ts) {
    case "year":
      return 18;
    case "month":
      return 16;
    case "week":
      return 14;
    case "day":
      return 12;
  }
};

const storageKey = "geometry_planner_tasks_v1";

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

function downloadBlob(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.setAttribute("download", filename);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function uploadFromFile(onLoaded: (text: string) => void) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".csv,text/csv";
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text === "string") {
        onLoaded(text);
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

function formatLocalDate(date: string): string {
  if (!date) return "";
  const d = new Date(date);
  if (isNaN(d.getTime())) return date;
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${mm}:${dd}:${yy}`;
}

const MAX_PER_QUAD = 10;

function computeQuadCounts(tasks: TaskItem[]): QuadCounts {
  const counts: QuadCounts = { UI: 0, NUI: 0, UNI: 0, NUNI: 0 };
  tasks.forEach((t) => {
    counts[t.quad] = (counts[t.quad] || 0) + 1;
  });
  return counts;
}

function toCsv(tasks: TaskItem[]): string {
  const header = [
    "id",
    "date",
    "deadline",
    "deadline_short",
    "project",
    "text",
    "quad",
    "rDay",
    "posAngle",
    "posRadius",
    "stars",
    "timeScale",
    "finishDate",
  ];
  const rows = tasks.map((t) => [
    t.id,
    t.date,
    t.deadline,
    t.deadlineShort,
    t.project,
    t.text.replace(/\n/g, " "),
    t.quad,
    t.rDay,
    t.posAngle.toFixed(3),
    t.posRadius.toFixed(3),
    String(t.stars),
    t.timeScale,
    t.finishDate ?? "",
  ]);
  return [header.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

function fromCsv(text: string): TaskRaw[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) return [];
  const header = lines[0].split(",");
  const idx = (name: string) => header.indexOf(name);

  const idIdx = idx("id");
  const dateIdx = idx("date");
  const deadlineIdx = idx("deadline");
  const deadlineShortIdx = idx("deadline_short");
  const projectIdx = idx("project");
  const textIdx = idx("text");
  const quadIdx = idx("quad");
  const rDayIdx = idx("rDay");
  const angleIdx = idx("posAngle");
  const radiusIdx = idx("posRadius");
  const starsIdx = idx("stars");
  const tsIdx = idx("timeScale");
  const finishIdx = idx("finishDate");

  const out: TaskRaw[] = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",");
    if (parts.length < 10) continue;
    const quad = parts[quadIdx] as QuadKey;
    const stars = Number(parts[starsIdx]) as Stars;
    const timeScale = (parts[tsIdx] as TimeScale) ?? "week";
    const finishDate = finishIdx >= 0 ? parts[finishIdx] : "";

    out.push({
      id: parts[idIdx] || String(i),
      date: parts[dateIdx] || "",
      deadline: parts[deadlineIdx] || "",
      deadlineShort: parts[deadlineShortIdx] || "",
      project: parts[projectIdx] || "",
      text: parts[textIdx] || "",
      quad,
      rDay: parts[rDayIdx] || "",
      posAngle: Number(parts[angleIdx]) || 0,
      posRadius: Number(parts[radiusIdx]) || 0.5,
      stars,
      timeScale,
      finishDate,
    });
  }

  return out;
}

function daysRemaining(deadline: string): string {
  if (!deadline) return "—";
  const today = new Date();
  const d = new Date(deadline);
  if (isNaN(d.getTime())) return "—";
  const msPerDay = 1000 * 60 * 60 * 24;
  const diff = d.setHours(0, 0, 0, 0) - today.setHours(0, 0, 0, 0);
  const days = Math.round(diff / msPerDay);
  return String(days);
}

function formatDeadlineShort(deadline: string): string {
  if (!deadline) return "";
  const d = new Date(deadline);
  if (isNaN(d.getTime())) return deadline;
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${mm}/${dd}/${yy}`;
}

function computeInitialAngle(stars: Stars): number {
  switch (stars) {
    case 4:
      return 45;
    case 3:
      return 315;
    case 2:
      return 135;
    case 1:
      return 225;
  }
}

function computeBandRadius(stars: Stars, deadline: string): number {
  const r = daysRemaining(deadline);
  if (r === "—") {
    return 0.5;
  }
  const days = Number(r);
  if (Number.isNaN(days)) return 0.5;

  if (stars === 4) {
    const d = clamp(days, 1, 7);
    const frac = (d - 1) / (7 - 1);
    return 0.2 + 0.8 * (1 - frac);
  } else if (stars === 3) {
    const weeks = clamp(Math.ceil(days / 7), 1, 4);
    const frac = (weeks - 1) / (4 - 1);
    return 0.2 + 0.8 * (1 - frac);
  } else if (stars === 2) {
    const months = clamp(Math.ceil(days / 30), 1, 12);
    const frac = (months - 1) / (12 - 1);
    return 0.2 + 0.8 * (1 - frac);
  } else {
    const years = clamp(Math.ceil(days / 365), 1, 10);
    const frac = (years - 1) / (10 - 1);
    return 0.2 + 0.8 * (1 - frac);
  }
}

function computeStarFromDeadline(deadline: string): Stars {
  const r = daysRemaining(deadline);
  if (r === "—") return 4;
  const days = Number(r);
  if (Number.isNaN(days)) return 4;
  if (days <= 7) return 4;
  if (days <= 30) return 3;
  if (days <= 365) return 2;
  return 1;
}

function polarToCartesian(
  cx: number,
  cy: number,
  radius: number,
  angleDeg: number
) {
  const angleRad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(angleRad),
    y: cy + radius * Math.sin(angleRad),
  };
}

function cartesianToPolar(
  cx: number,
  cy: number,
  x: number,
  y: number
): { angle: number; radius: number } {
  const dx = x - cx;
  const dy = y - cy;
  let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (angle < 0) angle += 360;
  const radius = Math.sqrt(dx * dx + dy * dy);
  return { angle, radius };
}

function nearestQuadrant(angle: number): QuadKey {
  const quads: QuadKey[] = ["UI", "UNI", "NUNI", "NUI"];
  let bestQuad: QuadKey = "UI";
  let bestDist = Infinity;
  for (const q of quads) {
    const center = quadAngles[q];
    let diff = Math.abs(angle - center);
    if (diff > 180) diff = 360 - diff;
    if (diff < bestDist) {
      bestDist = diff;
      bestQuad = q;
    }
  }
  return bestQuad;
}

type StarProps = {
  color?: string;
  size?: number;
};

function StarSVG({ color = "#facc15", size = 18 }: StarProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
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

function StarSelect({
  value,
  onChange,
}: {
  value: Stars;
  onChange: (v: Stars) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!open) return;
      const target = e.target as Node;
      if (containerRef.current && containerRef.current.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  const labelRow = (n: Stars) => (
    <div className="flex items-center gap-1">
      {Array.from({ length: n }).map((_, i) => (
        <StarSVG key={i} color={starColor(n)} size={18} />
      ))}
    </div>
  );

  return (
    <div className="relative inline-block" ref={containerRef}>
      <button
        type="button"
        className="border rounded-md px-2 py-1 bg-white flex items-center gap-2 hover:bg-neutral-50"
        onClick={() => setOpen((o) => !o)}
      >
        {labelRow(value)}
        <ChevronDown className="w-4 h-4 text-neutral-500" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-48 bg-white border rounded-md shadow-lg p-2 space-y-1">
          {[1, 2, 3, 4].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => {
                onChange(n as Stars);
                setOpen(false);
              }}
              className={`w-full text-left rounded-md px-2 py-1 hover:bg-neutral-100 ${
                n === value ? "bg-neutral-100" : ""
              }`}
            >
              {labelRow(n as Stars)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function useLocalStorageTasks(): [TaskItem[], (tasks: TaskItem[]) => void] {
  const [tasks, setTasks] = useState<TaskItem[]>([]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (!stored) return;
      const raw = JSON.parse(stored) as TaskRaw[];
      const placed: TaskItem[] = raw.map((t) => {
        const star =
          (t.stars as Stars) || computeStarFromDeadline(t.deadline ?? "");
        const quad = t.quad || quadrantForStars(star);
        const timeScale = t.timeScale ?? "week";
        return {
          ...t,
          quad,
          stars: star,
          timeScale,
          rDay: t.rDay || daysRemaining(t.deadline),
          deadlineShort: t.deadlineShort || formatDeadlineShort(t.deadline),
        };
      });

      const newPlaced = placed.map((t) => {
        let radius = t.posRadius;
        if (!radius || radius < 0.2 || radius > 1) {
          radius = computeBandRadius(t.stars, t.deadline);
        }
        return {
          ...t,
          posRadius: radius,
        };
      });
      setTasks(newPlaced);
    } catch (e) {
      console.error("Failed to load tasks from localStorage", e);
    }
  }, []);

  const persist = (next: TaskItem[]) => {
    setTasks(next);
    try {
      const raw: TaskRaw[] = next.map((t) => ({
        id: t.id,
        date: t.date,
        deadline: t.deadline,
        deadlineShort: t.deadlineShort,
        project: t.project,
        text: t.text,
        quad: t.quad,
        rDay: t.rDay,
        posAngle: t.posAngle,
        posRadius: t.posRadius,
        stars: t.stars,
        timeScale: t.timeScale,
        finishDate: t.finishDate,
      }));
      window.localStorage.setItem(storageKey, JSON.stringify(raw));
    } catch (e) {
      console.error("Failed to save tasks to localStorage", e);
    }
  };

  return [tasks, persist];
}

function useWindowSize() {
  const [size, setSize] = useState<{ width: number; height: number }>({
    width: 1024,
    height: 768,
  });

  useEffect(() => {
    const handler = () => {
      setSize({ width: window.innerWidth, height: window.innerHeight });
    };
    handler();
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  return size;
}

function buildShareText(tasks: TaskItem[]): string {
  if (!tasks.length) return "No tasks scheduled.";
  const lines: string[] = [];
  lines.push("gPlanner schedule");
  lines.push("");

  const sorted = [...tasks].sort((a, b) =>
    (a.deadline || "").localeCompare(b.deadline || "")
  );

  sorted.forEach((t, idx) => {
    const rem = t.rDay || daysRemaining(t.deadline);
    lines.push(
      `${idx + 1}. [${quadLabelByKey[t.quad]}] ${
        t.project || "Untitled"
      } – ${t.text}  (Date: ${t.date}, Deadline: ${formatDeadlineShort(
        t.deadline
      )}, Remaining: ${rem})`
    );
  });

  return lines.join("\n");
}

export default function Planner() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [deadline, setDeadline] = useState("");
  const [project, setProject] = useState("");
  const [text, setText] = useState("");
  const [stars, setStars] = useState<Stars>(4);
  const [timeScale, setTimeScale] = useState<TimeScale>("week");
  const [tasks, setTasks] = useLocalStorageTasks();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editDeadline, setEditDeadline] = useState("");
  const [editProject, setEditProject] = useState("");
  const [editText, setEditText] = useState("");

  const [csvPreviewOpen, setCsvPreviewOpen] = useState(false);
  const [csvPreview, setCsvPreview] = useState("");

  const [shareOpen, setShareOpen] = useState(false);
  const [shareText, setShareText] = useState("");

  const { width } = useWindowSize();
  const size = Math.min(540, width - 64);
  const cx = size / 2;
  const cy = size / 2;
  const baseRadius = size * 0.32;
  const bandThickness = size * 0.055;

  const quadCounts = computeQuadCounts(tasks);

  // Dot size scaling by quadrant occupancy
  const quadTaskIds: Record<QuadKey, string[]> = {
    UI: [],
    NUI: [],
    UNI: [],
    NUNI: [],
  };
  tasks.forEach((t) => {
    quadTaskIds[t.quad].push(t.id);
  });
  const dotScaleById: Record<string, number> = {};
  (Object.keys(quadTaskIds) as QuadKey[]).forEach((q) => {
    const n = quadTaskIds[q].length;
    let scale = 1;
    if (n >= 8) scale = 0.55;
    else if (n >= 5) scale = 0.7;
    else if (n >= 3) scale = 0.85;
    quadTaskIds[q].forEach((id) => {
      dotScaleById[id] = scale;
    });
  });

  const canvasRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const el = canvasRef.current;
    const rect = el.getBoundingClientRect();
    const w = Math.min(rect.width, 540);
    const h = w;
    el.style.height = `${h}px`;
  }, [width]);

  const onAddTask = () => {
    setWarning(null);
    if (!deadline) {
      setWarning("Please set a deadline.");
      return;
    }

    const newStars = stars || computeStarFromDeadline(deadline);
    const quad = quadrantForStars(newStars);
    const counts = computeQuadCounts(tasks);
    if (counts[quad] >= MAX_PER_QUAD) {
      setWarning(
        `Max ${MAX_PER_QUAD} tasks allowed in ${quadLabelByKey[quad]} region.`
      );
      return;
    }

    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const angle = computeInitialAngle(newStars);
    const radiusFrac = computeBandRadius(newStars, deadline);

    const newTask: TaskItem = {
      id,
      date,
      deadline,
      deadlineShort: formatDeadlineShort(deadline),
      project,
      text,
      quad,
      rDay: daysRemaining(deadline),
      posAngle: angle,
      posRadius: radiusFrac,
      stars: newStars,
      timeScale,
      finishDate: undefined,
    };

    setTasks([...tasks, newTask]);
    setActiveId(id);
    setDate(new Date().toISOString().slice(0, 10));
    setDeadline("");
    setProject("");
    setText("");
  };

  const activeTask = tasks.find((t) => t.id === activeId) || null;

  const handleMouseDown = (
    e: React.MouseEvent<SVGCircleElement, MouseEvent>,
    id: string
  ) => {
    e.preventDefault();
    setDragId(id);
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
    if (!dragId) return;
    const svg = svgRef.current;
    if (!svg) return;

    const rect = svg.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const { angle, radius } = cartesianToPolar(cx, cy, x, y);

    const inner = baseRadius + bandThickness * 0.5;
    const outer = baseRadius + bandThickness * 3.5;

    const clampedRadius = clamp(radius, inner * 0.2, outer);

    const quad = nearestQuadrant(angle);
    const quadCountsLocal = computeQuadCounts(tasks);
    const current = tasks.find((t) => t.id === dragId);
    if (!current) return;

    if (quadrantForStars(current.stars) !== quad && quadCountsLocal[quad] >= MAX_PER_QUAD) {
      return;
    }

    setTasks((prev) =>
      prev.map((t) =>
        t.id === dragId
          ? {
              ...t,
              posAngle: angle,
              posRadius:
                clampedRadius / (baseRadius + bandThickness * 3.5),
              stars: starsForQuadrant(quad),
              quad,
            }
          : t
      )
    );
  };

  const handleMouseUp = () => {
    if (dragId) {
      setDragId(null);
    }
  };

  const handleDotClick = (id: string) => {
    setActiveId(id);
    const ref = itemRefs.current[id];
    if (ref && "scrollIntoView" in ref) {
      ref.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const handleExportCsv = () => {
    const csv = toCsv(tasks);
    const today = new Date().toISOString().slice(0, 10);
    const fn = `gPlanner_tasks_${today}.csv`;
    downloadBlob(fn, csv);
  };

  const handleImportCsv = () => {
    uploadFromFile((text) => {
      try {
        const raw = fromCsv(text);
        const now = new Date();
        const placed: TaskItem[] = raw.map((t, i) => {
          const star = t.stars || computeStarFromDeadline(t.deadline);
          const quad = t.quad || quadrantForStars(star);
          const ts = t.timeScale ?? "week";
          const angle = t.posAngle || quadAngles[quad];
          const radius =
            t.posRadius && t.posRadius > 0 && t.posRadius <= 1
              ? t.posRadius
              : computeBandRadius(star, t.deadline);

          const dt = new Date(t.date || now.toISOString().slice(0, 10));
          const dStr = isNaN(dt.getTime())
            ? now.toISOString().slice(0, 10)
            : dt.toISOString().slice(0, 10);

          return {
            id: t.id || `${Date.now()}-${i}`,
            date: dStr,
            deadline: t.deadline,
            deadlineShort: formatDeadlineShort(t.deadline),
            project: t.project,
            text: t.text,
            quad,
            rDay: daysRemaining(t.deadline),
            posAngle: angle,
            posRadius: radius,
            stars: star,
            timeScale: ts,
            finishDate: t.finishDate,
          };
        });

        const counts: QuadCounts = { UI: 0, NUI: 0, UNI: 0, NUNI: 0 };
        const adjusted = placed.map((t) => {
          const quad = t.quad || quadrantForStars(t.stars);
          let idx = counts[quad];
          if (idx >= MAX_PER_QUAD) {
            return t;
          }
          counts[quad] = idx + 1;
          const bandRadius = computeBandRadius(t.stars, t.deadline);
          return {
            ...t,
            quad,
            posRadius: bandRadius,
          };
        });

        setTasks(adjusted);
      } catch (e) {
        console.error("Failed to import CSV", e);
        setWarning("Failed to import CSV file. Please check its format.");
      }
    });
  };

  const handleClearAll = () => {
    if (
      !window.confirm(
        "Clear all tasks from this planner? This cannot be undone."
      )
    ) {
      return;
    }
    setTasks([]);
    setActiveId(null);
  };

  const handleDeleteTask = (id: string) => {
    setTasks(tasks.filter((t) => t.id !== id));
    if (activeId === id) {
      setActiveId(null);
    }
  };

  const handleMarkFinished = (id: string) => {
    const today = new Date().toISOString().slice(0, 10);
    setTasks(
      tasks.map((t) =>
        t.id === id ? { ...t, finishDate: t.finishDate || today } : t
      )
    );
  };

  const openEditTask = (t: TaskItem) => {
    setEditingTask(t);
    setEditDate(t.date);
    setEditDeadline(t.deadline);
    setEditProject(t.project);
    setEditText(t.text);
  };

  const saveEdit = () => {
    if (!editingTask) return;
    const updated = tasks.map((t) =>
      t.id === editingTask.id
        ? {
            ...t,
            date: editDate,
            deadline: editDeadline,
            project: editProject,
            text: editText,
            deadlineShort: formatDeadlineShort(editDeadline),
            rDay: daysRemaining(editDeadline),
          }
        : t
    );
    setTasks(updated);
    setEditingTask(null);
  };

  const openCsvPreview = () => {
    const csv = toCsv(tasks);
    setCsvPreview(csv);
    setCsvPreviewOpen(true);
  };

  const handleShareSchedule = async () => {
    const text = buildShareText(tasks);
    setShareText(text);

    // Try Web Share API (mobile / some browsers)
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await (navigator as any).share({
          title: "gPlanner schedule",
          text,
        });
        return;
      } catch (err) {
        console.warn("Web Share failed or cancelled", err);
      }
    }

    // Fallback: copy to clipboard if possible
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(text);
        setWarning(
          "Schedule copied to clipboard – paste into email or chat to share."
        );
        return;
      } catch (err) {
        console.warn("Clipboard write failed", err);
      }
    }

    // Final fallback: show dialog with text to copy manually
    setShareOpen(true);
  };

  return (
    <div className="w-full min-h-screen bg-neutral-50 p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-4">
      {/* LEFT SIDE: New + Selected + Tasks */}
      <aside className="lg:col-span-4 space-y-4">
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="text-xl font-semibold">New Task</div>
            {warning && (
              <div className="text-xs bg-red-100 text-red-700 border border-red-300 rounded-md px-2 py-1">
                {warning}
              </div>
            )}
            <div className="space-y-1">
              <label className="text-sm font-medium">Date</label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Deadline</label>
              <Input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Project</label>
              <Input
                placeholder="Project name"
                value={project}
                onChange={(e) => setProject(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Task</label>
              <Textarea
                placeholder="Describe the task..."
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Region:</span>
              <StarSelect value={stars} onChange={setStars} />
            </div>
            <div className="space-y-1 text-xs text-neutral-600">
              <div>
                <span className="text-amber-400">★★★★</span> (1–7 d)
              </div>
              <div>
                <span className="text-amber-400">★★★</span> (1–4 w)
              </div>
              <div>
                <span className="text-amber-400">★★</span> (1–12 m)
              </div>
              <div>
                <span className="text-amber-400">★</span> (1–10 y)
              </div>
            </div>
            <div className="pt-2">
              <Button
                type="button"
                className="w-full"
                onClick={onAddTask}
                disabled={!deadline || !text}
              >
                Add task
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="text-lg font-semibold">Selected task</div>
            {activeTask ? (
              <div className="text-sm space-y-1">
                <div>
                  <span className="font-medium">Remaining Time:</span>{" "}
                  {activeTask.rDay}d (
                  {activeTask.rDay === "—"
                    ? "deadline unknown"
                    : `${activeTask.rDay} days remaining`}
                  )
                </div>
                <div>
                  <span className="font-medium">Project:</span>{" "}
                  {activeTask.project || "Untitled"}
                </div>
                <div>
                  <span className="font-medium">Task:</span> {activeTask.text}
                </div>
                <div>
                  <span className="font-medium">Date:</span> {activeTask.date}
                </div>
                <div>
                  <span className="font-medium">Deadline:</span>{" "}
                  {activeTask.deadline || "—"}
                </div>
                <div>
                  <span className="font-medium">Region:</span>{" "}
                  {quadLabelByKey[activeTask.quad]}
                </div>
                <div>
                  <span className="font-medium">Time scale:</span>{" "}
                  {timeScaleLabel[activeTask.timeScale]}
                </div>
                {activeTask.finishDate && (
                  <div>
                    <span className="font-medium">Finished:</span>{" "}
                    {activeTask.finishDate}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-neutral-500">
                Click a dot in the planner or a task below.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-lg font-semibold">Tasks</div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  title="Share schedule"
                  onClick={handleShareSchedule}
                >
                  <Share2 className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  title="Preview CSV"
                  onClick={openCsvPreview}
                >
                  <Download className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  title="Import CSV"
                  onClick={handleImportCsv}
                >
                  <span className="text-xs font-semibold">CSV</span>
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  title="Clear all tasks"
                  onClick={handleClearAll}
                >
                  <Trash2 className="w-4 h-4 text-red-500" />
                </Button>
              </div>
            </div>
            <div className="space-y-1 text-xs text-neutral-700">
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                <span>
                  <span className="font-semibold">UI:</span>{" "}
                  {quadCounts.UI}/{MAX_PER_QUAD}
                </span>
                <span>
                  <span className="font-semibold">NUI:</span>{" "}
                  {quadCounts.NUI}/{MAX_PER_QUAD}
                </span>
                <span>
                  <span className="font-semibold">UNI:</span>{" "}
                  {quadCounts.UNI}/{MAX_PER_QUAD}
                </span>
                <span>
                  <span className="font-semibold">NUNI:</span>{" "}
                  {quadCounts.NUNI}/{MAX_PER_QUAD}
                </span>
              </div>
            </div>
            <div className="space-y-1 text-xs text-neutral-600">
              <div>CSV export: gPlanner_tasks_YYYY-MM-DD.csv</div>
            </div>
            <div className="border-t pt-2 mt-2 space-y-1 max-h-[260px] overflow-y-auto">
              {tasks.length === 0 ? (
                <div className="text-xs text-neutral-500">
                  No tasks yet. Add one above.
                </div>
              ) : (
                tasks.map((t, i) => (
                  <div
                    key={t.id}
                    ref={(el) => {
                      itemRefs.current[t.id] = el;
                    }}
                    onClick={() => handleDotClick(t.id)}
                    className={`rounded-md border px-2 py-1.5 mb-1 text-xs cursor-pointer ${
                      t.id === activeId
                        ? "bg-amber-50 border-amber-400"
                        : "bg-white hover:bg-neutral-50 border-neutral-200"
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <div className="font-semibold truncate">
                        {t.project || "Untitled"}
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] px-1 py-0.5 rounded bg-neutral-800 text-white">
                          {i + 1}
                        </span>
                      </div>
                    </div>
                    <div className="truncate">{t.text}</div>
                    <div className="flex justify-between text-[11px] text-neutral-700">
                      <div>{formatLocalDate(t.date)}</div>
                      <div>{quadLabelByKey[t.quad]}</div>
                    </div>
                    <div className="text-[11px] text-neutral-700">
                      Remaining: {t.rDay} d
                    </div>
                    <div className="text-[11px] text-neutral-700">
                      Deadline: {formatDeadlineShort(t.deadline)}
                    </div>
                    {t.finishDate && (
                      <div className="text-[11px] text-green-700">
                        Finished: {t.finishDate}
                      </div>
                    )}
                    <div className="mt-1 flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-[10px]"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditTask(t);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-[10px]"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMarkFinished(t.id);
                        }}
                      >
                        Done
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-[10px] text-red-600 border-red-300"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTask(t.id);
                        }}
                      >
                        Del
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </aside>

      {/* CENTER: Planner */}
      <main className="lg:col-span-8 flex items-center justify-center mt-2 lg:mt-0">
        <div
          ref={canvasRef}
          className="relative w-full max-w-[540px] bg-neutral-200/40 rounded-2xl border border-neutral-300"
        >
          <svg
            ref={svgRef}
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className="block mx-auto"
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <circle
              cx={cx}
              cy={cy}
              r={baseRadius + bandThickness * 3.5}
              fill="#e5e7eb"
            />
            <circle
              cx={cx}
              cy={cy}
              r={baseRadius + bandThickness * 2.5}
              fill="#e5e7eb"
            />
            <circle
              cx={cx}
              cy={cy}
              r={baseRadius + bandThickness * 1.5}
              fill="#e5e7eb"
            />
            <circle
              cx={cx}
              cy={cy}
              r={baseRadius + bandThickness * 0.5}
              fill="#e5e7eb"
            />

            <line
              x1={cx}
              y1={cy - (baseRadius + bandThickness * 3.5)}
              x2={cx}
              y2={cy + (baseRadius + bandThickness * 3.5)}
              stroke="#4b5563"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
            <line
              x1={cx - (baseRadius + bandThickness * 3.5)}
              y1={cy}
              x2={cx + (baseRadius + bandThickness * 3.5)}
              y2={cy}
              stroke="#4b5563"
              strokeWidth={1}
              strokeDasharray="4 4"
            />

            <text
              x={cx}
              y={cy - (baseRadius + bandThickness * 3.5) - 8}
              textAnchor="middle"
              className="fill-black text-[11px] font-semibold"
            >
              Urgent
            </text>
            <text
              x={cx}
              y={cy + (baseRadius + bandThickness * 3.5) + 14}
              textAnchor="middle"
              className="fill-black text-[11px] font-semibold"
            >
              Not urgent
            </text>
            <text
              x={cx - (baseRadius + bandThickness * 3.5) - 4}
              y={cy}
              textAnchor="end"
              className="fill-black text-[11px] font-semibold"
            >
              Not important
            </text>
            <text
              x={cx + (baseRadius + bandThickness * 3.5) + 4}
              y={cy}
              textAnchor="start"
              className="fill-black text-[11px] font-semibold"
            >
              Important
            </text>

            {tasks.map((t) => {
              const radius =
                t.posRadius *
                (baseRadius + bandThickness * 3.5);
              const pos = polarToCartesian(cx, cy, radius, t.posAngle);
              const baseR = timeScaleDotRadius(t.timeScale);
              const scale = dotScaleById[t.id] ?? 1;
              const r = baseR * scale;

              return (
                <g key={t.id}>
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={r}
                    fill={t.id === activeId ? "#1f2937" : "#111827"}
                    stroke="#facc15"
                    strokeWidth={t.id === activeId ? 2 : 1.2 * scale}
                    onMouseDown={(e) => handleMouseDown(e, t.id)}
                    onClick={() => handleDotClick(t.id)}
                    cursor="pointer"
                  />
                  <text
                    x={pos.x}
                    y={pos.y + 3}
                    textAnchor="middle"
                    className="fill-white text-[10px] font-semibold pointer-events-none"
                  >
                    {t.rDay}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </main>

      {/* CSV preview dialog */}
      <Dialog open={csvPreviewOpen} onOpenChange={setCsvPreviewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>CSV Preview</DialogTitle>
            <DialogDescription>
              This is the CSV that will be used for export/import.
            </DialogDescription>
          </DialogHeader>
          <pre className="mt-2 max-h-[400px] overflow-auto text-xs bg-neutral-900 text-neutral-100 p-3 rounded-md">
            {csvPreview}
          </pre>
          <div className="mt-4 flex justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCsvPreviewOpen(false)}
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit task dialog */}
      <Dialog
        open={!!editingTask}
        onOpenChange={(open) => !open && setEditingTask(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Task</DialogTitle>
          </DialogHeader>
          {editingTask && (
            <div className="space-y-3 mt-2">
              <div className="space-y-1">
                <label className="text-sm font-medium">Date</label>
                <Input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Deadline</label>
                <Input
                  type="date"
                  value={editDeadline}
                  onChange={(e) => setEditDeadline(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Project</label>
                <Input
                  value={editProject}
                  onChange={(e) => setEditProject(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Task</label>
                <Textarea
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

      {/* Share dialog fallback */}
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Share schedule</DialogTitle>
            <DialogDescription>
              Copy this text and send it via email, chat, or notes.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            className="mt-2 h-64 text-xs"
            value={shareText}
            readOnly
          />
          <div className="mt-3 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (
                  typeof navigator !== "undefined" &&
                  navigator.clipboard
                ) {
                  navigator.clipboard.writeText(shareText);
                }
                setShareOpen(false);
              }}
            >
              Copy & close
            </Button>
            <Button type="button" onClick={() => setShareOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
