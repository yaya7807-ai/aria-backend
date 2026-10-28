# ARIA Backend

Backend API untuk **A.R.I.A (Automated Rainfall & Inundation Alert)**, Early Warning System banjir berbasis IoT.
Stack: **Node.js (Express) + PostgreSQL**.

Tugas backend:
1. Menerima data telemetri JSON dari Node Sensor / Gateway (`POST /api/telemetry`)
2. Menyimpan ke database
3. Mengecek threshold → status **AMAN / SIAGA / AWAS**
4. Menyediakan data untuk dashboard frontend (`GET /api/dashboard`, dll.)

---

## 1. Cara menjalankan di laptop

Yang perlu di-install: **Node.js 18+** dan **PostgreSQL**.

```bash
# 1. install library
npm install

# 2. buat database kosong (sekali saja)
psql -U postgres -c "CREATE DATABASE aria_db;"

# 3. buat file .env dari contoh, lalu edit isinya
cp .env.example .env

# 4. buat tabel + data awal
npm run migrate

# 5. jalankan server
npm run dev
```

Server jalan di `http://localhost:3000`. Cek: buka `http://localhost:3000/api/health`.

Jalankan tes logika threshold: `npm test`

Akun admin awal (dari seed): **admin / admin123** — ganti setelah fitur login dibuat.

---

## 2. Push ke GitHub

```bash
git init
git add .
git commit -m "feat: skema database ARIA + endpoint POST telemetri dengan cek threshold"
git branch -M main
git remote add origin https://github.com/<akun-atau-organisasi>/<nama-repo>.git
git push -u origin main
```

File `.env` **tidak ikut ter-push** (sudah ada di `.gitignore`) karena berisi password database dan API key.

---

## 3. Struktur database

| Tabel | Isi |
|---|---|
| `users` | Akun Admin Desa (password di-hash bcrypt) |
| `devices` | Semua node: Node Sensor, Node Sirine, Gateway + kondisi terakhirnya (`last_status`, `last_seen_at`, baterai, koneksi, URL kamera) |
| `sensors` | Komponen sensor di tiap node (ultrasonic, raindrop, float switch, kamera) + status kesehatan |
| `sensor_readings` | Riwayat data pembacaan (1 baris = 1 payload JSON), termasuk laju kenaikan air dan status bahaya hasil hitungan server |
| `thresholds` | Ambang batas siaga/awas. `device_id` kosong = default untuk semua device |

```
users 1──* thresholds (updated_by)
devices 1──* sensors
devices 1──* sensor_readings
devices 1──0..1 thresholds
```

File SQL ada di folder `migrations/`:
- `001_create_tables.sql` → membuat 5 tabel di atas
- `002_seed_data.sql` → admin awal, threshold default, dan `SENSOR_NODE_01`

---

## 4. Logika threshold (status bahaya)

Threshold default (bisa diubah di tabel `thresholds`):

| Parameter | Siaga | Awas |
|---|---|---|
| Ketinggian air | ≥ 100 cm | ≥ 150 cm |
| Laju kenaikan air | ≥ 1 cm/menit | ≥ 3 cm/menit |
| Hujan | `Deras` | — |

Aturan (sesuai UC-04 di proposal):

- **AWAS** jika salah satu terjadi:
  - float switch aktif, atau
  - ketinggian air ≥ batas awas, atau
  - laju kenaikan ≥ batas awas, atau
  - **hujan deras DAN air naik** (tinggi ≥ siaga atau laju ≥ siaga)
- **SIAGA** jika hanya salah satu indikator muncul: hujan deras, ATAU tinggi ≥ siaga, ATAU laju ≥ siaga
- **AMAN** jika semua normal

Laju kenaikan dihitung server dari pembacaan sebelumnya (maksimal jeda 30 menit).
Logikanya ada di `src/services/threshold.js`.

> Angka threshold di atas masih perkiraan. Kalibrasi bareng tim hardware di lokasi uji.

---

## 5. Dokumentasi API

### `POST /api/telemetry` — dipakai **alat (hardware)**

Header:
```
Content-Type: application/json
x-api-key: <DEVICE_API_KEY dari .env>
```

Body (contoh `json.txt`):
```json
{
  "node_id": "SENSOR_NODE_01",
  "timestamp": "2026-10-27T10:05:00Z",
  "data": {
    "ketinggian_air_cm": 150.5,
    "status_hujan": "Deras",
    "float_switch_aktif": false
  },
  "status_node": {
    "baterai_persen": 85,
    "koneksi": "WiFi",
    "kamera_url": "http://link-gambar-espcam.com/snapshot1.jpg"
  }
}
```

