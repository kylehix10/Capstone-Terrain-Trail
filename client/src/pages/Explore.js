/* global google */
import React, { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { GoogleMap, useJsApiLoader } from "@react-google-maps/api";
import "../components/Explore.css";

// Map container style
const mapContainerStyle = {
  width: "100%",
  height: "450px",
};

// Default center (Columbia, SC)
const DEFAULT_CENTER = { lat: 34.0007, lng: -81.0348 };
const LOCAL_STORAGE_KEY = "savedRoutes_v1";

//Travel Mode Type 
function travelModeFromType(type) {
  if (!window.google) return null;
  if (type === "🚗") return google.maps.TravelMode.DRIVING;
  if (type === "🚲") return google.maps.TravelMode.BICYCLING;
  if (type === "🛴" || type === "🛹") return google.maps.TravelMode.BICYCLING;
  return google.maps.TravelMode.WALKING;
}

function readSavedRoutesFromStorage() {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error("readSavedRoutesFromStorage error", e);
    return [];
  }
}

export default function Explore() {
  const navigate = useNavigate();

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: process.env.REACT_APP_GOOGLE_MAPS_API_KEY,
    libraries: ["places", "maps"],
    version: "weekly",
  });

  const [mapRef, setMapRef] = useState(null);
  const mapRefInternal = useRef(null);
  
  // States
  const [publicRoutes, setPublicRoutes] = useState([]);
  const [loadingPublic, setLoadingPublic] = useState(true);
  const [activeFilter, setActiveFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState(""); // New search state

  const onMapLoad = useCallback((map) => {
    mapRefInternal.current = map;
    setMapRef(map);
  }, []);

  const loadPublicRoutes = useCallback(() => {
    try {
      const all = readSavedRoutesFromStorage();
      const pubs = all.filter((r) => Boolean(r.public));
      setPublicRoutes(pubs);
    } catch (e) {
      console.error("loadPublicRoutes error", e);
      setPublicRoutes([]);
    } finally {
      setLoadingPublic(false);
    }
  }, []);

  useEffect(() => {
    loadPublicRoutes();
    function onStorage() { loadPublicRoutes(); }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [loadPublicRoutes]);

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

      {/* SEARCH BAR SECTION */}
      <div className="explore-search">
        <input
          type="text"
          placeholder="Search by title, origin, or destination..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* TRANSPORT ICONS TOOLBAR */}
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
        ].map((opt) => {
          const selected = activeFilter === opt.key;
          return (
            <button
              key={opt.key}
              title={opt.label}
              onClick={() => setActiveFilter(opt.key)}
              className={`filter-btn ${selected ? "selected" : ""}`}
            >
              {opt.key}
            </button>
          );
        })}
        </div>
      </div>

      <section style={{ marginBottom: 18 }}>
        <div className="map-card">
          {isLoaded ? (
            <GoogleMap
              mapContainerStyle={mapContainerStyle}
              center={DEFAULT_CENTER}
              zoom={13}
              onLoad={onMapLoad}
            />
          ) : (
            <div style={{ width: "100%", height: 450, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)" }}>
              Loading map…
            </div>
          )}
        </div>
        <div className="map-actions">
          <button onClick={() => {
            if (mapRefInternal.current) {
              mapRefInternal.current.panTo(DEFAULT_CENTER);
              mapRefInternal.current.setZoom(13);
            }
          }}>Recenter</button>
          <button onClick={loadPublicRoutes}>Refresh public list</button>
        </div>
      </section>

      <section>
        <h2 style={{ marginBottom: 12 }}>
          {activeFilter === "All" ? "Public Trails" : `${activeFilter} Trails`}
          {searchQuery && ` matching "${searchQuery}"`}
        </h2>

      {loadingPublic ? (
        <div style={{ color: "var(--muted)" }}>Loading public trails…</div>
      ) : filteredRoutes.length === 0 ? (
        <div className="empty-box">
          No public trails found matching your search or category.
        </div>
        ) : (
          <div className="routes-grid">
            {filteredRoutes.map((r) => (
              <div key={r.id} className="route-card">
                <div classname="route-row">
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
                      <span style={{ marginLeft: 8 }}>• ETA: {r.duration || "—"}</span>
                    </div>
                  </div>

                  <div className="route-actions">
                    <button onClick={() => openCompleted(r.id)}>View</button>
                    <button onClick={() => copyCompletedLink(r.id)}>Copy link</button>
                  </div>
                </div>

                {r.review && (
                  <div className="route-review">
                    <div><strong>Rating:</strong> {r.review.stars}/5</div>
                    {r.review.comment && <div style={{ marginTop: 4, fontStyle: "italic", color: "var(--muted)" }}>"{r.review.comment}"</div>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};