from fastapi import APIRouter
from pydantic import BaseModel
import httpx
import logging
import math
from typing import Optional, List

router = APIRouter()

logger = logging.getLogger(__name__)


class IncidentRouteRequest(BaseModel):
    latitude: float
    longitude: float
    route_coordinates: Optional[List[List[float]]] = None


# ─── Geometry helpers ─────────────────────────────────────────────────────────

def _point_to_segment_dist_sq(px: float, py: float,
                               ax: float, ay: float,
                               bx: float, by: float) -> float:
    """
    Returns the squared distance from point (px,py) to segment (ax,ay)-(bx,by).
    Works in degree-space; accurate enough for the small distances we care about.
    """
    dx, dy = bx - ax, by - ay
    seg_len_sq = dx * dx + dy * dy
    if seg_len_sq == 0.0:
        return (px - ax) ** 2 + (py - ay) ** 2
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / seg_len_sq))
    cx = ax + t * dx
    cy = ay + t * dy
    return (px - cx) ** 2 + (py - cy) ** 2


def passes_near_incident(candidate_coords: list,
                          incident_coords: list,
                          buffer_degrees: float = 0.002) -> bool:
    """
    Returns True if any point of *candidate_coords* comes within *buffer_degrees*
    of **any segment** of *incident_coords* (or the incident point itself).

    buffer_degrees ≈ 0.002° ≈ 200 m — keeps detours well clear of the blocked zone.
    """
    buf_sq = buffer_degrees ** 2

    if len(incident_coords) == 1:
        # Single-point incident — check distance from every candidate point to it
        i_lng, i_lat = incident_coords[0]
        for rc in candidate_coords:
            r_lng, r_lat = rc[0], rc[1]
            if (r_lng - i_lng) ** 2 + (r_lat - i_lat) ** 2 < buf_sq:
                return True
        return False

    # Route incident — check every candidate point against every incident segment
    for rc in candidate_coords:
        r_lng, r_lat = rc[0], rc[1]
        for i in range(len(incident_coords) - 1):
            a_lng, a_lat = incident_coords[i]
            b_lng, b_lat = incident_coords[i + 1]
            if _point_to_segment_dist_sq(r_lng, r_lat, a_lng, a_lat, b_lng, b_lat) < buf_sq:
                return True
    return False


# ─── Main endpoint ────────────────────────────────────────────────────────────

