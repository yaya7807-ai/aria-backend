/**
 * Titik sambung notifikasi Telegram (UC-08).
 * Untuk sekarang hanya mencatat log. Nanti tinggal isi dengan request ke
 * https://api.telegram.org/bot<TOKEN>/sendMessage  (atau sendPhoto kalau ada kamera_url).
 *
 * Dipanggil SETELAH data tersimpan, dan kegagalannya tidak boleh
 * menggagalkan request dari alat (jalur data bersifat best-effort).
 */
async function kirimNotifikasiPerubahanStatus({ device, statusLama, statusBaru, reading }) {
  console.log(
    `[NOTIF] ${device.node_id} (${device.nama}) berubah ${statusLama} -> ${statusBaru}` +
      ` | air=${reading.ketinggian_air_cm} cm, hujan=${reading.status_hujan}` +
      (reading.kamera_url ? ` | foto=${reading.kamera_url}` : '')
  );
}

module.exports = { kirimNotifikasiPerubahanStatus };
