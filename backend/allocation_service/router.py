from fastapi import APIRouter
from pydantic import BaseModel
import httpx
import logging
import math
from typing import Optional, List
from .bangalore_stations import POLICE_STATIONS, HOSPITALS, FIRE_STATIONS

router = APIRouter()
logger = logging.getLogger(__name__)


class AllocationRequest(BaseModel):
    incident_id: str
    severity: str
    latitude: float
    longitude: float
    event_type: Optional[str] = "accident"
    route_coordinates: Optional[List[List[float]]] = None


# ─── Haversine Distance (metres) ─────────────────────────────────────────────

def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Returns the great-circle distance in metres between two (lat, lon) points."""
    R = 6_371_000  # Earth radius in metres
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


# ─── OSRM Route ──────────────────────────────────────────────────────────────

def get_osrm_route(start_lng: float, start_lat: float, end_lng: float, end_lat: float):
    """
    Queries the public OSRM demo server for a real driving route.
    Returns list of [longitude, latitude] coordinate pairs.
    Falls back to a straight line if the request fails.
    """
    url = (
        f"http://router.project-osrm.org/route/v1/driving/"
        f"{start_lng},{start_lat};{end_lng},{end_lat}"
        f"?overview=full&geometries=geojson"
    )
    headers = {"User-Agent": "GridlockpResourceAllocator/1.0 (contact@gridlockp.com)"}
    for attempt in range(2):  # one retry
        try:
            res = httpx.get(url, headers=headers, timeout=5.0)
            if res.status_code == 200:
                routes = res.json().get("routes", [])
                if routes:
                    return routes[0]["geometry"]["coordinates"]
        except Exception as e:
            logger.warning(f"OSRM attempt {attempt + 1} failed: {e}")
    # Straight-line fallback
    return [[start_lng, start_lat], [end_lng, end_lat]]


# ─── Overpass API ────────────────────────────────────────────────────────────

def fetch_real_stations(lat: float, lng: float, radius_m: int = 10_000):
    """
    Queries the OpenStreetMap Overpass API for police stations, hospitals,
    and fire stations within `radius_m` metres of the incident location.
    Returns the raw list of OSM elements.
    """
    url = "https://overpass-api.de/api/interpreter"
    query = f"""
    [out:json][timeout:15];
    (
      node["amenity"="police"](around:{radius_m},{lat},{lng});
      way["amenity"="police"](around:{radius_m},{lat},{lng});
      node["amenity"="hospital"](around:{radius_m},{lat},{lng});
      way["amenity"="hospital"](around:{radius_m},{lat},{lng});
      node["amenity"="fire_station"](around:{radius_m},{lat},{lng});
      way["amenity"="fire_station"](around:{radius_m},{lat},{lng});
    );
    out center;
    """
    headers = {"User-Agent": "GridlockpResourceAllocator/1.0 (contact@gridlockp.com)"}
    try:
        res = httpx.post(url, data={"data": query}, headers=headers, timeout=15.0)
        if res.status_code == 200:
            elements = res.json().get("elements", [])
            logger.info(f"Overpass returned {len(elements)} elements near ({lat}, {lng})")
            return elements
    except Exception as e:
        logger.error(f"Overpass API query failed: {e}")
    return []


# ─── Station Selection ────────────────────────────────────────────────────────

def _element_coords(el: dict):
    """
    Extracts (lat, lon) from an OSM element.
    Nodes have top-level lat/lon; ways have a 'center' object.
    """
    if el.get("type") == "way" and "center" in el:
        return el["center"]["lat"], el["center"]["lon"]
    return el.get("lat"), el.get("lon")


def get_nearest_stations_of_type(
    elements: list,
    amenity_type: str,
    incident_lat: float,
    incident_lng: float,
    top_n: int = 3,
) -> list:
    """
    Filters OSM elements by amenity type, requires a non-empty name tag,
    computes real Haversine distance to the incident, and returns the
    closest `top_n` stations sorted by distance (ascending).
    """
    candidates = []
    for el in elements:
        tags = el.get("tags", {})
        if tags.get("amenity") != amenity_type:
            continue
        name = tags.get("name") or tags.get("name:en") or tags.get("operator")
        if not name:
            continue  # Skip unnamed facilities
        lat, lon = _element_coords(el)
        if lat is None or lon is None:
            continue
        dist = haversine_m(incident_lat, incident_lng, lat, lon)
        candidates.append({
            "name": name,
            "lat": lat,
            "lon": lon,
            "dist_m": dist,
            "osm_id": el.get("id"),
        })

    # Sort by real distance, return top N
    candidates.sort(key=lambda x: x["dist_m"])
    return candidates[:top_n]


def get_local_fallback_station(
    amenity_type: str, incident_lat: float, incident_lng: float
) -> dict:
    """
    Finds the closest station from the pre-seeded local database of real Bangalore stations.
    """
    if amenity_type == "police":
        stations = POLICE_STATIONS
    elif amenity_type == "hospital":
        stations = HOSPITALS
    elif amenity_type == "fire_station":
        stations = FIRE_STATIONS
    else:
        return None

    if not stations:
        return None

    closest = None
    min_dist = float("inf")
    for st in stations:
        dist = haversine_m(incident_lat, incident_lng, st["lat"], st["lon"])
        if dist < min_dist:
            min_dist = dist
            closest = st

    if closest:
        return {
            "name": closest["name"],
            "lat": closest["lat"],
            "lon": closest["lon"],
            "dist_m": min_dist,
        }
    return None


# ─── Main Allocation Endpoint ─────────────────────────────────────────────────

@router.post("/")
def allocate_resources(req: AllocationRequest):
    sev = req.severity
    lat, lng = req.latitude, req.longitude
    event_type = req.event_type or "accident"

    # Target points along route if route is provided
    route_coords = req.route_coordinates
    is_route = route_coords and len(route_coords) >= 2

    if is_route:
        # Determine specific points along route
        p_lng, p_lat = route_coords[0][0], route_coords[0][1]  # Start for Police
        mid_idx = len(route_coords) // 2
        f_lng, f_lat = route_coords[mid_idx][0], route_coords[mid_idx][1]  # Mid for Fire
        m_lng, m_lat = route_coords[-1][0], route_coords[-1][1]  # End for Medical
        
        # Use midpoint as search center for Overpass API
        lat, lng = f_lat, f_lng
    else:
        p_lng, p_lat = lng, lat
        f_lng, f_lat = lng, lat
        m_lng, m_lat = lng, lat

    # Base resource counts based on severity
    base_officers = {"Critical": 10, "High": 6, "Medium": 3}.get(sev, 1)

    # Determine custom dispatches based on event_type and severity
    dispatch_police = True
    dispatch_fire = False
    dispatch_medical = False
    
    police_count = base_officers
    fire_count = 0
    medical_count = 0
    
    if event_type == "political_rally":
        police_count = int(base_officers * 1.5)
        dispatch_fire = True
        fire_count = max(2, base_officers // 2)
        if sev in ("High", "Critical"):
            dispatch_medical = True
            medical_count = 2
            
    elif event_type == "festival":
        police_count = base_officers
        dispatch_fire = True
        fire_count = max(2, base_officers // 2)
        if sev in ("High", "Critical"):
            dispatch_medical = True
            medical_count = 2
            
    elif event_type == "sports_event":
        police_count = base_officers
        if sev in ("High", "Critical"):
            dispatch_fire = True
            fire_count = max(1, base_officers // 2)
        if sev == "Critical":
            dispatch_medical = True
            medical_count = 2
            
    elif event_type == "construction":
        police_count = max(1, base_officers // 2)
        dispatch_fire = True
        fire_count = base_officers  # Construction needs heavy barricades
        if sev == "Critical":
            dispatch_medical = True
            medical_count = 1
            
    elif event_type == "accident":
        police_count = base_officers
        if sev in ("Medium", "High", "Critical"):
            dispatch_medical = True
            medical_count = 2 if sev == "Critical" else 1
        if sev in ("High", "Critical"):
            dispatch_fire = True
            fire_count = max(1, base_officers // 2)
            
    elif event_type == "tree_fall":
        police_count = max(1, base_officers // 2)
        dispatch_fire = True
        fire_count = base_officers  # Tree clearing requires heavy equipment
        if sev == "Critical":
            dispatch_medical = True
            medical_count = 1
            
    elif event_type == "water_logging":
        police_count = base_officers
        dispatch_fire = True
        fire_count = base_officers  # Drainage pumping teams
        if sev == "Critical":
            dispatch_medical = True
            medical_count = 1
            
    elif event_type == "vehicle_breakdown":
        police_count = max(1, base_officers // 2)
        dispatch_fire = True
        fire_count = max(1, base_officers // 2)
        
    elif event_type == "sudden_gathering":
        police_count = base_officers * 2  # Riot control / crowd containment
        dispatch_fire = True
        fire_count = max(2, base_officers // 2)
        if sev in ("High", "Critical"):
            dispatch_medical = True
            medical_count = 2
            
    else: # default/others
        police_count = base_officers
        if sev in ("High", "Critical"):
            dispatch_fire = True
            fire_count = max(1, base_officers // 2)
        if sev == "Critical":
            dispatch_medical = True
            medical_count = 2

    # Fetch real OSM stations — try 10 km first, expand to 20 km if too few results
    elements = fetch_real_stations(lat, lng, radius_m=10_000)
    if len(elements) < 3:
        logger.info("Fewer than 3 results in 10 km, expanding radius to 20 km")
        elements = fetch_real_stations(lat, lng, radius_m=20_000)

    stations_data = []

    # ── 1. Nearest Police Station ──────────────────────────────────────────────
    if dispatch_police and police_count > 0:
        police_list = get_nearest_stations_of_type(elements, "police", p_lat, p_lng, top_n=1)
        if police_list:
            p = police_list[0]
            police_loc = [p["lon"], p["lat"]]
            police_name = p["name"]
            dist_label = f"{p['dist_m'] / 1000:.1f} km away"
            logger.info(f"Nearest police: {police_name} ({dist_label})")
        else:
            fallback = get_local_fallback_station("police", p_lat, p_lng)
            if fallback:
                police_loc = [fallback["lon"], fallback["lat"]]
                police_name = fallback["name"]
                dist_label = f"{fallback['dist_m'] / 1000:.1f} km away"
                logger.info(f"Nearest police (local DB fallback): {police_name} ({dist_label})")
            else:
                police_loc = [p_lng + 0.015, p_lat + 0.012]
                police_name = "Central Police Station (approx.)"

        stations_data.append({
            "id": "police_1",
            "type": "Police",
            "name": police_name,
            "location": police_loc,
            "dispatched": police_count,
            "color": "#3b82f6",
            "route": get_osrm_route(police_loc[0], police_loc[1], p_lng, p_lat),
            "target_location": [p_lng, p_lat]
        })

    # ── 2. Nearest Fire Station ────────────────────────────────────────────────
    if dispatch_fire and fire_count > 0:
        fire_list = get_nearest_stations_of_type(elements, "fire_station", f_lat, f_lng, top_n=1)
        if fire_list:
            f = fire_list[0]
            fire_loc = [f["lon"], f["lat"]]
            fire_name = f["name"]
            logger.info(f"Nearest fire station: {fire_name} ({f['dist_m']/1000:.1f} km)")
        else:
            fallback = get_local_fallback_station("fire_station", f_lat, f_lng)
            if fallback:
                fire_loc = [fallback["lon"], fallback["lat"]]
                fire_name = fallback["name"]
                dist_label = f"{fallback['dist_m'] / 1000:.1f} km away"
                logger.info(f"Nearest fire station (local DB fallback): {fire_name} ({dist_label})")
            else:
                fire_loc = [f_lng - 0.01, f_lat + 0.018]
                fire_name = "District Fire Station (approx.)"

        stations_data.append({
            "id": "fire_1",
            "type": "Fire/Barricade",
            "name": fire_name,
            "location": fire_loc,
            "dispatched": fire_count,
            "color": "#f97316",
            "route": get_osrm_route(fire_loc[0], fire_loc[1], f_lng, f_lat),
            "target_location": [f_lng, f_lat]
        })

    # ── 3. Nearest Hospital ───────────────────────────────────────────────────
    if dispatch_medical and medical_count > 0:
        medic_list = get_nearest_stations_of_type(elements, "hospital", m_lat, m_lng, top_n=1)
        if medic_list:
            m = medic_list[0]
            medic_loc = [m["lon"], m["lat"]]
            medic_name = m["name"]
            logger.info(f"Nearest hospital: {medic_name} ({m['dist_m']/1000:.1f} km)")
        else:
            fallback = get_local_fallback_station("hospital", m_lat, m_lng)
            if fallback:
                medic_loc = [fallback["lon"], fallback["lat"]]
                medic_name = fallback["name"]
                dist_label = f"{fallback['dist_m'] / 1000:.1f} km away"
                logger.info(f"Nearest hospital (local DB fallback): {medic_name} ({dist_label})")
            else:
                medic_loc = [m_lng + 0.005, m_lat - 0.02]
                medic_name = "City General Hospital (approx.)"

        stations_data.append({
            "id": "medic_1",
            "type": "Medical",
            "name": medic_name,
            "location": medic_loc,
            "dispatched": medical_count,
            "color": "#ef4444",
            "route": get_osrm_route(medic_loc[0], medic_loc[1], m_lng, m_lat),
            "target_location": [m_lng, m_lat]
        })

    logger.info(f"Allocation complete: {len(stations_data)} stations dispatched for {event_type} ({sev}) incident")

    return {
        "incident_id": req.incident_id,
        "stations": stations_data,
    }
