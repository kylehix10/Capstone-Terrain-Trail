import express from "express";
import dotenv from "dotenv";
import mongoose from "mongoose";
import cors from "cors";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import NodeCache from "node-cache";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import streamifier from "streamifier";


dotenv.config();

cloudinary.config({
  cloud_name: (process.env.CLOUDINARY_CLOUD_NAME || "").trim(),
  api_key: (process.env.CLOUDINARY_API_KEY || "").trim(),
  api_secret: (process.env.CLOUDINARY_API_SECRET || "").trim(),
});

const app = express();

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);

    const isLocal = origin === "http://localhost:3000";
    const isVercel = /\.vercel\.app$/.test(new URL(origin).hostname);

    if (isLocal || isVercel) return cb(null, true);

    return cb(new Error(`CORS blocked: ${origin}`));
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  maxAge: 86400,
}));

app.use(express.json({ limit: "2mb" }));

const cache = new NodeCache({ stdTTL: 60, checkperiod: 120 });

app.get("/", (req, res) => {
  res.send("API is running");
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", version: "1.6" });
});

const userSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    username: { type: String, trim: true, unique: true, sparse: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true }
);

const User = mongoose.models.User || mongoose.model("User", userSchema);


const routePhotoSchema = new mongoose.Schema(
  {
    url: { type: String, required: true, trim: true },
    caption: { type: String, default: "", trim: true },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

/**
 *
 * Route schema - mirrors the shape of the frontend writes to localStroage
 * `clientId` preserves the original "r_<timestamp>" so it can be match records during a localStorage -> server migration if needed
 */
const routeSchema = new mongoose.Schema(
  {
    clientId: { type: String, default: null },
    sourceRouteId:  {type: String, default: null },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    title: { type: String, trim: true, default: "" },
    origin: { type: String, trim: true, default: "" },
    destination: { type: String, trim: true, default: "" },
    distance: { type: String, default: "" },
    duration: { type: String, default: "" },
    type: { type: String, default: "👣" },
    tags: { type: [String], default: [] },
    public: { type: Boolean, default: false },
    review: {
      stars: { type: Number, min: 0, max: 5, default: 0 },
      terrain: { type: Number, min: 0, max: 10, default: 5 },
      comment: { type: String, default: "" },
      updatedAt: { type: Date },
    },
    votes: {
      score: { type: Number, default: 0 },
      upvoters: {
        type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
        default: [],
      },
      downvoters: {
        type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
        default: [],
      },
    },
    // GPS-tracked polyline points
    path: { type: [{ lat: Number, lng: Number }], default: [] },
    // Directions API geometry (used by explore hover preview)
    encodedPolyline: { type: String, default: null },
    bounds: {
      north: Number,
      east: Number,
      south: Number,
      west: Number,
    },
    hazards: {
      type: [{
        lat: { type: Number },
        lng: { type: Number },
        type: { type: String },
        createdAt: { type: String },
      }],
      default: [],
    },
    photos: {
      type: [routePhotoSchema],
      default: [],
      validate: {
        validator(arr) {
          return Array.isArray(arr) && arr.length <= 5;
        },
        message: "A route can have at most 5 photos.",
      },
    },
  },
  { timestamps: true }
);

const Route = mongoose.models.Route || mongoose.model("Route", routeSchema);

// HELPERS

/* Auth middleware for settings routes */

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ message: "Missing token" });
  }

  try {
    const payload = jwt.verify(
      token,
      process.env.JWT_SECRET || "dev"
    );
    req.userId = payload.sub;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

function normalizeRouteType(type) {
  const allowed = ["👣", "🚲", "🚗", "🛹", "🏃", "🛴"];
  return allowed.includes(type) ? type : "👣";
}

/**
 * Safely coerces hazards to an array of objects regardless of whether
 * the client sent a real array, a JSON-stringified array, or nothing.
 */
function parseHazards(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function isAllowedPhotoUrl(url) {
  const normalized = String(url || "").trim().toLowerCase();
  return normalized.startsWith("http://") || normalized.startsWith("https://");
}

function parsePhotos(raw) {
  if (!raw) return [];
  let arr = raw;

  if (typeof raw === "string") {
    try {
      arr = JSON.parse(raw);
    } catch {
      arr = [];
    }
  }

  if (!Array.isArray(arr)) return [];

  const cleaned = arr
    .filter((p) => p && typeof p.url === "string" && p.url.trim())
    .map((p) => ({
      url: String(p.url).trim(),
      caption: typeof p.caption === "string" ? p.caption.trim() : "",
      uploadedAt: p.uploadedAt ? new Date(p.uploadedAt) : new Date(),
    }));

  if (cleaned.length > 5) {
    throw new Error("You can attach at most 5 photos to a route.");
  }

  for (const photo of cleaned) {
    if (!isAllowedPhotoUrl(photo.url)) {
      throw new Error("Only jpg, png, and webp photo URLs are allowed.");
    }
  }

  return cleaned;
}


/** Maps a client-side route object -> Mongoose document fields */
function buildRouteDoc(r, ownerId) {
  return {
    clientId: r.id || r.clientId || null,
    sourceRouteId: r.sourceRouteId || null,
    owner: ownerId,
    title: r.title || "",
    origin: r.origin || "",
    destination: r.destination || "",
    distance: r.distance || "",
    duration: r.duration || "",
    type: normalizeRouteType(r.type || "👣"),
    tags: Array.isArray(r.tags) ? r.tags : [],
    public: Boolean(r.public),
    review: r.review
      ? {
        stars: Number(r.review.stars) || 0,
        terrain: r.review.terrain != null
          ? Number(r.review.terrain)
          : 5,
        comment: r.review.comment || "",
        updatedAt: r.review.updatedAt
          ? new Date(r.review.updatedAt)
          : new Date(),
      }
      : undefined,
    path: Array.isArray(r.path) ? r.path : [],
    encodedPolyline: r.encodedPolyline || null,
    bounds: r.bounds || undefined,
    hazards: parseHazards(r.hazards),
    photos: parsePhotos(r.photos),
  };
}

/**
 * Converts a Mongoose lean doc -> the shape the frontend expects.
 * Renames _id -> id to stay compatible with the localStorage schema.
 */
function normalizeRoute(doc, userId = null) {
  const { _id, __v, votes, owner, photos, type, ...rest } = doc;

  let userVote = 0;

  if (userId && votes) {
    const uid = String(userId);

    const hasUpvoted = Array.isArray(votes.upvoters) &&
      votes.upvoters.some((id) => String(id) === uid);

    const hasDownvoted = Array.isArray(votes.downvoters) &&
      votes.downvoters.some((id) => String(id) === uid);

    if (hasUpvoted) userVote = 1;
    else if (hasDownvoted) userVote = -1;
  }

  const ownerObj = owner && typeof owner === "object" ? owner : null;

  return {
    ...rest,
    id: String(_id),
    type: normalizeRouteType(type),
    photos: Array.isArray(photos) ? photos : [],
    owner: ownerObj?._id ? String(ownerObj._id) : String(owner || ""),
    authorName: ownerObj?.name || "",
    authorUsername: ownerObj?.username || "",
    votes: {
      score: votes?.score || 0,
      upvoteCount: votes?.upvoters?.length || 0,
      downvoteCount: votes?.downvoters?.length || 0,
      userVote,
    },
  };
}

function uploadBufferToCloudinary(buffer) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        cloud_name: (process.env.CLOUDINARY_CLOUD_NAME || "").trim(),
        api_key: (process.env.CLOUDINARY_API_KEY || "").trim(),
        api_secret: (process.env.CLOUDINARY_API_SECRET || "").trim(),
        folder: "colatrails/routes",
        resource_type: "image",
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );

    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 5,
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowed.includes(file.mimetype)) {
      cb(new Error("Only jpg, png, and webp files are allowed."));
      return;
    }
    cb(null, true);
  },
});

