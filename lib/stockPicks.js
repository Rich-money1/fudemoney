/* 每日報告用精選個股（維護方式：與 index_2.html 的 TW_STOCKS / US_STOCKS 同步更新，
   僅取前5檔精華以維持PDF簡潔，完整20+20檔清單請見網站「市場快報」頁面） */
const TW_PICKS = [
  { code: '2330', name: '台積電',  rating: '積極買進', target: '+18~25%', note: '7/17法說會後利多出盡重挫收2,290元，N2製程基本面未變，逢急殺為長線布局良機' },
  { code: '2382', name: '廣達',    rating: '積極買進', target: '+28~42%', note: 'GB300/NVL72伺服器訂單能見度未變，隨供應鏈同步回檔後布局空間擴大' },
  { code: '3017', name: '奇鋐',    rating: '積極買進', target: '+35~55%', note: '液冷散熱訂單題材未變，7/20盤中已回穩，短線震盪不改長線趨勢' },
  { code: '3711', name: '日月光',  rating: '積極買進', target: '+20~30%', note: 'CoWoS封裝良率與客戶結構未受影響，防守進攻兩用回檔幅度相對可控' },
  { code: '3661', name: '世芯-KY', rating: '積極買進', target: '+35~55%', note: 'ASIC設計大客戶訂單結構未變，台股最強AI純玩題材之一，波動大需分批布局' },
];

const US_PICKS = [
  { code: 'NVDA', name: '輝達(NVIDIA)', rating: '積極買進', target: '+22~42%', note: '隨AI類股估值疑慮拉回約-3.9%，Rubin架構與GB300供不應求基本面未變' },
  { code: 'MSFT', name: '微軟(Microsoft)', rating: '積極買進', target: '+20~30%', note: '本波逆勢上漲+2.3%，Copilot與Azure AI動能未變，抗跌韌性最強AI龍頭之一' },
  { code: 'TSM',  name: '台積電ADR', rating: '積極買進', target: '+18~28%', note: '與台股母股同步因法說會後利多出盡拉回，Q2營收/毛利率仍創高，長線基本面未變' },
  { code: 'AAPL', name: '蘋果(Apple)', rating: '持有/買', target: '+15~25%', note: '本波逆勢大漲+5.8%，最抗跌的科技巨頭之一，7/30財報前市場信心穩健' },
  { code: 'CEG',  name: '星座能源(Constellation)', rating: '積極買進', target: '+28~50%', note: '本波表現穩健，AI電力需求與核能長約題材未受科技股回檔影響' },
];

module.exports = { TW_PICKS, US_PICKS };
