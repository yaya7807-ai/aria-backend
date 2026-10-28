const express = require('express');
const pool = require('../db');
const cekApiKey = require('../middleware/apiKey');
const { validasiTelemetri } = require('../validators/telemetry');
const { tentukanStatus, hitungLaju, WARNA_STATUS } = require('../services/threshold');
const { kirimNotifikasiPerubahanStatus } = require('../services/notifier');

const router = express.Router();

/**
 * POST /api/telemetry
 * Dipanggil oleh Node Sensor (WiFi) atau Gateway (meneruskan data LoRa).
 * Header: x-api-key, Content-Type: application/json
 * Body  : lihat json.txt
 */
router.post('/', cekApiKey, async (req, res, next) => {
  const cek = validasiTelemetri(req.body);
  if (!cek.ok) {
    return res.status(400).json({ success: false, message: 'Payload tidak valid', errors: cek.errors });
  }
  const r = cek.value;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Pastikan device terdaftar
    const devRes = await client.query(
      `SELECT id, node_id, nama, last_status, last_seen_at
         FROM devices WHERE node_id = $1 AND is_active = TRUE FOR UPDATE`,
      [r.node_id]
    );
    if (devRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: `Device ${r.node_id} belum terdaftar. Daftarkan dulu di tabel devices.`,
      });
    }
    const device = devRes.rows[0];

    // 2. Ambil threshold: khusus device kalau ada, kalau tidak pakai default
    const thRes = await client.query(
      `SELECT * FROM thresholds
        WHERE device_id = $1 OR device_id IS NULL
        ORDER BY device_id NULLS LAST LIMIT 1`,
      [device.id]
    );
    if (thRes.rowCount === 0) throw new Error('Threshold belum diisi. Jalankan seed migration.');
    const threshold = thRes.rows[0];

    // 3. Pembacaan sebelumnya -> untuk hitung laju kenaikan air
    const prevRes = await client.query(
      `SELECT ketinggian_air_cm, recorded_at FROM sensor_readings
        WHERE device_id = $1 AND recorded_at < $2 AND ketinggian_air_cm IS NOT NULL
        ORDER BY recorded_at DESC LIMIT 1`,
      [device.id, r.recorded_at]
    );
    const laju = hitungLaju(r, prevRes.rows[0]);

    // 4. Cek threshold -> status bahaya
    const { status, alasan } = tentukanStatus({ ...r, laju_kenaikan_cm_per_menit: laju }, threshold);

    // 5. Simpan pembacaan (abaikan kalau duplikat kiriman ulang dari buffer alat)
    const ins = await client.query(
      `INSERT INTO sensor_readings
         (device_id, recorded_at, ketinggian_air_cm, status_hujan, float_switch_aktif,
          baterai_persen, koneksi, kamera_url, laju_kenaikan_cm_per_menit,
          status_bahaya, alasan_status, raw_payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (device_id, recorded_at) DO NOTHING
       RETURNING id`,
      [device.id, r.recorded_at, r.ketinggian_air_cm, r.status_hujan, r.float_switch_aktif,
       r.baterai_persen, r.koneksi, r.kamera_url, laju, status, alasan.join('; '), req.body]
    );

    if (ins.rowCount === 0) {
      await client.query('COMMIT');
      return res.status(200).json({ success: true, duplikat: true, message: 'Data dengan timestamp ini sudah tersimpan sebelumnya' });
    }

    // 6. Update kondisi terakhir device, HANYA kalau data ini yang paling baru
    //    (data lama dari buffer tidak boleh menimpa status terkini)
    const upd = await client.query(
      `UPDATE devices SET
          last_status = $2, last_baterai_persen = COALESCE($3, last_baterai_persen),
          last_koneksi = COALESCE($4, last_koneksi), last_kamera_url = COALESCE($5, last_kamera_url),
          last_seen_at = $6, updated_at = NOW()
        WHERE id = $1 AND (last_seen_at IS NULL OR last_seen_at <= $6)`,
      [device.id, status, r.baterai_persen, r.koneksi, r.kamera_url, r.recorded_at]
    );
    const dataTerbaru = upd.rowCount === 1;

    // 7. Tandai kesehatan sensor ultrasonic
    await client.query(
      `UPDATE sensors SET status_kesehatan = $2 WHERE device_id = $1 AND jenis = 'ultrasonic'`,
      [device.id, r.ketinggian_air_cm == null ? 'bermasalah' : 'normal']
    );

    await client.query('COMMIT');

    const berubah = dataTerbaru && device.last_status !== status;
    if (berubah) {
      kirimNotifikasiPerubahanStatus({ device, statusLama: device.last_status, statusBaru: status, reading: r })
        .catch((e) => console.error('[NOTIF] gagal:', e.message));
    }

    return res.status(201).json({
      success: true,
      message: 'Data tersimpan',
      data: {
        reading_id: Number(ins.rows[0].id),
        node_id: device.node_id,
        status_bahaya: status,
        ...WARNA_STATUS[status],
        alasan,
        laju_kenaikan_cm_per_menit: laju,
        status_sebelumnya: device.last_status,
        status_berubah: berubah,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

module.exports = router;
