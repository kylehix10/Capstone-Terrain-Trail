/* global google */
import React, { useEffect, useRef, useState } from "react";
import {
  GoogleMap,
  DirectionsRenderer,
  Polyline,
  Marker,
} from "@react-google-maps/api";
import { useNavigate } from "react-router-dom";
import "../components/CreateTrail.css";
import { useSnackbar } from "../components/Snackbar.jsx";

const containerStyle = { width: "100%", height: "600px" };
const DEFAULT_CENTER = { lat: 33.996112, lng: -81.027428 };
const API_BASE = process.env.REACT_APP_API_BASE_URL || "";

// auth helper
function authHeaders() {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function travelModeFromType(type) {
  if (!window.google?.maps) return null;
  if (type === "🚗") return window.google.maps.TravelMode.DRIVING;
  if (type === "🚲" || type === "🛴" || type === "🛹")
    return window.google.maps.TravelMode.BICYCLING;
  return window.google.maps.TravelMode.WALKING;
}

function haversineDistanceMeters(a, b) {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const aa =
    sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  return R * 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
}

// Create an SVG data URL marker using the emoji so it looks crisp on the map.
// width/height control marker dimensions.
function getEmojiMarkerIcon(emoji = "👣", size = 40) {
  const svg = `
    <svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'>
      <defs>
        <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000" flood-opacity="0.25"/>
        </filter>
      </defs>
      <g filter="url(#shadow)">
        <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 2}" fill="white" stroke="#333" stroke-width="1" />
        <text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" font-size="${Math.round(size / 2.2)}">
          ${emoji}
        </text>
      </g>
    </svg>
  `;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: undefined,
  };
}

function calculateCustomDurationFromWalking(walkingSeconds, multiplier) {
  if (!walkingSeconds || !multiplier) return "";
  return `${Math.round(walkingSeconds / multiplier / 60)} min`;
}

function getRouteDurationText(routeType, durationValue, durationText) {
  if (routeType === "🏃")
    return calculateCustomDurationFromWalking(durationValue, 2.0);
  if (routeType === "♿")
    return calculateCustomDurationFromWalking(durationValue, 0.8);
  if (routeType === "🛹" || routeType === "🛴") {
    return calculateCustomDurationFromWalking(durationValue, 1.0);
  }
  return durationText || "";
}

// Real terrain sensitivity: skateboard is rougher than bike/scooter.
function getTerrainSensitivity(type) {
  switch (type) {
    case "🛹":
      return 2.4;
    case "🚲":
      return 1.15;
    case "🛴":
      return 1.0;
    case "🏃":
      return 1.7;
    case "♿":
      return 2.5;
    case "🚗":
      return 0.2;
    default:
      return 1.0;
  }
}

function getTerrainLabel(adjustedGainPerMile) {
  if (adjustedGainPerMile < 20) return { label: "Flat", tone: "easy" };
  if (adjustedGainPerMile < 30) return { label: "Mainly flat", tone: "easy" };
  if (adjustedGainPerMile < 50) return { label: "Moderate", tone: "moderate" };
  if (adjustedGainPerMile < 100) return { label: "Hilly", tone: "hard" };
  return { label: "Very hilly", tone: "hard" };
}

async function estimateElevationGainMeters(path) {
  if (!window.google?.maps?.ElevationService || !path?.length) return 0;

  return new Promise((resolve) => {
    try {
      const elevationService = new google.maps.ElevationService();
      const samples = Math.min(24, Math.max(8, path.length));

      elevationService.getElevationAlongPath(
        { path, samples },
        (results, status) => {
          if (status !== "OK" || !Array.isArray(results) || results.length < 2) {
            resolve(0);
            return;
          }

          let gain = 0;
          for (let i = 1; i < results.length; i += 1) {
            const prev = results[i - 1]?.elevation ?? 0;
            const curr = results[i]?.elevation ?? 0;
            const delta = curr - prev;
            if (delta > 0) gain += delta;
          }
          resolve(gain);
        }
      );
    } catch (err) {
      console.warn("Elevation estimate failed:", err);
      resolve(0);
    }
  });
}

