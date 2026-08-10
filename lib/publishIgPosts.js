const { supabase } = require('./supabase');
const { publishPost } = require('./instagram');

/* 掃描今天以前（含今天）已排程但尚未發布的 IG 貼文，逐一發布到富得財富管理官方 IG
   未設定 IG_ACCESS_TOKEN／IG_BUSINESS_ACCOUNT_ID 時安全跳過，不影響其他排程任務 */
async function runIgPublish() {
  if (!process.env.IG_ACCESS_TOKEN || !process.env.IG_BUSINESS_ACCOUNT_ID) {
    return { skipped: true, reason: '尚未設定 IG_ACCESS_TOKEN／IG_BUSINESS_ACCOUNT_ID' };
  }

  const todayStr = new Date().toISOString().split('T')[0];

  const { data: posts, error } = await supabase
    .from('ig_posts')
    .select('id, caption, image_url, scheduled_date')
    .eq('status', 'scheduled')
    .lte('scheduled_date', todayStr);

  if (error) {
    console.error('查詢待發布 IG 貼文失敗', error);
    return { error: error.message };
  }

  const results = [];
  for (const post of posts || []) {
    try {
      const { mediaId, permalink } = await publishPost(post.image_url, post.caption);
      await supabase.from('ig_posts').update({
        status: 'published',
        ig_media_id: mediaId,
        ig_permalink: permalink,
        published_at: new Date().toISOString(),
      }).eq('id', post.id);
      results.push({ id: post.id, status: 'published', mediaId });
    } catch (err) {
      console.error(`IG 發文失敗 post=${post.id}`, err);
      await supabase.from('ig_posts').update({
        status: 'failed',
        error_message: err.message,
      }).eq('id', post.id);
      results.push({ id: post.id, status: 'failed', error: err.message });
    }
  }

  return { publishedCount: results.filter(r => r.status === 'published').length, results };
}

module.exports = { runIgPublish };
