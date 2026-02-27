import express from "express";
import dotenv from "dotenv";
import mongoose from "mongoose";
import cors from "cors";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import NodeCache from "node-cache";

dotenv.config();

const app = express();

/**
 * CORS: allows only known frontends + cache preflight 
 */
const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "https://capstone-terrain-trail-neva.vercel.app",
];

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


app.use(express.json());

const cache = new NodeCache({stdTTL: 60, checkperiod: 120});

app.get("/", (req, res) => {
  res.send("API is running");
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", version: "1.0" });
});

const userSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    username: { type: String, trim: true, unique: true, sparse: true},
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true }
);

const User = mongoose.models.User || mongoose.model("User", userSchema);

/*  Auth middleware for settings routes */

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({message: "Missing token" });
  }

  try {
    const payload = jwt.verify(
      token,
      process.env.JWT_SECRET || "dev"
    );
    req.userId = payload.sub;
    next();

  }
  catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

/* ===== Auth routes ===== */
app.post("/api/signup", async (req, res) => {
  try {
    const { name, username, email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ message: "Email and password required" });
    if (password.length < 6) return res.status(400).json({ message: "Password must be at least 6 characters" });

    //Check for unique username and email
    if (username) {
      const existingUser = await User.findOne({ username });
      if (existingUser) return res.status(409).json({message: "Username already in use"});
    }
    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return res.status(409).json({ message: "Email already in use" });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    await User.create({ name, username, email, passwordHash });

    res.status(201).json({ message: "User created" });
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ message: "Duplicate field" });
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ message: "Email and password required" });

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: "Invalid email or password" });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ message: "Invalid email or password" });

    const token = jwt.sign({ sub: user._id, email: user.email }, process.env.JWT_SECRET || "dev", { expiresIn: "7d" });

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
      return res.json({ user: cached, source: "cache"});
    }
    const user = await User.findById(req.userId)
      .select("name username email")
      .lean();

    if (!user) {
      return res.status(404).json({message: "User not found" });
    }
    cache.set(key, user);
    res.json({ user, source: "db" });
  }
  catch (err) {
    res.status(500).json({message: "Server error" });
  }
});
/**
 * PUT /api/account
 * Body can cantain: name, username,  email, currentPassword, newPassword
 */
app.put("/api/account", requireAuth, async (req, res) => {
  try {
    const { name, username, email, currentPassword, newPassword } = req.body || {};

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const trimmedEmail =
      typeof email === "string" ? email.trim().toLowerCase() : undefined;

    const isEmailChanging =
      typeof trimmedEmail === "string" && trimmedEmail !== user.email;

    const isPasswordChanging = !!newPassword;

    const trimmedUsername =
      typeof username === "string" ? username.trim() : undefined;

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
      const ok = await bcrypt.compare(currentPassword || "", user.passwordHash);
      if (!ok) {
        return res.status(400).json({ message: "Incorrect current password" });
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
            "Username must be 3–20 characters and contain only letters, numbers, and underscores.",
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
      user: { name: user.name, username: user.username, email: user.email },
    });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ message: "Email or username already in use" });
    }
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * DELETE /api/account
 * Permanently deletes the authenticated user's account.
 * This frees email/username for reuse because the document is removed.
 */
app.delete("/api/account", requireAuth, async(req, res) => {
  try {
    const user = await User.findById(req.userId).select("_id");
    if (!user) return res.status(404).json({ message: "User not found"});

    await User.deleteOne({ _id: req.userId });

    // clear cached account data for this user
    cache.del(`account:${req.userId}`);

    return res.json({ message: "Account deleted" });
  } catch (err) {
    return res.status(500).json({ message: "Server error" });
  }
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