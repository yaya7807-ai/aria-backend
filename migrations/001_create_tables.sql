-- =====================================================================
-- A.R.I.A (Automated Rainfall & Inundation Alert)
-- Migration 001: struktur tabel utama
-- Database : PostgreSQL 13+
-- Tabel    : users, devices, sensors, sensor_readings, thresholds
-- =====================================================================

-- pgcrypto dipakai untuk hashing password (crypt + bcrypt) di seed
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------
-- 1. USERS  -> akun Admin Desa untuk login dashboard (UC-01)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id             SERIAL PRIMARY KEY,
    username       VARCHAR(50)  NOT NULL UNIQUE,
    password_hash  VARCHAR(255) NOT NULL,          -- bcrypt, BUKAN password asli
    nama_lengkap   VARCHAR(100) NOT NULL,
    role           VARCHAR(20)  NOT NULL DEFAULT 'admin'
                   CHECK (role IN ('admin', 'operator')),
    telegram_chat_id VARCHAR(50),                  -- opsional, untuk notifikasi pribadi
    is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- 2. DEVICES -> semua node di lapangan: Node Sensor, Node Sirine, Gateway
--    Kolom "last_*" menyimpan kondisi TERAKHIR supaya dashboard cepat
--    (tidak perlu scan seluruh riwayat sensor_readings).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS devices (
    id                 SERIAL PRIMARY KEY,
    node_id            VARCHAR(50)  NOT NULL UNIQUE,   -- sama dengan "node_id" di payload, mis. SENSOR_NODE_01
    nama               VARCHAR(100) NOT NULL,
    tipe               VARCHAR(20)  NOT NULL
                       CHECK (tipe IN ('sensor', 'sirine', 'gateway')),
    lokasi             VARCHAR(255),
    latitude           NUMERIC(9,6),
    longitude          NUMERIC(9,6),
    punya_kamera       BOOLEAN      NOT NULL DEFAULT FALSE,

    -- kondisi terakhir (diupdate setiap ada data masuk)
    last_status        VARCHAR(10)  NOT NULL DEFAULT 'AMAN'
                       CHECK (last_status IN ('AMAN', 'SIAGA', 'AWAS')),
    last_baterai_persen SMALLINT    CHECK (last_baterai_persen BETWEEN 0 AND 100),
    last_koneksi       VARCHAR(10)  CHECK (last_koneksi IN ('WiFi', 'LoRa')),
    last_kamera_url    TEXT,
    last_seen_at       TIMESTAMPTZ,                    -- dipakai untuk status online/offline (UC-09)

    is_active          BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- 3. SENSORS -> komponen sensor yang terpasang di tiap Node Sensor
--    (ultrasonic, raindrop, float switch, ESP-CAM)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sensors (
    id                SERIAL PRIMARY KEY,
    device_id         INTEGER      NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    jenis             VARCHAR(20)  NOT NULL
                      CHECK (jenis IN ('ultrasonic', 'raindrop', 'float_switch', 'kamera')),
    model             VARCHAR(50),                     -- mis. JSN-SR04T, ESP32-CAM
    satuan            VARCHAR(20),                     -- mis. cm, level, boolean
    status_kesehatan  VARCHAR(15)  NOT NULL DEFAULT 'normal'
                      CHECK (status_kesehatan IN ('normal', 'bermasalah')),
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (device_id, jenis)
);

-- ---------------------------------------------------------------------
-- 4. SENSOR_READINGS -> data pembacaan / riwayat telemetri (UC-03)
--    Satu baris = satu payload JSON dari alat.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sensor_readings (
    id                    BIGSERIAL PRIMARY KEY,
    device_id             INTEGER      NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    recorded_at           TIMESTAMPTZ  NOT NULL,       -- "timestamp" dari alat
    received_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(), -- waktu server menerima

    -- isi "data"
    ketinggian_air_cm     NUMERIC(6,2),                -- boleh NULL kalau sensor error
    status_hujan          VARCHAR(15)  NOT NULL
                          CHECK (status_hujan IN ('Tidak Hujan', 'Ringan', 'Sedang', 'Deras')),
    float_switch_aktif    BOOLEAN      NOT NULL DEFAULT FALSE,

    -- isi "status_node"
    baterai_persen        SMALLINT     CHECK (baterai_persen BETWEEN 0 AND 100),
    koneksi               VARCHAR(10)  CHECK (koneksi IN ('WiFi', 'LoRa')),
    kamera_url            TEXT,

    -- hasil olahan server
    laju_kenaikan_cm_per_menit NUMERIC(8,3),           -- dibanding pembacaan sebelumnya
    status_bahaya         VARCHAR(10)  NOT NULL
                          CHECK (status_bahaya IN ('AMAN', 'SIAGA', 'AWAS')),
    alasan_status         TEXT,                        -- penjelasan singkat kenapa statusnya begitu

    raw_payload           JSONB        NOT NULL,       -- payload asli, untuk audit/debug

    -- alat bisa kirim ulang data dari buffer (UC-03 exception) -> cegah duplikat
    UNIQUE (device_id, recorded_at)
);

-- index supaya query "data terbaru per device" & grafik riwayat tetap cepat (NF-03)
CREATE INDEX IF NOT EXISTS idx_readings_device_time
    ON sensor_readings (device_id, recorded_at DESC);

-- ---------------------------------------------------------------------
-- 5. THRESHOLDS -> ambang batas untuk menentukan AMAN / SIAGA / AWAS
--    device_id NULL  = threshold default (berlaku untuk semua device)
--    device_id terisi = threshold khusus device itu (menimpa default)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS thresholds (
    id                     SERIAL PRIMARY KEY,
    device_id              INTEGER REFERENCES devices(id) ON DELETE CASCADE,
    tinggi_siaga_cm        NUMERIC(6,2) NOT NULL,      -- air mulai naik
    tinggi_awas_cm         NUMERIC(6,2) NOT NULL,      -- air sudah kritis
    laju_siaga_cm_per_menit NUMERIC(6,2) NOT NULL,     -- kenaikan mulai cepat
    laju_awas_cm_per_menit  NUMERIC(6,2) NOT NULL,     -- kenaikan sangat cepat
    hujan_siaga            VARCHAR(15)  NOT NULL DEFAULT 'Deras'
                           CHECK (hujan_siaga IN ('Ringan', 'Sedang', 'Deras')),
    keterangan             TEXT,
    updated_by             INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (tinggi_awas_cm > tinggi_siaga_cm),
    CHECK (laju_awas_cm_per_menit > laju_siaga_cm_per_menit)
);

-- hanya boleh ada 1 threshold per device, dan 1 threshold default
CREATE UNIQUE INDEX IF NOT EXISTS uq_threshold_device
    ON thresholds (device_id) WHERE device_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_threshold_default
    ON thresholds ((device_id IS NULL)) WHERE device_id IS NULL;
