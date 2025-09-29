require("dotenv").config(); // optional, jika pakai .env
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

// Routes (buat sementara dummy, nanti ganti sesuai folder routes kamu)
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const absensiRoutes = require("./routes/absensiRoutes");

// Middleware
const authMiddleware = require("./middlewares/authMiddleware");

const app = express();

// ===== Middleware =====
app.use(cors({ origin: "*", credentials: true }));
app.use(express.json());
app.use(cookieParser());

// ===== Routes =====
// Public
app.use("/api/auth", authRoutes);

// Protected
app.use("/api/user", authMiddleware, userRoutes);
app.use("/api/absensi", authMiddleware, absensiRoutes);

// Root
app.get("/", (req, res) => res.send("API Absensi Online Running..."));

// Ping route
app.get("/api/ping", (req, res) => {
  res.json({
    status: "success",
    message: "Backend is alive!",
    timestamp: new Date(),
  });
});

// ===== Start Server =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
