-- ══════════════════════════════════════════
-- InstaNeural：IG 帳號綁定
-- 存 Instagram Login 換來的長效 token，供自動發文與洞察數據回填使用。
-- 使用方式：Supabase 專案 → SQL Editor → 貼上全部內容 → Run
-- ══════════════════════════════════════════

create table if not exists ig_accounts (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  ig_user_id text not null,              -- Instagram 專業帳號的 user_id
  username text,                         -- @帳號，純顯示用
  access_token text not null,            -- 長效 token（60天，需定期 refresh）
  token_expires_at timestamptz,          -- 到期時間，前端只看這個判斷要不要提醒
  scopes text,                           -- 綁定當下實際拿到的權限，debug 用
  connected_at timestamptz default now(),
  refreshed_at timestamptz,
  updated_at timestamptz default now()
);

-- RLS 全開但「不給任何前端政策」：access_token 絕對不能被 anon/authenticated 讀到，
-- 一律只有後端的 service_role（會繞過 RLS）能存取，前端要資料就走 /api/ig-connect。
alter table ig_accounts enable row level security;

drop policy if exists "ig_accounts_no_client_access" on ig_accounts;
-- 刻意不建立任何 select/insert/update 政策 = 前端一律讀不到
