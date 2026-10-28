/**
 * Logika penentuan status bahaya: AMAN / SIAGA / AWAS
 *
 * Mengikuti proposal ARIA (UC-04):
 *  - AMAN  : semua indikator normal.
 *  - SIAGA : salah satu indikator muncul (hujan deras ATAU air mulai naik).
 *  - AWAS  : kombinasi kritis (hujan deras DAN air naik), atau kondisi fisik
 *            sudah kritis sendiri (air melewati batas awas / float switch aktif /
 *            kenaikan sangat cepat).
 *
 * File ini sengaja dibuat "murni" (tanpa database) supaya gampang di-test.
 */

const LEVEL_HUJAN = { 'Tidak Hujan': 0, Ringan: 1, Sedang: 2, Deras: 3 };

const WARNA_STATUS = {
  AMAN: { warna: 'hijau', hex: '#22C55E' },
  SIAGA: { warna: 'kuning', hex: '#EAB308' },
  AWAS: { warna: 'merah', hex: '#EF4444' },
};

/**
 * Hitung laju kenaikan air (cm/menit) dibanding pembacaan sebelumnya.
 * Return null kalau tidak bisa dihitung (belum ada data lama, data terlalu jauh, dsb).
 */
function hitungLaju(sekarang, sebelumnya, maksJedaMenit = 30) {
  if (!sebelumnya || sekarang.ketinggian_air_cm == null || sebelumnya.ketinggian_air_cm == null) {
    return null;
  }
  const menit = (new Date(sekarang.recorded_at) - new Date(sebelumnya.recorded_at)) / 60000;
  if (menit <= 0 || menit > maksJedaMenit) return null;
  const laju = (Number(sekarang.ketinggian_air_cm) - Number(sebelumnya.ketinggian_air_cm)) / menit;
  return Math.round(laju * 1000) / 1000;
}

/**
 * @param {object} data   { ketinggian_air_cm, status_hujan, float_switch_aktif, laju_kenaikan_cm_per_menit }
 * @param {object} t      baris dari tabel thresholds
 * @returns {{ status: 'AMAN'|'SIAGA'|'AWAS', alasan: string[] }}
 */
function tentukanStatus(data, t) {
  const tinggi = data.ketinggian_air_cm == null ? null : Number(data.ketinggian_air_cm);
  const laju = data.laju_kenaikan_cm_per_menit == null ? null : Number(data.laju_kenaikan_cm_per_menit);

  const tSiaga = Number(t.tinggi_siaga_cm);
  const tAwas = Number(t.tinggi_awas_cm);
  const lSiaga = Number(t.laju_siaga_cm_per_menit);
  const lAwas = Number(t.laju_awas_cm_per_menit);

  const hujanSignifikan =
    (LEVEL_HUJAN[data.status_hujan] ?? 0) >= (LEVEL_HUJAN[t.hujan_siaga] ?? LEVEL_HUJAN.Deras);
  const airDiAtasSiaga = tinggi != null && tinggi >= tSiaga;
  const airDiAtasAwas = tinggi != null && tinggi >= tAwas;
  const lajuSiaga = laju != null && laju >= lSiaga;
  const lajuAwas = laju != null && laju >= lAwas;

  const alasan = [];

  // ---- AWAS ----
  if (data.float_switch_aktif) alasan.push('Float switch aktif (air mencapai batas pelampung)');
  if (airDiAtasAwas) alasan.push(`Ketinggian air ${tinggi} cm >= batas awas ${tAwas} cm`);
  if (lajuAwas) alasan.push(`Air naik sangat cepat (${laju} cm/menit >= ${lAwas})`);
  if (hujanSignifikan && (airDiAtasSiaga || lajuSiaga) && !airDiAtasAwas && !lajuAwas) {
    alasan.push(`Hujan ${data.status_hujan} disertai kenaikan air`);
  }
  if (alasan.length > 0) return { status: 'AWAS', alasan };

  // ---- SIAGA ----
  if (hujanSignifikan) alasan.push(`Hujan ${data.status_hujan}`);
  if (airDiAtasSiaga) alasan.push(`Ketinggian air ${tinggi} cm >= batas siaga ${tSiaga} cm`);
  if (lajuSiaga) alasan.push(`Air mulai naik (${laju} cm/menit >= ${lSiaga})`);
  if (alasan.length > 0) return { status: 'SIAGA', alasan };

  // ---- AMAN ----
  if (tinggi == null) return { status: 'AMAN', alasan: ['Sensor ultrasonic tidak terbaca, dinilai dari sensor lain'] };
  return { status: 'AMAN', alasan: ['Semua indikator normal'] };
}

module.exports = { tentukanStatus, hitungLaju, WARNA_STATUS, LEVEL_HUJAN };