/* ===== Auth routes ===== */
app.post("/api/signup", async (req, res) => {
  try {
    const { name, username, email, password } = req.body || {};

    const nameNorm = typeof name === "string" ? name.trim() : "";
    const usernameNorm = typeof username === "string"
      ? username.trim()
      : "";
    const emailNorm = typeof email === "string"
      ? email.trim().toLowerCase()
      : "";
    const passwordNorm = typeof password === "string" ? password : "";

    if (!emailNorm || !passwordNorm) {
      return res.status(400).json({
        message: "Email and password required",
      });
    }
    if (passwordNorm.length < 6) {
      return res.status(400).json({
        message: "Password must be at least 6 characters",
      });
    }
    if (!usernameNorm) {
      return res.status(400).json({ message: "Username is required" });
    }

    // Check for unique username and email
    const existingUsername = await User.findOne({
      username: usernameNorm,
    }).select("_id");

    if (existingUsername) {
      return res.status(409).json({ message: "Username already in use" });
    }

    const existingEmail = await User.findOne({
      email: emailNorm,
    }).select("_id");

    if (existingEmail) {
      return res.status(409).json({ message: "Email already in use" });
    }

    const passwordHash = await bcrypt.hash(passwordNorm, 10);

    await User.create({
      name: nameNorm,
      username: usernameNorm,
      email: emailNorm,
      passwordHash,
    });

    return res.status(201).json({ message: "User created" });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ message: "Duplicate field" });
    }
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password required",
      });
    }

    const emailNorm = String(email).trim().toLowerCase();
    const passwordNorm = String(password);

    const user = await User.findOne({ email: emailNorm });
    if (!user) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    const ok = await bcrypt.compare(passwordNorm, user.passwordHash);
    if (!ok) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    const token = jwt.sign(
      { sub: user._id, email: user.email },
      process.env.JWT_SECRET || "dev",
      { expiresIn: "7d" }
    );

    return res.json({ message: "Logged in", token });
  } catch (e) {
    return res.status(500).json({ message: "Server error" });
  }
});

