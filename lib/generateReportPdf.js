const PDFDocument = require('pdfkit');
const path = require('path');
const { TW_PICKS, US_PICKS } = require('./stockPicks');

const FONT_PATH = path.join(__dirname, '..', 'assets', 'NotoSansTC-Regular.otf');
const ACCENT = '#1a1a1a';
const GREEN = '#1a6e3c';
const ORANGE = '#b45309';
const GREY = '#888888';
const LIGHT_GREY = '#f5f4f0';
const BORDER = '#dddddd';
const PAGE_MARGIN = 40;
const PAGE_BOTTOM = 800; // A4高度841.89扣掉底部安全邊距

function stripTags(html) {
  return html.replace(/<[^>]+>/g, '').trim();
}

/* 把 daily_market_note 的 <strong>標籤：</strong> 內容<br><br>... 拆成 { label, body } 區塊，
   body 保留完整內容（不截斷），讓報告呈現完整的多層次分析而非只有一句話摘要 */
function parseNoteToSections(html) {
  const paragraphs = html.split(/<br\s*\/?>\s*<br\s*\/?>/i);
  return paragraphs.map(p => {
    const m = p.match(/<strong>(.*?)<\/strong>\s*(.*)/s);
    const label = m ? stripTags(m[1]).replace(/[（(].*?[)）]/g, '').replace(/[：:]\s*$/, '') : '';
    const body = m ? stripTags(m[2]) : stripTags(p);
    return { label, body };
  }).filter(s => s.body);
}

const SECTION_ICONS = [
  { symbol: '◆', color: ACCENT },
  { symbol: '?', color: ORANGE },
  { symbol: '★', color: '#1565a0' },
  { symbol: '✓', color: GREEN },
  { symbol: '●', color: GREY },
];

function drawIconBadge(doc, cx, cy, r, color, symbol) {
  doc.circle(cx, cy, r).fill(color);
  doc.font('cjk').fontSize(r).fillColor('#ffffff').text(symbol, cx - r, cy - r * 0.62, { width: r * 2, align: 'center', lineBreak: false });
}

function drawUpTriangle(doc, cx, cy, size, color) {
  doc.moveTo(cx, cy - size).lineTo(cx - size, cy + size).lineTo(cx + size, cy + size).closePath().fill(color);
}
function drawDot(doc, cx, cy, r, color) {
  doc.circle(cx, cy, r).fill(color);
}

function ratingIcon(rating) {
  if (rating.includes('風險上調')) return { color: ORANGE, kind: 'up' };
  if (rating.includes('買進')) return { color: GREEN, kind: 'up' };
  return { color: GREY, kind: 'dot' };
}

/* 確保接下來要畫的區塊有足夠空間，不夠就自動換頁 */
function ensureSpace(doc, neededHeight) {
  if (doc.y + neededHeight > PAGE_BOTTOM) {
    doc.addPage();
    doc.y = PAGE_MARGIN;
  }
}

function drawNoteSections(doc, noteContent) {
  const sections = parseNoteToSections(noteContent);
  const contentW = doc.page.width - PAGE_MARGIN * 2;

  sections.forEach((section, i) => {
    const icon = SECTION_ICONS[i] || SECTION_ICONS[0];
    ensureSpace(doc, 50);

    const blockTop = doc.y;
    drawIconBadge(doc, PAGE_MARGIN + 10, blockTop + 10, 9, icon.color, icon.symbol);
    doc.font('cjk').fontSize(11.5).fillColor(icon.color)
      .text(section.label, PAGE_MARGIN + 28, blockTop + 2, { width: contentW - 28 });

    doc.font('cjk').fontSize(9).fillColor('#333333')
      .text(section.body, PAGE_MARGIN + 28, doc.y + 4, { width: contentW - 28, lineGap: 3 });

    doc.rect(PAGE_MARGIN, blockTop - 4, 3, doc.y - blockTop + 4).fill(icon.color);
    doc.y += 14;
  });
}

