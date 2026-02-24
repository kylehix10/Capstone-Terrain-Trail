/* global google */
import React, { useEffect, useRef, useState } from "react";
import { GoogleMap, useJsApiLoader, DirectionsRenderer } from "@react-google-maps/api";

const containerStyle = {
  width: "100%",
  height: "600px",
};

const DEFAULT_CENTER = { lat: 33.996112, lng: -81.027428 };
const LOCAL_STORAGE_KEY = "savedRoutes_v1";

function travelModeFromType(type) {
  if (!google || !google.maps) return null;

  if (type === "🚲" || type === "🛴" || type === "🛹") {
    return google.maps.TravelMode.BICYCLING;
  }

  if (type === "🚗") {
    return google.maps.TravelMode.DRIVING;
  }

  if (type === "♿") {
    return google.maps.TravelMode.WALKING;
  }

  return google.maps.TravelMode.WALKING;
}


function parseDistanceToMiles(distanceText) {
  if (!distanceText) return null;

  const normalized = String(distanceText).toLowerCase().trim().replace(/,/g, "");
  const value = parseFloat(normalized);
  if (Number.isNaN(value)) return null;

  if (/\bkm\b/.test(normalized)) return value * 0.621371;
  if (/\bmi\b/.test(normalized)) return value; // already miles
  if (/\bft\b/.test(normalized)) return value / 5280;
  if (/\bm\b/.test(normalized) && !/\bkm\b/.test(normalized)) return value * 0.000621371; // meters -> miles
  if (normalized.includes("km")) return value * 0.621371;
  if (normalized.includes("ft")) return value / 5280;
  if (/\bm\b/.test(normalized)) return value * 0.000621371;
  return value;
}

function parseDurationToMinutes(durationText) {
  if (!durationText) return null;

  const normalized = String(durationText).toLowerCase().trim();
  let minutes = 0;

  const hourMatches = normalized.matchAll(/(\d+(?:\.\d+)?)\s*(hour|hours|hr|hrs|h)\b/g);
  for (const match of hourMatches) {
    minutes += parseFloat(match[1]) * 60;
  }

  const minuteMatches = normalized.matchAll(/(\d+(?:\.\d+)?)\s*(minute|minutes|min|mins|m)\b/g);
  for (const match of minuteMatches) {
    minutes += parseFloat(match[1]);
  }

  if (minutes > 0) return minutes;

  const secondsMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(second|seconds|sec|secs|s)\b/);
  if (secondsMatch) return parseFloat(secondsMatch[1]) / 60;

  const fallback = parseFloat(normalized);
  return Number.isNaN(fallback) ? null : fallback;
}

