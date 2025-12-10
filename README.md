# gPlanner – Geometry Time Planner

gPlanner is a visual task-planning app that encodes urgency and importance directly on a circular “geometry” map. Tasks are represented as colored dots whose position and color encode both priority and remaining time to the deadline.

The app runs entirely in your browser (local Next.js app) and stores data in `localStorage` and optional CSV files. There is no backend: your schedule is private to your machine unless you explicitly share CSV or text exports.

---

## 1. Concept: How the Geometry Works

The planner circle is split into four regions (quadrants):

- Top-left: **★★★★ Important – Urgent** (1–7 days)
- Top-right: **★★★ Important – Not urgent** (1–4 weeks)
- Bottom-left: **★★ Not important – Urgent** (1–12 months)
- Bottom-right: **★ Not important – Not urgent** (1–10 years)

Each task is shown as a **colored circle**:

- **Red**: days (1–7 d)
- **Dark yellow**: weeks (1–4 w)
- **Green**: months (1–12 m)
- **Blue**: years (1–10 y)

Inside each dot you see a compact label such as `3d`, `2w`, `5m`, or `4y` indicating remaining time in that scale. The exact number of days remaining is displayed in the Selected Task panel.

The rings and percentages (25%, 50%, 75%) indicate how much time is left within each region, with the current design:

- The **center** represents the earliest part of that region.
- The **outer edge** represents the most urgent part of that region.
- As the deadline moves closer, the dot moves toward the outer edge of its region.

---

## 2. Installing and Running Locally

You need Node.js (v18+ recommended) and npm.

1. Clone the repository:
   ```bash
   git clone git@github.com:merang2050/gPlanner.git
   cd gPlanner


## Run gPlanner App (Vercel)

https://g-planner-eight.vercel.app/