Aturan isi:
- `node_id` harus sudah terdaftar di tabel `devices`
- `timestamp` format ISO 8601 UTC (akhiran `Z`)
- `ketinggian_air_cm` angka, atau `null` kalau sensor ultrasonic error. Ini **tinggi air**, bukan jarak sensor ke air.
- `status_hujan`: `Tidak Hujan` | `Ringan` | `Sedang` | `Deras`
- `koneksi`: `WiFi` | `LoRa`

Respon sukses `201`:
```json
{
  "success": true,
  "message": "Data tersimpan",
  "data": {
    "reading_id": 2,
    "node_id": "SENSOR_NODE_01",
    "status_bahaya": "AWAS",
    "warna": "merah",
    "hex": "#EF4444",
    "alasan": ["Ketinggian air 150.5 cm >= batas awas 150 cm"],
    "laju_kenaikan_cm_per_menit": 22.1,
    "status_sebelumnya": "AMAN",
    "status_berubah": true
  }
}
```

Respon lain:
| Kode | Arti |
|---|---|
| `200` + `"duplikat": true` | Data dengan timestamp sama sudah pernah masuk (aman untuk kirim ulang dari buffer) |
| `400` | Payload salah, lihat `errors` |
| `401` | API key salah / tidak ada |
| `404` | `node_id` belum terdaftar |

Tes cepat pakai curl:
```bash
curl -X POST http://localhost:3000/api/telemetry \
  -H "Content-Type: application/json" \
  -H "x-api-key: ganti-dengan-kunci-rahasia-panjang" \
  -d @contoh-payload.json
```

### `GET /api/dashboard` — dipakai **frontend**

Kondisi terkini semua node, untuk kotak **Ketinggian Air**, **Status Hujan**, **Pantauan Kamera**:

```json
{
  "success": true,
  "server_time": "2026-10-28T03:03:29.494Z",
  "data": [
    {
      "node_id": "SENSOR_NODE_01",
      "nama": "Node Sensor 01",
      "tipe": "sensor",
      "lokasi": "Titik rawan genangan 1",
      "status_bahaya": "AWAS",
      "warna": "merah",
      "hex": "#EF4444",
      "online": true,
      "last_seen_at": "2026-10-27T10:05:00.000Z",
      "ketinggian_air_cm": 150.5,
      "status_hujan": "Deras",
      "float_switch_aktif": false,
      "laju_kenaikan_cm_per_menit": 22.1,
      "alasan_status": "Ketinggian air 150.5 cm >= batas awas 150 cm",
      "baterai_persen": 85,
      "koneksi": "WiFi",
      "kamera_url": "http://link-gambar-espcam.com/snapshot1.jpg"
    }
  ]
}
```

- Warna komponen ikuti `warna` / `hex`: **hijau** = AMAN, **kuning** = SIAGA, **merah** = AWAS.
- `online` terpisah dari status bahaya: node offline jangan ditampilkan sebagai "aman" (lihat 3.1.1 proposal).
- `kamera_url` bernilai `null` untuk node tanpa ESP-CAM.

### Endpoint lain
| Method | Path | Kegunaan |
|---|---|---|
| GET | `/api/health` | Cek server hidup |
| GET | `/api/devices/:nodeId/latest` | Kondisi terkini 1 node |
| GET | `/api/devices/:nodeId/readings?limit=50` | Riwayat untuk grafik (urut lama → baru, maks 500) |
| GET | `/api/thresholds` | Nilai ambang batas (untuk garis batas di grafik) |

---

## 6. Menambah device baru

```sql
INSERT INTO devices (node_id, nama, tipe, lokasi, punya_kamera)
VALUES ('SENSOR_NODE_02', 'Node Sensor 02', 'sensor', 'Dekat balai desa', FALSE);
```

Threshold khusus untuk satu device (opsional):
```sql
INSERT INTO thresholds (device_id, tinggi_siaga_cm, tinggi_awas_cm,
                        laju_siaga_cm_per_menit, laju_awas_cm_per_menit)
SELECT id, 80, 120, 1, 3 FROM devices WHERE node_id = 'SENSOR_NODE_02';
```

---

## 7. Langkah berikutnya (belum dikerjakan)

- [ ] Login admin + JWT (UC-01), lalu kunci endpoint GET dengan token
- [ ] Kirim notifikasi Telegram saat status berubah (UC-08) → isi `src/services/notifier.js`
- [ ] Endpoint heartbeat Node Sirine (UC-07) dan penanda offline (UC-09)
- [ ] Deploy ke Railway / VPS
