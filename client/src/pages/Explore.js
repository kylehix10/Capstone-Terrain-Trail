/* global google */
import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { GoogleMap, DirectionsRenderer, Polyline } from "@react-google-maps/api";
import "../components/Explore.css";

// Map container style
const mapContainerStyle = {
  width: "100%",
  height: "450px",
};

const DEFAULT_CENTER = { lat: 34.0007, lng: -81.0348 };
const API_BASE = process.env.REACT_APP_API_BASE_URL || "";


function travelModeFromType(type) {
  if (!window.google?.maps) return null;
  const modeMap = { "🚗": "DRIVING", "🚲": "BICYCLING", "🛴": "BICYCLING", "🛹": "BICYCLING" };
  return window.google.maps.TravelMode[modeMap[type] || "WALKING"];
}

async function fetchPublicRoutes() {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_BASE}/api/routes/public`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`Server error: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data.routes) ? data.routes : [];
}

export default function Explore() {
  const mapRefInternal = useRef(null);
  const directionsCache = useRef({});
  const [previewPath, setPreviewPath] = useState([]);

  const [publicRoutes, setPublicRoutes] = useState([]);
  const [loadingPublic, setLoadingPublic] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  
  // Filters
  const [activeFilter, setActiveFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  
  // Map/View States
  const [selectedRouteId, setSelectedRouteId] = useState(null); 
  const [previewDirections, setPreviewDirections] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const onMapLoad = useCallback((map) => {
    mapRefInternal.current = map;
  }, []);

  const loadPublicRoutes = useCallback(async () => {
    setLoadingPublic(true);
    setFetchError(null);
    try {
      const routes = await fetchPublicRoutes();
      setPublicRoutes(routes);
    } catch (e) {
      setFetchError("Could not load public trails. Please try again.");
    } finally {
      setLoadingPublic(false);
    }
  }, []);

  useEffect(() => {
    loadPublicRoutes();
  }, [loadPublicRoutes]);

  const getSectionHeader = () => {
    const modeMap = {
      "All": "Public Trails",
      "👣": "Walking Trails",
      "🚲": "Biking Trails", 
      "🚗": "Driving Trails", 
      "🛹": "Skateboarding Trails", 
      "🏃": "Running Trails", 
      "🛴": "Scootering Trails", 
      "♿": "Wheelchair Trails"
    };
    return `Top ${modeMap[activeFilter] || "Trails"}`;
  };

  const handleViewOnMap = useCallback(async (route) => {
    if (!window.google?.maps || !route?.origin || !route?.destination) return;
    
    // TOGGLE LOGIC: If the clicked route is already selected, clear the map
    if (selectedRouteId === route.id) {
      setSelectedRouteId(null);
      setPreviewDirections(null);
      setPreviewPath([]);
      return;
    }
    if (route.recorded === true && Array.isArray(route.path) && route.path.length > 1) {
      setPreviewDirections(null);
      setPreviewPath(route.path);

      const bounds = new window.google.maps.LatLngBounds();
      route.path.forEach((p) => bounds.extend(p));
      mapRefInternal.current.fitBounds(bounds, 40);

      return;
    }
    setSelectedRouteId(route.id);

    if (directionsCache.current[route.id]) {
      const cached = directionsCache.current[route.id];
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
      directionsCache.current[route.id] = result;
      setPreviewDirections(result);
      if (mapRefInternal.current && result?.routes?.[0]?.bounds) {
        mapRefInternal.current.fitBounds(result.routes[0].bounds, 40);
      }
    } catch (err) {
      console.warn("View directions failed:", err);
      setPreviewDirections(null);
    } finally {
      setPreviewLoading(false);
    }
  }, [selectedRouteId]); // Added dependency to allow toggle check

  const handleShare = async (route) => {
    const shareUrl = `${window.location.origin}/app/completed/${route.id}`;
    if (navigator.share) {
      try { await navigator.share({ title: route.title, url: shareUrl }); } catch (err) {}
    } else {
      navigator.clipboard.writeText(shareUrl);
      window.alert("Link copied to clipboard!");
    }
  };

  const processedRoutes = useMemo(() => {
    let results = publicRoutes.filter(r => {
      const matchesFilter = activeFilter === "All" || r.type === activeFilter;
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = 
        (r.title || "").toLowerCase().includes(searchLower) ||
        (r.origin || "").toLowerCase().includes(searchLower) ||
        (r.destination || "").toLowerCase().includes(searchLower);
      return matchesFilter && matchesSearch;
    });
    results.sort((a, b) => (b.review?.stars || 0) - (a.review?.stars || 0));
    return results;
  }, [publicRoutes, activeFilter, searchQuery]);

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
            { key: "👣", label: "Walking" },
            { key: "🚲", label: "Biking" },
            { key: "🚗", label: "Driving" },
            { key: "🛹", label: "Skateboarding" },
            { key: "🏃", label: "Running" },
            { key: "🛴", label: "Scootering" },
            { key: "♿", label: "Wheelchair" },
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
        <div className="map-card" style={{ position: "relative", overflow: "hidden", borderRadius: "8px" }}>
          <GoogleMap
            mapContainerStyle={mapContainerStyle}
            center={DEFAULT_CENTER}
            zoom={13}
            onLoad={onMapLoad}
          >
            {previewPath.length > 1 ? (
              <Polyline
                path={previewPath}
                options={{
                  strokeColor: "#0b63d6",
                  strokeWeight: 5,
                  strokeOpacity: 0.85,
                }}
              />
            ) : (
              previewDirections && (
                <DirectionsRenderer
                  directions={previewDirections}
                  options={{
                    polylineOptions: {
                      strokeColor: "#0b63d6",
                      strokeWeight: 5,
                    },
                  }}
                />
              )
            )}
          </GoogleMap>
          
          {selectedRouteId && !previewLoading && (
            <button 
              onClick={() => { setSelectedRouteId(null); setPreviewDirections(null); }}
              style={{ 
                position: "absolute", 
                top: "15px", 
                left: "50%", 
                transform: "translateX(-50%)", 
                zIndex: 10, 
                padding: "10px 20px", 
                borderRadius: "30px", 
                border: "2px solid white", 
                background: "#ff4d4d", 
                color: "white",
                fontWeight: "bold",
                boxShadow: "0 4px 15px rgba(0,0,0,0.4)", 
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                transition: "all 0.2s ease"
              }}
              onMouseOver={(e) => e.currentTarget.style.background = "#e60000"}
              onMouseOut={(e) => e.currentTarget.style.background = "#ff4d4d"}
            >
              <span style={{ fontSize: "18px" }}>✕</span> Clear Map View
            </button>
          )}

          {previewLoading && (
            <div style={{ position: "absolute", top: 15, left: "50%", transform: "translateX(-50%)", background: "rgba(0,0,0,0.8)", color: "#fff", padding: "10px 20px", borderRadius: "30px", zIndex: 10, fontWeight: "500", boxShadow: "0 2px 10px rgba(0,0,0,0.3)" }}>
              Loading Route...
            </div>
          )}
        </div>
      </section>

      <section>
        <h2 style={{ marginBottom: 12 }}>
          {getSectionHeader()}
          {searchQuery && ` matching "${searchQuery}"`}
        </h2>

        {loadingPublic ? (
          <div style={{ color: "var(--muted)" }}>Loading trails…</div>
        ) : fetchError ? (
          <div className="empty-box" style={{ color: "crimson" }}>{fetchError}</div>
        ) : processedRoutes.length === 0 ? (
          <div className="empty-box">No trails found in this category.</div>
        ) : (
          <div className="routes-grid">
            {processedRoutes.map((r) => (
              <div
                key={r.id}
                className={`route-card ${selectedRouteId === r.id ? "previewing" : ""}`}
                style={{ borderLeft: selectedRouteId === r.id ? "5px solid #0b63d6" : "none" }}
              >
                <div className="route-row">
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 20 }}>{r.type}</span>
                      <strong style={{ fontSize: 16 }}>{r.title || "Untitled Route"}</strong>
                    </div>
                    <div className="route-meta">
                      {r.origin} → {r.destination}
                      <span style={{ marginLeft: 8 }}>• {r.distance}</span>
                    </div>
                  </div>
                  <div className="route-actions" style={{ display: "flex", gap: "8px" }}>
                    <button 
                       onClick={() => handleViewOnMap(r)}
                       style={{ 
                         background: selectedRouteId === r.id ? "#0b63d6" : "", 
                         color: selectedRouteId === r.id ? "white" : "",
                         fontWeight: selectedRouteId === r.id ? "bold" : "normal"
                       }}
                    >
                      {selectedRouteId === r.id ? "Viewing" : "View"}
                    </button>
                    <button onClick={() => handleShare(r)} title="Share Route">Share ↗</button>
                  </div>
                </div>

                {r.review && (
                  <div className="route-review" style={{ marginTop: 10, borderTop: "1px solid #eee", paddingTop: 8 }}>
                    <div style={{ color: "#f39c12", fontWeight: "bold" }}>
                      {"★".repeat(r.review.stars)}{"☆".repeat(5 - r.review.stars)}
                      <span style={{ color: "var(--muted)", marginLeft: 6, fontWeight: "normal" }}>
                        ({r.review.stars}/5)
                      </span>
                    </div>
                    {r.review.comment && (
                      <div style={{ marginTop: 4, fontStyle: "italic", fontSize: "0.9rem" }}>
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