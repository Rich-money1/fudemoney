const { createClient } = require('@supabase/supabase-js');

// 後端一律用 service_role key：繞過 RLS，因為後端本身就是受信任環境
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = { supabase };
