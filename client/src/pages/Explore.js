/* global google */
import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { useNavigate, useLocation } from "react-router-dom"; // Added for navigation
import {
  GoogleMap,
  DirectionsRenderer,
} from "@react-google-maps/api";
import { useSnackbar } from "../components/Snackbar.jsx";
import "../components/Explore.css";
import { useTheme } from "../theme/ThemeContext";

// Map container style - Reduced height to 300px to prevent excessive scrolling
const mapContainerStyle = {
  width: "100%",
  height: "300px",
};

const DEFAULT_CENTER = { lat: 34.0007, lng: -81.0348 };
const API_BASE = process.env.REACT_APP_API_BASE_URL || "";

const DARK_MAP_STYLES = [
  { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#263c3f" }] },
  { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#6b9a76" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#212a37" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9ca5b3" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#746855" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#1f2835" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#f3d19c" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#2f3948" }] },
  { featureType: "transit.station", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#17263c" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#515c6d" }] },
  { featureType: "water", elementType: "labels.text.stroke", stylers: [{ color: "#17263c" }] },
];

function authHeaders() {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

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
  const res = await fetch(`${API_BASE}/api/routes/public`, {
    headers: authHeaders(),
  });

  if (!res.ok) throw new Error(`Server error: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data.routes) ? data.routes : [];
}


async function voteOnRoute(routeId, vote) {
  const res = await fetch(`${API_BASE}/api/routes/${routeId}/vote`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ vote }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `Vote failed: ${res.status}`);
  }

  const data = await res.json();
  return data.route;
}

function PhotoCarousel({ photos, title, height = 200 }) {
  const [index, setIndex] = React.useState(0);

  if (!photos || photos.length === 0) return null;

  const prev = (e) => {
    e.stopPropagation();
    setIndex((i) => (i - 1 + photos.length) % photos.length);
  };

  const next = (e) => {
    e.stopPropagation();
    setIndex((i) => (i + 1) % photos.length);
  };

  const photo = photos[index];
  const src = photo?.url || photo?.previewUrl || "";

  return (
    <div style={{
      marginTop: 10,
      position: "relative",
      width: "100%",
      borderRadius: 10,
      overflow: "hidden",
      border: "1px solid var(--border)",
      background: "var(--surface-2, #f0f0f0)",
    }}>
      <img
        src={src}
        alt={photo?.caption || `${title || "Trail"} photo ${index + 1}`}
        style={{
          width: "100%",
          height: "auto",
          display: "block",
          maxHeight: 500,        // prevents extremely tall portrait images from being huge
        }}
      />

      {/* Caption */}
      {photo?.caption && (
        <div style={{
          position: "absolute",
          bottom: photos.length > 1 ? 32 : 0,
          left: 0,
          right: 0,
          background: "rgba(0,0,0,0.45)",
          color: "#fff",
          fontSize: 12,
          padding: "4px 10px",
          textAlign: "center",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}>
          {photo.caption}
        </div>
      )}

      {photos.length > 1 && (
        <>
          <button
            onClick={prev}
            style={{
              position: "absolute",
              left: 6,
              top: "50%",
              transform: "translateY(-50%)",
              background: "rgba(0,0,0,0.45)",
              color: "#fff",
              border: "none",
              borderRadius: "50%",
              width: 28,
              height: 28,
              fontSize: 14,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 2,
              padding: 0,
              lineHeight: 1,
            }}
          >
            ‹
          </button>

          <button
            onClick={next}
            style={{
              position: "absolute",
              right: 6,
              top: "50%",
              transform: "translateY(-50%)",
              background: "rgba(0,0,0,0.45)",
              color: "#fff",
              border: "none",
              borderRadius: "50%",
              width: 28,
              height: 28,
              fontSize: 14,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 2,
              padding: 0,
              lineHeight: 1,
            }}
          >
            ›
          </button>

          <div style={{
            position: "absolute",
            bottom: 6,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
            gap: 5,
            zIndex: 2,
          }}>
            {photos.map((_, i) => (
              <div
                key={i}
                onClick={(e) => { e.stopPropagation(); setIndex(i); }}
                style={{
                  width: i === index ? 18 : 7,
                  height: 7,
                  borderRadius: 999,
                  background: i === index ? "#fff" : "rgba(255,255,255,0.5)",
                  cursor: "pointer",
                  transition: "width 0.2s ease",
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function Explore() {
  const navigate = useNavigate(); // Hook for navigation
  const mapRefInternal = useRef(null);
  const directionsCache = useRef({});
  const { showSnackbar } = useSnackbar();

  const [publicRoutes, setPublicRoutes] = useState([]);
  const [loadingPublic, setLoadingPublic] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [voteLoadingIds, setVoteLoadingIds] = useState({});
  const [saveLoadingIds, setSaveLoadingIds] = useState({});
  const [savedCopySourceIds, setSavedCopySourceIds] = useState({});

  // Filters
  const [activeFilter, setActiveFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");

  // Map/View States
  const [selectedRouteId, setSelectedRouteId] = useState(null);
  const [previewDirections, setPreviewDirections] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const { darkMode } = useTheme();
  const [expandedReviews, setExpandedReviews] = useState({});
  const location = useLocation();
  const highlightRouteId = location.state?.highlightRouteId ?? null;

  const [currentUser, setCurrentUser] = useState(null);
  const [userRoutes, setUserRoutes] = useState([]);


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

    useEffect(() => {
    const style = document.createElement("style");
    style.id = "explore-highlight-pulse";
    style.textContent = `
      @keyframes highlight-pulse {
        0%   { box-shadow: 0 0 0 0px rgba(11, 99, 214, 0.55); }
        35%  { box-shadow: 0 0 0 8px rgba(11, 99, 214, 0.25); }
        100% { box-shadow: 0 0 0 0px rgba(11, 99, 214, 0.0);  }
      }
    `;
    if (!document.getElementById("explore-highlight-pulse")) {
      document.head.appendChild(style);
    }
    return () => {
      const existing = document.getElementById("explore-highlight-pulse");
      if (existing) existing.remove();
    };
  }, []);

  useEffect(() => {
  async function fetchUser() {
    try {
      const res = await fetch(`${API_BASE}/api/account`, {
        headers: authHeaders(),
      });

      if (!res.ok) return;

      const data = await res.json();
      setCurrentUser(data.user);
    } catch (e) {
      console.error("Failed to fetch user", e);
    }
  }

  fetchUser();
}, []);

useEffect(() => {
  async function fetchUserRoutes() {
    try {
      const res = await fetch(`${API_BASE}/api/routes`, {
        headers: authHeaders(),
      });

      if (!res.ok) return;

      const data = await res.json();
      setUserRoutes(data.routes);
    } catch (e) {
      console.error("Failed to fetch user routes", e);
    }
  }

  fetchUserRoutes();
}, [location]);

  // When navigating here from CompletedTrail with a highlightRouteId,
  // scroll to that card, pulse it, and load it onto the map.
  useEffect(() => {
    if (!highlightRouteId || loadingPublic) return;

    // Scroll the card into view
    const el = document.getElementById(`explore-route-${highlightRouteId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });

    // Also load it onto the map automatically
    const route = publicRoutes.find((r) => r.id === highlightRouteId);
    if (route) handleViewOnMap(route);
  }, [highlightRouteId, loadingPublic, publicRoutes]);

  const getSectionHeader = () => {
    const modeMap = {
      All: "Public Trails",
      "👣": "Walking Trails",
      "🚲": "Biking Trails",
      "🚗": "Driving Trails",
      "🛹": "Skateboarding Trails",
      "🏃": "Running Trails",
      "🛴": "Scootering Trails",
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

  const handleSaveCopy = useCallback(
    async (route) => {
      if (!route?.origin || !route?.destination) {
        showSnackbar(
          "This route is missing required details and cannot be saved.",
          "error"
        );
        return;
      }

      setSaveLoadingIds((prev) => ({ ...prev, [route.id]: true }));

      const copiedRoute = {
        title: route.title || "Untitled Route",
        origin: route.origin || "",
        destination: route.destination || "",
        distance: route.distance || "",
        duration: route.duration || "",
        type: route.type || "👣",
        tags: Array.isArray(route.tags) ? route.tags : [],
        public: false,
        review: route.review || null,
        path: Array.isArray(route.path) ? route.path : [],
        encodedPolyline: route.encodedPolyline || null,
        bounds: route.bounds || undefined,
        hazards: Array.isArray(route.hazards) ? route.hazards : [],
        photos: Array.isArray(route.photos) ? route.photos : [],
        sourceRouteId: route.id,
      };

      try {
        const res = await fetch(`${API_BASE}/api/routes`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify(copiedRoute),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message || `Server error: ${res.status}`);
        }

        setSavedCopySourceIds((prev) => ({ ...prev, [route.id]: true }));
        showSnackbar("Route copied to your library.", "success", [
          {
            label: "Open Library",
            onClick: () => navigate("/app/library"),
            closeOnClick: true,
          },
        ]);
      } catch (err) {
        console.error("save public route copy error", err);
        showSnackbar(
          err.message || "Could not save this route to your library.",
          "error"
        );
      } finally {
        setSaveLoadingIds((prev) => ({ ...prev, [route.id]: false }));
      }
    },
    [navigate, showSnackbar]
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

      <div className="explore-toolbar" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <span className="label">Filter by Mode:</span>
        <div className="buttons" style={{ display: "flex", width: "100%", gap: "8px" }}>
          {[
            { key: "All", label: "Show All" },
            { key: "👣", label: "Walking" },
            { key: "🚲", label: "Biking" },
            { key: "🚗", label: "Driving" },
            { key: "🛹", label: "Skateboarding" },
            { key: "🏃", label: "Running" },
            { key: "🛴", label: "Scootering" },
          ].map((opt) => (
            <button
              key={opt.key}
              title={opt.label}
              onClick={() => setActiveFilter(opt.key)}
              className={`filter-btn ${
                activeFilter === opt.key ? "selected" : ""
              }`}
              style={{ flex: 1, padding: "inherit" }} 
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
            options={{
              gestureHandling: "greedy",
              scrollwheel: true,
              ...(darkMode ? { styles: DARK_MAP_STYLES } : {}),
            }}
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
              const saveBusy = !!saveLoadingIds[r.id];
              const alreadySaved =
  savedCopySourceIds[r.id] ||
  userRoutes.some(saved =>
    saved.sourceRouteId === r.id || saved.id === r.id
  );

                const isOwner =
                currentUser &&
                (
                  r.owner?._id === currentUser._id ||
                  r.authorUsername === currentUser.username
                );

              const authorDisplay = r.authorUsername
                ? `@${r.authorUsername}`
                : r.authorName || "Unknown user";

              const routePhotos = Array.isArray(r.photos) ? r.photos : [];

              return (
                <div
                  key={r.id}
                  id={`explore-route-${r.id}`}
                  className={`route-card ${selectedRouteId === r.id ? "previewing" : ""}`}
                  style={{
                    borderLeft: selectedRouteId === r.id ? "5px solid #0b63d6" : "none",
                    display: "flex",
                    gap: 14,
                    alignItems: "stretch",
                    animation: r.id ? "highlight-pulse 2s ease-out forwards" : undefined,
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
                            flexWrap: "wrap",
                          }}
                        >
                          <span style={{ fontSize: 20 }}>{r.type}</span>
                          <strong
                            style={{ fontSize: 16, cursor: "pointer" }}
                            onClick={() => navigate(`/app/completed/${r.id}`)}
                          >
                            {r.title || "Untitled Route"}
                          </strong>

                          {routePhotos.length > 0 && (
                            <span
                              style={{
                                fontSize: 12,
                                padding: "2px 8px",
                                borderRadius: 999,
                                background: "rgba(11, 99, 214, 0.10)",
                                color: "#0b63d6",
                                fontWeight: 700,
                              }}
                            >
                              {routePhotos.length} photo{routePhotos.length > 1 ? "s" : ""}
                            </span>
                          )}
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
                            color: selectedRouteId === r.id ? "white" : "",
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

                        {isOwner ? (
                            <button
                              onClick={() => navigate("/app/library")}
                              title="View this route in your library"
                            >
                              View in Library
                            </button>
                          ) : (
                            <button
                              onClick={() => handleSaveCopy(r)}
                              disabled={saveBusy}
                              className={alreadySaved ? "saved-copy-btn" : ""}
                              title="Save a personal copy to your library"
                            >
                              {saveBusy ? "Saving..." : alreadySaved ? "Saved" : "Save"}
                            </button>
                          )}
                      </div>
                    </div>

                    {routePhotos.length > 0 && (
                      <PhotoCarousel photos={routePhotos} title={r.title} />
                    )}

                    {r.review && (
                      <div
                        className="route-review"
                        style={{
                          marginTop: 10,
                          borderTop: "1px solid var(--border)",
                          paddingTop: 8,
                        }}
                      >
                        <div style={{ color: "#f39c12", fontWeight: "bold" }}>
                          {"★".repeat(r.review.stars)}
                          {"☆".repeat(5 - r.review.stars)}
                          <span style={{ color: "var(--muted)", marginLeft: 6, fontWeight: "normal" }}>
                            ({r.review.stars}/5)
                          </span>
                        </div>

                        {r.review.comment && (
                          <>
                            <div
                              className={`route-comment-preview ${expandedReviews[r.id] ? "expanded" : ""}`}
                              dangerouslySetInnerHTML={{ __html: r.review.comment }}
                            />
                            <button
                              className="read-more-btn"
                              onClick={() =>
                                setExpandedReviews((prev) => ({
                                  ...prev,
                                  [r.id]: !prev[r.id],
                                }))
                              }
                            >
                              {expandedReviews[r.id] ? "Show less ▲" : "Read more ▼"}
                            </button>
                          </>
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
