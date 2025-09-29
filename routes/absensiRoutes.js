const express = require("express");
const router = express.Router();
const absensiController = require("../controllers/absensiController");
const authMiddleware = require("../middlewares/authMiddleware");

// Absen masuk
router.post("/checkin", authMiddleware, absensiController.checkIn);

// Absen pulang
router.post("/checkout", authMiddleware, absensiController.checkOut);

// Absen pulang shift malam
router.post(
  "/checkOutShiftMalam",
  authMiddleware,
  absensiController.checkOutShiftMalam
);

// Riwayat absensi
router.get("/history", authMiddleware, absensiController.getHistory);

// Jadwal bulan ini
router.get("/jadwal", authMiddleware, absensiController.getJadwalBulanIni);

// Jadwal hari ini
router.get("/jadwalToday", authMiddleware, absensiController.getJadwalToday);

// monthly Summary
router.get(
  "/monthlySummary",
  authMiddleware,
  absensiController.getMonthlySummary
);

// Jadwal 5 hari terakhir
router.get("/lastfiveDays", authMiddleware, absensiController.getLastFiveDays);

// Lokasi Kantor
router.get("/kantor", authMiddleware, absensiController.getLokasiKantor);

// Get approvals
router.get("/approvals", authMiddleware, absensiController.getApprovals);

// Get Assigment List
router.get("/assignment", authMiddleware, absensiController.getAssignmentList);

// Get Assigment List
router.get("/karyawan", authMiddleware, absensiController.getKaryawan);

// Add Assigment
router.post("/assignment", authMiddleware, absensiController.addAssignment);

// Add Assigment
router.get("/myshift", authMiddleware, absensiController.getMyShift);

router.put(
  "/assignment/:id/cancel",
  authMiddleware,
  absensiController.cancelAssignment
);

router.put(
  "/assignment/:id/start",
  authMiddleware,
  absensiController.startAssignment
);

router.put(
  "/assignment/:id/finish",
  authMiddleware,
  absensiController.finishAssignment
);

module.exports = router;
