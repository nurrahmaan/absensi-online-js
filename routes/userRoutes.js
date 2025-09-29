const express = require("express");
const router = express.Router();
const absensiController = require("../controllers/absensiController");
const authMiddleware = require("../middlewares/authMiddleware");
const rateLimit = require("express-rate-limit");
const db = require("../config/db");

// ==========================
// User Routes
// ==========================

// Cek apakah token masih valid
router.get("/check", authMiddleware, (req, res) => {
  res.json({
    message: "Token valid, user masih login",
    user: req.user, // data hasil decode token
  });
});

router.get("/profile", authMiddleware, absensiController.getUserProfile);

// === Custom Handler untuk logging ke DB ===
const logRateLimit = async (req, endpoint, message) => {
  try {
    await db.query(
      "INSERT INTO rate_limit_logs (ip_address, endpoint, message) VALUES (?, ?, ?)",
      [req.ip, endpoint, message]
    );
  } catch (err) {
    console.error("Gagal simpan log rate-limit:", err.message);
  }
};

// === Limit khusus untuk ganti password ===
const changePasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 5, // Maks 5 percobaan per 15 menit
  handler: async (req, res /*, next*/) => {
    const msg = "Terlalu banyak percobaan ganti password. Coba lagi nanti.";
    await logRateLimit(req, "change-password", msg);

    return res.status(429).json({
      success: false,
      message: msg,
    });
  },
});

// Route ganti password
router.post(
  "/change-password",
  authMiddleware,
  changePasswordLimiter, // <- dipasang di sini
  absensiController.changePassword
);

router.get("/lokasi/kantor", authMiddleware, absensiController.getLokasiKantor);

module.exports = router;
