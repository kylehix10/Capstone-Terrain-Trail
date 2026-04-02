/* global google */
import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { GoogleMap, DirectionsRenderer } from "@react-google-maps/api";
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
  const modeMap = {
    "🚗": "DRIVING",
    "🚲": "BICYCLING",
    "🛴": "BICYCLING",
    "🛹": "BICYCLING",
  };
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

async function voteOnRoute(routeId, vote) {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_BASE}/api/routes/${routeId}/vote`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ vote }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `Vote failed: ${res.status}`);
  }

  const data = await res.json();
  return data.route;
}

export default function Explore() {
  const mapRefInternal = useRef(null);
  const directionsCache = useRef({});

  const [publicRoutes, setPublicRoutes] = useState([]);
  const [loadingPublic, setLoadingPublic] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [voteLoadingIds, setVoteLoadingIds] = useState({});

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
      All: "Public Trails",
      "👣": "Walking Trails",
      "🚲": "Biking Trails",
      "🚗": "Driving Trails",
      "🛹": "Skateboarding Trails",
      "🏃": "Running Trails",
      "🛴": "Scootering Trails",
      "♿": "Wheelchair Trails",
    };
    return `Top ${modeMap[activeFilter] || "Trails"}`;
  };

  const handleViewOnMap = useCallback(
    async (route) => {
      if (!window.google?.maps || !route?.origin || !route?.destination) {
        return;
      }

      // Toggle off if same route clicked again
      if (selectedRouteId === route.id) {
        setSelectedRouteId(null);
        setPreviewDirections(null);
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
          travelMode:
            travelModeFromType(route.type) ||
            window.google.maps.TravelMode.WALKING,
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
    },
    [selectedRouteId]
  );

  const handleShare = async (route) => {
    const shareUrl = `${window.location.origin}/app/completed/${route.id}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: route.title, url: shareUrl });
      } catch (err) {}
    } else {
      navigator.clipboard.writeText(shareUrl);
      window.alert("Link copied to clipboard!");
    }
  };

  const handleVote = useCallback(
    async (routeId, intendedVote) => {
      const existingRoute = publicRoutes.find((r) => r.id === routeId);
      if (!existingRoute) return;

      const currentVote = existingRoute.votes?.userVote || 0;
      const voteToSend = currentVote === intendedVote ? 0 : intendedVote;

      setVoteLoadingIds((prev) => ({ ...prev, [routeId]: true }));

      // optimistic update
      setPublicRoutes((prev) =>
        prev.map((r) => {
          if (r.id !== routeId) return r;

          const oldVote = r.votes?.userVote || 0;
          let nextScore = r.votes?.score || 0;

          if (oldVote === 1) nextScore -= 1;
          if (oldVote === -1) nextScore += 1;

          if (voteToSend === 1) nextScore += 1;
          if (voteToSend === -1) nextScore -= 1;

          return {
            ...r,
            votes: {
              ...(r.votes || {}),
              score: nextScore,
              userVote: voteToSend,
            },
          };
        })
      );

      try {
        const updatedRoute = await voteOnRoute(routeId, voteToSend);
        setPublicRoutes((prev) =>
          prev.map((r) => (r.id === routeId ? updatedRoute : r))
        );
      } catch (err) {
        console.error("Vote failed:", err);
        setPublicRoutes((prev) =>
          prev.map((r) => (r.id === routeId ? existingRoute : r))
        );
        window.alert(err.message || "Could not save vote.");
      } finally {
        setVoteLoadingIds((prev) => ({ ...prev, [routeId]: false }));
      }
    },
    [publicRoutes]
  );

  const processedRoutes = useMemo(() => {
    let results = publicRoutes.filter((r) => {
      const matchesFilter = activeFilter === "All" || r.type === activeFilter;
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch =
        (r.title || "").toLowerCase().includes(searchLower) ||
        (r.origin || "").toLowerCase().includes(searchLower) ||
        (r.destination || "").toLowerCase().includes(searchLower) ||
        (r.authorUsername || "").toLowerCase().includes(searchLower) ||
        (r.authorName || "").toLowerCase().includes(searchLower);

      return matchesFilter && matchesSearch;
    });

    results.sort((a, b) => {
      const voteDiff = (b.votes?.score || 0) - (a.votes?.score || 0);
      if (voteDiff !== 0) return voteDiff;
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });

    return results;
  }, [publicRoutes, activeFilter, searchQuery]);

  return (
    <div className="explore-page">
      <h1 style={{ marginTop: 0 }}>Explore — Public Trails</h1>

      <div className="explore-search">
        <input
          type="text"
          placeholder="Search by title, origin, destination, or author..."
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
              className={`filter-btn ${
                activeFilter === opt.key ? "selected" : ""
              }`}
            >
              {opt.key}
            </button>
          ))}
        </div>
      </div>

      <section style={{ marginBottom: 18 }}>
        <div
          className="map-card"
          style={{
            position: "relative",
            overflow: "hidden",
            borderRadius: "8px",
          }}
        >
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
                  polylineOptions: {
                    strokeColor: "#0b63d6",
                    strokeWeight: 5,
                  },
                }}
              />
            )}
          </GoogleMap>

          {selectedRouteId && !previewLoading && (
            <button
              onClick={() => {
                setSelectedRouteId(null);
                setPreviewDirections(null);
              }}
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
                transition: "all 0.2s ease",
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = "#e60000";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = "#ff4d4d";
              }}
            >
              <span style={{ fontSize: "18px" }}>✕</span> Clear Map View
            </button>
          )}

          {previewLoading && (
            <div
              style={{
                position: "absolute",
                top: 15,
                left: "50%",
                transform: "translateX(-50%)",
                background: "rgba(0,0,0,0.8)",
                color: "#fff",
                padding: "10px 20px",
                borderRadius: "30px",
                zIndex: 10,
                fontWeight: "500",
                boxShadow: "0 2px 10px rgba(0,0,0,0.3)",
              }}
            >
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
          <div className="empty-box" style={{ color: "crimson" }}>
            {fetchError}
          </div>
        ) : processedRoutes.length === 0 ? (
          <div className="empty-box">No trails found in this category.</div>
        ) : (
          <div className="routes-grid">
            {processedRoutes.map((r) => {
              const userVote = r.votes?.userVote || 0;
              const voteScore = r.votes?.score || 0;
              const voteBusy = !!voteLoadingIds[r.id];
              const authorDisplay = r.authorUsername
                ? `@${r.authorUsername}`
                : (r.authorName || "Unknown user");

              return (
                <div
                  key={r.id}
                  className={`route-card ${
                    selectedRouteId === r.id ? "previewing" : ""
                  }`}
                  style={{
                    borderLeft:
                      selectedRouteId === r.id ? "5px solid #0b63d6" : "none",
                    display: "flex",
                    gap: 14,
                    alignItems: "stretch",
                  }}
                >
                  <div
                    style={{
                      minWidth: 54,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRight: "1px solid #eee",
                      paddingRight: 12,
                    }}
                  >
                    <button
                      onClick={() => handleVote(r.id, 1)}
                      disabled={voteBusy}
                      title="Upvote"
                      style={{
                        border: "none",
                        background: "transparent",
                        fontSize: "22px",
                        cursor: voteBusy ? "not-allowed" : "pointer",
                        color: userVote === 1 ? "#ff6a00" : "#888",
                        lineHeight: 1,
                        opacity: voteBusy ? 0.6 : 1,
                      }}
                    >
                      ▲
                    </button>

                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: "16px",
                        margin: "4px 0",
                        minWidth: "24px",
                        textAlign: "center",
                      }}
                    >
                      {voteScore}
                    </div>

                    <button
                      onClick={() => handleVote(r.id, -1)}
                      disabled={voteBusy}
                      title="Downvote"
                      style={{
                        border: "none",
                        background: "transparent",
                        fontSize: "22px",
                        cursor: voteBusy ? "not-allowed" : "pointer",
                        color: userVote === -1 ? "#7193ff" : "#888",
                        lineHeight: 1,
                        opacity: voteBusy ? 0.6 : 1,
                      }}
                    >
                      ▼
                    </button>
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="route-row">
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <span style={{ fontSize: 20 }}>{r.type}</span>
                          <strong style={{ fontSize: 16 }}>
                            {r.title || "Untitled Route"}
                          </strong>
                        </div>

                        <div
                          style={{
                            marginTop: 4,
                            fontSize: "0.9rem",
                            color: "var(--muted)",
                            fontWeight: 500,
                          }}
                        >
                          Posted by {authorDisplay}
                        </div>

                        <div className="route-meta">
                          {r.origin} → {r.destination}
                          <span style={{ marginLeft: 8 }}>• {r.distance}</span>
                        </div>
                      </div>

                      <div
                        className="route-actions"
                        style={{ display: "flex", gap: "8px" }}
                      >
                        <button
                          onClick={() => handleViewOnMap(r)}
                          style={{
                            background:
                              selectedRouteId === r.id ? "#0b63d6" : "",
                            color:
                              selectedRouteId === r.id ? "white" : "",
                            fontWeight:
                              selectedRouteId === r.id ? "bold" : "normal",
                          }}
                        >
                          {selectedRouteId === r.id ? "Viewing" : "View"}
                        </button>

                        <button
                          onClick={() => handleShare(r)}
                          title="Share Route"
                        >
                          Share ↗
                        </button>
                      </div>
                    </div>

                    {r.review && (
                      <div
                        className="route-review"
                        style={{
                          marginTop: 10,
                          borderTop: "1px solid #eee",
                          paddingTop: 8,
                        }}
                      >
                        <div style={{ color: "#f39c12", fontWeight: "bold" }}>
                          {"★".repeat(r.review.stars)}
                          {"☆".repeat(5 - r.review.stars)}
                          <span
                            style={{
                              color: "var(--muted)",
                              marginLeft: 6,
                              fontWeight: "normal",
                            }}
                          >
                            ({r.review.stars}/5)
                          </span>
                        </div>

                        {r.review.comment && (
                          <div
                            style={{
                              marginTop: 4,
                              fontStyle: "italic",
                              fontSize: "0.9rem",
                            }}
                          >
                            "{r.review.comment}"
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}