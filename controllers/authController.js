const db = require("../config/db");
const bcrypt = require("bcrypt");
const crypto = require("crypto");

// ==================== REGISTER ====================
exports.updateAllPassword = async (req, res) => {
  try {
    // Password default yang akan di-set ke semua user
    const plainPassword = "JNE2025";

    // 1. Hash password
    const hash = await bcrypt.hash(plainPassword, 10);

    await db.query("UPDATE absen_online SET password = ?", [hash]);

    res.json({ message: "Password berhasil diupdate untuk semua user" });
  } catch (error) {
    console.error("Error saat hashing password:", error);
    return res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

exports.register = async (req, res) => {
  try {
    const { username, password, nip_absen, nama, department } = req.body;
    if (!username || !password || !nip_absen || !nama || !department)
      return res.status(400).json({ message: "Semua field wajib diisi" });

    const [rows] = await db.query(
      "SELECT * FROM absen_online WHERE username = ?",
      [username]
    );
    if (rows.length > 0)
      return res.status(400).json({ message: "Username sudah digunakan" });

    const hashedPassword = await bcrypt.hash(password, 10);
    await db.query(
      "INSERT INTO absen_online (username, password, nip_absen, nama, department) VALUES (?, ?, ?, ?,?)",
      [username, hashedPassword, nip_absen, nama, department]
    );

    res.json({ message: "Register berhasil" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

// ==================== LOGIN ====================
exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res
        .status(400)
        .json({ message: "Username & password wajib diisi" });

    const [rows] = await db.query(
      "SELECT * FROM absen_online WHERE username = ?",
      [username]
    );
    if (rows.length === 0)
      return res.status(400).json({ message: "Username/password salah" });

    const user = rows[0];

    // Gunakan id_absen sebagai userId
    if (!user.id_absen)
      return res.status(500).json({ message: "ID user tidak ditemukan" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(400).json({ message: "Username/password salah" });

    const userId = user.id_absen;

    // Hapus token lama user
    await db.query(
      "DELETE FROM personal_access_tokens WHERE tokenable_id = ?",
      [userId]
    );

    // Generate token baru
    const token = crypto.randomBytes(64).toString("hex");
    const expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Simpan token baru
    await db.query(
      `INSERT INTO personal_access_tokens
        (tokenable_type, tokenable_id, name, token, expires_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
      ["User", userId, "Web Session", token, expires_at]
    );

    // Kirim token ke client via cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: false,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/",
    });

    res.json({ message: "Login berhasil", success: true, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

// ==================== LOGOUT ====================
exports.logout = async (req, res) => {
  try {
    const token = req.cookies.token;
    if (token)
      await db.query("DELETE FROM personal_access_tokens WHERE token = ?", [
        token,
      ]);
    res.clearCookie("token", { httpOnly: true, secure: false, path: "/" });
    res.json({ message: "Logout berhasil" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};
