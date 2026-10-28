/**
 * Validasi payload JSON dari alat (format sesuai json.txt).
 * Return { ok: true, value } atau { ok: false, errors: [...] }.
 */
const STATUS_HUJAN = ['Tidak Hujan', 'Ringan', 'Sedang', 'Deras'];
const KONEKSI = ['WiFi', 'LoRa'];

function validasiTelemetri(body) {
  const errors = [];
  if (!body || typeof body !== 'object') {
    return { ok: false, errors: ['Body harus berupa JSON object'] };
  }

  const { node_id, timestamp, data, status_node } = body;

  if (typeof node_id !== 'string' || node_id.trim() === '') errors.push('node_id wajib diisi (string)');

  const waktu = new Date(timestamp);
  if (!timestamp || Number.isNaN(waktu.getTime())) {
    errors.push('timestamp wajib berformat ISO 8601, contoh 2026-10-27T10:05:00Z');
  } else if (waktu.getTime() > Date.now() + 5 * 60 * 1000) {
    errors.push('timestamp tidak boleh lebih dari 5 menit di masa depan (cek jam/RTC alat)');
  }

  if (!data || typeof data !== 'object') {
    errors.push('data wajib ada');
  } else {
    const t = data.ketinggian_air_cm;
    if (t !== null && t !== undefined && (typeof t !== 'number' || t < 0 || t > 9999)) {
      errors.push('data.ketinggian_air_cm harus angka 0-9999 atau null');
    }
    if (!STATUS_HUJAN.includes(data.status_hujan)) {
      errors.push(`data.status_hujan harus salah satu: ${STATUS_HUJAN.join(', ')}`);
    }
    if (data.float_switch_aktif !== undefined && typeof data.float_switch_aktif !== 'boolean') {
      errors.push('data.float_switch_aktif harus true/false');
    }
  }

  const sn = status_node || {};
  if (sn.baterai_persen !== undefined && sn.baterai_persen !== null &&
      (!Number.isInteger(sn.baterai_persen) || sn.baterai_persen < 0 || sn.baterai_persen > 100)) {
    errors.push('status_node.baterai_persen harus bilangan bulat 0-100');
  }
  if (sn.koneksi !== undefined && sn.koneksi !== null && !KONEKSI.includes(sn.koneksi)) {
    errors.push(`status_node.koneksi harus salah satu: ${KONEKSI.join(', ')}`);
  }
  if (sn.kamera_url !== undefined && sn.kamera_url !== null && typeof sn.kamera_url !== 'string') {
    errors.push('status_node.kamera_url harus string URL');
  }

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    value: {
      node_id: node_id.trim(),
      recorded_at: waktu.toISOString(),
      ketinggian_air_cm: data.ketinggian_air_cm ?? null,
      status_hujan: data.status_hujan,
      float_switch_aktif: data.float_switch_aktif ?? false,
      baterai_persen: sn.baterai_persen ?? null,
      koneksi: sn.koneksi ?? null,
      kamera_url: sn.kamera_url || null,
    },
  };
}

module.exports = { validasiTelemetri };
