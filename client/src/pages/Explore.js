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
    <div style={{ padding: 20, maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ marginTop: 0 }}>Explore — Public Trails</h1>

      {/* SEARCH BAR SECTION */}
      <div style={{ marginBottom: 20 }}>
        <input
          type="text"
          placeholder="Search by title, origin, or destination..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: "100%",
            padding: "12px 15px",
            fontSize: "16px",
            borderRadius: "8px",
            border: "1px solid #ddd",
            boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
            outline: "none"
          }}
        />
      </div>

      {/* TRANSPORT ICONS TOOLBAR */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        <span style={{ fontWeight: "bold", marginRight: 8 }}>Filter by Mode:</span>
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
              style={{
                fontSize: 18,
                padding: "6px 12px",
                borderRadius: 20,
                border: selected ? "2px solid #0b63d6" : "1px solid #ddd",
                background: selected ? "#e8f0ff" : "white",
                cursor: "pointer",
                transition: "all 0.2s",
                display: "flex",
                alignItems: "center",
                gap: 5
              }}
            >
              {opt.key}
            </button>
          );
        })}
      </div>

      <section style={{ marginBottom: 18 }}>
        <div style={{ border: "1px solid #e6e6e6", borderRadius: 8, overflow: "hidden" }}>
          {isLoaded ? (
            <GoogleMap
              mapContainerStyle={mapContainerStyle}
              center={DEFAULT_CENTER}
              zoom={13}
              onLoad={onMapLoad}
            />
          ) : (
            <div style={{ width: "100%", height: 450, display: "flex", alignItems: "center", justifyContent: "center" }}>
              Loading map…
            </div>
          )}
        </div>
        <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
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
          <div>Loading public trails…</div>
        ) : filteredRoutes.length === 0 ? (
          <div style={{ padding: 20, background: "#f9f9f9", borderRadius: 8, textAlign: "center" }}>
            No public trails found matching your search or category.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {filteredRoutes.map((r) => (
              <div key={r.id} style={{ border: "1px solid #eee", padding: 12, borderRadius: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 20 }}>{r.type || "👣"}</span>
                      <strong style={{ fontSize: 16 }}>
                        {r.title || `${r.origin} → ${r.destination}`}
                      </strong>
                    </div>
                    <div style={{ fontSize: 13, color: "#555", marginTop: 6 }}>
                      {r.origin} → {r.destination}
                      <span style={{ marginLeft: 8 }}>• {r.distance || "—"}</span>
                      <span style={{ marginLeft: 8 }}>• ETA: {r.duration || "—"}</span>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <button onClick={() => openCompleted(r.id)}>View</button>
                    <button onClick={() => copyCompletedLink(r.id)}>Copy link</button>
                  </div>
                </div>

                {r.review && (
                  <div style={{ marginTop: 10, fontSize: 14, borderTop: "1px solid #fafafa", paddingTop: 8 }}>
                    <div><strong>Rating:</strong> {r.review.stars}/5</div>
                    {r.review.comment && <div style={{ marginTop: 4, fontStyle: "italic" }}>"{r.review.comment}"</div>}
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