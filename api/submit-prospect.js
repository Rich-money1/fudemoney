const { supabase } = require('../lib/supabase');

/* 公開端點：客戶專屬網站的意向表單提交（未登入訪客使用）
   對應 prospects 表，owner_id 依網址推廣代碼（?ref=顧問 profiles.id）歸屬顧問，
   沒有帶代碼或代碼格式不對就留空，依 migration_prospects_owner.sql 的政策歸管理者可見。 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTACT_METHODS = ['line', 'instagram', 'phone'];
const DEBT_STATUSES = ['none', 'credit', 'car', 'both'];
const CONTACT_TIMES = ['9-12', '12-17', '17-21'];
const INVEST_OPTIONS = ['stock', 'etf', 'insurance', 'fund', 'cash', 'none'];

function toNumberOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  const contactMethod = CONTACT_METHODS.includes(body.contact_method) ? body.contact_method : null;
  const contactValue = typeof body.contact_value === 'string' ? body.contact_value.trim().slice(0, 200) : '';

  if (!contactMethod || !contactValue) {
    res.status(400).json({ error: '請填寫聯絡方式' });
    return;
  }

  const investedOptions = Array.isArray(body.invested_options)
    ? body.invested_options.filter(o => INVEST_OPTIONS.includes(o))
    : [];

  const ownerId = typeof body.ref === 'string' && UUID_RE.test(body.ref) ? body.ref : null;

  const row = {
    line_id: contactValue,
    contact_method: contactMethod,
    principal: toNumberOrNull(body.principal),
    monthly_expense: toNumberOrNull(body.monthly_expense),
    desired_monthly_dividend: toNumberOrNull(body.desired_monthly_dividend),
    loan_amount: toNumberOrNull(body.loan_amount),
    invested_options: investedOptions,
    monthly_income: typeof body.monthly_income === 'string' ? body.monthly_income.slice(0, 50) : null,
    preferred_contact_time: CONTACT_TIMES.includes(body.preferred_contact_time) ? body.preferred_contact_time : null,
    debt_status: DEBT_STATUSES.includes(body.debt_status) ? body.debt_status : null,
    owner_id: ownerId,
  };

  try {
    const { error } = await supabase.from('prospects').insert(row);
    if (error) throw error;
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('新增準客戶名單失敗', err);
    res.status(500).json({ error: '提交失敗，請稍後再試或直接聯繫顧問' });
  }
};
