const db = require("../config/db");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
const bcrypt = require("bcrypt");
const isSameOrAfter = require("dayjs/plugin/isSameOrAfter");
const moment = require("moment");
require("moment/locale/id");

dayjs.extend(utc);
dayjs.extend(timezone);

dayjs.locale("id");
const TZ = "Asia/Makassar";

// ====================
// Check-in
// ====================
exports.checkIn = async (req, res) => {
  const maps = "https://www.google.com/maps/search/";
  const { location } = req.body;
  const lokasi = maps + location;

  try {
    const username = req.user.username;
    const nip_user = username.slice(-7);

    const now = dayjs().tz(TZ);
    const today = now.format("YYYY-MM-DD");
    const checkInTimeStr = now.format("YYYY-MM-DD HH:mm:ss");
    const checkInTimeHM = now.format("HH:mm");

    // 1. Cek apakah sudah absen hari ini
    const [todayRows] = await db.query(
      "SELECT * FROM data_absensi_online WHERE username=? AND tgl_absen=?",
      [username, today]
    );

    // 2. Jika sudah absen masuk
    if (todayRows.length > 0 && todayRows[0].absen1) {
      // a. Jika belum absen pulang
      if (!todayRows[0].absen2) {
        const start = dayjs(todayRows[0].absen1).tz(TZ);
        const durasiJam = now.diff(start, "hour");

        if (durasiJam < 5) {
          return res.status(200).json({
            status: "failed",
            message: "Minimal 5 jam kerja untuk bisa absen pulang.",
          });
        }

        // update absen2
        const update = await db.query(
          "UPDATE data_absensi_online SET absen2 = ?, absen2_location = ? WHERE id=?",
          [checkInTimeStr, lokasi, todayRows[0].id]
        );

        if (update) {
          // Update tabel absen_online_jadwal
          await db.query(
            "UPDATE absen_online_jadwal SET mode_pulang = 'online', pulang_jam = ?, lokasi_pulang = ? WHERE nip_absen_online_jadwal=? AND tgl_absen_online_jadwal=?",
            [checkInTimeHM, lokasi, username, today]
          );
        }

        return res.json({
          status: "success",
          message:
            "Absensi pulang berhasil. Terima kasih atas kerja keras Anda.",
          durasi_kerja: durasiJam,
        });
      }

      return res.status(200).json({
        status: "failed",
        message: "Anda sudah absen masuk dan pulang hari ini.",
      });
    }

    // 3. Jika belum absen → absen masuk
    await db.query(
      "INSERT INTO data_absensi_online (username, nip_user, tgl_absen, absen1, absen1_location) VALUES (?, ?, ?, ?, ?)",
      [username, nip_user, today, checkInTimeStr, lokasi]
    );

    // Ambil data jadwal
    const [rows] = await db.query(
      "SELECT jam_masuk FROM absen_online_jadwal WHERE nip_absen_online_jadwal=? AND tgl_absen_online_jadwal=?",
      [username, today]
    );

    let telat = "n";
    let durasiTelat = 0;

    if (rows.length > 0) {
      const jamMasukStr = rows[0].jam_masuk; // format HH:mm
      const [hMasuk, mMasuk] = jamMasukStr.split(":").map(Number);
      const [hAbsen, mAbsen] = checkInTimeHM.split(":").map(Number);

      const totalMasuk = hMasuk * 60 + mMasuk;
      const totalAbsen = hAbsen * 60 + mAbsen;

      if (totalAbsen > totalMasuk + 5) {
        telat = "y";
        durasiTelat = totalAbsen - totalMasuk;
      }

      // Update tabel absen_online_jadwal
      await db.query(
        "UPDATE absen_online_jadwal SET status_kehadiran = 'hadir', mode = 'online', masuk_jam=?, telat=?, durasi_telat=?, lokasi_masuk = ? WHERE nip_absen_online_jadwal=? AND tgl_absen_online_jadwal=?",
        [checkInTimeHM, telat, durasiTelat, lokasi, username, today]
      );

      // Update tabel data_absensi_online
      await db.query(
        "UPDATE data_absensi_online SET telat=?, durasi_telat=? WHERE username=? AND tgl_absen=?",
        [telat, durasiTelat, username, today]
      );
    }

    return res.json({
      status: "success",
      message: `Absensi masuk berhasil di jam ${checkInTimeHM}. Selamat bekerja.`,
      telat,
      durasi_telat: durasiTelat,
    });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ status: "error", message: "Terjadi kesalahan server" });
  }
};

