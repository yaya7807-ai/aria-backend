const express = require('express');
const pool = require('../db');
const { WARNA_STATUS } = require('../services/threshold');

const router = express.Router();
const ONLINE_MENIT = Number(process.env.ONLINE_TIMEOUT_MINUTES || 10);

function bentukDevice(row) {
  const online =
    row.last_seen_at != null && Date.now() - new Date(row.last_seen_at).getTime() <= ONLINE_MENIT * 60000;
  return {
    node_id: row.node_id,
    nama: row.nama,
    tipe: row.tipe,
    lokasi: row.lokasi,
    status_bahaya: row.last_status,
    ...WARNA_STATUS[row.last_status],
    online,
    last_seen_at: row.last_seen_at,
    ketinggian_air_cm: row.ketinggian_air_cm == null ? null : Number(row.ketinggian_air_cm),
    status_hujan: row.status_hujan,
    float_switch_aktif: row.float_switch_aktif,
    laju_kenaikan_cm_per_menit: row.laju == null ? null : Number(row.laju),
    alasan_status: row.alasan_status,
    baterai_persen: row.last_baterai_persen,
    koneksi: row.last_koneksi,
    kamera_url: row.punya_kamera ? row.last_kamera_url : null,
  };
}

const SQL_DASHBOARD = `
  SELECT d.*, sr.ketinggian_air_cm, sr.status_hujan, sr.float_switch_aktif,
         sr.laju_kenaikan_cm_per_menit AS laju, sr.alasan_status
    FROM devices d
    LEFT JOIN LATERAL (
      SELECT * FROM sensor_readings s
       WHERE s.device_id = d.id ORDER BY s.recorded_at DESC LIMIT 1
    ) sr ON TRUE
   WHERE d.is_active = TRUE`;

/** GET /api/dashboard -> kondisi terkini semua node (untuk kotak-kotak dashboard) */
router.get('/dashboard', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`${SQL_DASHBOARD} ORDER BY d.node_id`);
    res.json({ success: true, server_time: new Date().toISOString(), data: rows.map(bentukDevice) });
  } catch (e) { next(e); }
});

/** GET /api/devices/:nodeId/latest -> kondisi terkini 1 node */
router.get('/devices/:nodeId/latest', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`${SQL_DASHBOARD} AND d.node_id = $1`, [req.params.nodeId]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Device tidak ditemukan' });
    res.json({ success: true, data: bentukDevice(rows[0]) });
  } catch (e) { next(e); }
});

/** GET /api/devices/:nodeId/readings?limit=50 -> riwayat untuk grafik */
router.get('/devices/:nodeId/readings', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 500);
    const { rows } = await pool.query(
      `SELECT s.recorded_at, s.ketinggian_air_cm, s.status_hujan, s.float_switch_aktif,
              s.laju_kenaikan_cm_per_menit, s.status_bahaya, s.baterai_persen, s.koneksi, s.kamera_url
         FROM sensor_readings s JOIN devices d ON d.id = s.device_id
        WHERE d.node_id = $1
        ORDER BY s.recorded_at DESC LIMIT $2`,
      [req.params.nodeId, limit]
    );
    res.json({
      success: true,
      data: rows.reverse().map((x) => ({
        ...x,
        ketinggian_air_cm: x.ketinggian_air_cm == null ? null : Number(x.ketinggian_air_cm),
        laju_kenaikan_cm_per_menit: x.laju_kenaikan_cm_per_menit == null ? null : Number(x.laju_kenaikan_cm_per_menit),
        ...WARNA_STATUS[x.status_bahaya],
      })),
    });
  } catch (e) { next(e); }
});

/** GET /api/thresholds -> ambang batas aktif (biar frontend bisa gambar garis batas di grafik) */
router.get('/thresholds', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT t.id, d.node_id, t.tinggi_siaga_cm, t.tinggi_awas_cm,
              t.laju_siaga_cm_per_menit, t.laju_awas_cm_per_menit, t.hujan_siaga, t.keterangan
         FROM thresholds t LEFT JOIN devices d ON d.id = t.device_id
        ORDER BY t.device_id NULLS FIRST`
    );
    res.json({ success: true, data: rows });
  } catch (e) { next(e); }
});

module.exports = router;