@router.post("/")
def get_diversion_route(req: IncidentRouteRequest):
    """
    Returns the shortest alternative driving routes that completely avoid the
    incident point / path.

    Strategy (in order):
      1. Ask OSRM for native alternative routes (alternatives=true) — these are
         already optimised for shortest distance on real roads.  Filter out any
         that still pass near the incident and keep the rest.
      2. If fewer than 2 clear alternatives were found, fall back to waypoint-
         nudging: place a detour waypoint perpendicular to the incident path and
         ask OSRM for a forced route through it, widening the offset on each
         retry until the result clears the blocked zone.
      3. If OSRM is unreachable, return a pair of simple geometric bypasses.

    All candidate routes are sorted by distance (ascending) so the first entry
    in the response is always the shortest safe alternative.
    """
    lat, lng = req.latitude, req.longitude
    route_coords = req.route_coordinates
    is_route = bool(route_coords and len(route_coords) >= 2)

    # ── Geometry of the incident ──────────────────────────────────────────────
    if is_route:
        start_lng, start_lat = route_coords[0]
        end_lng,   end_lat   = route_coords[-1]
        mid_idx = len(route_coords) // 2
        mid_lng,   mid_lat   = route_coords[mid_idx]

        dx = end_lng - start_lng
        dy = end_lat - start_lat
        seg_len = math.sqrt(dx * dx + dy * dy)
        if seg_len > 0:
            nx = -dy / seg_len   # perpendicular unit vector (left)
            ny =  dx / seg_len
        else:
            nx, ny = 0.0, 1.0
    else:
        # Single-point incident — create a short artificial "route" around it so
        # the waypoint logic still works sensibly.
        start_lng, start_lat = lng - 0.005, lat
        end_lng,   end_lat   = lng + 0.005, lat
        mid_lng,   mid_lat   = lng, lat
        nx, ny = 0.0, 1.0
        seg_len = 0.01

    incident_coords = route_coords if is_route else [[lng, lat]]

    # Buffer scales with route length: longer blocked roads need wider clearance.
    # Minimum 200 m (0.002°), then 25 % of the route's diagonal extent.
    buffer_deg = max(0.002, seg_len * 0.25)

    headers = {"User-Agent": "GridlockpResourceAllocator/1.0 (contact@gridlockp.com)"}
    valid_routes: list[dict] = []

    # ── Step 1: OSRM native alternatives ─────────────────────────────────────
    # Ask OSRM for up to 3 alternatives in a single call; it will optimise them
    # on real road topology so they are already the true shortest alternatives.
    try:
        alt_url = (
            f"http://router.project-osrm.org/route/v1/driving/"
            f"{start_lng},{start_lat};{end_lng},{end_lat}"
            f"?overview=full&geometries=geojson&alternatives=3"
        )
        res = httpx.get(alt_url, headers=headers, timeout=6.0)
        if res.status_code == 200:
            data = res.json()
            for idx, r in enumerate(data.get("routes", [])):
                coords      = r["geometry"]["coordinates"]
                distance_m  = r.get("distance", 999_999.0)
                duration_s  = r.get("duration", 999_999.0)

                # Skip the primary route if it goes near the incident
                if passes_near_incident(coords, incident_coords, buffer_deg):
                    logger.info(
                        f"OSRM alternative {idx} rejected — passes near incident "
                        f"(buffer={buffer_deg:.4f}°)"
                    )
                    continue

                label = "Bypass Route A" if not valid_routes else "Bypass Route B"
                valid_routes.append({
                    "coordinates": coords,
                    "distance_m":  distance_m,
                    "duration_s":  duration_s,
                    "description": label,
                    "source": "OSRM Alternatives",
                })
                if len(valid_routes) == 2:
                    break   # two clear routes is enough

    except Exception as e:
        logger.warning(f"OSRM alternatives call failed: {e}")

    # ── Step 2: Waypoint-nudging fallback (if fewer than 2 clear routes) ─────
    if len(valid_routes) < 2:
        # Minimum base offset: 0.6 % of route length or 600 m, whichever is bigger.
        base_offset = max(0.006, seg_len * 0.6)

        for direction_name, sign in [("Bypass Route A", 1), ("Bypass Route B", -1)]:
            # Skip the direction we already filled from Step 1
            if any(r["description"] == direction_name for r in valid_routes):
                continue

            route_found = None
            # Widen the offset on each retry until a clear path is found
            for attempt in range(6):
                offset = base_offset + attempt * max(0.003, seg_len * 0.15)
                wp_lng = mid_lng + nx * offset * sign
                wp_lat = mid_lat + ny * offset * sign

                try:
                    url = (
                        f"http://router.project-osrm.org/route/v1/driving/"
                        f"{start_lng},{start_lat};{wp_lng},{wp_lat};{end_lng},{end_lat}"
                        f"?overview=full&geometries=geojson"
                    )
                    res = httpx.get(url, headers=headers, timeout=5.0)
                    if res.status_code == 200:
                        routes = res.json().get("routes", [])
                        if routes:
                            coords     = routes[0]["geometry"]["coordinates"]
                            distance_m = routes[0].get("distance", 999_999.0)
                            duration_s = routes[0].get("duration", 999_999.0)

                            if not passes_near_incident(coords, incident_coords, buffer_deg):
                                route_found = {
                                    "coordinates": coords,
                                    "distance_m":  distance_m,
                                    "duration_s":  duration_s,
                                    "description": direction_name,
                                    "source": "OSRM Waypoint",
                                }
                                break
                            else:
                                logger.info(
                                    f"Waypoint attempt {attempt} ({direction_name}) "
                                    f"still crosses incident — widening offset to "
                                    f"{offset + max(0.003, seg_len * 0.15):.4f}°"
                                )
                except Exception as e:
                    logger.warning(f"OSRM waypoint detour attempt {attempt} failed: {e}")

            if route_found:
                valid_routes.append(route_found)

    # ── Sort strictly by distance (shortest first) ────────────────────────────
    valid_routes.sort(key=lambda r: r["distance_m"])

    if valid_routes:
        colors = ["#10b981", "#06b6d4"]   # Emerald = shortest, Cyan = secondary
        formatted: list[dict] = []
        for i, r in enumerate(valid_routes):
            km   = r["distance_m"] / 1000
            mins = int(r.get("duration_s", 0) / 60)
            color  = colors[i] if i < len(colors) else "#f59e0b"
            prefix = "Shortest " if i == 0 else ""
            formatted.append({
                "id":          f"route_{i + 1}",
                "color":       color,
                "coordinates": r["coordinates"],
                "description": f"{prefix}{r['description']} — {km:.1f} km ({mins} min)",
                "distance_m":  r["distance_m"],
                "duration_s":  r.get("duration_s", 0),
                "source":      r.get("source", "OSRM"),
            })

        return {
            "source": "OSRM Road Network Routing",
            "routes": formatted,
        }

    # ── Step 3: Pure geometric fallback (OSRM offline) ───────────────────────
    # Use a guaranteed-clear offset (50 % of route length, min 800 m) so the
    # fallback lines at least visually bypass the incident.
    offset_val = max(0.008, seg_len * 0.5)

    return {
        "source": "Simulated Alternative Routes (OSRM Offline)",
        "routes": [
            {
                "id":          "route_1",
                "color":       "#10b981",
                "coordinates": [
                    [start_lng, start_lat],
                    [mid_lng + nx * offset_val, mid_lat + ny * offset_val],
                    [end_lng, end_lat],
                ],
                "description": "Shortest Bypass Route A (Simulated)",
                "distance_m":  0,
                "duration_s":  0,
                "source":      "Simulated",
            },
            {
                "id":          "route_2",
                "color":       "#06b6d4",
                "coordinates": [
                    [start_lng, start_lat],
                    [mid_lng - nx * offset_val, mid_lat - ny * offset_val],
                    [end_lng, end_lat],
                ],
                "description": "Bypass Route B (Simulated)",
                "distance_m":  0,
                "duration_s":  0,
                "source":      "Simulated",
            },
        ],
    }