// ====================
// Check-out
// ====================
exports.checkOut = async (req, res) => {
  try {
    const username = req.user.username;
    const now = dayjs().tz(TZ);

    // Ambil check-in terakhir tanpa check-out (hari ini atau sebelumnya)
    const [rows] = await db.query(
      "SELECT * FROM data_absensi_online WHERE username = ? AND absen1 IS NOT NULL AND absen2 IS NULL ORDER BY absen1 DESC LIMIT 1",
      [username]
    );

    if (rows.length === 0) {
      return res
        .status(400)
        .json({ message: "Tidak ada check-in aktif untuk check-out" });
    }

    const row = rows[0];
    const checkInTime = dayjs(row.absen1).tz(TZ);

    // Cek shift malam: check-in ≥ 14:00
    const shiftStart = dayjs(row.tgl_absen).tz(TZ).hour(14).minute(0).second(0);
    const isShiftMalam = checkInTime.isSameOrAfter(shiftStart);

    // Hanya shift malam (check-in ≥14:00) yang bisa check-out hari sebelumnya
    if (
      checkInTime.isBefore(shiftStart) &&
      checkInTime.format("YYYY-MM-DD") !== now.format("YYYY-MM-DD")
    ) {
      return res.status(400).json({
        message:
          "Check-out untuk hari sebelumnya hanya berlaku untuk shift malam (check-in ≥ 14:00)",
      });
    }

    // Durasi minimal 5 jam tetap berlaku
    const diffHours = now.diff(checkInTime, "hour", true);
    if (diffHours < MIN_WORK_HOURS) {
      return res.status(400).json({
        message: `Durasi kerja belum cukup. Minimal ${MIN_WORK_HOURS} jam sebelum check-out. Saat ini baru ${diffHours.toFixed(
          2
        )} jam`,
      });
    }

    // Update absen2 (check-out)
    await db.query(
      "UPDATE data_absensi_online SET absen2 = ?, absen2_location = ? WHERE id = ?",
      [now.format("YYYY-MM-DD HH:mm:ss"), lokasi, row.id]
    );

    res.json({
      message: "Check-out berhasil",
      shift_malam: isShiftMalam,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

exports.checkOutShiftMalam = async (req, res) => {
  try {
    const username = req.user.username;
    const now = dayjs().tz(TZ);

    const [lastAbsenRows] = await db.query(
      "SELECT * FROM data_absensi_online WHERE username=? AND absen1 IS NOT NULL AND absen2 IS NULL ORDER BY absen1 DESC LIMIT 1",
      [username]
    );

    if (lastAbsenRows.length === 0) {
      return res.status(200).json({
        status: "failed",
        message:
          "Tidak ada data shift malam yang perlu di-checkout atau jam absen sudah lewat.",
      });
    }

    const lastAbsen = lastAbsenRows[0];
    const start = dayjs(lastAbsen.absen1).tz(TZ);
    const durasiJam = now.diff(start, "hour");

    // < 5 jam → tolak
    if (durasiJam < 5) {
      return res.status(200).json({
        status: "failed",
        message: "Minimal 5 jam kerja untuk bisa absen pulang.",
      });
    }

    // > 10 jam → tolak juga
    if (durasiJam > 10) {
      return res.status(200).json({
        status: "failed",
        message:
          "Durasi kerja lebih dari 10 jam. Silakan hubungi admin untuk validasi shift malam Anda.",
      });
    }

    // 5–10 jam → normal checkout
    await db.query("UPDATE data_absensi_online SET absen2 = ? WHERE id=?", [
      now.format("YYYY-MM-DD HH:mm:ss"),
      lastAbsen.id,
    ]);

    return res.json({
      status: "success",
      message: "Check-out shift malam berhasil.",
      durasi_kerja: durasiJam,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error", message: "Server error." });
  }
};

exports.getLastFiveDays = async (req, res) => {
  try {
    const username = req.user.username;

    const [rows] = await db.query(
      `SELECT 
         nip_absen_online_jadwal,
         DATE_FORMAT(tgl_absen_online_jadwal, '%d %b %Y') AS tanggal,
         masuk_jam,
         pulang_jam,
         tipe_kehadiran,
         telat,
         durasi_telat
       FROM absen_online_jadwal
       WHERE nip_absen_online_jadwal = ?
         AND tgl_absen_online_jadwal < CURDATE()
       ORDER BY tgl_absen_online_jadwal DESC
       LIMIT 5`,
      [username]
    );

    const formatted = rows.map((r) => {
      let status = "";

      const isNormalOrPiket =
        r.tipe_kehadiran === "normal" || r.tipe_kehadiran === "piket";

      if (isNormalOrPiket) {
        if (r.telat === "n") {
          status = "On-time";
        } else if (r.telat === "y") {
          status = `Telat ${r.durasi_telat || 0}m`;
        } else {
          status = "Alpa";
        }
      }

      return {
        tanggal: r.tanggal,
        masuk: r.masuk_jam || "-",
        pulang: r.pulang_jam || "-",
        tipe_kehadiran: r.tipe_kehadiran === "normal" ? "" : r.tipe_kehadiran,
        status,
      };
    });

    res.json({ success: true, data: formatted });
  } catch (err) {
    console.error("getLastFiveDays error:", err);
    res.status(500).json({ success: false, message: err.message || err });
  }
};

// ====================
// History absensi ByMothYears
// ====================

exports.getHistory = async (req, res) => {
  try {
    const username = req.user.username;
    const nip_user = username.slice(-7);
    const { month, year } = req.query;

    if (!month || !year) {
      return res
        .status(400)
        .json({ message: "Bulan dan tahun harus diberikan" });
    }

    const [rows] = await db.query(
      `SELECT tgl_absen, absen1, absen2, telat, durasi_telat FROM data_absensi_online WHERE nip_user = ? AND MONTH(tgl_absen) = ? AND YEAR (tgl_absen) = ? ORDER BY tgl_absen DESC`,
      [nip_user, month, year]
    );

    // Format hasil
    const formatted = rows.map((r) => ({
      username: r.username,
      tgl_absen: dayjs(r.tgl_absen).format("DD MMM YYYY"),
      absen1: r.absen1 ? dayjs(r.absen1).format("HH:mm") : "Tidak absen masuk",
      absen2: r.absen2 ? dayjs(r.absen2).format("HH:mm") : "Tidak absen pulang",
      status:
        r.absen1 == null
          ? "Belum Absen"
          : r.telat == "n"
          ? "On-time"
          : "Telat " + r.durasi_telat ?? "0m",
    }));

    res.json({ history: formatted });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

// ====================
// History absensi (30 hari terakhir)
// ====================
exports.getJadwalBulanIni = async (req, res) => {
  try {
    const username = req.user.username; // ambil dari token

    // Bulan ini 'YYYY-MM'
    const thisMonth = new Date().toISOString().slice(0, 7);

    // Query ambil jadwal bulan ini
    const [rows] = await db.query(
      `SELECT tgl_absen_online_jadwal,
              nip_absen_online_jadwal,
              jam_masuk,
              masuk_jam,
              jam_pulang,
              pulang_jam,
              telat,
              durasi_telat
       FROM absen_online_jadwal
       WHERE nip_absen_online_jadwal = ?
         AND LEFT(tgl_absen_online_jadwal, 7) = ?
       ORDER BY tgl_absen_online_jadwal DESC`,
      [username, thisMonth]
    );

    // Konversi tanggal ke WIB agar Postman/Frontend tampil benar
    const dataWITA = rows.map((r) => {
      if (!r.tgl_absen_online_jadwal) return r;
      const d = new Date(r.tgl_absen_online_jadwal);
      r.tgl_absen_online_jadwal = d.toLocaleString("id-ID", {
        timeZone: "Asia/Makassar", // WITA
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      return r;
    });

    res.json({ success: true, data: dataWITA });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

exports.getJadwalToday = async (req, res) => {
  try {
    const username = req.user.username; // ambil dari token

    const now = dayjs().tz(TZ);
    const today = now.format("YYYY-MM-DD");

    // Query ambil jadwal bulan ini
    const [rows] = await db.query(
      `SELECT tgl_absen_online_jadwal,
              nip_absen_online_jadwal,
              jam_masuk,
              masuk_jam,
              jam_pulang,
              pulang_jam,
              telat,
              durasi_telat
       FROM absen_online_jadwal
       WHERE nip_absen_online_jadwal = ?
         AND tgl_absen_online_jadwal = ?`,
      [username, today]
    );

    // Konversi tanggal ke WIB agar Postman/Frontend tampil benar
    const dataWITA = rows.map((r) => {
      if (!r.tgl_absen_online_jadwal) return r;
      const d = new Date(r.tgl_absen_online_jadwal);
      r.tgl_absen_online_jadwal = d.toLocaleString("id-ID", {
        timeZone: "Asia/Makassar", // WITA
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      return r;
    });

    res.json({ success: true, data: dataWITA });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};
exports.getMonthlySummary = async (req, res) => {
  try {
    const username = req.user.username;
    const { month, year } = req.query;

    // default bulan & tahun sekarang
    const now = new Date();
    const bulan = month || now.getMonth() + 1;
    const tahun = year || now.getFullYear();

    const [rows] = await db.query(
      `
      SELECT 
        SUM(CASE WHEN status_kehadiran = 'hadir' AND (tipe_kehadiran = 'normal' OR tipe_kehadiran='piket')AND tgl_absen_online_jadwal <= CURDATE() THEN 1 ELSE 0 END) AS hadir,
        SUM(CASE WHEN status_kehadiran = 'alpa' AND tgl_absen_online_jadwal <= CURDATE() THEN 1 ELSE 0 END) AS alpha,
        SUM(CASE WHEN telat = 'y' AND tgl_absen_online_jadwal <= CURDATE() THEN 1 ELSE 0 END) AS telat,
        SUM(CASE WHEN tipe_kehadiran = 'piket' AND tgl_absen_online_jadwal <= CURDATE()  THEN 1 ELSE 0 END) AS piket
      FROM absen_online_jadwal
      WHERE nip_absen_online_jadwal = ? 
        AND MONTH(tgl_absen_online_jadwal) = ? 
        AND YEAR(tgl_absen_online_jadwal) = ?
      `,
      [username, bulan, tahun]
    );

    return res.json({
      success: true,
      data: rows[0],
    });
  } catch (err) {
    console.error("getMonthlySummary error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.getUserProfile = async (req, res) => {
  try {
    const username = req.user.username;

    const [rows] = await db.query(
      "SELECT nama, username, kantor, department, lokasi_absen, jabatan FROM absen_online WHERE username = ?",
      [username]
    );

    res.json({ data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

exports.getLokasiKantor = async (req, res) => {
  try {
    const username = req.user.username;
    const [rows] = await db.query(
      "SELECT nama_kantor, absen_online_kantor.gruping, latitude_kantor, longitude_kantor, absen_online_kantor.radius, aktif FROM absen_online_kantor INNER JOIN absen_online ON absen_online_kantor.gruping=absen_online.lokasi_absen WHERE username = ?",
      [username]
    );

    res.json({ kantor: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

// ====================
// Ganti Password
// ====================

exports.changePassword = async (req, res) => {
  try {
    const { old_password, new_password } = req.body;
    const userId = req.user.id_absen; // dari token middleware

    if (!old_password || !new_password) {
      return res
        .status(400)
        .json({ success: false, message: "Password lama & baru wajib diisi" });
    }

    // Ambil user dari tabel absen_online
    const [rows] = await db.query(
      "SELECT * FROM absen_online WHERE id_absen = ?",
      [userId]
    );
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "User tidak ditemukan" });
    }

    const user = rows[0];

    // 1. Cek apakah password lama cocok
    const match = await bcrypt.compare(old_password, user.password);
    if (!match) {
      return res.status(400).json({
        success: false,
        message: "Password lama salah",
      });
    }

    // 2. Cek apakah password baru sama dengan yang lama
    const same = await bcrypt.compare(new_password, user.password);
    if (same) {
      return res.status(400).json({
        success: false,
        message: "Password baru tidak boleh sama dengan password lama",
      });
    }

    if (new_password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password minimal 8 karakter",
      });
    }

    const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
    if (!strongPasswordRegex.test(new_password)) {
      return res.status(400).json({
        success: false,
        message:
          "Password harus terdiri dari minimal 8 karakter, dengan minimal 1 huruf besar, 1 huruf kecil, dan 1 angka",
      });
    }

    // Hash password baru
    const hashedPassword = await bcrypt.hash(new_password, 10);
    await db.query(
      "UPDATE absen_online SET password = ?, noenc = ?, default_pwd = ? WHERE id_absen = ?",
      [hashedPassword, new_password, "TIDAK", userId]
    );

    res.json({ success: true, message: "Password berhasil diubah" });
  } catch (err) {
    console.error("changePassword error:", err);
    res
      .status(500)
      .json({ success: false, message: "Terjadi kesalahan server" });
  }
};

// Endpoint API gabungan Cuti & Dispensasi
// Endpoint API gabungan Cuti & Dispensasi
exports.getApprovals = async (req, res) => {
  const username = req.user.username;
  try {
    // Ambil data cuti_karyawan
    const [cutiRows] = await db.query(
      `SELECT 
          id_cuti AS id,
          CONCAT('Cuti ', jenis_cuti) AS category,
          kategori_cuti AS subcategory,
          keperluan_cuti AS keterangan,
          tgl_mulai_cuti AS startdate,
          tgl_selesai_cuti AS enddate,
          tgl_pengajuan AS reqdate,
          status_cuti AS status,
          rejected_reason AS reason,
          NULL AS jadwal,
          NULL AS absen,
          durasi_cuti AS durasi_value,
          CONCAT(durasi_cuti, ' hari') AS durasi,
          'cuti' AS source
       FROM cuti_karyawan
       WHERE karyawan = ?`,
      [username]
    );

    // Ambil data absen_online_izin
    const [izinRows] = await db.query(
      `SELECT 
          id,
          request AS category,
          jenis AS subcategory,
          keterangan,
          tgl_mulai_izin AS startdate,
          tgl_selesai_izin AS enddate,
          tgl_request AS reqdate,
          status,
          reason,
          jadwal,
          absen,
          durasi AS durasi_value,
          CONCAT(durasi, ' menit') AS durasi,
          'izin' AS source
       FROM absen_online_izin
       WHERE nip_izin = ?`,
      [username]
    );

    // Gabungkan data cuti dan izin lalu urutkan berdasarkan tanggal request
    const result = [...cutiRows, ...izinRows]
      .map((item) => ({
        ...item,
        startdate: item.startdate
          ? dayjs(item.startdate).tz(TZ).format("DD-MMM-YYYY")
          : null,
        enddate: item.enddate
          ? dayjs(item.enddate).tz(TZ).format("DD-MMM-YYYY")
          : null,
        reqdate: item.reqdate
          ? dayjs(item.reqdate).tz(TZ).format("DD-MMM-YYYY")
          : null,
      }))
      .sort((a, b) => new Date(b.reqdate) - new Date(a.reqdate));

    res.json(result);
  } catch (err) {
    console.error("Error fetching approvals:", err);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

exports.getAssignmentList = async (req, res) => {
  try {
    const username = req.user.username;
    const [rows] = await db.query(
      "SELECT id, username, nama, kategori, CONCAT('dihari ', dihari) AS dihari, jadwal_masuk, masuk_jam, jadwal_pulang, pulang_jam, uraian, durasi, status, tgl_extra FROM absen_online_extra LEFT JOIN absen_online ON username=nip_extra WHERE assign_by = ? ORDER BY id DESC",
      [username]
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

exports.getKaryawan = async (req, res) => {
  try {
    const username = req.user.username;
    const [rows] = await db.query(
      "SELECT username, nama FROM absen_online WHERE gruping = ?",
      [username]
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

exports.addAssignment = async (req, res) => {
  const username = req.user.username;
  try {
    const {
      nipExtra,
      kategori,
      tanggal,
      jam_masuk,
      jam_pulang,
      uraian,
      dihari,
    } = req.body;

    if (!nipExtra || !kategori || !tanggal || !jam_masuk || !jam_pulang) {
      return res
        .status(400)
        .json({ success: false, message: "Data tidak lengkap" });
    }

    // Gabungkan tanggal + jam ke format datetime
    const jadwalMasuk = `${tanggal} ${jam_masuk}:00`;
    const jadwalPulang = `${tanggal} ${jam_pulang}:00`;

    // Simpan ke DB
    const [result] = await db.query(
      `INSERT INTO absen_online_extra 
        (nip_extra, kategori, tgl_extra, jadwal_masuk, jadwal_pulang, uraian, dihari, assign_by, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nipExtra,
        kategori,
        tanggal,
        jadwalMasuk,
        jadwalPulang,
        uraian,
        dihari,
        username,
        "assign",
      ]
    );

    res.json({
      success: true,
      message: "Assignment berhasil dibuat",
      data: {
        id: result.insertId,
        nipExtra,
        kategori,
        tgl_extra: tanggal,
        jadwal_masuk: jadwalMasuk,
        jadwal_pulang: jadwalPulang,
        uraian: uraian,
        dihari,
        assign_by: username,
        status: "assign",
      },
    });
  } catch (err) {
    console.error("Error addAssignment:", err);
    res
      .status(500)
      .json({ success: false, message: "Terjadi kesalahan server" });
  }
};

exports.cancelAssignment = async (req, res) => {
  try {
    const { id } = req.params;
    const username = req.user.username; // dari databse

    if (!id) {
      return res
        .status(400)
        .json({ success: false, message: "ID assignment diperlukan" });
    }

    // Cek apakah assignment ada
    const [rows] = await db.query(
      "SELECT * FROM absen_online_extra WHERE id = ?",
      [id]
    );
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Assignment tidak ditemukan" });
    }

    // Update status jadi canceled
    await db.query(
      `UPDATE absen_online_extra 
       SET status = ?, canceled_by = ?, canceled_at = NOW()
       WHERE id = ?`,
      ["canceled", username, id]
    );

    res.json({
      success: true,
      message: "Assignment berhasil dibatalkan",
      data: {
        id,
        status: "canceled",
        canceled_by: username,
      },
    });
  } catch (err) {
    console.error("Error cancelAssignment:", err);
    res
      .status(500)
      .json({ success: false, message: "Terjadi kesalahan server" });
  }
};

exports.getMyShift = async (req, res) => {
  try {
    const username = req.user.username;
    const [rows] = await db.query(
      `SELECT id, username, kategori, CONCAT('dihari ', dihari) AS dihari,
              jadwal_masuk, masuk_jam, jadwal_pulang, pulang_jam,
              uraian, status, tgl_extra
       FROM absen_online_extra
       LEFT JOIN absen_online ON username=nip_extra
       WHERE nip_extra = ? AND status!='canceled'
       ORDER BY id DESC`,
      [username]
    );

    const formatted = rows.map((r) => ({
      ...r,
      jadwal_masuk: r.jadwal_masuk
        ? dayjs(r.jadwal_masuk).tz(TZ).format("HH:mm")
        : null,
      masuk_jam: r.masuk_jam ? dayjs(r.masuk_jam).tz(TZ).format("HH:mm") : null,
      jadwal_pulang: r.jadwal_pulang
        ? dayjs(r.jadwal_pulang).tz(TZ).format("HH:mm")
        : null,
      pulang_jam: r.pulang_jam
        ? dayjs(r.pulang_jam).tz(TZ).format("HH:mm")
        : null,
      tgl_extra: r.tgl_extra
        ? dayjs(r.tgl_extra).tz(TZ).format("DD MMM YYYY") // → contoh: 23 Sep 2025
        : null,
    }));

    res.json({ success: true, data: formatted });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

exports.startAssignment = async (req, res) => {
  try {
    const { id } = req.params;
    const username = req.user.username; // dari databse

    if (!id) {
      return res
        .status(400)
        .json({ success: false, message: "ID assignment diperlukan" });
    }

    // Cek apakah assignment ada
    const [rows] = await db.query(
      "SELECT * FROM absen_online_extra WHERE id = ?",
      [id]
    );
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Task tidak ditemukan" });
    }

    // Update status jadi canceled
    await db.query(
      `UPDATE absen_online_extra 
       SET status = ?, masuk_jam = NOW()
       WHERE id = ?`,
      ["ongoing", id]
    );

    res.json({
      success: true,
      message:
        "Task started successfully. Don't forget to finish your task when its done!",
      data: {
        id,
        status: "success",
        task_status: "ongoing",
      },
    });
  } catch (err) {
    console.error("Error startAssignment:", err);
    res
      .status(500)
      .json({ success: false, message: "Terjadi kesalahan server" });
  }
};

exports.finishAssignment = async (req, res) => {
  try {
    const { id } = req.params;
    const username = req.user.username; // dari databse

    if (!id) {
      return res
        .status(400)
        .json({ success: false, message: "ID assignment diperlukan" });
    }

    // Cek apakah assignment ada
    const [rows] = await db.query(
      "SELECT * FROM absen_online_extra WHERE id = ? AND status = ?",
      [id, "ongoing"]
    );
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Task tidak ditemukan" });
    }

    // Update status jadi canceled
    await db.query(
      `UPDATE absen_online_extra 
       SET status = ?, pulang_jam = NOW()
       WHERE id = ?`,
      ["completed", id]
    );

    res.json({
      success: true,
      message: "Task finished successfully!",
      data: {
        id,
        status: "success",
        task_status: "completed",
      },
    });
  } catch (err) {
    console.error("Error finishAssignment:", err);
    res
      .status(500)
      .json({ success: false, message: "Terjadi kesalahan server" });
  }
};
