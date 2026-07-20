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

function stripTags(html) {
  return html.replace(/<[^>]+>/g, '').trim();
}

function truncate(text, maxLen) {
  return text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
}

/* 把 daily_market_note 的 <strong>標籤：</strong> 內容<br><br>... 拆成 { label, body } 卡片資料，
   並把 body 濃縮成一句重點，符合「文字簡化只講重點」的需求 */
function parseNoteToCards(html) {
  const paragraphs = html.split(/<br\s*\/?>\s*<br\s*\/?>/i);
  return paragraphs.map(p => {
    const m = p.match(/<strong>(.*?)<\/strong>\s*(.*)/s);
    const label = m ? stripTags(m[1]).replace(/[（(].*?[)）]/g, '').replace(/[：:]\s*$/, '') : '';
    const body = m ? stripTags(m[2]) : stripTags(p);
    return { label, body: truncate(body, 62) };
  });
}

const CARD_ICONS = { 0: { symbol: '◆', color: ACCENT }, 1: { symbol: '★', color: ORANGE }, 2: { symbol: '✓', color: GREEN } };

function drawIconBadge(doc, cx, cy, r, color, symbol) {
  doc.circle(cx, cy, r).fill(color);
  doc.fontSize(r).fillColor('#ffffff').text(symbol, cx - r, cy - r * 0.6, { width: r * 2, align: 'center', lineBreak: false });
}

function drawUpTriangle(doc, cx, cy, size, color) {
  doc.moveTo(cx, cy - size).lineTo(cx - size, cy + size).lineTo(cx + size, cy + size).closePath().fill(color);
}
function drawDot(doc, cx, cy, r, color) {
  doc.circle(cx, cy, r).fill(color);
}

function ratingIcon(rating) {
  if (rating.includes('風險上調')) return { color: ORANGE, kind: 'up' };
  if (rating.includes('積極買進')) return { color: GREEN, kind: 'up' };
  if (rating.includes('買進')) return { color: GREEN, kind: 'up' };
  return { color: GREY, kind: 'dot' };
}

function drawNoteCards(doc, noteContent, startY) {
  const cards = parseNoteToCards(noteContent);
  const cardW = (doc.page.width - PAGE_MARGIN * 2 - 16) / 3;
  let x = PAGE_MARGIN;
  const cardH = 108;

  cards.slice(0, 3).forEach((card, i) => {
    const icon = CARD_ICONS[i] || CARD_ICONS[0];
    doc.rect(x, startY, cardW, cardH).fill(LIGHT_GREY);
    doc.rect(x, startY, 4, cardH).fill(icon.color);
    drawIconBadge(doc, x + 24, startY + 24, 10, icon.color, icon.symbol);
    doc.font('cjk').fontSize(10.5).fillColor(ACCENT)
      .text(card.label, x + 42, startY + 16, { width: cardW - 58 });
    doc.font('cjk').fontSize(8.5).fillColor('#444444')
      .text(card.body, x + 14, startY + 42, { width: cardW - 28, lineGap: 2 });
    x += cardW + 8;
  });

  return startY + cardH + 20;
}

function drawStockTable(doc, title, picks, startY) {
  const startX = PAGE_MARGIN;
  doc.x = startX;
  doc.y = startY;
  doc.font('cjk').fontSize(12.5).fillColor(ACCENT).text(title, startX, startY);

  const colWidths = [20, 45, 90, 60, 55, 235];
  const tableWidth = colWidths.reduce((a, b) => a + b, 0);
  const headers = ['', '代號', '名稱', '評等', '目標區間', '重點'];

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
    const rowH = 22;
    if (idx % 2 === 1) doc.rect(startX, rowY, tableWidth, rowH).fill(LIGHT_GREY);

    const icon = ratingIcon(p.rating);
    const iconCx = startX + colWidths[0] / 2;
    const iconCy = rowY + rowH / 2;
    if (icon.kind === 'up') drawUpTriangle(doc, iconCx, iconCy, 4.5, icon.color);
    else drawDot(doc, iconCx, iconCy, 3.5, icon.color);

    let cx = startX + colWidths[0];
    const shortNote = truncate(p.note, 26);
    const cells = [p.code, p.name, p.rating, p.target, shortNote];
    cells.forEach((c, i) => {
      doc.fontSize(8).fillColor(i === 2 ? GREEN : ACCENT)
        .text(c, cx + 4, rowY + 6, { width: colWidths[i + 1] - 6, lineBreak: false });
      cx += colWidths[i + 1];
    });
    rowY += rowH;
  });

  return rowY + 14;
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

    // 封面標題
    doc.rect(0, 0, doc.page.width, 90).fill(ACCENT);
    drawDot(doc, 56, 45, 16, '#ffffff');
    doc.font('cjk').fontSize(14).fillColor(ACCENT).text('富', 48, 37, { width: 16, lineBreak: false });
    doc.font('cjk').fontSize(20).fillColor('#ffffff').text('富得財富管理', 84, 28);
    doc.fontSize(10).fillColor('#cccccc').text('FUDE WEALTH · 每日市場報告', 84, 58);
    doc.fillColor('#ffffff').fontSize(11).text(dateStr, 0, 38, { align: 'right', width: doc.page.width - 40 });

    // 每日核心觀點（重點卡片式，取代長篇文字）
    let y = drawNoteCards(doc, noteContent, 112);

    doc.moveTo(PAGE_MARGIN, y).lineTo(doc.page.width - PAGE_MARGIN, y).strokeColor(BORDER).stroke();
    y += 16;

    // 可進場個股
    y = drawStockTable(doc, '▲ 台股精選標的', TW_PICKS, y);
    y = drawStockTable(doc, '▲ 美股精選標的', US_PICKS, y);

    // 免責聲明
    doc.fontSize(7).fillColor(GREY).text(
      '⚠ 本報告內容僅供投資參考，不構成投資建議，過去績效不代表未來報酬。個股評等、目標價區間為顧問團隊主觀判斷，投資人應依個人風險承受度自行判斷，投資有風險。',
      PAGE_MARGIN, y, { width: doc.page.width - PAGE_MARGIN * 2, lineGap: 2 }
    );
    doc.fontSize(7).fillColor(GREY).text('富得財富管理 · Fude Wealth © ' + new Date().getFullYear(), PAGE_MARGIN, y + 22);

    doc.end();
  });
}

module.exports = { generateReportPdf };