/* ==== Settings/ Account routes ==== */

/**
 * GET /api/account
 * populate fields with current user data
 */
app.get("/api/account", requireAuth, async (req, res) => {
  try {
    const key = `account:${req.userId}`;
    const cached = cache.get(key);

    if (cached) {
      return res.json({ user: cached, source: "cache" });
    }

    const user = await User.findById(req.userId)
      .select("name username email")
      .lean();

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    cache.set(key, user);
    res.json({ user, source: "db" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * PUT /api/account
 * Body can contain: name, username, email, currentPassword, newPassword
 */
app.put("/api/account", requireAuth, async (req, res) => {
  try {
    const {
      name,
      username,
      email,
      currentPassword,
      newPassword,
    } = req.body || {};

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const trimmedEmail = typeof email === "string"
      ? email.trim().toLowerCase()
      : undefined;

    const isEmailChanging =
      typeof trimmedEmail === "string" && trimmedEmail !== user.email;

    const isPasswordChanging = !!newPassword;

    const trimmedUsername = typeof username === "string"
      ? username.trim()
      : undefined;

    const isUsernameChanging =
      typeof trimmedUsername === "string" &&
      trimmedUsername.length > 0 &&
      trimmedUsername !== (user.username || "");

    // Require current password for email or password changes
    if ((isEmailChanging || isPasswordChanging) && !currentPassword) {
      return res.status(400).json({
        message: "Current password is required to change email or password",
      });
    }

    // Verify password if needed
    if (isEmailChanging || isPasswordChanging) {
      const ok = await bcrypt.compare(
        currentPassword || "",
        user.passwordHash
      );
      if (!ok) {
        return res.status(400).json({
          message: "Incorrect current password",
        });
      }
    }

    // Update name
    if (typeof name === "string") {
      user.name = name.trim();
    }

    // Update username (no password required, but unique + validation)
    if (isUsernameChanging) {
      if (!/^[a-zA-Z0-9][a-zA-Z0-9_]{2,19}$/.test(trimmedUsername)) {
        return res.status(400).json({
          message:
            "Username must be 3–20 characters and contain only letters, " +
            "numbers, and underscores.",
        });
      }

      const existing = await User.findOne({
        username: trimmedUsername,
        _id: { $ne: user._id },
      }).select("_id");

      if (existing) {
        return res.status(409).json({ message: "Username already in use" });
      }

      user.username = trimmedUsername;
    }

    // Update email
    if (isEmailChanging) {
      user.email = trimmedEmail;
    }

    // Update password
    if (newPassword) {
      if (newPassword.length < 6) {
        return res.status(400).json({
          message: "New password must be at least 6 characters",
        });
      }
      user.passwordHash = await bcrypt.hash(newPassword, 10);
    }

    await user.save();

    // clear cached account data for this user
    cache.del(`account:${req.userId}`);

    res.json({
      message: "Changes saved",
      user: {
        name: user.name,
        username: user.username,
        email: user.email,
      },
    });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({
        message: "Email or username already in use",
      });
    }
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * DELETE /api/account
 * Permanently deletes the authenticated user's account.
 * This frees email/username for reuse because the document is removed.
 */
app.delete("/api/account", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("_id");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    await Route.deleteMany({ owner: req.userId });
    await User.deleteOne({ _id: req.userId });

    // clear cached account data for this user
    cache.del(`account:${req.userId}`);

    return res.json({ message: "Account deleted" });
  } catch (err) {
    return res.status(500).json({ message: "Server error" });
  }
});

/* ==== Photo upload ==== */

app.post(
  "/api/uploads/route-photos",
  requireAuth,
  upload.array("photos", 5),
  async (req, res, next) => {
    try {
      const files = Array.isArray(req.files) ? req.files : [];
      const captionsRaw = req.body?.captions;

      let captions = [];
      if (typeof captionsRaw === "string") {
        try {
          captions = JSON.parse(captionsRaw);
        } catch {
          captions = [];
        }
      } else if (Array.isArray(captionsRaw)) {
        captions = captionsRaw;
      }

      const photos = await Promise.all(
        files.map(async (file, index) => {
          const result = await uploadBufferToCloudinary(file.buffer);

          return {
            url: result.secure_url,
            caption:
              typeof captions[index] === "string" ? captions[index].trim() : "",
            uploadedAt: new Date(),
          };
        })
      );

      res.status(201).json({ photos });
    } catch (err) {
      next(err);
    }
  }
);

// ROUTES API

/**
 * GET /api/routes
 * All routes owned by the authenticated user, newest-first
 */
app.get("/api/routes", requireAuth, async (req, res) => {
  try {
    const routes = await Route.find({ owner: req.userId })
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      routes: routes.map((r) => normalizeRoute(r, req.userId)),
    });
  } catch (err) {
    console.error("GET /api/routes error", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /api/routes/public
 * All public routes - mirrors what Explore reads
 */
app.get("/api/routes/public", requireAuth, async (req, res) => {
  try {
    const routes = await Route.find({ public: true })
      .populate("owner", "name username")
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      routes: routes.map((r) => normalizeRoute(r, req.userId)),
    });
  } catch (err) {
    console.error("GET /api/routes/public error", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /api/routes/:id
 * Single route by MongoDB _id.
 * Allows the owner to view their own route and authenticated users to
 * see a public route (e.g. via a shared link inside the app).
 */
app.get("/api/routes/:id", requireAuth, async (req, res) => {
  try {
    const route = await Route.findById(req.params.id)
      .populate("owner", "name username")
      .lean();

    if (!route) {
      return res.status(404).json({ message: "Route not found" });
    }

    const isOwner = req.userId &&
      String(route.owner?._id || route.owner) === String(req.userId);
    const isPublic = route.public;

    if (!isOwner && !isPublic) {
      return res.status(403).json({ message: "Forbidden" });
    }

    res.json({ route: normalizeRoute(route, req.userId) });
  } catch (err) {
    console.error("GET /api/routes/:id error", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /api/routes
 * Create one route, or bulk-import many.
 *
 * Single: body = { title, origin, destination, ... }
 * Bulk: body = { routes: [ { ... }, { ... } ] }
 *
 * Bulk import is intended for the one-time migration of localStorage data.
 * The frontend can call it after first login to sync existing local routes.
 */
app.post("/api/routes", requireAuth, async (req, res) => {
  try {
    const body = req.body || {};

    // Bulk import
    if (Array.isArray(body.routes)) {
      const docs = body.routes.map((r) => buildRouteDoc(r, req.userId));
      const inserted = await Route.insertMany(docs, { ordered: false });

      return res.status(201).json({
        message: `${inserted.length} routes imported`,
        routes: inserted.map((d) =>
          normalizeRoute(d.toObject(), req.userId)
        ),
      });
    }

    // Single route
    const doc = buildRouteDoc(body, req.userId);

    // Prevent duplicate copies of the same source route
    if (doc.sourceRouteId) {
      const existing = await Route.findOne({
        owner: req.userId,
        sourceRouteId: doc.sourceRouteId,
      });
      if (existing) {
        return res.status(409).json({ message: "You already have a copy of this route." });
      }
    }

    const created = await Route.create(doc);

    res.status(201).json({
      route: normalizeRoute(created.toObject(), req.userId),
    });
  } catch (err) {
    console.error("POST /api/routes error", err);

    if (err?.name === "ValidationError") {
      return res.status(400).json({ message: err.message });
    }
    if (err?.message) {
      return res.status(400).json({ message: err.message });
    }

    res.status(500).json({ message: "Server error" });
  }
});

/**
 * PUT /api/routes/:id
 * Full update - must be the owner
 */
app.put("/api/routes/:id", requireAuth, async (req, res) => {
  try {
    const route = await Route.findById(req.params.id);
    if (!route) {
      return res.status(404).json({ message: "Route not found" });
    }

    if (String(route.owner) !== String(req.userId)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const update = buildRouteDoc(req.body || {}, req.userId);

    // Preserve existing votes during normal route edits
    delete update.votes;

    Object.assign(route, update);
    await route.save();

    const refreshed = await Route.findById(route._id)
      .populate("owner", "name username")
      .lean();

    res.json({ route: normalizeRoute(refreshed, req.userId) });
  } catch (err) {
    console.error("PUT /api/routes/:id error", err);

    if (err?.name === "ValidationError") {
      return res.status(400).json({ message: err.message });
    }
    if (err?.message) {
      return res.status(400).json({ message: err.message });
    }

    res.status(500).json({ message: "Server error" });
  }
});


/**
 * DELETE /api/routes/:id
 * Must be the owner
 */
app.delete("/api/routes/:id", requireAuth, async (req, res) => {
  try {
    const route = await Route.findById(req.params.id);
    if (!route) {
      return res.status(404).json({ message: "Route not found" });
    }

    if (String(route.owner) !== String(req.userId)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    await Route.deleteOne({ _id: req.params.id });
    res.json({ message: "Route deleted" });
  } catch (err) {
    console.error("DELETE /api/routes/:id error", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /api/routes/:id/vote
 * Vote on a public route
 * Body: { vote: 1 } for upvote, { vote: -1 } for downvote,
 *       { vote: 0 } to remove your vote
 */
app.post("/api/routes/:id/vote", requireAuth, async (req, res) => {
  try {
    const { vote } = req.body || {};

    if (![1, -1, 0].includes(vote)) {
      return res.status(400).json({
        message: "Vote must be 1, -1, or 0",
      });
    }

    const route = await Route.findById(req.params.id)
      .populate("owner", "name username");

    if (!route) {
      return res.status(404).json({ message: "Route not found" });
    }

    if (!route.public) {
      return res.status(403).json({
        message: "Voting allowed only on public routes",
      });
    }

    if (!route.votes) {
      route.votes = { score: 0, upvoters: [], downvoters: [] };
    }

    const uid = String(req.userId);

    const upvoters = Array.isArray(route.votes.upvoters)
      ? route.votes.upvoters
      : [];
    const downvoters = Array.isArray(route.votes.downvoters)
      ? route.votes.downvoters
      : [];

    const alreadyUp = upvoters.some((id) => String(id) === uid);
    const alreadyDown = downvoters.some((id) => String(id) === uid);

    route.votes.upvoters = upvoters.filter(
      (id) => String(id) !== uid
    );
    route.votes.downvoters = downvoters.filter(
      (id) => String(id) !== uid
    );

    if (vote === 1 && !alreadyUp) {
      route.votes.upvoters.push(req.userId);
    } else if (vote === -1 && !alreadyDown) {
      route.votes.downvoters.push(req.userId);
    }

    route.votes.score =
      (route.votes.upvoters?.length || 0) -
      (route.votes.downvoters?.length || 0);

    await route.save();

    const refreshed = await Route.findById(route._id)
      .populate("owner", "name username")
      .lean();

    res.json({ route: normalizeRoute(refreshed, req.userId) });
  } catch (err) {
    console.error("POST /api/routes/:id/vote error", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ message: "Each photo must be 5MB or smaller." });
    }
    if (err.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json({ message: "You can upload at most 5 photos." });
    }
    return res.status(400).json({ message: err.message });
  }

  if (err?.message) {
    return res.status(400).json({ message: err.message });
  }

  return res.status(500).json({ message: "Server error" });
});

async function start() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
      socketTimeoutMS: 10000,
      maxPoolSize: 10,
    });

    console.log("DB connected");

    const port = process.env.PORT || 4000;
    app.listen(port, () => {
      console.log(`API running on http://localhost:${port}`);
    });
  } catch (err) {
    console.error("Error starting server:", err.message);
  }
}

start();