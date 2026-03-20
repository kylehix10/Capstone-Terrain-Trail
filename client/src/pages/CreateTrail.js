// npm install @react-google-maps/api
/* global google */
import React, { useEffect, useRef, useState } from "react";
import {
  GoogleMap,
  useJsApiLoader,
  DirectionsRenderer,
  Polyline,
  Marker,
} from "@react-google-maps/api";
import { useNavigate } from "react-router-dom";
import "../components/CreateTrail.css";

const GOOGLE_MAPS_LIBRARIES = ["places"];
const containerStyle = { width: "100%", height: "600px" };
const DEFAULT_CENTER = { lat: 33.996112, lng: -81.027428 };

function travelModeFromType(type) {
  if (!window.google?.maps) return null;
  if (type === "🚗") return window.google.maps.TravelMode.DRIVING;
  if (type === "🚲") return window.google.maps.TravelMode.BICYCLING;
  if (type === "🛴" || type === "🛹") return window.google.maps.TravelMode.BICYCLING;
  return window.google.maps.TravelMode.WALKING;
}

function haversineDistanceMeters(a, b) {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371000; // m
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const aa =
    sinDLat * sinDLat +
    Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
  return R * c;
}

// Create an SVG data URL marker using the emoji so it looks crisp on the map.
// width/height control marker dimensions.
function getEmojiMarkerIcon(emoji = "👣", size = 40) {
  // simple circular marker with emoji centered
  const svg = `
    <svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'>
      <defs>
        <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000" flood-opacity="0.25"/>
        </filter>
      </defs>
      <g filter="url(#shadow)">
        <circle cx="${size/2}" cy="${size/2}" r="${size/2 - 2}" fill="white" stroke="#333" stroke-width="1" />
        <text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" font-size="${Math.round(size/2.2)}">
          ${emoji}
        </text>
      </g>
    </svg>
  `;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    // no need to use google.maps.Size explicitly; google will scale data URL image
    scaledSize: undefined,
  };
}