async function analyzeRoute(route, prefs, routeType) {
  const leg = route?.legs?.[0];
  const distanceMeters = leg?.distance?.value ?? Number.MAX_SAFE_INTEGER;
  const stepCount = leg?.steps?.length ?? 0;

  const elevationGainMeters = await estimateElevationGainMeters(
    route?.overview_path || []
  );
  const distanceMiles = Math.max(distanceMeters / 1609.344, 0.1);

  const sensitivity = getTerrainSensitivity(routeType);
  const adjustedGainPerMile = (elevationGainMeters / distanceMiles) * sensitivity;
  const terrain = getTerrainLabel(adjustedGainPerMile);

  const turnPenalty = prefs.fewerTurns ? stepCount * 250 : 0;
  const terrainWeight = prefs.flatter ? 42 : 28;
  const terrainPenalty = adjustedGainPerMile * terrainWeight;

  return {
    route,
    score: distanceMeters + turnPenalty + terrainPenalty,
    terrainLabel: terrain.label,
    terrainTone: terrain.tone,
    elevationGainMeters,
    adjustedGainPerMile,
    turnCount: stepCount,
  };
}

export default function CreateTrail() {
  const navigate = useNavigate();

  const originInputRef = useRef(null);
  const destInputRef = useRef(null);
  const originAutocompleteRef = useRef(null);
  const destAutocompleteRef = useRef(null);
  const watchIdRef = useRef(null);
  const routeRequestIdRef = useRef(0);

  const [map, setMap] = useState(null);
  const [mapCenter, setMapCenter] = useState(DEFAULT_CENTER);

  const [directionsResult, setDirectionsResult] = useState(null);
  const [distanceText, setDistanceText] = useState("");
  const [durationText, setDurationText] = useState("");
  const [originPosition, setOriginPosition] = useState(null);
  const [locationMessage, setLocationMessage] = useState("");

  const [routeTitle, setRouteTitle] = useState("");
  const [routeType, setRouteType] = useState("👣");
  const [isUSC, setIsUSC] = useState(false);
  const [saving, setSaving] = useState(false);

  const [routeOptions, setRouteOptions] = useState([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [routePrefs, setRoutePrefs] = useState({
    avoidHighways: false,
    fewerTurns: false,
    flatter: false,
  });

  // Tracking state
  const [isTracking, setIsTracking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [trackedPath, setTrackedPath] = useState([]);
  const [trackedDistanceMeters, setTrackedDistanceMeters] = useState(0);

  const [elapsedMsDisplay, setElapsedMsDisplay] = useState(0);
  const baseElapsedRef = useRef(0);
  const startTsRef = useRef(null);
  const elapsedIntervalRef = useRef(null);

  const [hazardMenuOpen, setHazardMenuOpen] = useState(false);
  const [hazards, setHazards] = useState([]);
  const [selectedHazardType, setSelectedHazardType] = useState(null);

  const { showSnackbar } = useSnackbar();

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

  useEffect(() => {
    if (!map || !window.google?.maps) return;
    try {
      map.setMapTypeId(
        routeType === "🚗"
          ? window.google.maps.MapTypeId.ROADMAP
          : window.google.maps.MapTypeId.TERRAIN
      );
    } catch (e) {
      console.warn("Failed to set map type:", e);
    }
  }, [map, routeType]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (elapsedIntervalRef.current) {
        clearInterval(elapsedIntervalRef.current);
        elapsedIntervalRef.current = null;
      }
    };
  }, []);

  function deleteHazard(index) {
    setHazards((prev) => prev.filter((_, i) => i !== index));
  }

  function placeHazardNow(type) {
    const pos = getCurrentHazardPosition();
    if (!pos || !type) return;

    setHazards((prev) => [
      ...prev,
      {
        lat: pos.lat,
        lng: pos.lng,
        type,
        createdAt: new Date().toISOString(),
      },
    ]);

    setSelectedHazardType(null);
    setHazardMenuOpen(false);
  }

  function getCurrentHazardPosition() {
    if (isTracking && trackedPath.length > 0) {
      return trackedPath[trackedPath.length - 1];
    }
    if (originPosition) {
      return originPosition;
    }
    return null;
  }

  function handleMapClick(e) {
    if (!selectedHazardType) return;
    const clicked = e?.latLng?.toJSON?.();
    if (!clicked) return;
    setHazards((prev) => [
      ...prev,
      {
        lat: clicked.lat,
        lng: clicked.lng,
        type: selectedHazardType,
        createdAt: new Date().toISOString(),
      },
    ]);

    setSelectedHazardType(null);
    setHazardMenuOpen(false);
  }

  async function calculateRoute(typeArg) {
    if (!window.google?.maps) {
      showSnackbar("Map not ready yet — please wait a moment and try again.", "warning");
      return null;
    }
    const originVal = originInputRef.current?.value?.trim();
    const destVal = destInputRef.current?.value?.trim();
    if (!originVal || !destVal) return null;

    const usedType = typeArg || routeType;
    const travelMode = travelModeFromType(usedType);
    if (!travelMode) return null;

    const requestId = ++routeRequestIdRef.current;

    try {
      const result = await new google.maps.DirectionsService().route({
        origin: originPosition || originVal,
        destination: destVal,
        travelMode,
        provideRouteAlternatives: true,
        avoidHighways: routePrefs.avoidHighways,
        unitSystem: google.maps.UnitSystem.IMPERIAL,
      });

      let routes = [...(result.routes || [])];

      const analyzed = await Promise.all(
        routes.map(async (route) => analyzeRoute(route, routePrefs, usedType))
      );

      let sorted = analyzed.sort((a, b) => a.score - b.score);

      if (requestId !== routeRequestIdRef.current) {
        return null;
      }

      setDirectionsResult(result);
      setRouteOptions(sorted);
      setSelectedRouteIndex(0);

      const selected = sorted[0];
      if (selected?.route?.legs?.[0]) {
        const leg = selected.route.legs[0];
        setDistanceText(leg.distance?.text || "");
        setDurationText(
          getRouteDurationText(usedType, leg.duration?.value, leg.duration?.text || "")
        );
      } else {
        setDistanceText("");
        setDurationText("");
      }

      return result;
    } catch (err) {
      console.error("calculateRoute error:", err);
      showSnackbar("Could not calculate route. See console for details.", "error");
      return null;
    }
  }

  useEffect(() => {
    const originVal = originInputRef.current?.value?.trim();
    const destVal = destInputRef.current?.value?.trim();
    if (!originVal || !destVal || !directionsResult) return;
    calculateRoute(routeType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routePrefs.avoidHighways, routePrefs.fewerTurns, routePrefs.flatter]);

  function selectRoute(index) {
    const selected = routeOptions[index];
    const route = selected?.route;
    if (!route?.legs?.[0]) return;

    setSelectedRouteIndex(index);

    const leg = route.legs[0];
    setDistanceText(leg.distance?.text || "");
    setDurationText(
      getRouteDurationText(routeType, leg.duration?.value, leg.duration?.text || "")
    );
  }

  function startElapsedTimer() {
    if (elapsedIntervalRef.current) return;
    elapsedIntervalRef.current = setInterval(() => {
      const running = startTsRef.current ? Date.now() - startTsRef.current : 0;
      setElapsedMsDisplay(baseElapsedRef.current + running);
    }, 1000);
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
      showSnackbar("Geolocation not supported by this browser.", "error");
      return;
    }

    setTrackedPath([]);
    setTrackedDistanceMeters(0);
    baseElapsedRef.current = 0;
    setElapsedMsDisplay(0);

    startTsRef.current = Date.now();
    setIsPaused(false);
    setIsTracking(true);
    startElapsedTimer();

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        if (isPaused) return;
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setTrackedPath((prev) => {
          const next = [...prev, coords];
          if (prev.length > 0) {
            const d = haversineDistanceMeters(prev[prev.length - 1], coords);
            setTrackedDistanceMeters((prevD) => prevD + d);
          }
          return next;
        });
      },
      (err) => console.warn("geolocation watch error", err),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 5000 }
    );
  }

  function pauseTracking() {
    if (!isTracking || isPaused) return;
    if (startTsRef.current) {
      baseElapsedRef.current += Date.now() - startTsRef.current;
      startTsRef.current = null;
    }
    setIsPaused(true);
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    stopElapsedTimer();
    setElapsedMsDisplay(baseElapsedRef.current);
  }

  function resumeTracking() {
    if (!isTracking || !isPaused) return;
    startTsRef.current = Date.now();
    setIsPaused(false);
    startElapsedTimer();

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        if (isPaused) return;
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setTrackedPath((prev) => {
          const next = [...prev, coords];
          if (prev.length > 0) {
            const d = haversineDistanceMeters(prev[prev.length - 1], coords);
            setTrackedDistanceMeters((prevD) => prevD + d);
          }
          return next;
        });
      },
      (err) => console.warn("geolocation watch error", err),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 5000 }
    );
  }

  async function stopTracking({ offerSave = true } = {}) {
    if (!isTracking) return;

    if (startTsRef.current) {
      baseElapsedRef.current += Date.now() - startTsRef.current;
      startTsRef.current = null;
    }

    setIsTracking(false);
    setIsPaused(false);

    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    stopElapsedTimer();
    setElapsedMsDisplay(baseElapsedRef.current);

    async function reverseGeocodePoint(point) {
      if (!window.google?.maps || !point) return null;
      return new Promise((resolve) => {
        new google.maps.Geocoder().geocode({ location: point }, (results, status) => {
          resolve(status === "OK" && results?.[0] ? results[0].formatted_address : null);
        });
      });
    }

    if (offerSave && trackedPath.length > 0) {
      const minutes = Math.round((baseElapsedRef.current || 0) / 60000);
      const originVal = originInputRef.current?.value?.trim() || "";
      const lastPoint = trackedPath[trackedPath.length - 1];
      const address = await reverseGeocodePoint(lastPoint);
      const destinationValue =
        address || `${lastPoint.lat.toFixed(6)}, ${lastPoint.lng.toFixed(6)}`;

      const title =
        (routeTitle || "").trim() || `${originVal || "Start"} → ${destinationValue}`;

      const newRoute = {
        title,
        origin: originVal,
        destination: destinationValue,
        distance: `${(trackedDistanceMeters / 1609.344).toFixed(2)} mi`,
        duration: `${minutes} min`,
        type: routeType || "👣",
        tags: isUSC ? ["USC"] : [],
        public: false,
        review: null,
        path: trackedPath,
        recorded: true,
        hazards,
      };

      try {
        setSaving(true);
        const res = await fetch(`${API_BASE}/api/routes`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify(newRoute),
        });
        if (!res.ok) throw new Error(`Server error: ${res.status}`);
        const data = await res.json();
        showSnackbar("Tracked route saved!", "success");
        navigate(`/app/completed/${data.route.id}`);
      } catch (err) {
        console.error("save tracked route error", err);
        showSnackbar("Failed to save tracked route. See console for details.", "error");
      } finally {
        setSaving(false);
      }
    }
  }

  async function setOriginToUserLocation() {
    if (!navigator.geolocation || !window.google?.maps) {
      setLocationMessage("Location permission required.");
      return;
    }

    setLocationMessage("");

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        const exactPoint = { lat: latitude, lng: longitude };

        setOriginPosition(exactPoint);
        setMapCenter(exactPoint);

        const geocoder = new window.google.maps.Geocoder();
        geocoder.geocode({ location: exactPoint }, (results, status) => {
          if (status === "OK" && results?.[0]) {
            if (originInputRef.current) {
              originInputRef.current.value = results[0].formatted_address;
            }
          } else {
            if (originInputRef.current) {
              originInputRef.current.value = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
            }
          }
        });

        if (accuracy && accuracy > 50) {
          setLocationMessage(
            `Location is a little imprecise (${Math.round(accuracy)}m), but using nearest place.`
          );
        } else {
          setLocationMessage("");
        }
      },
      (err) => {
        setLocationMessage(
          err?.code === 1 ? "Location permission required." : "Could not get your location."
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  }

  useEffect(() => {
    if (!window.google?.maps?.places) return;

    if (originInputRef.current && !originAutocompleteRef.current) {
      originAutocompleteRef.current = new window.google.maps.places.Autocomplete(
        originInputRef.current,
        {
          fields: ["formatted_address", "geometry"],
        }
      );
      originAutocompleteRef.current.addListener("place_changed", () => {
        const place = originAutocompleteRef.current.getPlace();
        if (place?.geometry?.location) {
          const loc = place.geometry.location;
          setOriginPosition({ lat: loc.lat(), lng: loc.lng() });
        }
      });
    }

    if (destInputRef.current && !destAutocompleteRef.current) {
      destAutocompleteRef.current = new window.google.maps.places.Autocomplete(
        destInputRef.current,
        {
          fields: ["formatted_address"],
        }
      );
      destAutocompleteRef.current.addListener("place_changed", async () => {
        const place = destAutocompleteRef.current.getPlace();
        const originVal = originInputRef.current?.value?.trim();
        const destVal = place?.formatted_address || destInputRef.current?.value?.trim();

        if (!destVal) return;

        setRouteType("👣");

        if (originVal) {
          await calculateRoute("👣");
        }
      });
    }
  }, []);

  async function saveRouteToLibrary() {
    const originVal = originInputRef.current?.value?.trim();
    const destVal = destInputRef.current?.value?.trim();

    if (!originVal || !destVal || !directionsResult) {
      showSnackbar("Please calculate a route before saving.", "warning");
      return;
    }

    const selectedItem = routeOptions[selectedRouteIndex] || null;
    const selectedRoute = selectedItem?.route || directionsResult.routes?.[0] || null;

    if (!selectedRoute) {
      showSnackbar("No route available to save.", "warning");
      return;
    }

    const title = (routeTitle || "").trim() || `${originVal} → ${destVal}`;

    const rawBounds = selectedRoute?.bounds ?? null;
    const bounds = rawBounds
      ? {
          north: rawBounds.getNorthEast().lat(),
          east: rawBounds.getNorthEast().lng(),
          south: rawBounds.getSouthWest().lat(),
          west: rawBounds.getSouthWest().lng(),
        }
      : null;

    const leg = selectedRoute.legs?.[0] || null;

    const newRoute = {
      title,
      origin: originVal,
      destination: destVal,
      distance: distanceText || leg?.distance?.text || "",
      duration: durationText || leg?.duration?.text || "",
      type: routeType || "👣",
      tags: isUSC ? ["USC"] : [],
      public: false,
      review: null,
      hazards,
      encodedPolyline: selectedRoute?.overview_polyline?.points ?? null,
      bounds,
      terrain: selectedItem?.terrainLabel || "",
      elevationGainMeters: selectedItem?.elevationGainMeters ?? null,
    };

    try {
      setSaving(true);
      const res = await fetch(`${API_BASE}/api/routes`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(newRoute),
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();
      showSnackbar("Route saved successfully!", "success");
      navigate(`/app/completed/${data.route.id}`);
    } catch (err) {
      console.error("saveRouteToLibrary error", err);
      showSnackbar("Failed to save route. See console for details.", "error");
    } finally {
      setSaving(false);
    }
  }

  function clearRoute() {
    setLocationMessage("");
    setDirectionsResult(null);
    setDistanceText("");
    setDurationText("");
    setRouteOptions([]);
    setSelectedRouteIndex(0);
    if (originInputRef.current) originInputRef.current.value = "";
    if (destInputRef.current) destInputRef.current.value = "";
    setOriginPosition(null);
    setIsUSC(false);

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
    setHazards([]);

    map?.panTo(DEFAULT_CENTER);
    map?.setZoom(14);
  }

  function recenterToOrigin() {
    const target = originPosition || DEFAULT_CENTER;
    if (!map) return;
    map.panTo(target);
    map.setZoom(14);
  }

  const totalElapsedMs = elapsedMsDisplay;
  const elapsedMinutes = Math.floor(totalElapsedMs / 60000);
  const elapsedSeconds = Math.floor((totalElapsedMs % 60000) / 1000);
  const elapsedDisplay = `${elapsedMinutes}:${String(elapsedSeconds).padStart(2, "0")}`;

  const lastPos =
    trackedPath && trackedPath.length > 0
      ? trackedPath[trackedPath.length - 1]
      : originPosition;

  const userIcon = getEmojiMarkerIcon(routeType, 48);

  const selectedRouteItem = routeOptions[selectedRouteIndex] || null;
  const selectedRoute = selectedRouteItem?.route || null;
  const selectedTerrainText = selectedRouteItem?.terrainLabel || "—";

  const destinationPosition = selectedRoute?.legs?.[0]?.end_location || null;

  const displayedDirections =
    directionsResult && selectedRoute
      ? {
          ...directionsResult,
          routes: [selectedRoute],
        }
      : directionsResult;

  return (
  <div className="create-trail-container" style={{ maxWidth: 1200, margin: "0 auto" }}>
    <h2 style={{ marginTop: 0 }}>Create Trail</h2>

    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
      <div className="origin-input-wrapper">
        <input
          ref={originInputRef}
          placeholder="Origin"
          style={{ padding: 8, minWidth: 240 }}
        />
        <button className="use-location-btn" onClick={setOriginToUserLocation}>
          📍 My location
        </button>
        {locationMessage && (
          <div style={{ marginTop: 6, fontSize: 14, color: "crimson" }}>
            {locationMessage}
          </div>
        )}
      </div>

      <input
        ref={destInputRef}
        placeholder="Destination"
        style={{ padding: 8, minWidth: 240 }}
      />

      <div className="transport-toolbar" style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
                lineHeight: 1,
                border: selected ? "2px solid var(--brand)" : "1px solid var(--border)",
                background: selected ? "rgba(115, 0, 10, 0.12)" : "var(--surface)",
                color: "var(--text)",
                cursor: "pointer",
              }}
              aria-pressed={selected}
            >
              {opt.key}
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          placeholder="Route title (optional)"
          value={routeTitle}
          onChange={(e) => setRouteTitle(e.target.value)}
          style={{ padding: 8, minWidth: 260 }}
        />

        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type="checkbox"
            checked={isUSC}
            onChange={(e) => setIsUSC(e.target.checked)}
          />
          On Campus
        </label>

        <button onClick={saveRouteToLibrary} disabled={saving}>
          {saving ? "Saving..." : "Save to Library"}
        </button>

        <button onClick={clearRoute}>Clear</button>
      </div>
    </div>

    <div className="map-layout">
      <div className="map-section">
        <div className="map-container">
          <GoogleMap
            mapContainerStyle={containerStyle}
            center={mapCenter}
            zoom={14}
            onLoad={setMap}
            onClick={handleMapClick}
            onUnmount={() => setMap(null)}
            options={isDarkMode ? { styles: darkMapStyles } : undefined}
          >
            {displayedDirections && (
              <DirectionsRenderer
                directions={displayedDirections}
                options={{
                  suppressMarkers: true,
                  preserveViewport: true,
                }}
              />
            )}

            {originPosition && (
              <Marker position={originPosition} icon={userIcon} optimized={false} />
            )}

            {destinationPosition && (
              <Marker
                position={destinationPosition}
                title="Destination"
                label="B"
                optimized={false}
              />
            )}

            {trackedPath && trackedPath.length > 1 && (
              <Polyline path={trackedPath} options={{ strokeWeight: 4 }} />
            )}

            {lastPos && <Marker position={lastPos} icon={userIcon} optimized={false} />}

            {hazards.map((hazard, idx) => {
              const emojiMap = {
                pothole: "🕳️",
                construction: "🚧",
                car: "🚗",
                debris: "🪨",
                accident: "⚠️",
                flood: "🌊",
              };
              return (
                <Marker
                  key={idx}
                  position={{ lat: hazard.lat, lng: hazard.lng }}
                  icon={getEmojiMarkerIcon(emojiMap[hazard.type] || "⚠️")}
                  title={hazard.type}
                  optimized={false}
                  clickable={true}
                  onClick={(e) => {
                    e.domEvent.stopPropagation();
                    deleteHazard(idx);
                  }}
                />
              );
            })}
          </GoogleMap>

          

          <div className="floating-controls">
            {!isTracking && (
              <>
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

                <button
                  className="map-btn"
                  onClick={() => {
                    const originVal = originInputRef.current?.value?.trim();
                    if (!originVal) {
                      setLocationMessage("Please enter a start location before recording.");
                      return;
                    }
                    setLocationMessage("");
                    setDirectionsResult(null);
                    setDistanceText("");
                    setDurationText("");
                    setRouteOptions([]);
                    setSelectedRouteIndex(0);
                    beginTracking();
                  }}
                >
                  Record New Route
                </button>
              </>
            )}

            {isTracking && !isPaused && (
              <button className="map-btn" onClick={pauseTracking}>
                Pause
              </button>
            )}
            {isTracking && isPaused && (
              <button className="map-btn" onClick={resumeTracking}>
                Resume
              </button>
            )}
            {isTracking && (
              <button className="map-btn" onClick={() => stopTracking({ offerSave: true })}>
                Stop
              </button>
            )}
          </div>

      <div className="map-controls">  
          <div className="hazard-control">
            <button
              className="map-btn hazard-btn"
              onClick={() => setHazardMenuOpen((v) => !v)}
              aria-expanded={hazardMenuOpen}
            >
              ⚠️ Hazard
            </button>

            {hazardMenuOpen && (
              <div className="hazard-menu">
                {[
                  { type: "accident", label: "⚠️ Accident" },
                  { type: "pothole", label: "🕳️ Pothole" },
                  { type: "construction", label: "🚧 Construction" },
                  { type: "car", label: "🚗 Car on roadside" },
                  { type: "debris", label: "🪨 Road debris" },
                ].map((h) => (
                  <button
                    key={h.type}
                    className="hazard-menu-item"
                    onClick={() => placeHazardNow(h.type)}
                  >
                    {h.label}
                  </button>
                ))}
                <button
                  className="hazard-menu-item"
                  onClick={() => {
                    setSelectedHazardType(null);
                    setHazardMenuOpen(false);
                  }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          <button className="map-btn recenter-btn" onClick={recenterToOrigin}>
            Recenter
          </button>
          </div>
        </div>
      </div>

      <aside className="map-sidebar">

  {/* DISTANCE / ETA / TERRAIN */}
  <div className="card">
    <strong>Distance (route):</strong> {distanceText || "—"} <br />
    <strong>ETA:</strong> {durationText || "—"} <br />
    <strong>Terrain:</strong> {selectedTerrainText}
  </div>

  {/* TRACKING */}
  <div className="card">
    <strong>Tracking status:</strong>{" "}
    {isTracking ? (isPaused ? "Paused" : "Active") : "Stopped"} <br />
    <strong>Elapsed:</strong> {elapsedDisplay} <br />
    <strong>Traveled:</strong>{" "}
    {trackedDistanceMeters
      ? `${(trackedDistanceMeters / 1609.344).toFixed(2)} mi`
      : "—"}
  </div>

  {/* ROUTE OPTIONS (Selections) */}
  <div className="card">
    <strong>Selections:</strong>{" "}
    {routeOptions.length > 1
      ? `${routeOptions.length} available`
      : routeOptions.length === 1
        ? "1 available"
        : "—"}

    {routeOptions.length > 0 && (
      <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
        {routeOptions.map((item, i) => {
          const leg = item.route?.legs?.[0];
          if (!leg) return null;
          const isSelected = i === selectedRouteIndex;

          return (
            <div
              key={`${i}-${leg.distance?.value || i}`}
              onClick={() => selectRoute(i)}
              style={{
                padding: 10,
                borderRadius: 10,
                border: isSelected
                  ? "2px solid var(--brand)"
                  : "1px solid var(--border)",
                background: isSelected
                  ? "rgba(115, 0, 10, 0.08)"
                  : "var(--surface)",
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <strong>{isSelected ? "Selected" : `Option ${i + 1}`}</strong>
                <span>
                  {leg.distance?.text || "—"} •{" "}
                  {getRouteDurationText(
                    routeType,
                    leg.duration?.value,
                    leg.duration?.text || ""
                  )}
                </span>
              </div>

              <div style={{ fontSize: 13, opacity: 0.8, marginTop: 4 }}>
                Terrain: {item.terrainLabel || "—"}
              </div>
            </div>
          );
        })}
      </div>
    )}
  </div>

  {/* ROUTE PREFERENCES */}
  <div className="card">
    <strong>Route Preferences:</strong>
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
      <label>
        <input
          type="checkbox"
          checked={routePrefs.avoidHighways}
          onChange={(e) =>
            setRoutePrefs((p) => ({ ...p, avoidHighways: e.target.checked }))
          }
        />{" "}
        No highways
      </label>

      <label>
        <input
          type="checkbox"
          checked={routePrefs.fewerTurns}
          onChange={(e) =>
            setRoutePrefs((p) => ({ ...p, fewerTurns: e.target.checked }))
          }
        />{" "}
        Fewer turns
      </label>

      <label>
        <input
          type="checkbox"
          checked={routePrefs.flatter}
          onChange={(e) =>
            setRoutePrefs((p) => ({ ...p, flatter: e.target.checked }))
          }
        />{" "}
        Flatter route
      </label>
    </div>
  </div>

</aside>
    </div>
  </div>
);
}