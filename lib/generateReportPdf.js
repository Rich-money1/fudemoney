const PDFDocument = require('pdfkit');
const path = require('path');
const { TW_PICKS, US_PICKS } = require('./stockPicks');

const FONT_PATH = path.join(__dirname, '..', 'assets', 'NotoSansTC-Regular.otf');
const ACCENT = '#1a1a1a';
const GREEN = '#1a6e3c';
const GREY = '#666666';
const BORDER = '#dddddd';

/* 把 daily_market_note 存的 <strong>/<em>/<br> HTML片段，拆解成 pdfkit 可逐段渲染的區塊
   每個區塊: { text, bold: boolean, color: string } */
function parseNoteHtml(html) {
  const paragraphs = html.split(/<br\s*\/?>\s*<br\s*\/?>/i);
  return paragraphs.map(p => {
    const segments = [];
    const re = /<strong>(.*?)<\/strong>|<em>(.*?)<\/em>|([^<]+)/g;
    let m;
    while ((m = re.exec(p)) !== null) {
      if (m[1] !== undefined) segments.push({ text: m[1], bold: true, color: ACCENT });
      else if (m[2] !== undefined) segments.push({ text: m[2], bold: false, color: GREEN });
      else if (m[3] !== undefined && m[3].trim()) segments.push({ text: m[3], bold: false, color: ACCENT });
    }
    return segments;
  });
}

const PAGE_MARGIN = 40;

function drawStockTable(doc, title, picks, startY) {
  const startX = PAGE_MARGIN;
  doc.x = startX;
  doc.y = startY;
  doc.font('cjk').fontSize(13).fillColor(ACCENT).text(title, startX, startY);

  const colWidths = [55, 95, 65, 65, 220];
  const tableWidth = colWidths.reduce((a, b) => a + b, 0);
  const headers = ['代號', '名稱', '評等', '目標區間', '重點'];

  const headerY = startY + 22;
  doc.rect(startX, headerY, tableWidth, 18).fill(ACCENT);
  doc.fontSize(8.5).fillColor('#ffffff');
  let x = startX;
  headers.forEach((h, i) => {
    doc.text(h, x + 4, headerY + 5, { width: colWidths[i] - 6, lineBreak: false });
    x += colWidths[i];
  });

  let rowY = headerY + 18;
  picks.forEach((p, idx) => {
    const rowH = 30;
    if (idx % 2 === 1) {
      doc.rect(startX, rowY, tableWidth, rowH).fill('#f5f4f0');
    }
    let cx = startX;
    const cells = [p.code, p.name, p.rating, p.target, p.note];
    cells.forEach((c, i) => {
      doc.fontSize(8.5).fillColor(i === 2 ? GREEN : ACCENT)
        .text(c, cx + 4, rowY + 4, { width: colWidths[i] - 6 });
      cx += colWidths[i];
    });
    rowY += rowH;
  });

  return rowY + 12; // 回傳表格結束後的 y 座標，供下一個區塊接續使用
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
    doc.fillColor('#ffffff').fontSize(20).text('富得財富管理', 40, 28);
    doc.fontSize(10).fillColor('#cccccc').text('FUDE WEALTH · 每日市場報告', 40, 58);
    doc.fillColor('#ffffff').fontSize(11).text(dateStr, 0, 38, { align: 'right', width: doc.page.width - 40 });

    doc.moveDown(3);
    doc.x = 40;
    doc.y = 110;

    // 每日核心觀點
    doc.fontSize(13).fillColor(ACCENT).text('今日核心觀點', { underline: false });
    doc.moveDown(0.5);
    const paragraphs = parseNoteHtml(noteContent);
    paragraphs.forEach(segments => {
      segments.forEach((seg, i) => {
        doc.fontSize(9.5).fillColor(seg.color);
        doc.text(seg.text, { continued: i < segments.length - 1, lineGap: 3 });
      });
      doc.moveDown(0.8);
    });

    doc.moveDown(0.5);
    doc.moveTo(PAGE_MARGIN, doc.y).lineTo(doc.page.width - PAGE_MARGIN, doc.y).strokeColor(BORDER).stroke();
    doc.moveDown(1);

    // 可進場個股
    let nextY = drawStockTable(doc, '台股精選標的', TW_PICKS, doc.y);
    nextY = drawStockTable(doc, '美股精選標的', US_PICKS, nextY);

    // 免責聲明
    doc.x = PAGE_MARGIN;
    doc.y = nextY + 8;
    doc.fontSize(7.5).fillColor(GREY).text(
      '⚠ 本報告內容僅供投資參考，不構成投資建議，過去績效不代表未來報酬。個股評等、目標價區間為顧問團隊主觀判斷，投資人應依個人風險承受度自行判斷，投資有風險。',
      PAGE_MARGIN, nextY + 8, { width: doc.page.width - PAGE_MARGIN * 2, lineGap: 2 }
    );
    doc.moveDown(0.3);
    doc.fontSize(7.5).fillColor(GREY).text('富得財富管理 · Fude Wealth © ' + new Date().getFullYear(), PAGE_MARGIN);

    doc.end();
  });
}

module.exports = { generateReportPdf };
