'use client';

import React, { useEffect, useRef, useState } from 'react';
import { mappls, mappls_plugin } from 'mappls-web-maps';

const MAPMYINDIA_KEY = process.env.NEXT_PUBLIC_MAPMYINDIA_KEY || 'tqaqwbbmicdlewwuyzppimsrhywtgoyindbz';

const mapplsClassObject = new mappls();

const safeRemoveOverlay = (map, layer) => {
  if (!map || !layer) return;
  // If the map has been removed or style is cleared, do not attempt to call removal methods
  if (map._removed || !map.style) return;

  try {
    if (typeof layer.remove === 'function') {
      layer.remove();
      return;
    }
  } catch (e) {}
  try {
    if (typeof mappls.remove === 'function') {
      mappls.remove({ map: map, layer: layer });
      return;
    }
  } catch (e) {}
  try {
    if (mapplsClassObject && typeof mapplsClassObject.remove === 'function') {
      mapplsClassObject.remove({ map: map, layer: layer });
      return;
    }
  } catch (e) {}
  try {
    if (mapplsClassObject && typeof mapplsClassObject.removeLayer === 'function') {
      mapplsClassObject.removeLayer({ map: map, layer: layer });
      return;
    }
  } catch (e) {}
};

const getCircleGeoJSON = (lat, lng, radiusInKm) => {
  const points = 64;
  const coords = [];
  const distanceX = radiusInKm / (111.32 * Math.cos(lat * Math.PI / 180));
  const distanceY = radiusInKm / 110.57;

  for (let i = 0; i < points; i++) {
    const theta = (i / points) * (2 * Math.PI);
    const x = distanceX * Math.cos(theta);
    const y = distanceY * Math.sin(theta);
    coords.push([lng + x, lat + y]);
  }
  coords.push(coords[0]); // Close polygon
  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [coords]
    }
  };
};