export default function Library() {
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: process.env.REACT_APP_GOOGLE_MAPS_API_KEY,
    libraries: ["places", "maps"],
    version: "weekly",
  });

  const mapRef = useRef(null);
  const [map, setMap] = useState(null);
  const [mapCenter, setMapCenter] = useState(DEFAULT_CENTER);

  const [directionsResult, setDirectionsResult] = useState(null);
  const [distanceText, setDistanceText] = useState("");
  const [durationText, setDurationText] = useState("");
  const [originPosition, setOriginPosition] = useState(null);

  const [selectedRouteId, setSelectedRouteId] = useState(null);
  const [loadingRouteId, setLoadingRouteId] = useState(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filterType, setFilterType] = useState("all");
  const [maxDistanceMiles, setMaxDistanceMiles] = useState("");
  const [maxDurationMinutes, setMaxDurationMinutes] = useState("");

  const [savedRoutes, setSavedRoutes] = useState(() => {
    try {
      const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) return parsed;
      }
    } catch (e) {
      console.warn("Failed to load saved routes", e);
    }
    // NO FALLBACK ROUTES: return empty array if nothing in localStorage
    return [];
  });

  const [loadedReview, setLoadedReview] = useState(null);


  useEffect(() => {
    try {
      window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(savedRoutes));
    } catch (e) {
      console.warn("Failed to save routes", e);
    }
  }, [savedRoutes]);

  const routeTypeOptions = Array.from(
    new Set(savedRoutes.map((route) => route.type).filter(Boolean))
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
    (hasDistanceFilter ? 1 : 0) +
    (hasDurationFilter ? 1 : 0);

  const filteredRoutes = savedRoutes.filter((route) => {
    const title = String(route.title || "").toLowerCase();
    const origin = String(route.origin || "").toLowerCase();
    const destination = String(route.destination || "").toLowerCase();

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

    return matchesSearch && matchesType && matchesDistance && matchesDuration;
  });

  function clearFilters() {
    setFilterType("all");
    setMaxDistanceMiles("");
    setMaxDurationMinutes("");
  }

  async function loadRoute(route) {
  if (!isLoaded || !google?.maps) return;

  setLoadingRouteId(route.id);
  setSelectedRouteId(route.id);

  // clear any previously loaded UI review while we (re)load this route
  setLoadedReview(null);

  try {
    const service = new google.maps.DirectionsService();

    const result = await service.route({
      origin: route.origin,
      destination: route.destination,
      travelMode: travelModeFromType(route.type),
      unitSystem: google.maps.UnitSystem.IMPERIAL,
    });

    setDirectionsResult(result);

    const leg = result.routes[0].legs[0];
    setDistanceText(leg.distance?.text || route.distance || "");
    setDurationText(leg.duration?.text || route.duration || "");

    const originLoc = leg.start_location;
    const lat = originLoc.lat();
    const lng = originLoc.lng();
    setOriginPosition({ lat, lng });
    setMapCenter({ lat, lng });

    // fit map to the route bounds if available
    map?.fitBounds(result.routes[0].bounds);

    // --- NEW: set the loadedReview from the saved route (if any) ---
    // route.review is expected to be { stars, terrain, comment, ... } or null/undefined
    setLoadedReview(route.review || null);
  } catch (err) {
    console.error("Failed to load route:", err);
    alert("Could not load route.");
    // clear the review on failure so stale UI doesn't persist
    setLoadedReview(null);
  } finally {
    setLoadingRouteId(null);
  }
}


   

  function deleteRoute(routeId) {
    const shouldDelete = window.confirm("Delete this saved route?");
    if (!shouldDelete) return;

    setSavedRoutes((prevRoutes) => prevRoutes.filter((route) => route.id !== routeId));

    if (selectedRouteId === routeId) {
      setSelectedRouteId(null);
      setLoadingRouteId(null);
      setDirectionsResult(null);
      setDistanceText("");
      setDurationText("");
      setOriginPosition(null);
      setMapCenter(DEFAULT_CENTER);
      setLoadedReview(null);
    }
  }

  function recenterToOrigin() {
    const target = originPosition || DEFAULT_CENTER;
    if (!map) return;
    map.panTo(target);
    map.setZoom(14);
  }

  if (loadError) return <div>Error loading Google Maps</div>;
  if (!isLoaded) return <div>Loading map...</div>;

  return (
    <div style={{ padding: "1.5rem", maxWidth: 1200, margin: "0 auto" }}>
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
          border: "1px solid #ccc",
          fontSize: 14,
        }}
      />

      <div style={{ marginBottom: 16 }}>
        <button onClick={() => setShowFilters((current) => !current)}>
          {showFilters ? "Hide Filters" : "Filter"}
          {activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
        </button>
      </div>

      {showFilters && (
        <div
          style={{
            border: "1px solid #ddd",
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
              style={{ display: "block", fontSize: 13, marginBottom: 4 }}
            >
              Route Type
            </label>
            <select
              id="route-type-filter"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              style={{ width: "100%", padding: 8 }}
            >
              <option value="all">All types</option>
              {routeTypeOptions.map((typeValue) => (
                <option key={typeValue} value={typeValue}>
                  {typeValue}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="max-distance-filter"
              style={{ display: "block", fontSize: 13, marginBottom: 4 }}
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
              style={{ width: "100%", padding: 8 }}
            />
          </div>

          <div>
            <label
              htmlFor="max-duration-filter"
              style={{ display: "block", fontSize: 13, marginBottom: 4 }}
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
              style={{ width: "100%", padding: 8 }}
            />
          </div>

          <div>
            <button onClick={clearFilters}>Clear Filters</button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 16 }}>
        <div style={{ flex: 1 }}>
          <GoogleMap
            mapContainerStyle={containerStyle}
            center={mapCenter}
            zoom={14}
            onLoad={(m) => {
              setMap(m);
              mapRef.current = m;
            }}
            options={{
              fullscreenControl: false,
              streetViewControl: false,
              mapTypeControl: false,
            }}
          >
            {directionsResult && <DirectionsRenderer directions={directionsResult} />}
          </GoogleMap>

          {(distanceText || durationText) && (
            <div style={{ marginTop: 8 }}>
              <strong>Distance:</strong> {distanceText} &nbsp;
              <strong>ETA:</strong> {durationText}
            </div>
          )}

          <button onClick={recenterToOrigin} style={{ marginTop: 8 }}>
            Recenter
          </button>
        </div>

{/* --- Review panel for loaded route (shows after clicking Load) --- */}
{selectedRouteId && (
  <div
    style={{
      marginTop: 12,
      border: "1px solid #eee",
      borderRadius: 8,
      padding: 12,
      background: "#fff",
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
              <span key={`empty-${i}`} style={{ color: "#ddd" }}>
                ★
              </span>
            ))}
          </span>{" "}
          <span style={{ marginLeft: 8 }}>{loadedReview.stars || 0}/5</span>
        </div>

        <div style={{ marginBottom: 8 }}>
          <strong>Terrain:</strong> {typeof loadedReview.terrain === "number" ? loadedReview.terrain : "—"} / 10
        </div>

        <div>
          <strong>Comment:</strong>
          <div style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>
            {loadedReview.comment || <em>No comment</em>}
          </div>
        </div>
      </div>
    ) : (
      <div style={{ color: "#666" }}>No review saved for this route.</div>
    )}
  </div>
)}



        <aside
          style={{
            width: 340,
            border: "1px solid #ddd",
            borderRadius: 8,
            padding: 12,
            maxHeight: 600,
            overflowY: "auto",
          }}
        >
          <h3>Saved Routes ({filteredRoutes.length})</h3>

          {filteredRoutes.length === 0 && (
            <div style={{ color: "#666", fontSize: 14 }}>
              No routes match your search and filters.
            </div>
          )}

          {filteredRoutes.map((route) => (
            <div
              key={route.id}
              style={{
                padding: 10,
                marginBottom: 10,
                border: "1px solid #eee",
                borderRadius: 6,
                background: route.id === selectedRouteId ? "#f5f7fa" : "#fff",
              }}
            >
              <div style={{ fontWeight: 700 }}>
                {route.title} {route.type}
              </div>
              <div style={{ fontSize: 13 }}>
                {route.origin} {'→'} {route.destination}
              </div>
              <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                {route.distance} {route.duration && `| ${route.duration}`}
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <button
                  onClick={() => loadRoute(route)}
                  disabled={loadingRouteId === route.id}
                >
                  {loadingRouteId === route.id ? "Loading..." : "Load"}
                </button>
                <button
                  onClick={() => deleteRoute(route.id)}
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
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}
