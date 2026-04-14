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
const MAX_PHOTOS = 5;

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

function makeLocalPhotoEntries(files) {
  return files.map((file) => ({
    id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
    file,
    previewUrl: URL.createObjectURL(file),
    url: "",
    caption: "",
    uploadedAt: new Date().toISOString(),
  }));
}

const HAZARD_EMOJI = {
  pothole: "🕳️",
  construction: "🚧",
  car: "🚗",
  debris: "🪨",
  accident: "⚠️",
  flood: "🌊",
};

function photoSnapshot(photo) {
  if (photo?.file instanceof File) {
    return {
      kind: "file",
      name: photo.file.name,
      size: photo.file.size,
      type: photo.file.type,
      lastModified: photo.file.lastModified,
      caption: photo.caption || "",
    };
  }

  return {
    kind: "saved",
    url: photo?.url || "",
    caption: photo?.caption || "",
    uploadedAt: photo?.uploadedAt || "",
  };
}

function buildReviewSnapshot({
  stars,
  terrain,
  comment,
  isPublic,
  hazards,
  photos,
}) {
  return JSON.stringify({
    stars: Number(stars) || 0,
    terrain: Number(terrain) || 0,
    comment: comment || "",
    isPublic: Boolean(isPublic),
    hazards: (hazards || []).map((h) => ({
      type: h?.type || "",
      lat: h?.lat ?? null,
      lng: h?.lng ?? null,
    })),
    photos: (photos || []).map(photoSnapshot),
  });
}

function RichTextEditor({ value, onChange, disabled = false }) {
  const editorRef = useRef(null);
  const [active, setActive] = useState({
    bold: false,
    italic: false,
    underline: false,
    ul: false,
    ol: false,
    h1: false,
    h2: false,
    h3: false,
  });
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkText, setLinkText] = useState("");

  const syncActiveState = () => {
    const editor = editorRef.current;
    if (!editor) return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const node = selection.anchorNode;

    if (!editor.contains(node)) return;

    const block =
      document.queryCommandValue("formatBlock")?.toLowerCase?.() || "";

    setActive({
      bold: document.queryCommandState("bold"),
      italic: document.queryCommandState("italic"),
      underline: document.queryCommandState("underline"),
      ul: document.queryCommandState("insertUnorderedList"),
      ol: document.queryCommandState("insertOrderedList"),
      h1: block.includes("h1"),
      h2: block.includes("h2"),
      h3: block.includes("h3"),
    });
  };

  useEffect(() => {
    const el = editorRef.current;
    if (el && el.innerHTML !== (value || "")) {
      el.innerHTML = value || "";
    }
  }, [value]);

  useEffect(() => {
    const handleSelection = () => syncActiveState();
    document.addEventListener("selectionchange", handleSelection);
    return () => document.removeEventListener("selectionchange", handleSelection);
  }, []);

  const syncValue = () => {
    if (!disabled) {
      onChange(editorRef.current?.innerHTML || "");
    }
    syncActiveState();
  };

  const exec = (command, arg = null) => {
    if (disabled) return;
    editorRef.current?.focus();
    document.execCommand(command, false, arg);
    syncValue();
  };

  const formatBlock = (tag) => {
    if (disabled) return;
    editorRef.current?.focus();
    document.execCommand("formatBlock", false, tag);
    syncValue();
  };

  const insertLink = () => {
    if (disabled) return;
    editorRef.current?.focus();
    setShowLinkInput(true);
  };

  const applyLink = () => {
    if (disabled) return;
    if (!linkUrl) return;

    let url = linkUrl.trim();
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = `https://${url}`;
    }

    const text = linkText.trim() || url;

    editorRef.current?.focus();
    document.execCommand(
      "insertHTML",
      false,
      `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`
    );
    setLinkUrl("");
    setLinkText("");
    setShowLinkInput(false);
    syncValue();
  };

  const cancelLink = () => {
    setLinkUrl("");
    setShowLinkInput(false);
    editorRef.current?.focus();
  };

  const btnClass = (isActive) =>
    `toolbar-btn ${isActive ? "toolbar-btn-active" : ""}`;

  return (
    <div className="rich-text-editor">
      <div className="rich-text-toolbar">
        <div className="toolbar-group">
          <button
            type="button"
            className={btnClass(active.bold)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec("bold")}
            disabled={disabled}
          >
            B
          </button>

          <button
            type="button"
            className={btnClass(active.italic)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec("italic")}
            disabled={disabled}
          >
            I
          </button>

          <button
            type="button"
            className={btnClass(active.underline)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec("underline")}
            disabled={disabled}
          >
            U
          </button>
        </div>

        <div className="toolbar-group">
          <button
            type="button"
            className={btnClass(active.ul)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec("insertUnorderedList")}
            disabled={disabled}
          >
            • List
          </button>

          <button
            type="button"
            className={btnClass(active.ol)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec("insertOrderedList")}
            disabled={disabled}
          >
            1. List
          </button>
        </div>

        <div className="toolbar-group">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={insertLink}
            disabled={disabled}
          >
            Link
          </button>
        </div>

        <div className="toolbar-group">
          <button
            type="button"
            className={btnClass(active.h1)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => formatBlock(active.h1 ? "p" : "h1")}
            disabled={disabled}
          >
            H1
          </button>

          <button
            type="button"
            className={btnClass(active.h2)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => formatBlock(active.h2 ? "p" : "h2")}
            disabled={disabled}
          >
            H2
          </button>

          <button
            type="button"
            className={btnClass(active.h3)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => formatBlock(active.h3 ? "p" : "h3")}
            disabled={disabled}
          >
            H3
          </button>
        </div>
      </div>

      {showLinkInput && !disabled && (
        <div
          style={{
            display: "flex",
            gap: 6,
            margin: "10px 0",
            alignItems: "center",
          }}
        >
          <input
            type="text"
            placeholder="Link text (optional)"
            value={linkText}
            onChange={(e) => setLinkText(e.target.value)}
            style={{ flex: 1 }}
          />
          <input
            type="text"
            placeholder="Enter URL..."
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            style={{ flex: 1 }}
          />
          <button type="button" onClick={applyLink}>
            Add
          </button>
          <button type="button" onClick={cancelLink}>
            Cancel
          </button>
        </div>
      )}

      <div
        ref={editorRef}
        className="rich-text-area"
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={syncValue}
        onKeyUp={syncActiveState}
        onMouseUp={syncActiveState}
        onFocus={syncActiveState}
        style={disabled ? { pointerEvents: "none", opacity: 0.7 } : undefined}
      />
    </div>
  );
}