export default function MapView({ 
  incidents, 
  selectedIncident, 
  onSelectIncident,
  stations = [],
  selectedLocations = [],
  onMapClick,
  incidentShape = 'point'
}) {
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const stationMarkersRef = useRef([]);
  const selectionMarkersRef = useRef([]);
  const dispatchLinesRef = useRef([]);
  const activeRouteLineRef = useRef(null);
  const simulatedRouteLinesRef = useRef([]);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const onMapClickRef = useRef(onMapClick);
  const [activeRoutePath, setActiveRoutePath] = useState([]);
  const [simulatedRoutes, setSimulatedRoutes] = useState({});

  // Fetch OSRM road-snapped route for active selection
  useEffect(() => {
    if (incidentShape !== 'route' || selectedLocations.length < 2) {
      setActiveRoutePath([]);
      return;
    }

    const coordsStr = selectedLocations.map(loc => `${loc[0]},${loc[1]}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson`;

    const controller = new AbortController();
    fetch(url, { signal: controller.signal })
      .then(res => res.json())
      .then(data => {
        if (data.routes && data.routes[0]) {
          setActiveRoutePath(data.routes[0].geometry.coordinates);
        } else {
          setActiveRoutePath(selectedLocations);
        }
      })
      .catch(err => {
        if (err.name !== 'AbortError') {
          console.error("OSRM active selection query failed:", err);
          setActiveRoutePath(selectedLocations);
        }
      });

    return () => controller.abort();
  }, [selectedLocations, incidentShape]);

  // Fetch OSRM road-snapped routes for simulated incidents
  useEffect(() => {
    incidents.forEach(inc => {
      if (inc.route_coordinates && inc.route_coordinates.length >= 2 && !simulatedRoutes[inc.id]) {
        const coordsStr = inc.route_coordinates.map(loc => `${loc[0]},${loc[1]}`).join(';');
        const url = `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson`;

        fetch(url)
          .then(res => res.json())
          .then(data => {
            if (data.routes && data.routes[0]) {
              const coords = data.routes[0].geometry.coordinates;
              setSimulatedRoutes(prev => ({ ...prev, [inc.id]: coords }));
            } else {
              setSimulatedRoutes(prev => ({ ...prev, [inc.id]: inc.route_coordinates }));
            }
          })
          .catch(err => {
            console.error("OSRM simulation route query failed:", err);
            setSimulatedRoutes(prev => ({ ...prev, [inc.id]: inc.route_coordinates }));
          });
      }
    });
  }, [incidents, simulatedRoutes]);

  useEffect(() => {
    onMapClickRef.current = onMapClick;
  }, [onMapClick]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const loadObject = { 
      map: true, 
      version: '3.0' 
    };

    mapplsClassObject.initialize(MAPMYINDIA_KEY, loadObject, () => {
      if (!document.getElementById("map")) return;
      
      const newMap = mapplsClassObject.Map({
        id: "map",
        properties: {
          center: [12.9716, 77.5946], // Bangalore default
          zoom: 11,
        },
      });

      newMap.on("load", () => {
        setIsMapLoaded(true);
      });

      const handleMapClickEvent = (e) => {
        if (onMapClickRef.current) {
          let lat = null;
          let lng = null;
          if (e.lngLat) {
            lat = e.lngLat.lat;
            lng = e.lngLat.lng;
          } else if (e.latLng) {
            lat = typeof e.latLng.lat === 'function' ? e.latLng.lat() : e.latLng.lat;
            lng = typeof e.latLng.lng === 'function' ? e.latLng.lng() : e.latLng.lng;
          } else if (e.coordinates && e.coordinates.length >= 2) {
            lng = e.coordinates[0];
            lat = e.coordinates[1];
          }
          
          if (lat !== null && lng !== null) {
            onMapClickRef.current(lat, lng);
          }
        }
      };

      try {
        newMap.addListener("click", handleMapClickEvent);
      } catch (err) {
        console.warn("Could not bind click via addListener:", err);
      }

      try {
        newMap.on("click", handleMapClickEvent);
      } catch (err) {
        console.warn("Could not bind click via on:", err);
      }
      
      mapRef.current = newMap;
    });

    return () => {
      // Clear overlay refs immediately to prevent removing them on a destroyed map
      markersRef.current = [];
      stationMarkersRef.current = [];
      selectionMarkersRef.current = [];
      polylinesRef.current = [];
      dispatchLinesRef.current = [];
      activeRouteLineRef.current = null;
      simulatedRouteLinesRef.current = [];

      if (mapRef.current && typeof mapRef.current.remove === 'function') {
        try {
          mapRef.current.remove();
        } catch (e) {
          console.warn("Could not remove map safely:", e);
        }
        mapRef.current = null;
      }
    };
  }, []);

  // Update map overlays when props change
  useEffect(() => {
    if (!isMapLoaded || !mapRef.current) return;
    
    // 1. Clear old overlays
    
    // Clear incident markers
    markersRef.current.forEach(marker => {
      if (typeof marker.remove === 'function') marker.remove();
    });
    markersRef.current = [];

    // Clear station markers
    stationMarkersRef.current.forEach(marker => {
      if (typeof marker.remove === 'function') marker.remove();
    });
    stationMarkersRef.current = [];

    // Clear selection markers
    selectionMarkersRef.current.forEach(marker => {
      if (typeof marker.remove === 'function') marker.remove();
    });
    selectionMarkersRef.current = [];

    // Clear dispatch line polylines
    dispatchLinesRef.current.forEach(line => {
      safeRemoveOverlay(mapRef.current, line);
    });
    dispatchLinesRef.current = [];

    // Clear active route polyline
    if (activeRouteLineRef.current) {
      safeRemoveOverlay(mapRef.current, activeRouteLineRef.current);
      activeRouteLineRef.current = null;
    }

    // Clear simulated route polylines
    simulatedRouteLinesRef.current.forEach(line => {
      safeRemoveOverlay(mapRef.current, line);
    });
    simulatedRouteLinesRef.current = [];

    // Clear Mapbox GL blast radius layers and sources
    try {
      if (mapRef.current.getLayer('blast-radius-fill')) {
        mapRef.current.removeLayer('blast-radius-fill');
      }
      if (mapRef.current.getLayer('blast-radius-outline')) {
        mapRef.current.removeLayer('blast-radius-outline');
      }
      if (mapRef.current.getSource('blast-radius-source')) {
        mapRef.current.removeSource('blast-radius-source');
      }
    } catch (e) {
      console.warn("Could not clear Mapbox GL blast radius source/layer:", e);
    }

    // 2. Add Selection Markers (if user clicked but hasn't submitted yet)
    selectedLocations.forEach((loc, idx) => {
      try {
        const marker = new mapplsClassObject.Marker({
          map: mapRef.current,
          position: { lat: loc[1], lng: loc[0] },
          title: `Selected simulation target #${idx + 1}`
        });
        selectionMarkersRef.current.push(marker);
      } catch (err) {
        console.log("Could not add Selection marker:", err);
      }
    });

    // 2.5 Draw Active Route Selection Polyline
    if (incidentShape === 'route' && activeRoutePath.length >= 2) {
      try {
        const path = activeRoutePath.map(coord => ({ lat: coord[1], lng: coord[0] }));
        const activeLine = new mapplsClassObject.Polyline({
          map: mapRef.current,
          path: path,
          strokeColor: '#3b82f6',
          strokeWeight: 4,
          strokeOpacity: 0.8
        });
        activeRouteLineRef.current = activeLine;
      } catch (err) {
        console.error("Could not draw active route line:", err);
      }
    }

    // 2.6 Draw Simulated Route Breakdown Polylines
    incidents.forEach(inc => {
      const routeCoords = simulatedRoutes[inc.id] || inc.route_coordinates;
      if (routeCoords && routeCoords.length >= 2) {
        try {
          const path = routeCoords.map(loc => ({ lat: loc[1], lng: loc[0] }));
          const color = inc.severity === 'Critical' ? '#ef4444' :
                        inc.severity === 'High' ? '#f97316' :
                        inc.severity === 'Medium' ? '#eab308' : '#3b82f6';
          const simLine = new mapplsClassObject.Polyline({
            map: mapRef.current,
            path: path,
            strokeColor: color,
            strokeWeight: 6,
            strokeOpacity: 0.7
          });
          simulatedRouteLinesRef.current.push(simLine);
          
          // Also place marker at end of route to show entire path direction
          const endLoc = inc.route_coordinates[inc.route_coordinates.length - 1];
          const endMarker = new mapplsClassObject.Marker({
            map: mapRef.current,
            position: { lat: endLoc[1], lng: endLoc[0] },
            title: `End point of route simulation`
          });
          markersRef.current.push(endMarker);
        } catch (err) {
          console.error("Could not draw simulated route line:", err);
        }
      }
    });

    // 3. Add Incident Markers & Blast Radii
    incidents.forEach(inc => {
      try {
        const marker = new mapplsClassObject.Marker({
          map: mapRef.current,
          position: { lat: inc.location[1], lng: inc.location[0] },
          title: `[${inc.severity}] ${inc.event_type}`
        });
        markersRef.current.push(marker);
      } catch (err) {
        console.log("Could not add Mappls incident marker:", err);
      }
    });

    // Draw Mapbox GL blast radius layers
    const blastFeatures = incidents
      .filter(inc => inc.blast_radius_km)
      .map(inc => {
        const circlePolygon = getCircleGeoJSON(inc.location[1], inc.location[0], inc.blast_radius_km);
        circlePolygon.properties = {
          severity: inc.severity,
          color: inc.severity === 'Critical' ? '#ef4444' :
                 inc.severity === 'High' ? '#f97316' :
                 inc.severity === 'Medium' ? '#eab308' : '#3b82f6'
        };
        return circlePolygon;
      });

    if (blastFeatures.length > 0) {
      try {
        mapRef.current.addSource('blast-radius-source', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: blastFeatures
          }
        });
        
        mapRef.current.addLayer({
          id: 'blast-radius-fill',
          type: 'fill',
          source: 'blast-radius-source',
          paint: {
            'fill-color': ['get', 'color'],
            'fill-opacity': 0.15
          }
        });

        mapRef.current.addLayer({
          id: 'blast-radius-outline',
          type: 'line',
          source: 'blast-radius-source',
          paint: {
            'line-color': ['get', 'color'],
            'line-width': 1.5,
            'line-opacity': 0.5
          }
        });
      } catch (err) {
        console.error("Could not add Mapbox GL blast radius layer:", err);
      }
    }

    // 4. Add Station Markers
    stations.forEach(st => {
      try {
        const marker = new mapplsClassObject.Marker({
          map: mapRef.current,
          position: { lat: st.location[1], lng: st.location[0] },
          title: `${st.name} (${st.type} - Dispatched: ${st.dispatched})`
        });
        stationMarkersRef.current.push(marker);
      } catch (err) {
        console.log("Could not add Mappls station marker:", err);
      }
    });

    // Determine target location for routing and resource allocation lines (fallback)
    let targetLatLng = null;
    if (incidents.length > 0) {
      const latestIncident = incidents[incidents.length - 1];
      targetLatLng = { lat: latestIncident.location[1], lng: latestIncident.location[0] };
    } else if (selectedLocations.length > 0) {
      const latestLoc = selectedLocations[selectedLocations.length - 1];
      targetLatLng = { lat: latestLoc[1], lng: latestLoc[0] };
    }

    // 5. Draw Resource Dispatch lines (OSRM directions connecting stations to incident)
    stations.forEach(station => {
      try {
        let path = [];
        if (station.route && station.route.length >= 2) {
          path = station.route.map(coord => ({
            lat: coord[1],
            lng: coord[0]
          }));
        } else {
          // Fallback to straight line connecting station location to target location
          const stationLatLng = { lat: station.location[1], lng: station.location[0] };
          let destLatLng = targetLatLng;
          if (station.incidentLocation && station.incidentLocation.length >= 2) {
            destLatLng = { lat: station.incidentLocation[1], lng: station.incidentLocation[0] };
          }
          if (destLatLng) {
            path = [stationLatLng, destLatLng];
          }
        }

        if (path.length >= 2) {
          const dispatchLine = new mapplsClassObject.Polyline({
            map: mapRef.current,
            path: path,
            strokeColor: station.color || '#ef4444',
            strokeWeight: 4,
            strokeOpacity: 0.8
          });
          dispatchLinesRef.current.push(dispatchLine);
        }
      } catch (err) {
        console.error("Could not add dispatch line polyline:", err);
      }
    });


  }, [incidents, selectedLocations, stations, isMapLoaded, incidentShape, activeRoutePath, simulatedRoutes]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      <div id="map" style={{ width: '100%', height: '100%' }} />
      {!isMapLoaded && (
        <div className="gl-map-loading">
          <div className="gl-spinner" style={{ width: 28, height: 28, borderWidth: 2.5 }} />
          <p className="gl-map-loading-text">Loading MapMyIndia…</p>
        </div>
      )}
    </div>
  );
}
