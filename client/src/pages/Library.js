/* global google */
import React, { useEffect, useRef, useState, useCallback } from "react";
import { GoogleMap, DirectionsRenderer, Marker, Polyline } from "@react-google-maps/api";

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

function travelModeFromType(type) {
  if (!window.google?.maps) return null;
  if (type === "🚲" || type === "🛴" || type === "🛹")
    return window.google.maps.TravelMode.BICYCLING;
  if (type === "🚗") return window.google.maps.TravelMode.DRIVING;
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
  const mapRef = useRef(null);
  const [map, setMap] = useState(null);
  const [mapCenter, setMapCenter] = useState(DEFAULT_CENTER);

  const [directionsResult, setDirectionsResult] = useState(null);
  const [distanceText, setDistanceText] = useState("");
  const [durationText, setDurationText] = useState("");
  const [originPosition, setOriginPosition] = useState(null);

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

  // ── fetch all routes for this user ────────────────────────────────────────
 
  const loadRoutes = useCallback(async () => {
    setLoadingRoutes(true);
    setFetchError(null);
    try {
      const res = await fetch(`${API_BASE}/api/routes`, { headers: authHeaders() });
      if (res.status === 401) throw new Error("Not authenticated");
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();
      setSavedRoutes(Array.isArray(data.routes) ? data.routes : []);
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
 
  const routeTypeOptions = Array.from(
    new Set(savedRoutes.map((r) => r.type).filter(Boolean))
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

  const filteredRoutes = savedRoutes.filter((route) => {
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

      return matchesSearch && matchesType && matchesUSC && matchesDistance && matchesDuration;
  });

  function clearFilters() {
    setFilterType("all");
    setMaxDistanceMiles("");
    setMaxDurationMinutes("");
    setFilterUSC("all");
  }

  // ── load route onto map ───────────────────────────────────────────────────
 
  async function loadRoute(route) {
    if (!window.google?.maps) return;
 
    setLoadingRouteId(route.id);
    setSelectedRouteId(route.id);
    setLoadedReview(null);
    setLoadedHazards([]);
    setLoadedPath([]);
 
    try {
      const service = new window.google.maps.DirectionsService();
      const result  = await service.route({
        origin:      route.origin,
        destination: route.destination,
        travelMode:  travelModeFromType(route.type),
        unitSystem:  window.google.maps.UnitSystem.IMPERIAL,
      });
 
      setDirectionsResult(result);
 
      const leg = result.routes[0].legs[0];
      setDistanceText(leg.distance?.text || route.distance || "");
      setDurationText(leg.duration?.text || route.duration || "");
 
      const lat = leg.start_location.lat();
      const lng = leg.start_location.lng();
      setOriginPosition({ lat, lng });
      setMapCenter({ lat, lng });
 
      map?.fitBounds(result.routes[0].bounds);
      setLoadedReview(route.review || null);
    setLoadedHazards(Array.isArray(route.hazards) ? route.hazards : []);
    setLoadedPath(Array.isArray(route.path) ? route.path : []);
    } catch (err) {
      console.error("Failed to load route:", err);
      alert("Could not load route.");
      setLoadedReview(null);
    } finally {
      setLoadingRouteId(null);
    }
  }

  // ── delete ────────────────────────────────────────────────────────────────
 
  async function deleteRoute(routeId) {
    if (!window.confirm("Delete this saved route?")) return;
 
    try {
      const res = await fetch(`${API_BASE}/api/routes/${routeId}`, {
        method:  "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
 
      setSavedRoutes((prev) => prev.filter((r) => r.id !== routeId));
      if (editingRouteId  === routeId) setEditingRouteId(null);
 
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
      }
    } catch (err) {
      console.error("deleteRoute error", err);
      alert("Failed to delete route. Please try again.");
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
      type: "",
      isUSC: false,
    });
  }

  function handleEditFieldChange(field, value) {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  }
 
  async function saveEditedRoute(routeId) {
    const origin      = editForm.origin.trim();
    const destination = editForm.destination.trim();
 
    if (!origin || !destination) {
      alert("Origin and destination are required.");
      return;
    }
 
    const updatedFields = {
      title:       editForm.title.trim() || "Untitled Route",
      origin,
      destination,
      distance:    editForm.distance.trim(),
      duration:    editForm.duration.trim(),
      type:        editForm.type.trim(),
      tags:        editForm.isUSC ? ["USC"] : [],
    };
 
    try {
      const res = await fetch(`${API_BASE}/api/routes/${routeId}`, {
        method:  "PUT",
        headers: authHeaders(),
        body:    JSON.stringify(updatedFields),
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();
 
      setSavedRoutes((prev) =>
        prev.map((r) => (r.id === routeId ? data.route : r))
      );
      cancelEditingRoute();
 
      if (selectedRouteId === routeId) {
        await loadRoute(data.route);
      }
    } catch (err) {
      console.error("saveEditedRoute error", err);
      alert("Failed to save changes. Please try again.");
    }
  }

  function recenterToOrigin() {
    const target = originPosition || DEFAULT_CENTER;
    if (!map) return;
    map.panTo(target);
    map.setZoom(14);
  }

  return (
    <div style={{ padding: "1.5rem", maxWidth: 1200, margin: "0 auto" }}>
      <h2>Library</h2>
 
      {/* Search */}
      <input
        type="text"
        placeholder="Search saved routes..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        style={{
          width: "100%", padding: "10px 12px", marginBottom: 12,
          borderRadius: 8, border: "1px solid var(--border)",
          background: "var(--surface)", color: "var(--text)", fontSize: 14,
        }}
      />
 
      {/* Filter toggle */}
      <div style={{ marginBottom: 16 }}>
        <button
          onClick={() => setShowFilters((c) => !c)}
          style={{
            border: "1px solid var(--border)", background: "var(--surface)",
            color: "var(--text)", padding: "8px 12px", borderRadius: 8, cursor: "pointer",
          }}
        >
          {showFilters ? "Hide Filters" : "Filter"}
          {activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
        </button>
      </div>
 
      {showFilters && (
        <div
          style={{
            border: "1px solid var(--border)", background: "var(--surface)",
            borderRadius: 8, padding: 12, marginBottom: 16,
            display: "grid", gap: 10,
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            alignItems: "end",
          }}
        >
          {/* Route type */}
          <div>
            <label htmlFor="route-type-filter" style={{ display: "block", fontSize: 13, marginBottom: 4, color: "var(--muted)" }}>
              Route Type
            </label>
            <select
              id="route-type-filter" value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              style={{ width: "100%", padding: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", borderRadius: 6 }}
            >
              <option value="all">All types</option>
              {routeTypeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
 
          {/* USC tag */}
          <div>
            <label htmlFor="usc-filter" style={{ display: "block", fontSize: 13, marginBottom: 4, color: "var(--muted)" }}>
              USC Tag
            </label>
            <select
              id="usc-filter" value={filterUSC}
              onChange={(e) => setFilterUSC(e.target.value)}
              style={{ width: "100%", padding: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", borderRadius: 6 }}
            >
              <option value="all">All routes</option>
              <option value="usc">USC only</option>
            </select>
          </div>
 
          {/* Max distance */}
          <div>
            <label htmlFor="max-distance-filter" style={{ display: "block", fontSize: 13, marginBottom: 4, color: "var(--muted)" }}>
              Max Distance (mi)
            </label>
            <input
              id="max-distance-filter" type="number" min="0" step="0.1"
              value={maxDistanceMiles} onChange={(e) => setMaxDistanceMiles(e.target.value)}
              placeholder="e.g. 1.5"
              style={{ width: "100%", padding: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", borderRadius: 6 }}
            />
          </div>
 
          {/* Max duration */}
          <div>
            <label htmlFor="max-duration-filter" style={{ display: "block", fontSize: 13, marginBottom: 4, color: "var(--muted)" }}>
              Max Time (min)
            </label>
            <input
              id="max-duration-filter" type="number" min="0" step="1"
              value={maxDurationMinutes} onChange={(e) => setMaxDurationMinutes(e.target.value)}
              placeholder="e.g. 20"
              style={{ width: "100%", padding: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", borderRadius: 6 }}
            />
          </div>
 
          {/* Clear */}
          <div>
            <button
              onClick={clearFilters}
              style={{ width: "100%", border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", padding: "8px 12px", borderRadius: 8, cursor: "pointer" }}
            >
              Clear Filters
            </button>
          </div>
        </div>
      )}
 
      <div style={{ display: "flex", gap: 16 }}>
        {/* Map */}
        <div style={{ flex: 1 }}>
          <GoogleMap
            mapContainerStyle={containerStyle}
            center={mapCenter}
            zoom={14}
            onLoad={(m) => { setMap(m); mapRef.current = m; }}
            onUnmount={() => { setMap(null); mapRef.current = null; }}
            options={{ fullscreenControl: false, streetViewControl: false, mapTypeControl: false }}
          >
            {directionsResult && <DirectionsRenderer directions={directionsResult} />}
            {loadedPath.length > 1 && (
              <Polyline
                path={loadedPath}
                options={{ strokeColor: "#e63946", strokeWeight: 4, strokeOpacity: 0.9 }}
              />
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
 
          <button
            onClick={recenterToOrigin}
            style={{ marginTop: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", padding: "8px 12px", borderRadius: 8, cursor: "pointer" }}
          >
            Recenter
          </button>
        </div>
 
        {/* Review panel */}
        {selectedRouteId && (
          <div
            style={{
              marginTop: 12, border: "1px solid var(--border)", borderRadius: 8,
              padding: 12, background: "var(--surface)", color: "var(--text)",
            }}
          >
            <h3 style={{ marginTop: 0 }}>Saved Review</h3>
            {loadedReview ? (
              <div>
                <div style={{ marginBottom: 8 }}>
                  <strong>Stars:</strong>{" "}
                  <span style={{ color: "gold" }}>
                    {Array.from({ length: loadedReview.stars || 0 }).map((_, i) => <span key={i}>★</span>)}
                    {Array.from({ length: 5 - (loadedReview.stars || 0) }).map((_, i) => <span key={`e${i}`} style={{ color: "#ddd" }}>★</span>)}
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
 
 
        {/* Hazard list for loaded route */}
        {selectedRouteId && loadedHazards.length > 0 && (
          <div style={{ marginTop: 12, border: "1px solid var(--border)", borderRadius: 8, padding: 12, background: "var(--surface)", color: "var(--text)" }}>
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
 
        {/* Sidebar route list */}
        <aside
          style={{
            width: 340, border: "1px solid var(--border)", background: "var(--surface)",
            color: "var(--text)", borderRadius: 8, padding: 12,
            maxHeight: 600, overflowY: "auto",
          }}
        >
          <h3>
            Saved Routes ({filteredRoutes.length})
            <button
              onClick={loadRoutes}
              disabled={loadingRoutes}
              style={{ marginLeft: 10, fontSize: 12, padding: "3px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", cursor: "pointer" }}
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
            filteredRoutes.map((route) => (
              <div
                key={route.id}
                style={{
                  padding: 10, marginBottom: 10,
                  border: "1px solid var(--border)", borderRadius: 6,
                  background: route.id === selectedRouteId ? "var(--surface-2)" : "var(--surface)",
                  color: "var(--text)",
                }}
              >
                {editingRouteId === route.id ? (
                  <>
                    <div style={{ display: "grid", gap: 6 }}>
                      <input type="text" value={editForm.title}       onChange={(e) => handleEditFieldChange("title", e.target.value)}       placeholder="Route title"            style={{ padding: 6, fontSize: 13 }} />
                      <input type="text" value={editForm.type}        onChange={(e) => handleEditFieldChange("type", e.target.value)}        placeholder="Route type"             style={{ padding: 6, fontSize: 13 }} />
                      <input type="text" value={editForm.origin}      onChange={(e) => handleEditFieldChange("origin", e.target.value)}      placeholder="Origin"                 style={{ padding: 6, fontSize: 13 }} />
                      <input type="text" value={editForm.destination} onChange={(e) => handleEditFieldChange("destination", e.target.value)} placeholder="Destination"            style={{ padding: 6, fontSize: 13 }} />
                      <input type="text" value={editForm.distance}    onChange={(e) => handleEditFieldChange("distance", e.target.value)}    placeholder="Distance (e.g. 1.2 mi)" style={{ padding: 6, fontSize: 13 }} />
                      <input type="text" value={editForm.duration}    onChange={(e) => handleEditFieldChange("duration", e.target.value)}    placeholder="Duration (e.g. 15 mins)" style={{ padding: 6, fontSize: 13 }} />
                    </div>
 
                    <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
                      <input
                        type="checkbox" checked={editForm.isUSC}
                        onChange={(e) => setEditForm((p) => ({ ...p, isUSC: e.target.checked }))}
                      />
                      at USC
                    </label>
 
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <button onClick={() => saveEditedRoute(route.id)}>Save</button>
                      <button onClick={cancelEditingRoute}>Cancel</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontWeight: 700 }}>
                      {route.title} {route.type}
                      {Array.isArray(route.tags) && route.tags.includes("USC") && (
                        <span style={{ marginLeft: 8, fontSize: 12, padding: "2px 6px", borderRadius: 999, background: "rgba(115, 0, 10, 0.12)", color: "var(--brand)" }}>
                          USC
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 13 }}>{route.origin} {"->"} {route.destination}</div>
                    <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                      {route.distance} {route.duration && `| ${route.duration}`}
                    </div>
 
                    <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                      <button onClick={() => loadRoute(route)} disabled={loadingRouteId === route.id}>
                        {loadingRouteId === route.id ? "Loading..." : "Load"}
                      </button>
                      <button onClick={() => startEditingRoute(route)} disabled={loadingRouteId === route.id}>
                        Edit
                      </button>
                      <button
                        onClick={() => deleteRoute(route.id)}
                        disabled={loadingRouteId === route.id}
                        style={{ border: "1px solid #c62828", color: "#c62828", background: "#fff" }}
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </aside>
      </div>
    </div>
  );
}