export default function CreateTrail() {
  const { isLoaded, loadError } = useJsApiLoader({
    id: "google-map-script",
    googleMapsApiKey: process.env.REACT_APP_GOOGLE_MAPS_API_KEY,
    libraries: GOOGLE_MAPS_LIBRARIES,
  });
  
  const navigate = useNavigate();

  const originInputRef = useRef(null);
  const destInputRef = useRef(null);
  const originAutocompleteRef = useRef(null);
  const destAutocompleteRef = useRef(null);
  const watchIdRef = useRef(null);

  const [map, setMap] = useState(null);
  const [mapCenter, setMapCenter] = useState(DEFAULT_CENTER);

  const [directionsResult, setDirectionsResult] = useState(null);
  const [distanceText, setDistanceText] = useState("");
  const [durationText, setDurationText] = useState("");
  const [originPosition, setOriginPosition] = useState(null);

  const [routeTitle, setRouteTitle] = useState("");
  const [routeType, setRouteType] = useState("👣");
  const [saving, setSaving] = useState(false);

  // Tracking state
  const [isTracking, setIsTracking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [trackedPath, setTrackedPath] = useState([]); // [{lat,lng}, ...]
  const [trackedDistanceMeters, setTrackedDistanceMeters] = useState(0);

  // elapsed handling: baseElapsed stores accumulated ms when paused/stopped; startTsRef stores epoch when running
  const [elapsedMsDisplay, setElapsedMsDisplay] = useState(0); // used for UI; updated every second
  const baseElapsedRef = useRef(0);
  const startTsRef = useRef(null);
  const elapsedIntervalRef = useRef(null);

  const LOCAL_STORAGE_KEY = "savedRoutes_v1";

    // Dark-mode map styling (only when :root.dark is active)
  const isDarkMode = document.documentElement.classList.contains("dark");
  const darkMapStyles = [
    { elementType: "geometry", stylers: [{ color: "#1d1d1d" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#1d1d1d" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#e5e5e5" }] },
    {
      featureType: "administrative",
      elementType: "geometry",
      stylers: [{ color: "#3a3a3a" }],
    },
    {
      featureType: "poi",
      elementType: "labels.text.fill",
      stylers: [{ color: "#bdbdbd" }],
    },
    {
      featureType: "poi.park",
      elementType: "geometry",
      stylers: [{ color: "#202a20" }],
    },
    {
      featureType: "road",
      elementType: "geometry",
      stylers: [{ color: "#2a2a2a" }],
    },
    {
      featureType: "road",
      elementType: "geometry.stroke",
      stylers: [{ color: "#3a3a3a" }],
    },
    {
      featureType: "road",
      elementType: "labels.text.fill",
      stylers: [{ color: "#dcdcdc" }],
    },
    {
      featureType: "water",
      elementType: "geometry",
      stylers: [{ color: "#0f2a3a" }],
    },
    {
      featureType: "water",
      elementType: "labels.text.fill",
      stylers: [{ color: "#bdbdbd" }],
    },
  ];

  // Keep map type in sync with routeType (darkmode-safe)
  useEffect(() => {
  if (!map || !window.google?.maps) return;
  // If routeType is driving (🚗) use roadmap; otherwise use terrain
  try {
    const mapType = routeType === "🚗" ? window.google.maps.MapTypeId.ROADMAP : window.google.maps.MapTypeId.TERRAIN;
    map.setMapTypeId(mapType);
  } catch (e) {
    // google may be undefined briefly; ignore
    console.warn("Failed to set map type:", e);
  }
}, [map, routeType]);

// If the user navigates away while tracking, watchPosition and the interval can keep running
useEffect(() => {
  return () => {
    // cleanup geolocation watcher
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    // cleanup timer
    if (elapsedIntervalRef.current) {
      clearInterval(elapsedIntervalRef.current);
      elapsedIntervalRef.current = null;
    }
  };
}, []);

  function calculateCustomDurationFromWalking(walkingSeconds, multiplier) {
    if (!walkingSeconds || !multiplier) return "";
    const runningSeconds = walkingSeconds / multiplier;
    const minutes = Math.round(runningSeconds / 60);
    return `${minutes} min`;
  }

  async function calculateRoute(typeArg) {
    if (!isLoaded || !window.google?.maps) {
      alert("Map not ready yet — please wait a moment and try again.");
      return;
    }
    const originVal = originInputRef.current?.value?.trim();
    const destVal = destInputRef.current?.value?.trim();
    if (!originVal || !destVal) return;

    const usedType = typeArg || routeType;
    const travelMode = travelModeFromType(usedType);
    if (!travelMode) return;

    try {
      const directionsService = new window.google.maps.DirectionsService();
      const request = {
        origin: originVal,
        destination: destVal,
        travelMode,
        unitSystem: window.google.maps.UnitSystem.IMPERIAL,
      };
      const result = await directionsService.route(request);
      setDirectionsResult(result);
      const leg = result.routes[0].legs[0];
      setDistanceText(leg.distance.text);

      if (travelMode === window.google.maps.TravelMode.DRIVING) {
        setDurationText(leg.duration.text);
      } else if (usedType === "🚲" || usedType === "👣") {
        setDurationText(leg.duration.text);
      } else if (usedType === "🏃") {
        setDurationText(calculateCustomDurationFromWalking(leg.duration.value, 2.0));
      } else if (usedType === "♿") {
        setDurationText(calculateCustomDurationFromWalking(leg.duration.value, 0.8));
      } else {
        setDurationText(calculateCustomDurationFromWalking(leg.duration.value, 1.0));
      }
    } catch (err) {
      console.error("calculateRoute error:", err);
      alert("Could not calculate route. See console for details.");
    }
  }

  // Timer helpers
  function startElapsedTimer() {
    if (elapsedIntervalRef.current) return;
    // update UI every second
    elapsedIntervalRef.current = setInterval(() => {
      const running = startTsRef.current ? Date.now() - startTsRef.current : 0;
      setElapsedMsDisplay(baseElapsedRef.current + running);
    }, 1000);
    // also set immediate
    const running = startTsRef.current ? Date.now() - startTsRef.current : 0;
    setElapsedMsDisplay(baseElapsedRef.current + running);
  }
  function stopElapsedTimer() {
    if (elapsedIntervalRef.current) {
      clearInterval(elapsedIntervalRef.current);
      elapsedIntervalRef.current = null;
    }
  }

  function beginTracking() {
    if (!navigator.geolocation) {
      alert("Geolocation not supported by this browser.");
      return;
    }

    // Reset tracking state so timer and path start fresh
    setTrackedPath([]);
    setTrackedDistanceMeters(0);
    baseElapsedRef.current = 0;
    setElapsedMsDisplay(0);

    startTsRef.current = Date.now();
    setIsPaused(false);
    setIsTracking(true);
    startElapsedTimer();

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        // if paused ignore (we clear watcher on pause to save battery)
        if (isPaused) return;
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setTrackedPath((prev) => {
          const next = [...prev, coords];
          if (prev.length > 0) {
            const last = prev[prev.length - 1];
            const d = haversineDistanceMeters(last, coords);
            setTrackedDistanceMeters((prevD) => prevD + d);
          }
          return next;
        });
      },
      (err) => {
        console.warn("geolocation watch error", err);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 5000,
      }
    );

    watchIdRef.current = id;
  }

  function pauseTracking() {
    if (!isTracking || isPaused) return;
    // accumulate elapsed
    if (startTsRef.current) {
      baseElapsedRef.current += Date.now() - startTsRef.current;
      startTsRef.current = null;
    }
    setIsPaused(true);
    // clear watcher to save battery
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    stopElapsedTimer();
    // ensure display shows final base elapsed
    setElapsedMsDisplay(baseElapsedRef.current);
  }

  function resumeTracking() {
    if (!isTracking || !isPaused) return;
    startTsRef.current = Date.now();
    setIsPaused(false);
    startElapsedTimer();

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        if (isPaused) return;
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setTrackedPath((prev) => {
          const next = [...prev, coords];
          if (prev.length > 0) {
            const last = prev[prev.length - 1];
            const d = haversineDistanceMeters(last, coords);
            setTrackedDistanceMeters((prevD) => prevD + d);
          }
          return next;
        });
      },
      (err) => {
        console.warn("geolocation watch error", err);
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 5000 }
    );
    watchIdRef.current = id;
  }

  function stopTracking({ offerSave = true } = {}) {
    if (!isTracking) return;
    // finalize elapsed
    if (startTsRef.current) {
      baseElapsedRef.current += Date.now() - startTsRef.current;
      startTsRef.current = null;
    }
    setIsTracking(false);
    setIsPaused(false);
    // stop geolocation watcher
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    stopElapsedTimer();
    setElapsedMsDisplay(baseElapsedRef.current);

    if (offerSave && trackedPath.length > 0) {
      const minutes = Math.round((baseElapsedRef.current || 0) / 60000);
      if (window.confirm("Save tracked route to library?")) {
        const originVal = originInputRef.current?.value?.trim() || "";
        const destVal = destInputRef.current?.value?.trim() || "";
        const title =
          (routeTitle || "").trim() || `${originVal || "Start"} → ${destVal || "End"}`;

        const newRoute = {
          id: `r_${Date.now()}`,
          title,
          origin: originVal || "",
          destination: destVal || "",
          distance: `${(trackedDistanceMeters / 1609.344).toFixed(2)} mi`,
          duration: `${minutes} min`,
          type: routeType || "👣",
          public: false,
          review: null,
          createdAt: new Date().toISOString(),
          path: trackedPath,
        };

        try {
          const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
          const routes = raw ? JSON.parse(raw) : [];
          routes.unshift(newRoute);
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(routes));
          navigate(`/app/completed/${newRoute.id}`);
        } catch (err) {
          console.error("save tracked route error", err);
          alert("Failed to save tracked route. See console for details.");
        }
      }
    }
  }

