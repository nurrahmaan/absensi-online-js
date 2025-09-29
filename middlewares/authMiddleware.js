const db = require("../config/db");

const authMiddleware = async (req, res, next) => {
  try {
    const token =
      req.cookies.token || req.headers["authorization"]?.split(" ")[1];
    if (!token)
      return res.status(401).json({ message: "Token tidak ditemukan" });

    const [rows] = await db.query(
      "SELECT * FROM personal_access_tokens WHERE token = ? AND (expires_at IS NULL OR expires_at > NOW())",
      [token]
    );
    if (rows.length === 0)
      return res
        .status(401)
        .json({ message: "Token tidak valid atau sudah logout" });

    const userId = rows[0].tokenable_id;
    const [userRows] = await db.query(
      "SELECT id_absen, username FROM absen_online WHERE id_absen = ?",
      [userId]
    );
    if (userRows.length === 0)
      return res.status(401).json({ message: "User tidak ditemukan" });

    req.user = userRows[0];
    await db.query(
      "UPDATE personal_access_tokens SET last_used_at = NOW() WHERE token = ?",
      [token]
    );

    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

module.exports = authMiddleware;
