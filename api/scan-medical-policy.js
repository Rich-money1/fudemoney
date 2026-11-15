const { scanMedicalPolicy } = require('../lib/scanMedicalPolicy');

// medical.html本身沒有登入機制，這支API也刻意不加帳號驗證，靠前端一次最多3張+壓圖控制用量
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'Method not allowed' }); return; }

  try {
    const { images } = req.body || {};
    const result = await scanMedicalPolicy(images);
    res.status(200).json({ ok: true, result });
  } catch (err) {
    console.error('醫療險保單辨識失敗', err);
    res.status(400).json({ ok: false, error: err.message });
  }
};
