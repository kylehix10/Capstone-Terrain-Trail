// src/pages/CompletedTrail.js
import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import "./CompletedTrail.css";


const LOCAL_STORAGE_KEY = "savedRoutes_v1";

function readSavedRoutes() {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error("readSavedRoutes error", e);
    return [];
  }
}

function writeSavedRoutes(routes) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(routes));
  } catch (e) {
    console.error("writeSavedRoutes error", e);
  }
}

export default function CompletedTrail() {
  const { id } = useParams(); // expects route like /app/completed/:id
  const navigate = useNavigate();

  const [route, setRoute] = useState(null);
  const [editing, setEditing] = useState(false);

  // review fields
  const [stars, setStars] = useState(0); // 0-5
  const [terrain, setTerrain] = useState(5); // 0-10
  const [isPublic, setIsPublic] = useState(false);
  const [comment, setComment] = useState("");

  useEffect(() => {
    const routes = readSavedRoutes();
    const found = routes.find((r) => r.id === id);
    if (!found) {
      // send back to library
      navigate("/app/library", { replace: true });
      return;
    }
    setRoute(found);

    // populate review fields if present
    setStars(found.review?.stars || 0);
    setTerrain(found.review?.terrain ?? 5);
    setIsPublic(Boolean(found.public));
    setComment(found.review?.comment || "");
  }, [id, navigate]);

  if (!route) return null;

function saveChanges() {
  const routes = readSavedRoutes();
  const idx = routes.findIndex((r) => r.id === id);
  if (idx === -1) return;

  const updated = {
    ...route,
    public: Boolean(isPublic),
    review: {
      stars,
      terrain,
      comment,
      updatedAt: new Date().toISOString(),
    },
    updatedAt: new Date().toISOString(),
  };

  routes[idx] = updated;
  writeSavedRoutes(routes);
  setRoute(updated);
  setEditing(false);

  navigate("/app/explore");
}

function deleteRoute() {
  if (!window.confirm("Delete this route? This cannot be undone.")) return;

  const routes = readSavedRoutes().filter((r) => r.id !== id);
  writeSavedRoutes(routes);

  navigate("/app/explore");
}

  // remove route from localStorage without navigation (utility)
  function removeRouteOnly() {
    const routes = readSavedRoutes().filter((r) => r.id !== id);
    writeSavedRoutes(routes);
  }

  // lightweight UI for editing basic fields
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
          <button onClick={saveChanges}>Save changes</button>
        </div>
      </section>
    );
  }

  return (
    <div className="completed-trail-container">
      <h1>Completed Trail</h1>

      <div className="completed-trail-top">
        {/* left/main content */}
        <div className="completed-card" style={{ flex: 1 }}>
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

        {/* sidebar */}
        <div className="completed-trail-sidebar">

          <div style={{ marginBottom: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button onClick={saveChanges} aria-label="Save route">
              Save
            </button>

            <button onClick={deleteRoute} className="delete-btn" aria-label="Delete route">
              Delete
            </button>
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
            <button
              onClick={() => {
                // quick actions
                navigator.clipboard
                  .writeText(window.location.href);
              }}
            >
              Copy Link
            </button>
          </div>
        </div>
      </div>
      
      {/* review */}
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
          <label style={{ display: "block", marginBottom: 6 }}>Comment</label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={5}
            placeholder="Write details about the trail (surface, hazards, highlights...)"
          />
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={saveChanges}>Save review</button>
          <button
            onClick={() => {
              const next = !isPublic;
              setIsPublic(next);
              // let state update then save
              setTimeout(saveChanges, 0);
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
