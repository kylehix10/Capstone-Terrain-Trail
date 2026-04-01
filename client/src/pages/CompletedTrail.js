// src/pages/CompletedTrail.js
import React, { useEffect, useState, useRef, useCallback } from "react";
import { useSnackbar } from "../components/Snackbar.jsx";
import { useNavigate, useParams } from "react-router-dom";
import {
  GoogleMap,
  DirectionsRenderer,
  Marker,
  Polyline,
} from "@react-google-maps/api";
import "./CompletedTrail.css";

const API_BASE = process.env.REACT_APP_API_BASE_URL || "http://localhost:4000";
const MAP_CONTAINER = { width: "100%", height: "420px" };
const DEFAULT_CENTER = { lat: 33.996112, lng: -81.027428 };

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
  if (type === "🚲" || type === "🛴" || type === "🛹") {
    return window.google.maps.TravelMode.BICYCLING;
  }
  return window.google.maps.TravelMode.WALKING;
}

function getEmojiMarkerIcon(emoji = "⚠️", size = 36) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="${size * 0.8}">
        ${emoji}
      </text>
    </svg>
  `;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: window.google?.maps
      ? new window.google.maps.Size(size, size)
      : undefined,
  };
}

const HAZARD_EMOJI = {
  pothole: "🕳️",
  construction: "🚧",
  car: "🚗",
  debris: "🪨",
  accident: "⚠️",
  flood: "🌊",
};

export default function CompletedTrail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showSnackbar } = useSnackbar();
  const undoTimeoutRef = useRef(null);
  const lastDeletedRef = useRef(null);

  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);

  const mapRef = useRef(null);

  const [route, setRoute] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  const [map, setMap] = useState(null);
  const [mapLoading, setMapLoading] = useState(false);
  const [directionsResult, setDirectionsResult] = useState(null);

  const [stars, setStars] = useState(0);
  const [terrain, setTerrain] = useState(5);
  const [isPublic, setIsPublic] = useState(false);
  const [comment, setComment] = useState("");

  const [hazards, setHazards] = useState([]);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    async function fetchRoute() {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/api/routes/${id}`, {
          headers: authHeaders(),
        });

        if (res.status === 404 || res.status === 403) {
          navigate("/app/library", { replace: true });
          return;
        }

        if (!res.ok) {
          throw new Error(`Server error: ${res.status}`);
        }

        const data = await res.json();
        const found = data.route;

        setRoute(found);
        setHazards(Array.isArray(found.hazards) ? found.hazards : []);
        setStars(found.review?.stars ?? 0);
        setTerrain(found.review?.terrain ?? 5);
        setIsPublic(Boolean(found.public));
        setComment(found.review?.comment || "");
        setPhotoPreview(found.review?.photo || null);
      } catch (e) {
        console.error("fetchRoute error", e);
        navigate("/app/library", { replace: true });
      } finally {
        setLoading(false);
      }
    }

    fetchRoute();
  }, [id, navigate]);

  const loadDirections = useCallback(async (r) => {
    if (!r?.origin || !r?.destination || !window.google?.maps) return;

    setMapLoading(true);
    try {
      const result = await new window.google.maps.DirectionsService().route({
        origin: r.origin,
        destination: r.destination,
        travelMode:
          travelModeFromType(r.type) || window.google.maps.TravelMode.WALKING,
      });

      setDirectionsResult(result);

      if (mapRef.current && result?.routes?.[0]?.bounds) {
        mapRef.current.fitBounds(result.routes[0].bounds, 40);
      }
    } catch (err) {
      console.warn("loadDirections failed", err);
      setDirectionsResult(null);
    } finally {
      setMapLoading(false);
    }
  }, []);

  useEffect(() => {
    if (route) {
      loadDirections(route);
    }
  }, [route, loadDirections]);

  async function saveChanges({ overridePublic } = {}) {
    if (!route) return;

    setSaving(true);

    const publicValue =
      overridePublic !== undefined ? overridePublic : isPublic;

    const payload = {
      ...route,
      public: Boolean(publicValue),
      hazards,
      review: {
        stars,
        terrain,
        comment,
        photo: photoPreview,
        updatedAt: new Date().toISOString(),
      },
    };

    try {
      const res = await fetch(`${API_BASE}/api/routes/${id}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`Server error: ${res.status}`);
      }

      const data = await res.json();

      setRoute(data.route);
      setIsPublic(Boolean(data.route.public));
      setHazards(Array.isArray(data.route.hazards) ? data.route.hazards : []);
      setEditing(false);
      navigate("/app/explore");
    } catch (e) {
      console.error("saveChanges error", e);
      showSnackbar("Failed to save changes", "error");
    } finally {
      setSaving(false);
    }
  }

  function handlePhotoUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  setPhoto(file);

  const reader = new FileReader();
  reader.onloadend = () => {
    setPhotoPreview(reader.result);
  };
  reader.readAsDataURL(file);
}

 async function deleteRoute() {
  try {
    const res = await fetch(`${API_BASE}/api/routes/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });

    if (!res.ok) throw new Error(`Server error: ${res.status}`);

    showSnackbar("Route deleted", "success");
    navigate("/app/explore");
  } catch (e) {
    console.error("deleteRoute error", e);
    showSnackbar("Failed to delete route", "error");
  }
}

  function removeHazard(idx) {
    setHazards((prev) => prev.filter((_, i) => i !== idx));
  }

  function renderEditSection() {
    return (
      <section style={{ marginBottom: 20 }}>
        <h3>Edit basic info</h3>

        <label style={{ display: "block", marginBottom: 6 }}>Title</label>
        <input
          value={route.title || ""}
          onChange={(e) => setRoute({ ...route, title: e.target.value })}
          style={{ marginBottom: 12 }}
        />

        <label style={{ display: "block", marginBottom: 6 }}>Type</label>
        <select
          value={route.type || "👣"}
          onChange={(e) => setRoute({ ...route, type: e.target.value })}
          style={{ marginBottom: 12 }}
        >
          <option>👣</option>
          <option>🚲</option>
          <option>🚗</option>
          <option>🛹</option>
          <option>🛴</option>
          <option>🏃</option>
          <option>♿</option>
        </select>

        <div>
          <button onClick={() => setEditing(false)} style={{ marginRight: 8 }}>
            Cancel
          </button>
          <button onClick={() => saveChanges()} disabled={saving}>
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </section>
    );
  }

  if (loading) {
    return (
      <div className="completed-trail-container">
        <p style={{ color: "var(--muted)" }}>Loading trail…</p>
      </div>
    );
  }

  if (!route) return null;

  const isRecordedRoute = Array.isArray(route?.path) && route.path.length > 1;


  return (
    <div className="completed-trail-container">
      <h1>Completed Trail</h1>

      <div className="completed-trail-top">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ position: "relative", marginBottom: 12 }}>
            <GoogleMap
              mapContainerStyle={MAP_CONTAINER}
              center={DEFAULT_CENTER}
              zoom={14}
              onLoad={(m) => {
                setMap(m);
                mapRef.current = m;
              }}
              onUnmount={() => {
                setMap(null);
                mapRef.current = null;
              }}
              options={{
                fullscreenControl: false,
                streetViewControl: false,
                mapTypeControl: false,
              }}
            >
              

            {isRecordedRoute ? (
              <Polyline
                path={route.path}
                options={{
                  strokeColor: "#e63946",
                  strokeWeight: 4,
                  strokeOpacity: 0.9,
                }}
              />
            ) : (
              directionsResult && (
                <DirectionsRenderer
                  directions={directionsResult}
                  options={{
                    suppressMarkers: false,
                    polylineOptions: {
                      strokeColor: "#0b63d6",
                      strokeWeight: 5,
                      strokeOpacity: 0.85,
                    },
                  }}
                />
              )
            )}


              {hazards.map((h, idx) => (
                <Marker
                  key={idx}
                  position={{ lat: h.lat, lng: h.lng }}
                  icon={getEmojiMarkerIcon(HAZARD_EMOJI[h.type] || "⚠️")}
                  title={h.type}
                  optimized={false}
                />
              ))}
            </GoogleMap>

            {mapLoading && (
              <div
                style={{
                  position: "absolute",
                  top: 10,
                  left: "50%",
                  transform: "translateX(-50%)",
                  background: "rgba(0,0,0,0.6)",
                  color: "#fff",
                  padding: "4px 14px",
                  borderRadius: 20,
                  fontSize: 13,
                  pointerEvents: "none",
                }}
              >
                Loading map…
              </div>
            )}
          </div>

          <div className="completed-card">
            <h2 style={{ marginTop: 0 }}>
              {route.title || `${route.origin} → ${route.destination}`}
            </h2>
            <p style={{ marginTop: 6 }}>
              <strong>Origin:</strong> {route.origin}
              <br />
              <strong>Destination:</strong> {route.destination}
              <br />
              <strong>Distance:</strong> {route.distance}
              <br />
              <strong>Duration:</strong> {route.duration}
              <br />
              <strong>Type:</strong> {route.type}
            </p>
          </div>

          {hazards.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <h3 style={{ marginBottom: 8 }}>Hazards ({hazards.length})</h3>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                {hazards.map((h, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "6px 10px",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      background: "var(--surface)",
                    }}
                  >
                    
                    <span>
                      {HAZARD_EMOJI[h.type] || "⚠️"}{" "}
                      <strong>{h.type}</strong>{" "}
                      <span
                        style={{
                          fontSize: 12,
                          color: "var(--muted)",
                        }}
                      >
                        ({h.lat?.toFixed(4)}, {h.lng?.toFixed(4)})
                      </span>
                    </span>
                    <button
                      onClick={() => removeHazard(idx)}
                      style={{
                        border: "1px solid #c62828",
                        color: "#c62828",
                        background: "transparent",
                        borderRadius: 6,
                        padding: "2px 8px",
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="completed-trail-sidebar">
          <div
            style={{
              marginBottom: 12,
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            <button onClick={() => saveChanges()} disabled={saving} aria-label="Save route">
              {saving ? "Saving..." : "Save"}
            </button>
            {!confirmingDelete ? (
            <button
              onClick={() => setConfirmingDelete(true)}
              className="delete-btn"
            >
              Delete
            </button>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={deleteRoute}
                className="delete-btn"
                style={{ background: "red", color: "white" }}
              >
                Confirm
              </button>

              <button onClick={() => setConfirmingDelete(false)}>
                Cancel
              </button>
            </div>
          )}
          </div>

          <div style={{ marginTop: 12 }}>
            <label style={{ display: "block", marginBottom: 6 }}>Public</label>
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
            />
          </div>

          <div style={{ marginTop: 16 }}>
            <button onClick={() => navigator.clipboard?.writeText(window.location.href)}>
              Copy Link
            </button>
          </div>
        </div>
      </div>

      <section className="review-section" style={{ marginBottom: 20 }}>
        <h3>Review this trail</h3>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", marginBottom: 6 }}>Stars</label>
          <div>
            {[1, 2, 3, 4, 5].map((s) => (
              <button
                key={s}
                className="star-button"
                onClick={() => setStars(s)}
                style={{
                  fontSize: 22,
                  color: s <= stars ? "gold" : "var(--muted)",
                }}
                aria-pressed={s <= stars}
                title={`${s} star${s > 1 ? "s" : ""}`}
              >
                ★
              </button>
            ))}
            <span style={{ marginLeft: 8 }} className="muted">
              {stars}/5
            </span>
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", marginBottom: 6 }}>
            Terrain Level (0–10): {terrain}
          </label>
          <input
            type="range"
            min={0}
            max={10}
            value={terrain}
            onChange={(e) => setTerrain(Number(e.target.value))}
            style={{ width: "100%" }}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
  <label style={{ display: "block", marginBottom: 6 }}>
    Add Route Photo (optional)
  </label>

  <input
    type="file"
    accept="image/*"
    onChange={handlePhotoUpload}
  />

  {photoPreview && (
    <div style={{ marginTop: 10 }}>
      <img
        src={photoPreview}
        alt="Route preview"
        style={{
          width: "100%",
          maxHeight: 200,
          objectFit: "cover",
          borderRadius: 8,
        }}
      />

      <button
        onClick={() => {
          setPhoto(null);
          setPhotoPreview(null);
        }}
        style={{ marginTop: 6 }}
      >
        Remove photo
      </button>
    </div>
  )}
</div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", marginBottom: 6 }}>Comment</label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={5}
            placeholder="Write details about the trail (surface, hazards, highlights...)"
          />
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => saveChanges()} disabled={saving}>
            {saving ? "Saving..." : "Save review"}
          </button>
          <button
            disabled={saving}
            onClick={() => {
              const next = !isPublic;
              setIsPublic(next);
              saveChanges({ overridePublic: next });
            }}
          >
            Toggle Public & Save
          </button>
        </div>
      </section>

      {editing && renderEditSection()}
    </div>
  );
}