/* global google */
import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { GoogleMap, DirectionsRenderer, Marker, Polyline } from "@react-google-maps/api";
import { useSnackbar } from "../components/Snackbar.jsx";


const HAZARD_EMOJI = {
  pothole: "🕳️", construction: "🚧", car: "🚗",
  debris: "🪨", accident: "⚠️", flood: "🌊",
};
 
function getEmojiMarkerIcon(emoji = "⚠️", size = 36) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="${size * 0.8}">${emoji}</text>
  </svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: window.google?.maps ? new window.google.maps.Size(size, size) : undefined,
  };
}

const containerStyle = {
  width: "100%",
  height: "600px",
};

const DEFAULT_CENTER = { lat: 33.996112, lng: -81.027428 };
const API_BASE = process.env.REACT_APP_API_BASE_URL || "";

function authHeaders() {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function normalizeRouteType(type) {
  const allowed = ["👣", "🚲", "🚗", "🛹", "🏃", "🛴"];
  return allowed.includes(type) ? type : "👣";
}

function travelModeFromType(type) {
  if (!window.google?.maps) return null;
  const normalized = normalizeRouteType(type);

  if (normalized === "🚲" || normalized === "🛴" || normalized === "🛹") {
    return window.google.maps.TravelMode.BICYCLING;
  }
  if (normalized === "🚗") {
    return window.google.maps.TravelMode.DRIVING;
  }
  return window.google.maps.TravelMode.WALKING;
}


function parseDistanceToMiles(distanceText) {
  if (!distanceText) return null;
  const normalized = String(distanceText).toLowerCase().trim().replace(/,/g, "");
  const value = parseFloat(normalized);
  if (Number.isNaN(value)) return null;
  if (/\bkm\b/.test(normalized)) return value * 0.621371;
  if (/\bmi\b/.test(normalized)) return value;
  if (/\bft\b/.test(normalized)) return value / 5280;
  if (/\bm\b/.test(normalized) && !/\bkm\b/.test(normalized)) return value * 0.000621371;
  return value;
}

function parseDurationToMinutes(durationText) {
  if (!durationText) return null;

  const normalized = String(durationText).toLowerCase().trim();
  let minutes = 0;

  for (const m of normalized.matchAll(/(\d+(?:\.\d+)?)\s*(hour|hours|hr|hrs|h)\b/g))
    minutes += parseFloat(m[1]) * 60;

  for (const m of normalized.matchAll(/(\d+(?:\.\d+)?)\s*(minute|minutes|min|mins|m)\b/g))
    minutes += parseFloat(m[1]);

  if (minutes > 0) return minutes;

  const sec = normalized.match(/(\d+(?:\.\d+)?)\s*(second|seconds|sec|secs|s)\b/);
  if (sec) return parseFloat(sec[1]) / 60;

  const fallback = parseFloat(normalized);
  return Number.isNaN(fallback) ? null : fallback;
}

export default function Library() {
  const [isMobileView, setIsMobileView] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth <= 768;
  });
  const mapRef = useRef(null);
  const [map, setMap] = useState(null);
  const [mapCenter, setMapCenter] = useState(DEFAULT_CENTER);

  const [directionsResult, setDirectionsResult] = useState(null);
  const [distanceText, setDistanceText] = useState("");
  const [durationText, setDurationText] = useState("");
  const [originPosition, setOriginPosition] = useState(null);
  const { showSnackbar } = useSnackbar();

  const [selectedRouteId, setSelectedRouteId] = useState(null);
  const [loadingRouteId, setLoadingRouteId] = useState(null);
  const [editingRouteId, setEditingRouteId] = useState(null);
  const [editForm, setEditForm] = useState({
    title: "",
    origin: "",
    destination: "",
    distance: "",
    duration: "",
    type: "",
    isUSC: false,
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filterType, setFilterType] = useState("all");
  const [filterUSC, setFilterUSC] = useState("all");
  const [maxDistanceMiles, setMaxDistanceMiles] = useState("");
  const [maxDurationMinutes, setMaxDurationMinutes] = useState("");
 
  // server-backed routes
  const [savedRoutes, setSavedRoutes] = useState([]);
  const [loadingRoutes, setLoadingRoutes] = useState(true);
  const [fetchError, setFetchError] = useState(null);
 
  const [loadedReview, setLoadedReview] = useState(null);
  const [loadedHazards, setLoadedHazards] = useState([]);
  const [loadedPath,    setLoadedPath]    = useState([]);
  const [loadedPhotos, setLoadedPhotos] = useState([]);

  // ── fetch all routes for this user ────────────────────────────────────────
 
  const loadRoutes = useCallback(async () => {
    setLoadingRoutes(true);
    setFetchError(null);
    try {
      const res = await fetch(`${API_BASE}/api/routes`, { headers: authHeaders() });
      if (res.status === 401) throw new Error("Not authenticated");
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();
      const routes = Array.isArray(data.routes) ? data.routes : [];

      setSavedRoutes(
        routes.map((route) => ({
          ...route,
          type: normalizeRouteType(route.type),
          photos: Array.isArray(route.photos) ? route.photos : [],
        }))
      );
    } catch (e) {
      console.error("loadRoutes error", e);
      setFetchError("Could not load your routes. Please try again.");
      setSavedRoutes([]);
    } finally {
      setLoadingRoutes(false);
    }
  }, []);
 
  // ── filter helpers ────────────────────────────────────────────────────────
 
  useEffect(() => {
    loadRoutes();
  }, [loadRoutes]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const mediaQuery = window.matchMedia("(max-width: 768px)");
    const updateIsMobileView = (event) => setIsMobileView(event.matches);

    setIsMobileView(mediaQuery.matches);

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updateIsMobileView);
      return () => mediaQuery.removeEventListener("change", updateIsMobileView);
    }

    mediaQuery.addListener(updateIsMobileView);
    return () => mediaQuery.removeListener(updateIsMobileView);
  }, []);
 
  const routeTypeOptions = useMemo(
    () => Array.from(new Set(savedRoutes.map((r) => r.type).filter(Boolean))),
    [savedRoutes]
  );

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const maxDistanceValue = Number.parseFloat(maxDistanceMiles);
  const maxDurationValue = Number.parseFloat(maxDurationMinutes);
  const hasDistanceFilter =
    maxDistanceMiles.trim() !== "" && !Number.isNaN(maxDistanceValue);
  const hasDurationFilter =
    maxDurationMinutes.trim() !== "" && !Number.isNaN(maxDurationValue);

  const activeFilterCount =
    (filterType !== "all" ? 1 : 0) +
    (filterUSC !== "all" ? 1 : 0) +
    (hasDistanceFilter ? 1 : 0) +
    (hasDurationFilter ? 1 : 0);

  const filteredRoutes = useMemo(() => {
    return savedRoutes.filter((route) => {
      const title = String(route.title || "").toLowerCase();
      const origin = String(route.origin || "").toLowerCase();
      const destination = String(route.destination || "").toLowerCase();

      const routeTags = Array.isArray(route.tags) ? route.tags : [];
      const matchesUSC =
        filterUSC === "all" ||
        (filterUSC === "usc" && routeTags.includes("USC"));

      const matchesSearch =
        !normalizedQuery ||
        title.includes(normalizedQuery) ||
        origin.includes(normalizedQuery) ||
        destination.includes(normalizedQuery);

      const matchesType = filterType === "all" || route.type === filterType;

      const routeDistanceMiles = parseDistanceToMiles(route.distance);
      const matchesDistance =
        !hasDistanceFilter ||
        (routeDistanceMiles !== null && routeDistanceMiles <= maxDistanceValue);

      const routeDurationMinutes = parseDurationToMinutes(route.duration);
      const matchesDuration =
        !hasDurationFilter ||
        (routeDurationMinutes !== null && routeDurationMinutes <= maxDurationValue);

      return (
        matchesSearch &&
        matchesType &&
        matchesUSC &&
        matchesDistance &&
        matchesDuration
      );
    });
  }, [
    savedRoutes,
    normalizedQuery,
    filterType,
    filterUSC,
    hasDistanceFilter,
    hasDurationFilter,
    maxDistanceValue,
    maxDurationValue,
  ]);

  function clearFilters() {
    setFilterType("all");
    setMaxDistanceMiles("");
    setMaxDurationMinutes("");
    setFilterUSC("all");
  }

  // ── load route onto map ───────────────────────────────────────────────────
 
  async function loadRoute(route) {
  if (!window.google?.maps) return;

    setLoadedReview(route.review || null);
  setLoadedHazards(Array.isArray(route.hazards) ? route.hazards : []);
  setLoadedPhotos(Array.isArray(route.photos) ? route.photos : []);

  // clear stale blue route from a previous selection
  setDirectionsResult(null);
  setLoadedPath([]);

  try {
    const isRecordedRoute =
      (route.recorded === true || Array.isArray(route.path)) &&
      Array.isArray(route.path) &&
      route.path.length > 1;

    if (isRecordedRoute) {
      setLoadedPath(route.path);

      const bounds = new window.google.maps.LatLngBounds();
      route.path.forEach((p) => bounds.extend(p));
      mapRef.current?.fitBounds(bounds, 40);

      const first = route.path[0];
      if (first) {
        setOriginPosition(first);
        setMapCenter(first);
      }

      setDistanceText(route.distance || "");
      setDurationText(route.duration || "");
      return;
    }

    const service = new window.google.maps.DirectionsService();
    const result = await service.route({
      origin: route.origin,
      destination: route.destination,
      travelMode: travelModeFromType(route.type),
      unitSystem: window.google.maps.UnitSystem.IMPERIAL,
    });

    setDirectionsResult(result);

    const leg = result.routes[0].legs[0];
    setDistanceText(leg.distance?.text || route.distance || "");
    setDurationText(leg.duration?.text || route.duration || "");

    const lat = leg.start_location.lat();
    const lng = leg.start_location.lng();
    setOriginPosition({ lat, lng });
    setMapCenter({ lat, lng });

    mapRef.current?.fitBounds(result.routes[0].bounds);
  } catch (err) {
    console.error("Failed to load route:", err);
    showSnackbar("Could not load route.", "error");
    setLoadedReview(null);
    setLoadedHazards([]);
    setLoadedPath([]);
    setLoadedPhotos([]);
  } finally {
    setLoadingRouteId(null);
  }
}

  // ── delete ────────────────────────────────────────────────────────────────
 function requestDeleteRoute(routeId) {
  showSnackbar("Delete this saved route?", "warning", [
    {
      label: "Delete",
      onClick: () => performDeleteRoute(routeId),
      closeOnClick: true,
    },
    {
      label: "Cancel",
      onClick: () => {},
      closeOnClick: true,
    },
  ], null);
}