async function setOriginToUserLocation() {
  if (!navigator.geolocation || !window.google?.maps) return;

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;
      const latLng = new window.google.maps.LatLng(latitude, longitude);

      const geocoder = new window.google.maps.Geocoder();

      geocoder.geocode({ location: latLng }, (results, status) => {
        if (status === "OK" && results && results[0]) {
          const address = results[0].formatted_address;

          if (originInputRef.current) {
            originInputRef.current.value = address;
          }

          setOriginPosition({ lat: latitude, lng: longitude });
          setMapCenter({ lat: latitude, lng: longitude });
        }
      });
    },
    (err) => {
      console.warn("Geolocation error:", err);
    }
  );
}



  useEffect(() => {
    if (!isLoaded || !window.google?.maps?.places) return;

    if (originInputRef.current && !originAutocompleteRef.current) {
      originAutocompleteRef.current = new window.google.maps.places.Autocomplete(originInputRef.current, {
        fields: ["formatted_address", "geometry"],
      });
      originAutocompleteRef.current.addListener("place_changed", () => {
        const place = originAutocompleteRef.current.getPlace();
        if (place?.geometry?.location) {
          const loc = place.geometry.location;
          setOriginPosition({ lat: loc.lat(), lng: loc.lng() });
        }
      });
    }

    if (destInputRef.current && !destAutocompleteRef.current) {
      destAutocompleteRef.current = new window.google.maps.places.Autocomplete(destInputRef.current, {
        fields: ["formatted_address"],
      });
    }
  }, [isLoaded]);

  // clear everything including timer, tracked data, UI fields
  function clearRoute() {
    setDirectionsResult(null);
    setDistanceText("");
    setDurationText("");
    if (originInputRef.current) originInputRef.current.value = "";
    if (destInputRef.current) destInputRef.current.value = "";
    setOriginPosition(null);

    // stop tracking
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    stopElapsedTimer();
    startTsRef.current = null;
    baseElapsedRef.current = 0;
    setElapsedMsDisplay(0);
    setIsTracking(false);
    setIsPaused(false);
    setTrackedPath([]);
    setTrackedDistanceMeters(0);
    setRouteTitle("");

    // recenter map
    map?.panTo(DEFAULT_CENTER);
    map?.setZoom(14);
  }

  function recenterToOrigin() {
    const target = originPosition || DEFAULT_CENTER;
    if (!map) return;
    map.panTo(target);
    map.setZoom(14);
  }

  function saveRouteToLibrary() {
    const originVal = originInputRef.current?.value?.trim();
    const destVal = destInputRef.current?.value?.trim();

    if (!originVal || !destVal) {
      window.alert("Please calculate a route before saving.");
      return;
    }

    if (!directionsResult) {
      window.alert("Please calculate a route before saving.");
      return;
    }

    const title = (routeTitle || "").trim() || `${originVal} → ${destVal}`;

    // extract geometry from the directions result for explore hover preview
    const route = directionsResult.routes?.[0];
    const encodedPolyline = route?.overview_polyline ?? null;
    const rawBounds = route?.bounds ?? null;
    const bounds = rawBounds ? { north: rawBounds.getNorthEast().lat(), east:  rawBounds.getNorthEast().lng(), south: rawBounds.getSouthWest().lat(), west:  rawBounds.getSouthWest().lng() } : null;

    const newRoute = {
      id: `r_${Date.now()}`,
      title,
      origin: originVal,
      destination: destVal,
      distance: distanceText || "",
      duration: durationText || "",
      type: routeType || "👣",
      public: false,
      review: null,
      createdAt: new Date().toISOString(),
      encodedPolyline, // used by Explore hover preview 
      bounds, // used by Explore fitBounds on hover
    };

    try {
      setSaving(true);
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      const routes = raw ? JSON.parse(raw) : [];
      routes.unshift(newRoute);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(routes));
      navigate(`/app/completed/${newRoute.id}`);
    } catch (err) {
      console.error("saveRouteToLibrary error", err);
      window.alert("Failed to save route. See console for details.");
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <div style={{ padding: 16 }}>
        Map failed to load. Check your Google Maps API key and console logs.
      </div>
    );
  }

  if (!isLoaded) return <div style={{ padding: 16 }}>Loading map...</div>;

  // compute elapsed display string from elapsedMsDisplay
  const totalElapsedMs = elapsedMsDisplay;
  const elapsedMinutes = Math.floor(totalElapsedMs / 60000);
  const elapsedSeconds = Math.floor((totalElapsedMs % 60000) / 1000);
  const elapsedDisplay = `${elapsedMinutes}:${String(elapsedSeconds).padStart(2, "0")}`;

  // user marker position (last known GPS or origin)
  const lastPos =
    trackedPath && trackedPath.length > 0
      ? trackedPath[trackedPath.length - 1]
      : originPosition;

  // create icon for current transport emoji
  const userIcon = getEmojiMarkerIcon(routeType, 48);

  return (
    <div className="create-trail-container" style={{ maxWidth: 1200, margin: "0 auto" }}>
      <h2  style={{ marginTop: 0 }}>Create Trail</h2>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <div className="origin-input-wrapper">
          <input
            ref={originInputRef}
            placeholder="Origin"
            style={{ padding: 8, minWidth: 240 }}
          />

          <button
            className="use-location-btn"
            onClick={setOriginToUserLocation}
          >
            📍 My location
          </button>
        </div>

        <input ref={destInputRef} placeholder="Destination" style={{ padding: 8, minWidth: 240 }} />

        {/* transport icons toolbar */}
        <div className= "transport-toolbar" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {[
            { key: "👣", label: "Walking" },
            { key: "🚲", label: "Biking" },
            { key: "🚗", label: "Driving" },
            { key: "🛹", label: "Skateboarding" },
            { key: "🏃", label: "Running" },
            { key: "🛴", label: "Scootering" },
            { key: "♿", label: "Wheelchair" },
          ].map((opt) => {
            const selected = routeType === opt.key;
            return (
              <button
                key={opt.key}
                title={opt.label}
                onClick={async () => {
                  setRouteType(opt.key);
                  const originVal = originInputRef.current?.value?.trim();
                  const destVal = destInputRef.current?.value?.trim();
                  if (originVal && destVal) {
                    try {
                      await calculateRoute(opt.key);
                    } catch (e) {}
                  }
                }}
                style={{
                  fontSize: 18,
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: selected ? "2px solid var(--brand)" : "1px solid var(--border)",
                  background: selected ? "rgba(115, 0, 10, 0.12)" : "var(--surface)",
                  color: "var(--text)",
                  cursor: "pointer",
                  lineHeight: 1,
                }}
                aria-pressed={selected}
              >
                {opt.key}
              </button>
            );
          })}
        </div>

        {/* Controls row (non-floating) - Save / Title / Clear */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            placeholder="Route title (optional)"
            value={routeTitle}
            onChange={(e) => setRouteTitle(e.target.value)}
            style={{ padding: 8, minWidth: 260 }}
          />
          <button onClick={saveRouteToLibrary} disabled={saving}>
            {saving ? "Saving..." : "Save to Library"}
          </button>
          
          <button onClick={clearRoute}>Clear</button>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <strong>Distance (route):</strong> {distanceText || "—"} &nbsp;
        <strong>ETA:</strong> {durationText || "—"}
      </div>

      <div style={{ marginBottom: 12 }}>
        <strong>Tracking status:</strong>{" "}
        {isTracking ? (isPaused ? "Paused" : "Active") : "Stopped"} &nbsp;|&nbsp;
        <strong>Elapsed:</strong> {elapsedDisplay} &nbsp;|&nbsp;
        <strong>Traveled:</strong>{" "}
        {trackedDistanceMeters ? `${(trackedDistanceMeters / 1609.344).toFixed(2)} mi` : "—"}
      </div>

   
<div className="map-container">
  <GoogleMap
    mapContainerStyle={containerStyle}
    center={mapCenter}
    zoom={14}
    onLoad={setMap}
  >
    {directionsResult && <DirectionsRenderer directions={directionsResult} />}
    {trackedPath && trackedPath.length > 1 && (
      <Polyline path={trackedPath} options={{ strokeWeight: 4 }} />
    )}
    {lastPos && (
      <Marker
        position={lastPos}
        icon={userIcon}
        optimized={false}
      />
    )}
  </GoogleMap>

  {/* Floating Start / Pause / Stop Controls (INSIDE map via position on .map-container) */}
  <div className="floating-controls">
    {!isTracking && (
      <button
        className="map-btn"
        onClick={() => {
          const originVal = originInputRef.current?.value?.trim();
          const destVal = destInputRef.current?.value?.trim();
          if (!directionsResult && originVal && destVal) {
            calculateRoute().then(beginTracking).catch(beginTracking);
          } else {
            beginTracking();
          }
        }}
      >
        Start
      </button>
    )}

    {isTracking && !isPaused && (
      <button className="map-btn" onClick={pauseTracking}>Pause</button>
    )}

    {isTracking && isPaused && (
      <button className="map-btn" onClick={resumeTracking}>Resume</button>
    )}

    {isTracking && (
      <button className="map-btn" onClick={() => stopTracking({ offerSave: true })}>
        Stop
      </button>
    )}
  </div>

  {/* Recenter button pinned bottom-left inside the map */}
  <button className="map-btn recenter-btn" onClick={recenterToOrigin}>Recenter</button>
</div>
    </div>
  );
}