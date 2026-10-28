-- =====================================================================
-- Migration 002: data awal (seed) untuk development & testing
-- GANTI password admin setelah login pertama!
-- =====================================================================

-- Admin default -> username: admin | password: admin123
INSERT INTO users (username, password_hash, nama_lengkap, role)
VALUES ('admin', crypt('admin123', gen_salt('bf', 10)), 'Admin Desa', 'admin')
ON CONFLICT (username) DO NOTHING;

-- Threshold DEFAULT (berlaku untuk semua device yang tidak punya threshold khusus)
-- Angka ini masih perkiraan -> kalibrasi bareng tim hardware di lokasi uji.
INSERT INTO thresholds
    (device_id, tinggi_siaga_cm, tinggi_awas_cm,
     laju_siaga_cm_per_menit, laju_awas_cm_per_menit, hujan_siaga, keterangan)
SELECT NULL, 100, 150, 1.0, 3.0, 'Deras', 'Threshold default sistem'
WHERE NOT EXISTS (SELECT 1 FROM thresholds WHERE device_id IS NULL);

-- Node Sensor contoh (sesuai payload json.txt)
INSERT INTO devices (node_id, nama, tipe, lokasi, punya_kamera)
VALUES ('SENSOR_NODE_01', 'Node Sensor 01', 'sensor', 'Titik rawan genangan 1', TRUE)
ON CONFLICT (node_id) DO NOTHING;

-- Komponen sensor di SENSOR_NODE_01
INSERT INTO sensors (device_id, jenis, model, satuan)
SELECT d.id, s.jenis, s.model, s.satuan
FROM devices d
CROSS JOIN (VALUES
    ('ultrasonic',   'JSN-SR04T',      'cm'),
    ('raindrop',     'Raindrop FC-37', 'level'),
    ('float_switch', 'Float switch',   'boolean'),
    ('kamera',       'ESP32-CAM',      'url')
) AS s(jenis, model, satuan)
WHERE d.node_id = 'SENSOR_NODE_01'
ON CONFLICT (device_id, jenis) DO NOTHING;