async function performDeleteRoute(routeId) {
  try {
    const res = await fetch(`${API_BASE}/api/routes/${routeId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });

    if (!res.ok) throw new Error(`Server error: ${res.status}`);

    setSavedRoutes((prev) => prev.filter((r) => r.id !== routeId));
    if (editingRouteId === routeId) setEditingRouteId(null);

    if (selectedRouteId === routeId) {
      setSelectedRouteId(null);
      setDirectionsResult(null);
      setDistanceText("");
      setDurationText("");
      setOriginPosition(null);
      setMapCenter(DEFAULT_CENTER);
      setLoadedReview(null);
      setLoadedHazards([]);
      setLoadedPath([]);
      setLoadedPhotos([]);
    }

    showSnackbar("Route deleted successfully.", "success");
  } catch (err) {
    console.error("deleteRoute error", err);
    showSnackbar("Failed to delete route. Please try again.", "error");
  }
}


  function startEditingRoute(route) {
    setEditingRouteId(route.id);
    setEditForm({
      title: route.title || "",
      origin: route.origin || "",
      destination: route.destination || "",
      distance: route.distance || "",
      duration: route.duration || "",
      type: route.type || "",
      isUSC: Array.isArray(route.tags) && route.tags.includes("USC"),
    });
  }

  function cancelEditingRoute() {
    setEditingRouteId(null);
    setEditForm({
      title: "",
      origin: "",
      destination: "",
      distance: "",
      duration: "",
      type: "👣",
      isUSC: false,
    });
  }

  function handleEditFieldChange(field, value) {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  }
 
  async function saveEditedRoute(routeId) {
  const origin = editForm.origin.trim();
  const destination = editForm.destination.trim();

  if (!origin || !destination) {
    showSnackbar("Origin and destination are required.", "warning");
    return;
  }

  const updatedFields = {
    title: editForm.title.trim() || "Untitled Route",
    origin,
    destination,
    distance: editForm.distance.trim(),
    duration: editForm.duration.trim(),
    type: normalizeRouteType(editForm.type),
    tags: editForm.isUSC ? ["USC"] : [],
  };

  try {
    const res = await fetch(`${API_BASE}/api/routes/${routeId}`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify(updatedFields),
    });

    if (!res.ok) throw new Error(`Server error: ${res.status}`);

    
    const data = await res.json();

    setSavedRoutes((prev) =>
      prev.map((r) =>
        r.id === routeId
          ? {
            ...data.route,
            type: normalizeRouteType(data.route.type),
            photos: Array.isArray(data.route.photos) ? data.route.photos : [],
          }
        : r
      )
    );

    cancelEditingRoute();
    showSnackbar("Route updated successfully!", "success");

    if (selectedRouteId === routeId) {
      await loadRoute(data.route);
    }

  } catch (err) {
    console.error("saveEditedRoute error", err);
    showSnackbar("Failed to save changes. Please try again.", "error");
  }
}

  function recenterToOrigin() {
    const target = originPosition || DEFAULT_CENTER;
    if (!map) return;
    map.panTo(target);
    map.setZoom(14);
  }

  const pageStyle = {
    padding: isMobileView ? "1rem" : "1.5rem",
    maxWidth: 1200,
    margin: "0 auto",
  };

  const contentGridStyle = {
    display: "grid",
    gridTemplateColumns: isMobileView ? "1fr" : "1fr 320px",
    gap: 16,
    alignItems: "start",
  };

  const mapContainerDynamicStyle = {
    ...containerStyle,
    height: isMobileView ? "320px" : containerStyle.height,
    borderRadius: isMobileView ? 12 : undefined,
  };

  const sidebarStyle = {
    width: "100%",
    border: "1px solid var(--border)",
    background: "var(--surface)",
    color: "var(--text)",
    borderRadius: 8,
    padding: 12,
    maxHeight: isMobileView ? "none" : 600,
    overflowY: isMobileView ? "visible" : "auto",
    order: 2,
  };

  const routeActionStyle = {
    display: "flex",
    gap: 8,
    marginTop: 6,
    flexWrap: isMobileView ? "wrap" : "nowrap",
  };

  const routeEditActionStyle = {
    display: "flex",
    gap: 8,
    marginTop: 8,
    flexWrap: isMobileView ? "wrap" : "nowrap",
  };

  return (
    <div style={pageStyle}>
      <h2>Library</h2>

      <input
        type="text"
        placeholder="Search saved routes..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        style={{
          width: "100%",
          padding: "10px 12px",
          marginBottom: 12,
          borderRadius: 8,
          border: "1px solid var(--border)",
          background: "var(--surface)",
          color: "var(--text)",
          fontSize: 14,
        }}
      />

      <div style={{ marginBottom: 16 }}>
        <button
          onClick={() => setShowFilters((c) => !c)}
          style={{
            border: "1px solid var(--border)",
            background: "var(--surface)",
            color: "var(--text)",
            padding: "8px 12px",
            borderRadius: 8,
            cursor: "pointer",
          }}
        >
          {showFilters ? "Hide Filters" : "Filter"}
          {activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
        </button>
      </div>

      {showFilters && (
        <div
          style={{
            border: "1px solid var(--border)",
            background: "var(--surface)",
            borderRadius: 8,
            padding: 12,
            marginBottom: 16,
            display: "grid",
            gap: 10,
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            alignItems: "end",
          }}
        >
          <div>
            <label
              htmlFor="route-type-filter"
              style={{ display: "block", fontSize: 13, marginBottom: 4, color: "var(--muted)" }}
            >
              Route Type
            </label>
            <select
              id="route-type-filter"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              style={{
                width: "100%",
                padding: 8,
                border: "1px solid var(--border)",
                background: "var(--surface-2)",
                color: "var(--text)",
                borderRadius: 6,
              }}
            >
              <option value="all">All types</option>
              {routeTypeOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="usc-filter"
              style={{ display: "block", fontSize: 13, marginBottom: 4, color: "var(--muted)" }}
            >
              USC Tag
            </label>
            <select
              id="usc-filter"
              value={filterUSC}
              onChange={(e) => setFilterUSC(e.target.value)}
              style={{
                width: "100%",
                padding: 8,
                border: "1px solid var(--border)",
                background: "var(--surface-2)",
                color: "var(--text)",
                borderRadius: 6,
              }}
            >
              <option value="all">All routes</option>
              <option value="usc">USC only</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="max-distance-filter"
              style={{ display: "block", fontSize: 13, marginBottom: 4, color: "var(--muted)" }}
            >
              Max Distance (mi)
            </label>
            <input
              id="max-distance-filter"
              type="number"
              min="0"
              step="0.1"
              value={maxDistanceMiles}
              onChange={(e) => setMaxDistanceMiles(e.target.value)}
              placeholder="e.g. 1.5"
              style={{
                width: "100%",
                padding: 8,
                border: "1px solid var(--border)",
                background: "var(--surface-2)",
                color: "var(--text)",
                borderRadius: 6,
              }}
            />
          </div>

          <div>
            <label
              htmlFor="max-duration-filter"
              style={{ display: "block", fontSize: 13, marginBottom: 4, color: "var(--muted)" }}
            >
              Max Time (min)
            </label>
            <input
              id="max-duration-filter"
              type="number"
              min="0"
              step="1"
              value={maxDurationMinutes}
              onChange={(e) => setMaxDurationMinutes(e.target.value)}
              placeholder="e.g. 20"
              style={{
                width: "100%",
                padding: 8,
                border: "1px solid var(--border)",
                background: "var(--surface-2)",
                color: "var(--text)",
                borderRadius: 6,
              }}
            />
          </div>

          <div>
            <button
              onClick={clearFilters}
              style={{
                width: "100%",
                border: "1px solid var(--border)",
                background: "var(--surface-2)",
                color: "var(--text)",
                padding: "8px 12px",
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              Clear Filters
            </button>
          </div>
        </div>
      )}

      <div style={contentGridStyle}>
        <div style={{ order: isMobileView ? 1 : 0 }}>
          <GoogleMap
            mapContainerStyle={mapContainerDynamicStyle}
            center={mapCenter}
            zoom={14}
            onLoad={(m) => {
              setMap(m);
              mapRef.current = m;
            }}
            onUnmount={() => {
              setMap(null);
              mapRef.current = null;
            }}
            options={{
              fullscreenControl: false,
              streetViewControl: false,
              mapTypeControl: false,
            }}
          >
{loadedPath.length > 1 ? (
  <>
    <Polyline
      path={loadedPath}
      options={{
        strokeColor: "#e63946",
        strokeWeight: 4,
        strokeOpacity: 0.9,
      }}
    />

    {loadedPath[0] && (
      <Marker position={loadedPath[0]} label="A" optimized={false} />
    )}

    {loadedPath[loadedPath.length - 1] && (
      <Marker
        position={loadedPath[loadedPath.length - 1]}
        label="B"
        optimized={false}
      />
    )}
  </>
) : (
  directionsResult && <DirectionsRenderer directions={directionsResult} />
)}

            {loadedHazards.map((h, idx) => (
              <Marker
                key={idx}
                position={{ lat: h.lat, lng: h.lng }}
                icon={getEmojiMarkerIcon(HAZARD_EMOJI[h.type] || "⚠️")}
                title={h.type}
                optimized={false}
              />
            ))}
          </GoogleMap>

          {(distanceText || durationText) && (
            <div style={{ marginTop: 8 }}>
              <strong>Distance:</strong> {distanceText} &nbsp;
              <strong>ETA:</strong> {durationText}
            </div>
          )}

          {selectedRouteId && (
            <div
              style={{
                marginTop: 12,
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: 12,
                background: "var(--surface)",
                color: "var(--text)",
              }}
            >
              <h3 style={{ marginTop: 0 }}>Saved Review</h3>
              {loadedReview ? (
                <div>
                  <div style={{ marginBottom: 8 }}>
                    <strong>Stars:</strong>{" "}
                    <span style={{ color: "gold" }}>
                      {Array.from({ length: loadedReview.stars || 0 }).map((_, i) => (
                        <span key={i}>★</span>
                      ))}
                      {Array.from({ length: 5 - (loadedReview.stars || 0) }).map((_, i) => (
                        <span key={`e${i}`} style={{ color: "#ddd" }}>
                          ★
                        </span>
                      ))}
                    </span>{" "}
                    <span style={{ marginLeft: 8 }}>{loadedReview.stars || 0}/5</span>
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <strong>Terrain:</strong>{" "}
                    {typeof loadedReview.terrain === "number" ? loadedReview.terrain : "—"} / 10
                  </div>
                  <div>
                    <strong>Comment:</strong>
                    <div style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>
                      {loadedReview.comment || <em>No comment</em>}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ color: "var(--muted)" }}>No review saved for this route.</div>
              )}
            </div>
          )}

          {selectedRouteId && loadedHazards.length > 0 && (
            <div
              style={{
                marginTop: 12,
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: 12,
                background: "var(--surface)",
                color: "var(--text)",
              }}
            >
              <h3 style={{ marginTop: 0 }}>Hazards ({loadedHazards.length})</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {loadedHazards.map((h, idx) => (
                  <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                    <span>{HAZARD_EMOJI[h.type] || "⚠️"}</span>
                    <span style={{ textTransform: "capitalize" }}>{h.type}</span>
                    <span style={{ color: "var(--muted)", fontSize: 11 }}>
                      ({h.lat?.toFixed(4)}, {h.lng?.toFixed(4)})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedRouteId && (
            <div
              style={{
                marginTop: 12,
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: 12,
                background: "var(--surface)",
                color: "var(--text)",
              }}
            >
              <h3 style={{ marginTop: 0 }}>Trail Photos</h3>
              {loadedPhotos.length === 0 ? (
                <div style={{ color: "var(--muted)" }}>No photos saved for this route.</div>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: 12,
                  }}
                >
                  {loadedPhotos.map((photo, index) => (
                    <div
                      key={photo.url || index}
                      style={{
                        border: "1px solid var(--border)",
                        borderRadius: 10,
                        padding: 10,
                        background: "var(--surface-2, var(--surface))",
                      }}
                    >
                      <img
                        src={photo.url}
                        alt={photo.caption || `Trail photo ${index + 1}`}
                        style={{
                          width: "100%",
                          height: 140,
                          objectFit: "cover",
                          borderRadius: 8,
                          display: "block",
                          marginBottom: 8,
                        }}
                      />
                      <div style={{ fontSize: 13, color: "var(--text)" }}>
                        {photo.caption || (
                          <span style={{ color: "var(--muted)" }}>No caption</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

{isMobileView && filteredRoutes.length > 0 && (
  <div
    style={{
      marginTop: 12,
      padding: "10px 12px",
      border: "1px solid var(--border)",
      borderRadius: 8,
      background: "var(--surface)",
      color: "var(--text)",
    }}
  >
    <div style={{ fontWeight: 700, marginBottom: 6 }}>
      Saved routes below
    </div>

    <div style={{ fontSize: 13, color: "var(--muted)" }}>
      Scroll down to view your routes.
    </div>

    <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
      {filteredRoutes.slice(0, 2).map((route) => (
        <div
          key={route.id}
          style={{
            fontSize: 14,
            padding: "6px 8px",
            borderRadius: 6,
            border: "1px solid var(--border)",
            background: "var(--surface-2)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {route.title || `${route.origin} → ${route.destination}`}
        </div>
      ))}
    </div>
  </div>
)}

        <aside
          style={sidebarStyle}
        >
          <h3>
            Saved Routes ({filteredRoutes.length})
            <button
              onClick={loadRoutes}
              disabled={loadingRoutes}
              style={{
                marginLeft: 10,
                fontSize: 12,
                padding: "3px 8px",
                borderRadius: 6,
                border: "1px solid var(--border)",
                background: "var(--surface-2)",
                color: "var(--text)",
                cursor: "pointer",
              }}
            >
              {loadingRoutes ? "…" : "↺ Refresh"}
            </button>
          </h3>

          {loadingRoutes ? (
            <div style={{ color: "var(--muted)", fontSize: 14 }}>Loading routes…</div>
          ) : fetchError ? (
            <div style={{ color: "crimson", fontSize: 14 }}>{fetchError}</div>
          ) : filteredRoutes.length === 0 ? (
            <div style={{ color: "var(--muted)", fontSize: 14 }}>
              No routes match your search and filters.
            </div>
          ) : (
            filteredRoutes.map((route) => {
              const firstPhoto =
                Array.isArray(route.photos) && route.photos.length > 0
                  ? route.photos[0]?.url
                  : null;

              return (
                <div
                  key={route.id}
                  style={{
                    padding: 10,
                    marginBottom: 10,
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    background:
                      route.id === selectedRouteId
                        ? "var(--surface-2)"
                        : "var(--surface)",
                    color: "var(--text)",
                  }}
                >
                  {editingRouteId === route.id ? (
                    <>
                      <div style={{ display: "grid", gap: 6 }}>
                        <input
                          type="text"
                          value={editForm.title}
                          onChange={(e) => handleEditFieldChange("title", e.target.value)}
                          placeholder="Route title"
                          style={{ padding: 6, fontSize: 13 }}
                        />

                        <select
                          value={editForm.type}
                          onChange={(e) => handleEditFieldChange("type", e.target.value)}
                          style={{ padding: 6, fontSize: 13 }}
                        >
                          <option value="👣">👣 Walking</option>
                          <option value="🚲">🚲 Biking</option>
                          <option value="🚗">🚗 Driving</option>
                          <option value="🛹">🛹 Skateboarding</option>
                          <option value="🏃">🏃 Running</option>
                          <option value="🛴">🛴 Scootering</option>
                        </select>

                        <input
                          type="text"
                          value={editForm.origin}
                          onChange={(e) => handleEditFieldChange("origin", e.target.value)}
                          placeholder="Origin"
                          style={{ padding: 6, fontSize: 13 }}
                        />
                        <input
                          type="text"
                          value={editForm.destination}
                          onChange={(e) => handleEditFieldChange("destination", e.target.value)}
                          placeholder="Destination"
                          style={{ padding: 6, fontSize: 13 }}
                        />
                        <input
                          type="text"
                          value={editForm.distance}
                          onChange={(e) => handleEditFieldChange("distance", e.target.value)}
                          placeholder="Distance (e.g. 1.2 mi)"
                          style={{ padding: 6, fontSize: 13 }}
                        />
                        <input
                          type="text"
                          value={editForm.duration}
                          onChange={(e) => handleEditFieldChange("duration", e.target.value)}
                          placeholder="Duration (e.g. 15 mins)"
                          style={{ padding: 6, fontSize: 13 }}
                        />
                      </div>

                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          marginTop: 8,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={editForm.isUSC}
                          onChange={(e) =>
                            setEditForm((p) => ({ ...p, isUSC: e.target.checked }))
                          }
                        />
                        at USC
                      </label>

                      <div style={routeEditActionStyle}>
                        <button onClick={() => saveEditedRoute(route.id)}>Save</button>
                        <button onClick={cancelEditingRoute}>Cancel</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontWeight: 700 }}>
                        {route.title} {route.type}
                        {Array.isArray(route.tags) && route.tags.includes("USC") && (
                          <span
                            style={{
                              marginLeft: 8,
                              fontSize: 12,
                              padding: "2px 6px",
                              borderRadius: 999,
                              background: "rgba(115, 0, 10, 0.12)",
                              color: "var(--brand)",
                            }}
                          >
                            USC
                          </span>
                        )}
                      </div>

                      <div style={{ fontSize: 13 }}>
                        {route.origin} {"->"} {route.destination}
                      </div>

                      <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                        {route.distance} {route.duration && `| ${route.duration}`}
                      </div>

                      {firstPhoto && (
                        <div style={{ marginTop: 8 }}>
                          <img
                            src={firstPhoto}
                            alt={`${route.title || "Route"} preview`}
                            style={{
                              width: "100%",
                              height: 120,
                              objectFit: "cover",
                              borderRadius: 8,
                              border: "1px solid var(--border)",
                              display: "block",
                            }}
                          />
                        </div>
                      )}

                      {Array.isArray(route.photos) && route.photos.length > 0 && (
                        <div
                          style={{
                            marginTop: 6,
                            fontSize: 12,
                            color: "var(--muted)",
                            fontWeight: 600,
                          }}
                        >
                          {route.photos.length} photo{route.photos.length > 1 ? "s" : ""}
                        </div>
                      )}

                      <div style={routeActionStyle}>
                        <button
                          onClick={() => loadRoute(route)}
                          disabled={loadingRouteId === route.id}
                        >
                          {loadingRouteId === route.id ? "Loading..." : "Load"}
                        </button>
                        <button
                          onClick={() => startEditingRoute(route)}
                          disabled={loadingRouteId === route.id}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => requestDeleteRoute(route.id)}
                          disabled={loadingRouteId === route.id}
                          style={{
                            border: "1px solid #c62828",
                            color: "#c62828",
                            background: "#fff",
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })
          )}
        </aside>
      </div>
    </div>
  );
}
