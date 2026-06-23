# GridGuardian — Traffic Intelligence Platform

> **Predictive Traffic Intelligence & Dynamic Incident Management Platform for Smart Cities.**

GridGuardian is an intelligent, real-time traffic management dashboard designed to help cities respond to road congestion, emergency events, and planned disruptions. It combines AI-powered severity prediction, dynamic resource allocation, and an interactive MapMyIndia map into a single operational command platform.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [System Architecture](#system-architecture)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Backend Setup](#backend-setup)
  - [Frontend Setup](#frontend-setup)
- [Environment Variables](#environment-variables)
- [Deploying to Render](#deploying-to-render)
- [API Reference](#api-reference)
- [Incident Types & Resource Logic](#incident-types--resource-logic)
- [Machine Learning Models](#machine-learning-models)
- [Screenshots](#screenshots)
- [License](#license)

---

## Features

### 🛡️ Interactive Landing Page
- Animated **swipe-to-unlock** gesture reveals the main dashboard.
- Rotating surveillance radar rings, glowing scrolling grid, and gradient title animations.

### 🗺️ Incident Simulation
- **Point Simulation** — click any location on the live MapMyIndia map to simulate a single-point incident.
- **Route Simulation** — click multiple points to define a route path (road, rally corridor, construction zone). A real road-snapped blue polyline is drawn using OSRM.
- **Multiple Hotspots** — simulate several independent incidents simultaneously, each with their own resource dispatch.

### 🤖 AI Prediction Engine
- Predicts **Priority** (Low / Medium / High / Critical), **Severity**, and **Expected Resolution Duration** for every incident.
- Uses three fine-tuned **XGBoost models** trained on historical Bangalore incident data.
- Falls back gracefully to smart heuristic rules if models are unavailable.
- **Impact Score** progress bar provides a quick visual read of the event's overall city-wide effect.

### 🚨 Smart Resource Allocation
- Dispatches **Police**, **Fire/Barricades**, and **Medical** units based on event type and severity.
- Each incident type has a **custom dispatch profile**:
  - Accidents → Medical-heavy + Police
  - Political Rallies / Festivals / Sudden Gatherings → Heavy Police + Barricades + Medical standby
  - Construction / Tree Fall / Water Logging → Heavy Fire/Barricades + reduced Police
- Finds the nearest Bangalore emergency stations using Haversine distance ranking.
- Draws real OSRM dispatch routes on the map (colored lines from stations to the incident).

### 🧠 Explainable AI (XAI)
- Breaks down the severity score into weighted contributing factors:
  - Incident Classification, Requires Road Closure, Temporal Rush Hour, Geographical Hotspot, Route Path Extent.
- Displayed as a percentage bar chart in the sidebar.

### 📋 Action Plan Checklist
- Generates a step-by-step timed action plan (T+0 min, T+2 min, T+5 min, T+10 min, T+15 min).
- Each step is tailored to the specific incident type (e.g., barricade setup for rallies, pump deployment for water logging).
- Interactive checkboxes allow field operators to mark tasks as completed in real time.

### 📝 Historical Learning Report
- Provides a post-incident intelligence card with:
  - Risk Factor classification
  - Preventive Action recommendation for future incidents
  - Estimated traffic clearance time
  - Efficiency index under rapid dispatch model

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 16, React 19, TypeScript |
| **Styling** | Vanilla CSS (custom design system), TailwindCSS v4, Inter typeface |
| **Map** | MapMyIndia / Mappls SDK (`mappls-web-maps`) |
| **Routing** | OSRM Public API (`router.project-osrm.org`) |
| **Backend** | FastAPI (Python) |
| **Database** | SQLite (dev) / PostgreSQL (prod via `DATABASE_URL`) |
| **ORM** | SQLAlchemy |
| **ML Models** | XGBoost, scikit-learn, Pandas, Joblib |
| **HTTP Client** | Axios (frontend), httpx (backend) |
| **Deployment** | Render (Blueprint `render.yaml`) |

---

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Browser (Next.js)                    │
│  ┌───────────────┐   ┌──────────────────────────────┐  │
│  │  Sidebar UI   │   │   MapMyIndia Interactive Map │  │
│  │  - Incident   │   │   - Incident markers          │  │
│  │    form       │   │   - Blast radius overlays     │  │
│  │  - Results    │   │   - Resource dispatch lines   │  │
│  │  - XAI        │   │   - OSRM route polylines      │  │
│  └───────┬───────┘   └──────────────────────────────┘  │
│          │ axios.post                                    │
└──────────┼──────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────┐
│              FastAPI Backend (Python)                   │
│  ┌────────────────┐  ┌────────────────┐                │
│  │ /api/predict/  │  │ /api/allocate/ │                │
│  │ XGBoost Models │  │ Station Ranker │                │
│  │ XAI Engine     │  │ OSRM Dispatch  │                │
│  │ Action Plan    │  │ Custom Profile │                │
│  └────────┬───────┘  └───────┬────────┘                │
│           │                  │                          │
│           ▼                  ▼                          │
│  ┌─────────────────────────────────────┐               │
│  │     SQLite / PostgreSQL Database    │               │
│  └─────────────────────────────────────┘               │
│           │                  │                          │
│           ▼                  ▼                          │
│  ┌────────────────────────────────────┐                │
│  │   OSRM Public Routing API          │                │
│  │   router.project-osrm.org          │                │
│  └────────────────────────────────────┘                │
└─────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
gridlockp/
├── backend/                        # FastAPI Python backend
│   ├── main.py                     # App entry point, CORS, router registration
│   ├── requirements.txt            # Python dependencies
│   ├── gridlockp.db                # SQLite database (local dev)
│   ├── common/
│   │   ├── db.py                   # SQLAlchemy engine & session (env-configurable)
│   │   ├── models.py               # Database ORM models
│   │   └── schemas.py              # Pydantic request/response schemas
│   ├── auth_service/
│   │   └── router.py               # Mock JWT authentication
│   ├── incidence_service/
│   │   └── router.py               # CRUD endpoints for incidents
│   ├── prediction_service/
│   │   └── router.py               # AI severity/priority prediction endpoint
│   ├── allocation_service/
│   │   ├── router.py               # Resource dispatch & OSRM routing endpoint
│   │   └── bangalore_stations.py   # Police, Fire, Hospital station data for Bangalore
│   └── routing_service/
│       └── router.py               # Alternative detour route calculation endpoint
│
├── frontend/                       # Next.js 16 frontend
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx          # Root layout with Inter font & metadata
│   │   │   ├── page.tsx            # Main dashboard page (landing + sidebar + map)
│   │   │   └── globals.css         # Full design system tokens, components, animations
│   │   └── components/
│   │       └── MapView.jsx         # MapMyIndia map component with OSRM polylines
│   ├── next.config.ts              # Next.js config (static export enabled)
│   ├── package.json
│   └── .env.local                  # Local environment variables (not committed)
│
├── ml/                             # Machine learning pipeline
│   ├── models/                     # Trained XGBoost model files (.joblib)
│   │   ├── priority_xgb.joblib
│   │   ├── severity_xgb.joblib
│   │   ├── resolution_xgb.joblib
│   │   ├── le_event.joblib
│   │   └── le_priority.joblib
│   ├── data/
│   │   ├── incidents.csv           # Raw historical incident dataset
│   │   └── processed_incidents.csv # Cleaned & feature-engineered dataset
│   └── training/                   # Training scripts
│
├── render.yaml                     # Render Blueprint deployment configuration
└── README.md
```

---

## Getting Started

### Prerequisites

| Tool | Version |
|---|---|
| Python | 3.10+ |
| Node.js | 18+ |
| npm | 9+ |
| Git | Any recent |

---

### Backend Setup

```bash
# 1. Navigate to the project root
cd gridlockp

# 2. Create and activate a virtual environment
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# 3. Install Python dependencies
pip install -r backend/requirements.txt

# 4. Start the FastAPI development server
cd backend
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

The backend API will be available at: **`http://127.0.0.1:8000`**

Interactive API documentation (Swagger UI): **`http://127.0.0.1:8000/docs`**

---

### Frontend Setup

```bash
# 1. Navigate to the frontend directory
cd gridlockp/frontend

# 2. Install Node dependencies
npm install

# 3. Create a local environment file
# Create frontend/.env.local with the following content:
NEXT_PUBLIC_API_URL=http://localhost:8000/api
NEXT_PUBLIC_MAPMYINDIA_KEY=your_mapmyindia_api_key

# 4. Start the Next.js development server
npm run dev
```

The frontend will be available at: **`http://localhost:3000`**

> **Note:** The map uses the MapMyIndia (Mappls) SDK. A valid API key is required for the map to render. A public demo key is pre-configured in `MapView.jsx`.

---

## Environment Variables

### Backend

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./gridlockp.db` | Database connection string. Supports SQLite (dev) and PostgreSQL (prod). |
| `OSRM_URL` | `http://router.project-osrm.org/route/v1/driving/` | OSRM routing engine base URL. Override to use a self-hosted instance. |
| `ALLOWED_ORIGINS` | `*` | Comma-separated list of allowed CORS origins. Set to your frontend URL in production. |

### Frontend

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_API_URL` | Full URL to the backend API (e.g., `https://your-backend.onrender.com/api`). |
| `NEXT_PUBLIC_MAPMYINDIA_KEY` | MapMyIndia / Mappls SDK API key. |

---

## Deploying to Render

A `render.yaml` Render Blueprint is included for one-click deployment of both services.

### Option A: Blueprint Auto-Deploy
1. Push the repository to GitHub.
2. Go to the [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint**.
3. Connect your GitHub repository.
4. Render will auto-detect `render.yaml` and provision both services.

### Option B: Manual Deploy (Backend)
| Setting | Value |
|---|---|
| **Environment** | Python |
| **Root Directory** | `backend` |
| **Build Command** | `pip install -r requirements.txt` |
| **Start Command** | `uvicorn main:app --host 0.0.0.0 --port $PORT` |

### Option C: Manual Deploy (Frontend — Static Site)
| Setting | Value |
|---|---|
| **Environment** | Static Site |
| **Root Directory** | `frontend` |
| **Build Command** | `npm install && npm run build` |
| **Publish Directory** | `out` |

---

## API Reference

All endpoints are prefixed with `/api`.

### `POST /api/predict/`
Runs AI prediction for a given incident.

**Request Body:**
```json
{
  "event_type": "accident",
  "requires_road_closure": true,
  "latitude": 12.9716,
  "longitude": 77.5946,
  "hour": 8,
  "day_of_week": 1,
  "route_coordinates": [[77.58, 12.97], [77.60, 12.98]]
}
```

**Response:** Severity, priority, impact score, expected duration, XAI explanation, action plan, and learning report.

---

### `POST /api/allocate/`
Allocates emergency resources to an incident and returns nearby dispatched stations with OSRM routes.

**Request Body:**
```json
{
  "incident_id": "abc123",
  "severity": "High",
  "latitude": 12.9716,
  "longitude": 77.5946,
  "event_type": "political_rally",
  "route_coordinates": [[77.58, 12.97], [77.60, 12.98]]
}
```

**Response:** List of dispatched stations with type, unit count, location, color, and OSRM route coordinates.

---

### `POST /api/incidents/`
Creates and stores an incident record in the database.

### `GET /api/incidents/`
Returns the 100 most recent incidents from the database.

### `GET /health`
Returns `{"status": "ok"}` — used for uptime monitoring.

---

## Incident Types & Resource Logic

| Event Type | Police | Fire / Barricades | Medical |
|---|---|---|---|
| `accident` | Medium | High (Critical) | Heavy |
| `water_logging` | Low | Heavy | Low |
| `tree_fall` | Low | Heavy | Low |
| `vehicle_breakdown` | Low | Low | Low |
| `political_rally` | Heavy | Heavy | Medium |
| `festival` | Heavy | Heavy | Medium |
| `sports_event` | Heavy | Medium | Medium |
| `construction` | Low | Heavy | Low |
| `sudden_gathering` | Heavy | Heavy | Medium |

---

## Machine Learning Models

Three XGBoost models are trained on a historical Bangalore incident dataset:

| Model | File | Output |
|---|---|---|
| **Priority Model** | `priority_xgb.joblib` | Low / Medium / High / Critical |
| **Severity Model** | `severity_xgb.joblib` | 0 (Low) → 3 (Critical) |
| **Resolution Model** | `resolution_xgb.joblib` | Expected duration in minutes |

**Features used:**
- `hour` — Hour of day (0–23)
- `day_of_week` — Day of week (0 = Monday)
- `latitude`, `longitude` — Geospatial location
- `requires_road_closure` — Boolean flag
- `event_type_encoded` — Label-encoded event type
- `priority_encoded` — Label-encoded priority (fed into severity & resolution models)

If model files are not found, the system falls back to a robust heuristic prediction engine automatically.

---

## License

This project is built for research and smart city demonstration purposes.

---

> Built with ❤️ for Bangalore's Traffic Intelligence Initiative.