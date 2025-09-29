const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");

// Routes
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const absensiRoutes = require("./routes/absensiRoutes");

// Middleware
const authMiddleware = require("./middlewares/authMiddleware");

const app = express();

// === Database pool ===
// const db = require("./config/db");

// // === Global Rate Limit ===
// const globalLimiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 menit
//   max: 100, // 100 request per IP
//   message: {
//     success: false,
//     message: "Terlalu banyak request dari IP ini. Coba lagi nanti.",
//   },
//   standardHeaders: true,
//   legacyHeaders: false,
// });

// app.use(globalLimiter);

// Middleware global
const baseUrl = "http://172.20.10.6:3000";
// const baseUrl = "http://192.168.1.3:3000";
// const baseUrl = "https://api.jnemataram.com/absensi_online";
app.use(cors({ origin: baseUrl, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// === Routes ===
// Public
app.use("/api/auth", authRoutes);

// Protected
app.use("/api/user", authMiddleware, userRoutes);
app.use("/api/absensi", authMiddleware, absensiRoutes);

// Root
app.get("/", (req, res) => res.send("API Absensi Online Running..."));

// Protected dashboard example
app.get("/api/dashboard", authMiddleware, (req, res) => {
  res.json({
    message: `Halo ${req.user.username}, selamat datang di dashboard!`,
  });
});

app.get("/api/ping", (req, res) => {
  res.json({
    status: "success",
    message: "Backend is alive!",
    timestamp: new Date(),
  });
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Server running on ${baseUrl}`));
