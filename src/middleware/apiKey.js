const crypto = require('crypto');

/**
 * Proteksi endpoint IoT dengan API Key statis (NF-02).
 * Alat wajib mengirim header:  x-api-key: <DEVICE_API_KEY>
 */
function cekApiKey(req, res, next) {
  const kunci = req.get('x-api-key') || '';
  const benar = process.env.DEVICE_API_KEY || '';

  const a = Buffer.from(kunci);
  const b = Buffer.from(benar);
  const valid = benar.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);

  if (!valid) {
    return res.status(401).json({ success: false, message: 'API key tidak valid atau tidak ada' });
  }
  next();
}

module.exports = cekApiKey;