function drawStockTable(doc, title, picks) {
  ensureSpace(doc, 40 + picks.length * 26);
  const startX = PAGE_MARGIN;
  const startY = doc.y;
  doc.x = startX;
  doc.font('cjk').fontSize(12.5).fillColor(ACCENT).text(title, startX, startY);

  const colWidths = [20, 45, 90, 60, 55, 235];
  const tableWidth = colWidths.reduce((a, b) => a + b, 0);
  const headers = ['', '代號', '名稱', '評等', '目標區間', '重點解說'];

  const headerY = startY + 20;
  doc.rect(startX, headerY, tableWidth, 16).fill(ACCENT);
  doc.fontSize(8).fillColor('#ffffff');
  let x = startX;
  headers.forEach((h, i) => {
    if (h) doc.text(h, x + 4, headerY + 4, { width: colWidths[i] - 6, lineBreak: false });
    x += colWidths[i];
  });

  let rowY = headerY + 16;
  picks.forEach((p, idx) => {
    const rowH = 26;
    if (idx % 2 === 1) doc.rect(startX, rowY, tableWidth, rowH).fill(LIGHT_GREY);

    const icon = ratingIcon(p.rating);
    const iconCx = startX + colWidths[0] / 2;
    const iconCy = rowY + rowH / 2;
    if (icon.kind === 'up') drawUpTriangle(doc, iconCx, iconCy, 4.5, icon.color);
    else drawDot(doc, iconCx, iconCy, 3.5, icon.color);

    let cx = startX + colWidths[0];
    const cells = [p.code, p.name, p.rating, p.target, p.note];
    cells.forEach((c, i) => {
      doc.fontSize(7.8).fillColor(i === 2 ? GREEN : ACCENT)
        .text(c, cx + 4, rowY + 4, { width: colWidths[i + 1] - 6, lineGap: 1 });
      cx += colWidths[i + 1];
    });
    rowY = Math.max(rowY + rowH, doc.y + 4);
  });

  doc.y = rowY + 12;
}

function drawHeader(doc, dateStr) {
  doc.rect(0, 0, doc.page.width, 90).fill(ACCENT);
  drawDot(doc, 56, 45, 16, '#ffffff');
  doc.font('cjk').fontSize(14).fillColor(ACCENT).text('富', 48, 37, { width: 16, lineBreak: false });
  doc.font('cjk').fontSize(20).fillColor('#ffffff').text('富得財富管理', 84, 28);
  doc.fontSize(10).fillColor('#cccccc').text('FUDE WEALTH · 每日市場報告', 84, 58);
  doc.fillColor('#ffffff').fontSize(11).text(dateStr, 0, 38, { align: 'right', width: doc.page.width - 40 });
  doc.y = 112;
}

async function generateReportPdf({ dateStr, noteContent }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.registerFont('cjk', FONT_PATH);
    doc.font('cjk');

    drawHeader(doc, dateStr);

    // 每日投資觀點（完整多層次分析：核心觀點/原因拆解/本週焦點/操作建議）
    drawNoteSections(doc, noteContent);

    doc.moveTo(PAGE_MARGIN, doc.y).lineTo(doc.page.width - PAGE_MARGIN, doc.y).strokeColor(BORDER).stroke();
    doc.y += 16;

    // 可進場個股
    drawStockTable(doc, '▲ 台股精選標的', TW_PICKS);
    drawStockTable(doc, '▲ 美股精選標的', US_PICKS);

    // 免責聲明
    ensureSpace(doc, 40);
    doc.fontSize(7).fillColor(GREY).text(
      '⚠ 本報告內容僅供投資參考，不構成投資建議，過去績效不代表未來報酬。個股評等、目標價區間為顧問團隊主觀判斷，投資人應依個人風險承受度自行判斷，投資有風險。',
      PAGE_MARGIN, doc.y, { width: doc.page.width - PAGE_MARGIN * 2, lineGap: 2 }
    );
    doc.fontSize(7).fillColor(GREY).text('富得財富管理 · Fude Wealth © ' + new Date().getFullYear(), PAGE_MARGIN, doc.y + 10);

    doc.end();
  });
}

module.exports = { generateReportPdf };
