/* global google */
import React, { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { GoogleMap, DirectionsRenderer } from "@react-google-maps/api";
import "../components/Explore.css";

// Map container style
const mapContainerStyle = {
  width: "100%",
  height: "450px",
};

// Default center (Columbia, SC)
const DEFAULT_CENTER = { lat: 34.0007, lng: -81.0348 };
const API_BASE = process.env.REACT_APP_API_BASE_URL || "";

//Travel Mode Type 
function travelModeFromType(type) {
  if (!window.google?.maps) return null;
  if (type === "🚗") return window.google.maps.TravelMode.DRIVING;
  if (type === "🚲" || type === "🛴" || type === "🛹")
    return window.google.maps.TravelMode.BICYCLING;
  return window.google.maps.TravelMode.WALKING;
}

async function fetchPublicRoutes() {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_BASE}/api/routes/public`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (res.status === 401) throw new Error("Not authenticated");
  if (!res.ok) throw new Error(`Server error: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data.routes) ? data.routes : [];
}

export default function Explore() {
  const navigate = useNavigate();

  const mapRefInternal = useRef(null);
  const hoverTimerRef = useRef(null);
  const directionsCache = useRef({});
  
  // data / loading
  const [publicRoutes, setPublicRoutes] = useState([]);
  const [loadingPublic, setLoadingPublic] = useState(true);
  const [fetchError, setFetchError] = useState(null);

  // filters
  const [activeFilter, setActiveFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState(""); // New search state

  // map preview
  const [previewRoute, setPreviewRoute] = useState(null); // card being hovered
  const [previewDirections, setPreviewDirections] = useState(null); //DirectionsResult for a card
  const [previewLoading, setPreviewLoading] = useState(false); // loading indicator on map

  const onMapLoad = useCallback((map) => {
    mapRefInternal.current = map;
  }, []);

  // load public routes from server
  const loadPublicRoutes = useCallback(async () => {
    setLoadingPublic(true);
    setFetchError(null);
    try {
      const routes = await fetchPublicRoutes();
      setPublicRoutes(routes);
    }
    catch (e) {
      console.error("loadPublicRoutes error", e);
      setFetchError("Could not load public trails. Please try again.");
      setPublicRoutes([]);
    }
    finally {
      setLoadingPublic(false);
    }
  }, []);

  useEffect(() => {
    loadPublicRoutes();
  }, [loadPublicRoutes]);

  // fetch directions for a route and  pan map
  const fetchPreviewDirections = useCallback(async (route) => {
    if (!window.google?.maps) return;
    if (!route?.origin || !route?.destination) return;

    // use cache to avoid redundant API calls
    const cacheKey = String(route.id ?? `${route.origin}-${route.destination}-${route.type}`);
    if (directionsCache.current[cacheKey]) {
      const cached = directionsCache.current[cacheKey];
      setPreviewDirections(cached);

      if (mapRefInternal.current && cached?.routes?.[0]?.bounds) {
        mapRefInternal.current.fitBounds(cached.routes[0].bounds, 40);
      }
      return;
    }

    setPreviewLoading(true);
    try {
      const svc = new window.google.maps.DirectionsService();

      const result = await svc.route({
        origin: route.origin,
        destination: route.destination,
        travelMode: travelModeFromType(route.type) || window.google.maps.TravelMode.WALKING,
      });

      directionsCache.current[cacheKey] = result;
      setPreviewDirections(result);

      if (mapRefInternal.current && result?.routes?.[0]?.bounds) {
        mapRefInternal.current.fitBounds(result.routes[0].bounds, 40);
      }
    } catch (err) {
      console.warn("Preview directions failed:", err);
      setPreviewDirections(null);
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  // hover handlers with 300ms debounce
  const handleCardMouseEnter = useCallback((route) => {
    clearTimeout(hoverTimerRef.current);

    hoverTimerRef.current = setTimeout(() => {
      setPreviewRoute(route);
      fetchPreviewDirections(route);
    }, 300);
  }, [fetchPreviewDirections]);


  const handleCardMouseLeave = useCallback(() => {
    clearTimeout(hoverTimerRef.current);
    setPreviewRoute(null);
    setPreviewDirections(null);
    setPreviewLoading(false);

    if (mapRefInternal.current) {
      mapRefInternal.current.panTo(DEFAULT_CENTER);
      mapRefInternal.current.setZoom(13);
    }
  }, []);

  // cleanup debounce timer on unmount 
  useEffect(() => () => clearTimeout(hoverTimerRef.current), []);

  const openCompleted = (id) => navigate(`/app/completed/${id}`);

  const copyCompletedLink = (id) => {
    const link = `${window.location.origin}/app/completed/${id}`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(link)
        .then(() => window.alert("Link copied"))
        .catch(() => window.alert("Copy failed"));
    } else {
      window.prompt("Copy this link:", link);
    }
  };

  // Filters: Handles both Transport Mode and Search 
  const filteredRoutes = publicRoutes.filter(r => {
    const matchesFilter = activeFilter === "All" || r.type === activeFilter;
    
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = 
      (r.title || "").toLowerCase().includes(searchLower) ||
      (r.origin || "").toLowerCase().includes(searchLower) ||
      (r.destination || "").toLowerCase().includes(searchLower);

    return matchesFilter && matchesSearch;
  });

  return (
    <div className="explore-page">
      <h1 style={{ marginTop: 0 }}>Explore — Public Trails</h1>

      <div className="explore-search">
        <input
          type="text"
          placeholder="Search by title, origin, or destination..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="explore-toolbar">
        <span className="label">Filter by Mode:</span>
        <div className="buttons">
          {[
            { key: "All", label: "Show All" },
            { key: "👣",  label: "Walking" },
            { key: "🚲",  label: "Biking" },
            { key: "🚗",  label: "Driving" },
            { key: "🛹",  label: "Skateboarding" },
            { key: "🏃",  label: "Running" },
            { key: "🛴",  label: "Scootering" },
            { key: "♿",  label: "Wheelchair" },
          ].map((opt) => (
            <button
              key={opt.key}
              title={opt.label}
              onClick={() => setActiveFilter(opt.key)}
              className={`filter-btn ${activeFilter === opt.key ? "selected" : ""}`}
            >
              {opt.key}
            </button>
          ))}
        </div>
      </div>

      <section style={{ marginBottom: 18 }}>
        <div className="map-card" style={{ position: "relative" }}>
          <GoogleMap
            mapContainerStyle={mapContainerStyle}
            center={DEFAULT_CENTER}
            zoom={13}
            onLoad={onMapLoad}
          >
            {previewDirections && (
              <DirectionsRenderer
                directions={previewDirections}
                options={{
                  suppressMarkers: false,
                  polylineOptions: {
                    strokeColor: "#0b63d6",
                    strokeWeight: 5,
                    strokeOpacity: 0.85,
                  },
                }}
              />
            )}
          </GoogleMap>

          {previewLoading && (
            <div
              style={{
                position: "absolute",
                top: 10,
                left: "50%",
                transform: "translateX(-50%)",
                background: "rgba(0,0,0,0.65)",
                color: "#fff",
                padding: "5px 14px",
                borderRadius: 20,
                fontSize: 13,
                pointerEvents: "none",
                zIndex: 10,
              }}
            >
              Loading preview…
            </div>
          )}

          {previewRoute && !previewLoading && previewDirections && (
            <div
              style={{
                position: "absolute",
                top: 10,
                left: "50%",
                transform: "translateX(-50%)",
                background: "rgba(11, 99, 214, 0.88)",
                color: "#fff",
                padding: "5px 14px",
                borderRadius: 20,
                fontSize: 13,
                pointerEvents: "none",
                zIndex: 10,
                whiteSpace: "nowrap",
              }}
            >
              Previewing: {previewRoute.title || `${previewRoute.origin} → ${previewRoute.destination}`}
            </div>
          )}
        </div>

        <div className="map-actions">
          <button
            onClick={() => {
              if (mapRefInternal.current) {
                mapRefInternal.current.panTo(DEFAULT_CENTER);
                mapRefInternal.current.setZoom(13);
              }
            }}
          >
            Recenter
          </button>

          <button onClick={loadPublicRoutes} disabled={loadingPublic}>
            {loadingPublic ? "Refreshing…" : "Refresh public list"}
          </button>
        </div>
      </section>

       <section>
        <h2 style={{ marginBottom: 12 }}>
          {activeFilter === "All" ? "Public Trails" : `${activeFilter} Trails`}
          {searchQuery && ` matching "${searchQuery}"`}
        </h2>
 
        {loadingPublic ? (
          <div style={{ color: "var(--muted)" }}>Loading public trails…</div>
        ) : fetchError ? (
          <div className="empty-box" style={{ color: "crimson" }}>
            {fetchError}
          </div>
        ) : filteredRoutes.length === 0 ? (
          <div className="empty-box">
            No public trails found matching your search or category.
          </div>
        ) : (
          <div className="routes-grid">
            {filteredRoutes.map((r) => (
              <div
                key={r.id}
                className={`route-card${
                  previewRoute?.id === r.id ? " previewing" : ""
                }`}
                onMouseEnter={() => handleCardMouseEnter(r)}
                onMouseLeave={handleCardMouseLeave}
              >
                <div className="route-row">
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 20 }}>{r.type || "👣"}</span>
                      <strong style={{ fontSize: 16 }}>
                        {r.title || `${r.origin} → ${r.destination}`}
                      </strong>
                    </div>
 
                    <div className="route-meta">
                      {r.origin} → {r.destination}
                      <span style={{ marginLeft: 8 }}>• {r.distance || "—"}</span>
                      <span style={{ marginLeft: 8 }}>
                        • ETA: {r.duration || "—"}
                      </span>
                    </div>
                  </div>
 
                  <div className="route-actions">
                    <button onClick={() => openCompleted(r.id)}>View</button>
                    <button onClick={() => copyCompletedLink(r.id)}>
                      Copy link
                    </button>
                  </div>
                </div>
 
                {r.review && (
                  <div className="route-review">
                    <div>
                      <strong>Rating:</strong> {r.review.stars}/5
                    </div>
                    {r.review.comment && (
                      <div
                        style={{
                          marginTop: 4,
                          fontStyle: "italic",
                          color:     "var(--muted)",
                        }}
                      >
                        "{r.review.comment}"
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}