// Jalankan: npm test   (pakai test runner bawaan Node.js, tanpa library tambahan)
const test = require('node:test');
const assert = require('node:assert');
const { tentukanStatus, hitungLaju } = require('../src/services/threshold');
const { validasiTelemetri } = require('../src/validators/telemetry');

const T = {
  tinggi_siaga_cm: '100', tinggi_awas_cm: '150',
  laju_siaga_cm_per_menit: '1', laju_awas_cm_per_menit: '3', hujan_siaga: 'Deras',
};
const base = { ketinggian_air_cm: 40, status_hujan: 'Tidak Hujan', float_switch_aktif: false, laju_kenaikan_cm_per_menit: null };

test('payload json.txt (150.5 cm, hujan Deras) -> AWAS', () => {
  const r = tentukanStatus({ ...base, ketinggian_air_cm: 150.5, status_hujan: 'Deras' }, T);
  assert.strictEqual(r.status, 'AWAS');
});

test('semua normal -> AMAN', () => {
  assert.strictEqual(tentukanStatus(base, T).status, 'AMAN');
});

test('hanya hujan deras -> SIAGA', () => {
  assert.strictEqual(tentukanStatus({ ...base, status_hujan: 'Deras' }, T).status, 'SIAGA');
});

test('hanya air di atas batas siaga -> SIAGA', () => {
  assert.strictEqual(tentukanStatus({ ...base, ketinggian_air_cm: 110 }, T).status, 'SIAGA');
});

test('hujan deras + air naik (laju >= siaga) -> AWAS', () => {
  const r = tentukanStatus({ ...base, status_hujan: 'Deras', laju_kenaikan_cm_per_menit: 1.5 }, T);
  assert.strictEqual(r.status, 'AWAS');
});

test('float switch aktif -> AWAS walau sensor lain normal', () => {
  assert.strictEqual(tentukanStatus({ ...base, float_switch_aktif: true }, T).status, 'AWAS');
});

test('laju sangat cepat tanpa hujan (air kiriman) -> AWAS', () => {
  assert.strictEqual(tentukanStatus({ ...base, laju_kenaikan_cm_per_menit: 4 }, T).status, 'AWAS');
});

test('hujan Sedang tidak dihitung kalau hujan_siaga = Deras', () => {
  assert.strictEqual(tentukanStatus({ ...base, status_hujan: 'Sedang' }, T).status, 'AMAN');
});

test('ultrasonic null tetap bisa dinilai dari sensor lain', () => {
  assert.strictEqual(tentukanStatus({ ...base, ketinggian_air_cm: null, status_hujan: 'Deras' }, T).status, 'SIAGA');
});

test('hitungLaju: naik 10 cm dalam 5 menit = 2 cm/menit', () => {
  const laju = hitungLaju(
    { ketinggian_air_cm: 60, recorded_at: '2026-10-27T10:05:00Z' },
    { ketinggian_air_cm: '50', recorded_at: new Date('2026-10-27T10:00:00Z') }
  );
  assert.strictEqual(laju, 2);
});

test('hitungLaju: jeda > 30 menit diabaikan', () => {
  const laju = hitungLaju(
    { ketinggian_air_cm: 60, recorded_at: '2026-10-27T11:05:00Z' },
    { ketinggian_air_cm: 50, recorded_at: '2026-10-27T10:00:00Z' }
  );
  assert.strictEqual(laju, null);
});

test('validasi menerima payload json.txt', () => {
  const payload = {
    node_id: 'SENSOR_NODE_01', timestamp: '2026-10-27T10:05:00Z',
    data: { ketinggian_air_cm: 150.5, status_hujan: 'Deras', float_switch_aktif: false },
    status_node: { baterai_persen: 85, koneksi: 'WiFi', kamera_url: 'http://link-gambar-espcam.com/snapshot1.jpg' },
  };
  assert.strictEqual(validasiTelemetri(payload).ok, true);
});

test('validasi menolak status_hujan asal-asalan', () => {
  const r = validasiTelemetri({ node_id: 'X', timestamp: '2026-10-27T10:05:00Z', data: { status_hujan: 'banget' } });
  assert.strictEqual(r.ok, false);
});