export default function CompletedTrail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showSnackbar } = useSnackbar();

  const mapRef = useRef(null);
  const photoInputRef = useRef(null);

  const [route, setRoute] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [mapLoading, setMapLoading] = useState(false);
  const [directionsResult, setDirectionsResult] = useState(null);

  const [stars, setStars] = useState(0);
  const [terrain, setTerrain] = useState(5);
  const [isPublic, setIsPublic] = useState(false);
  const [comment, setComment] = useState("");

  const [hazards, setHazards] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isOwner, setIsOwner] = useState(false);

  const [saveStatus, setSaveStatus] = useState("saved");
  const [lastSavedTime, setLastSavedTime] = useState(null);

  const autosaveTimerRef = useRef(null);
  const lastSavedSnapshotRef = useRef("");
  const isHydratingRef = useRef(true);
  const saveInProgressRef = useRef(false);
  const pendingAutosaveRef = useRef(false);

  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    async function fetchRoute() {
      setLoading(true);
      isHydratingRef.current = true;

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
        setPhotos(
          Array.isArray(found.photos)
            ? found.photos.map((p, index) => ({
                id: p.url || `saved-${index}`,
                url: p.url,
                previewUrl: p.url,
                caption: p.caption || "",
                uploadedAt: p.uploadedAt,
              }))
            : []
        );
        setStars(found.review?.stars ?? 0);
        setTerrain(found.review?.terrain ?? 5);
        setIsPublic(Boolean(found.public));
        setComment(found.review?.comment || "");

        // 1. Get identifiers from localStorage
const storedUserRaw = localStorage.getItem("user") || localStorage.getItem("currentUser");
let storedUser = null;
try {
  storedUser = storedUserRaw ? JSON.parse(storedUserRaw) : null;
} catch {
  storedUser = null;
}

// Current User Info
let currentUserId = storedUser?._id || storedUser?.id || localStorage.getItem("userId");
let currentHandle = localStorage.getItem("username") || storedUser?.username || storedUser?.handle;

// 2. Extract Route Owner Info from the 'found' object
// Based on your debug log, the field is 'authorUsername'
const routeOwnerId = found.owner?._id || found.owner?.id || (typeof found.owner === 'string' ? found.owner : null);
const routeOwnerHandle = found.authorUsername || found.owner?.username || found.owner?.handle || found.postedBy;

// 3. Perform the Match
const normalize = (str) => String(str || "").toLowerCase().replace(/^@/, "").trim();

const isIdMatch = currentUserId && routeOwnerId && String(currentUserId) === String(routeOwnerId);
const isHandleMatch = currentHandle && routeOwnerHandle && normalize(currentHandle) === normalize(routeOwnerHandle);

const ownerMatch = !!(isIdMatch || isHandleMatch);

// Debugging log to confirm it works now
console.log("Ownership Match Found:", { 
  current: currentHandle, 
  owner: routeOwnerHandle, 
  match: ownerMatch 
});

setIsOwner(ownerMatch);

        lastSavedSnapshotRef.current = buildReviewSnapshot({
          stars: found.review?.stars ?? 0,
          terrain: found.review?.terrain ?? 5,
          comment: found.review?.comment || "",
          isPublic: Boolean(found.public),
          hazards: Array.isArray(found.hazards) ? found.hazards : [],
          photos: Array.isArray(found.photos)
            ? found.photos.map((p) => ({
                url: p.url,
                caption: p.caption || "",
                uploadedAt: p.uploadedAt,
              }))
            : [],
        });

        setSaveStatus("saved");
        setLastSavedTime(new Date());
      } catch (e) {
        console.error("fetchRoute error", e);
        navigate("/app/library", { replace: true });
      } finally {
        isHydratingRef.current = false;
        setLoading(false);
      }
    }

    fetchRoute();
  }, [id, navigate]);

  useEffect(() => {
    return () => {
      photos.forEach((photo) => {
        if (photo.previewUrl?.startsWith("blob:")) {
          URL.revokeObjectURL(photo.previewUrl);
        }
      });
    };
  }, [photos]);

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

  useEffect(() => {
    if (!route || loading || !isOwner || isHydratingRef.current) return;

    const currentSnapshot = buildReviewSnapshot({
      stars,
      terrain,
      comment,
      isPublic,
      hazards,
      photos,
    });

    if (currentSnapshot === lastSavedSnapshotRef.current) return;

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }

    setSaveStatus("saving");

    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null;
      pendingAutosaveRef.current = true;
      saveChanges({ silent: true }).catch(() => {});
    }, 800);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [stars, terrain, comment, isPublic, hazards, photos, route, loading, isOwner]);

  function updatePhotoCaption(index, caption) {
    if (!isOwner) return;
    setPhotos((prev) =>
      prev.map((p, i) => (i === index ? { ...p, caption } : p))
    );
  }

  function removePhoto(index) {
    if (!isOwner) return;

    setPhotos((prev) => {
      const target = prev[index];
      if (target?.previewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((_, i) => i !== index);
    });

    if (photoInputRef.current) {
      photoInputRef.current.value = "";
    }
  }

  async function handlePhotoSelection(e) {
    if (!isOwner) return;

    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

    try {
      if (photos.length + files.length > MAX_PHOTOS) {
        throw new Error(`You can attach at most ${MAX_PHOTOS} photos.`);
      }

      for (const file of files) {
        if (!allowed.includes(file.type)) {
          throw new Error(`"${file.name}" must be jpg, png, or webp.`);
        }
      }

      const newEntries = makeLocalPhotoEntries(files);
      setPhotos((prev) => [...prev, ...newEntries]);
      showSnackbar("Photos added", "success");
    } catch (err) {
      console.error("Photo selection failed:", err);
      showSnackbar(err.message || "Could not add photos.", "error");
    } finally {
      if (photoInputRef.current) {
        photoInputRef.current.value = "";
      }
    }
  }

  async function uploadPendingPhotos(photoEntries) {
    const pending = photoEntries.filter((p) => p.file instanceof File);

    if (!pending.length) {
      return photoEntries.map(({ file, previewUrl, id, ...rest }) => rest);
    }

    const formData = new FormData();
    pending.forEach((photo) => {
      formData.append("photos", photo.file);
    });
    formData.append(
      "captions",
      JSON.stringify(pending.map((photo) => photo.caption || ""))
    );

    const token = localStorage.getItem("token");
    const res = await fetch(`${API_BASE}/api/uploads/route-photos`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || `Upload failed: ${res.status}`);
    }

    const data = await res.json();
    const uploadedPhotos = Array.isArray(data.photos) ? data.photos : [];

    let uploadIndex = 0;
    return photoEntries.map((photo) => {
      if (photo.file instanceof File) {
        const uploaded = uploadedPhotos[uploadIndex++];
        return {
          url: uploaded?.url || "",
          caption: photo.caption || uploaded?.caption || "",
          uploadedAt:
            uploaded?.uploadedAt || photo.uploadedAt || new Date().toISOString(),
        };
      }
      return {
        url: photo.url,
        caption: photo.caption || "",
        uploadedAt: photo.uploadedAt || new Date().toISOString(),
      };
    });
  }

  async function saveChanges({
    overridePublic,
    redirectToExplore = false,
    silent = false,
  } = {}) {
    if (!route || !isOwner) {
      if (!silent) {
        showSnackbar("You cannot edit this review.", "error");
      }
      return;
    }

    if (saveInProgressRef.current) {
      pendingAutosaveRef.current = true;
      return;
    }

    saveInProgressRef.current = true;
    setSaving(true);
    setSaveStatus("saving");

    const publicValue =
      overridePublic !== undefined ? overridePublic : isPublic;

    try {
      const uploadedPhotos = await uploadPendingPhotos(photos);

      const payload = {
        ...route,
        public: Boolean(publicValue),
        hazards,
        photos: uploadedPhotos,
        review: {
          stars,
          terrain,
          comment,
          updatedAt: new Date().toISOString(),
        },
      };

      const res = await fetch(`${API_BASE}/api/routes/${id}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || `Server error: ${res.status}`);
      }

      const data = await res.json();

      setRoute(data.route);
      setIsPublic(Boolean(data.route.public));
      setHazards(Array.isArray(data.route.hazards) ? data.route.hazards : []);
      setPhotos(
        Array.isArray(data.route.photos)
          ? data.route.photos.map((p, index) => ({
              id: p.url || `saved-${index}`,
              url: p.url,
              previewUrl: p.url,
              caption: p.caption || "",
              uploadedAt: p.uploadedAt,
            }))
          : []
      );
      lastSavedSnapshotRef.current = buildReviewSnapshot({
        stars,
        terrain,
        comment,
        isPublic: Boolean(data.route.public),
        hazards: Array.isArray(data.route.hazards) ? data.route.hazards : [],
        photos: Array.isArray(data.route.photos)
          ? data.route.photos.map((p) => ({
              url: p.url,
              caption: p.caption || "",
              uploadedAt: p.uploadedAt,
            }))
          : [],
      });

      setSaveStatus("saved");
      setLastSavedTime(new Date());

      if (!silent) {
        showSnackbar("Route updated", "success");
      }

      if (redirectToExplore && data.route.public) {
        navigate("/app/explore");
      }
    } catch (e) {
      console.error("saveChanges error", e);
      showSnackbar(e.message || "Failed to save changes", "error");
    } finally {
      saveInProgressRef.current = false;
      setSaving(false);

      if (pendingAutosaveRef.current) {
        pendingAutosaveRef.current = false;
        saveChanges({ silent: true }).catch(() => {});
      }
    }
  }

  async function deleteRoute() {
    if (!isOwner) {
      showSnackbar("You cannot delete this route.", "error");
      return;
    }

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
    if (!isOwner) return;
    setHazards((prev) => prev.filter((_, i) => i !== idx));
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
  const canEdit = isOwner;

  if (!canEdit) {
    return (
      <div className="completed-trail-container">
        <h1>Completed Trail</h1>

        <div className="completed-trail-top">
          <div className="completed-trail-main">
            <div style={{ position: "relative", marginBottom: 12 }}>
              <GoogleMap
                mapContainerStyle={MAP_CONTAINER}
                center={DEFAULT_CENTER}
                zoom={14}
                onLoad={(m) => {
                  mapRef.current = m;
                }}
                onUnmount={() => {
                  mapRef.current = null;
                }}
                options={{
                  fullscreenControl: false,
                  streetViewControl: false,
                  mapTypeControl: false,
                  gestureHandling: "none",
                  scrollwheel: false,
                  draggable: false,
                  zoomControl: false,
                  clickableIcons: false,
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

              {mapLoading && <div className="map-loading-pill">Loading map…</div>}
            </div>

            <div className="completed-card">
              <h2 style={{ marginTop: 0 }}>
                {route.title || `${route.origin} → ${route.destination}`}
              </h2>

              <p style={{ marginTop: 6 }}>
                <strong>Transportation:</strong> {route.type}
                <br />
                <strong>Origin:</strong> {route.origin}
                <br />
                <strong>Destination:</strong> {route.destination}
                <br />
                <strong>Distance:</strong> {route.distance}
                <br />
                <strong>Duration:</strong> {route.duration}
              </p>
            </div>

            {hazards.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <h3 style={{ marginBottom: 8 }}>Hazards ({hazards.length})</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {hazards.map((h, idx) => (
                    <div key={idx} className="hazard-row">
                      <span>
                        {HAZARD_EMOJI[h.type] || "⚠️"}{" "}
                        <strong>{h.type}</strong>{" "}
                        <span className="muted-text">
                          ({h.lat?.toFixed(4)}, {h.lng?.toFixed(4)})
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <section className="review-section">
              <h3>Trail Review</h3>

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", marginBottom: 6 }}>Stars</label>
                <div style={{ fontSize: 22, lineHeight: 1 }}>
                  {"★".repeat(stars)}
                  {"☆".repeat(5 - stars)}
                  <span style={{ marginLeft: 8, fontSize: 14 }} className="muted">
                    {stars}/5
                  </span>
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", marginBottom: 6 }}>
                  Terrain Level (0–10): {terrain}
                </label>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", marginBottom: 6 }}>Comment</label>
                <div
                  className="route-comment-preview"
                  dangerouslySetInnerHTML={{
                    __html: comment || "No comment added yet.",
                  }}
                />
              </div>

              <div style={{ marginBottom: 12 }}>
                <div
                  style={{
                    marginBottom: 8,
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <h3 style={{ margin: 0 }}>Trail Photos</h3>
                  <span style={{ fontSize: 13, color: "var(--muted)" }}>
                    {photos.length}/{MAX_PHOTOS} attached
                  </span>
                </div>

                {photos.length === 0 ? (
                  <div style={{ marginTop: 10, color: "var(--muted)" }}>
                    No photos added yet.
                  </div>
                ) : (
                  <div className="photo-grid">
                    {photos.map((photo, index) => (
                      <div key={photo.id || photo.url || index} className="photo-card">
                        <img
                          src={photo.previewUrl || photo.url}
                          alt={photo.caption || `Trail photo ${index + 1}`}
                          className="photo-image"
                        />
                        {photo.caption ? (
                          <div
                            style={{
                              marginTop: 8,
                              fontSize: 13,
                              color: "var(--muted)",
                            }}
                          >
                            {photo.caption}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="completed-trail-container">
      <h1>Completed Trail</h1>

      <div className="completed-trail-top">
        <div className="completed-trail-main">
          <div style={{ position: "relative", marginBottom: 12 }}>
            <GoogleMap
              mapContainerStyle={MAP_CONTAINER}
              center={DEFAULT_CENTER}
              zoom={14}
              onLoad={(m) => {
                mapRef.current = m;
              }}
              onUnmount={() => {
                mapRef.current = null;
              }}
              options={{
                fullscreenControl: false,
                streetViewControl: false,
                mapTypeControl: false,
                gestureHandling: canEdit ? "greedy" : "none",
                scrollwheel: canEdit,
                draggable: canEdit,
                zoomControl: canEdit,
                clickableIcons: false,
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

            {mapLoading && <div className="map-loading-pill">Loading map…</div>}
          </div>

          <div className="completed-card">
            <h2 style={{ marginTop: 0 }}>
              {route.title || `${route.origin} → ${route.destination}`}
            </h2>

            <p style={{ marginTop: 6 }}>
              <strong>Transportation:</strong> {route.type}
              <br />
              <strong>Origin:</strong> {route.origin}
              <br />
              <strong>Destination:</strong> {route.destination}
              <br />
              <strong>Distance:</strong> {route.distance}
              <br />
              <strong>Duration:</strong> {route.duration}
            </p>
          </div>

          {hazards.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <h3 style={{ marginBottom: 8 }}>Hazards ({hazards.length})</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {hazards.map((h, idx) => (
                  <div key={idx} className="hazard-row">
                    <span>
                      {HAZARD_EMOJI[h.type] || "⚠️"}{" "}
                      <strong>{h.type}</strong>{" "}
                      <span className="muted-text">
                        ({h.lat?.toFixed(4)}, {h.lng?.toFixed(4)})
                      </span>
                    </span>
                    <button
                      onClick={() => removeHazard(idx)}
                      className="hazard-remove-btn"
                      disabled={!canEdit}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <section className="review-section">
            <h3>Review this trail</h3>

            <div
              style={{
                marginBottom: 10,
                fontSize: 14,
                fontWeight: 500,
                color: saveStatus === "saving" ? "#888" : "green",
              }}
            >
              {saveStatus === "saving"
                ? "Saving..."
                : lastSavedTime
                ? "✓ Saved just now"
                : "✓ Saved"}
            </div>

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
                      opacity: 1,
                      cursor: "pointer",
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
                style={{ "--fill": `${terrain * 10}%` }}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", marginBottom: 6 }}>Comment</label>
              <RichTextEditor
                value={comment}
                onChange={setComment}
                disabled={false}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <div
                style={{
                  marginBottom: 8,
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <h3 style={{ margin: 0 }}>Trail Photos</h3>
                <span style={{ fontSize: 13, color: "var(--muted)" }}>
                  {photos.length}/{MAX_PHOTOS} attached
                </span>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  onChange={handlePhotoSelection}
                />
                <span style={{ fontSize: 13, color: "var(--muted)" }}>
                  jpg, png, webp
                </span>
              </div>

              {photos.length === 0 ? (
                <div style={{ marginTop: 10, color: "var(--muted)" }}>
                  No photos added yet.
                </div>
              ) : (
                <div className="photo-grid">
                  {photos.map((photo, index) => (
                    <div
                      key={photo.id || photo.url || index}
                      className="photo-card"
                    >
                      <img
                        src={photo.previewUrl || photo.url}
                        alt={photo.caption || `Trail photo ${index + 1}`}
                        className="photo-image"
                      />

                      <input
                        type="text"
                        placeholder="Optional caption"
                        value={photo.caption || ""}
                        onChange={(e) => updatePhotoCaption(index, e.target.value)}
                        className="photo-caption-input"
                      />

                      <button
                        onClick={() => removePhoto(index)}
                        className="photo-remove-btn"
                      >
                        Remove Photo
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>

        {canEdit && (
          <div className="completed-trail-sidebar">
            <div className="sidebar-actions">
              {!confirmingDelete ? (
                <button
                  onClick={() => setConfirmingDelete(true)}
                  className="delete-btn"
                >
                  Delete
                </button>
              ) : (
                <>
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
                </>
              )}
            </div>

            <div className="public-toggle-row">
              <label htmlFor="public-toggle">Public</label>
              <label className="toggle-switch">
                <input
                  id="public-toggle"
                  type="checkbox"
                  checked={isPublic}
                  onChange={async (e) => {
                    const nextValue = e.target.checked;
                    setIsPublic(nextValue);
                    await saveChanges({ overridePublic: nextValue });
                  }}
                />
                <span className="slider"></span>
              </label>
            </div>

            <div style={{ marginTop: 16 }}>
              <button
                onClick={() => navigator.clipboard?.writeText(window.location.href)}
              >
                Copy Link
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}