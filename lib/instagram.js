const IG_API = 'https://graph.facebook.com/v21.0';

/* 建立媒體容器（第一步）：把圖片網址＋文案送給 IG，取得 creation_id */
async function createMediaContainer(imageUrl, caption) {
  const igUserId = process.env.IG_BUSINESS_ACCOUNT_ID;
  const token = process.env.IG_ACCESS_TOKEN;
  const params = new URLSearchParams({
    image_url: imageUrl,
    caption: caption || '',
    access_token: token,
  });
  const res = await fetch(`${IG_API}/${igUserId}/media`, { method: 'POST', body: params });
  const data = await res.json();
  if (!res.ok) throw new Error(`IG 建立媒體容器失敗: ${JSON.stringify(data)}`);
  return data.id; // creation_id
}

/* 查詢容器處理狀態，等到 FINISHED 才能發布（圖片通常很快，但仍需輪詢確認） */
async function waitForContainerReady(creationId, { retries = 10, delayMs = 2000 } = {}) {
  const token = process.env.IG_ACCESS_TOKEN;
  for (let i = 0; i < retries; i++) {
    const res = await fetch(`${IG_API}/${creationId}?fields=status_code&access_token=${token}`);
    const data = await res.json();
    if (data.status_code === 'FINISHED') return true;
    if (data.status_code === 'ERROR') throw new Error(`IG 媒體容器處理失敗: ${JSON.stringify(data)}`);
    await new Promise(r => setTimeout(r, delayMs));
  }
  throw new Error('IG 媒體容器處理逾時');
}

/* 發布容器（第二步）：正式貼到 IG 上，回傳貼文的 media id */
async function publishContainer(creationId) {
  const igUserId = process.env.IG_BUSINESS_ACCOUNT_ID;
  const token = process.env.IG_ACCESS_TOKEN;
  const params = new URLSearchParams({ creation_id: creationId, access_token: token });
  const res = await fetch(`${IG_API}/${igUserId}/media_publish`, { method: 'POST', body: params });
  const data = await res.json();
  if (!res.ok) throw new Error(`IG 發布失敗: ${JSON.stringify(data)}`);
  return data.id; // 貼文 media id
}

/* 取得貼文的公開連結（permalink），方便存回資料庫供後台顯示 */
async function getPermalink(mediaId) {
  const token = process.env.IG_ACCESS_TOKEN;
  const res = await fetch(`${IG_API}/${mediaId}?fields=permalink&access_token=${token}`);
  const data = await res.json();
  if (!res.ok) return null;
  return data.permalink || null;
}

/* 一次完成：建立容器 → 等待處理完成 → 發布 → 回傳 media id 與連結 */
async function publishPost(imageUrl, caption) {
  const creationId = await createMediaContainer(imageUrl, caption);
  await waitForContainerReady(creationId);
  const mediaId = await publishContainer(creationId);
  const permalink = await getPermalink(mediaId);
  return { mediaId, permalink };
}

module.exports = { createMediaContainer, waitForContainerReady, publishContainer, getPermalink, publishPost };
