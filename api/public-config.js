/* 提供前端頁面登入用的公開設定：SUPABASE_URL + SUPABASE_ANON_KEY。
   anon key本來就是設計給前端直接使用的公開金鑰，實際資料權限由RLS政策把關，不是密鑰外洩。 */
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  res.status(200).json({
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  });
};
