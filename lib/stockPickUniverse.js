/* 台股/美股精選 TOP 20 的固定名單與基本論點（名稱/評級/潛力空間%/風險 由顧問手動維護，不隨每日自動更新變動）
   thesis 是不含日期與股價的長線論點，供 AI 每天重寫「進場建議」一句話時的素材依據 */
const TW_UNIVERSE = [
  { code:'2330', name:'台積電',  rating:'積極買進', target:'+18~25%', thesis:'N2製程量產基本面未變，CoWoS訂單仍滿載' },
  { code:'2382', name:'廣達',    rating:'積極買進', target:'+28~42%', thesis:'GB300/NVL72伺服器訂單能見度未變' },
  { code:'3017', name:'奇鋐',    rating:'積極買進', target:'+35~55%', thesis:'GB300液冷訂單題材未變，短線震盪不改長線趨勢' },
  { code:'3711', name:'日月光',  rating:'積極買進', target:'+20~30%', thesis:'CoWoS封裝良率與客戶結構未受影響，防守進攻兩用特性使其回檔幅度相對可控' },
  { code:'2454', name:'聯發科',  rating:'買進',     target:'+22~32%', thesis:'Dimensity端側AI晶片市佔與車用訂單基本面未變' },
  { code:'2317', name:'鴻海',    rating:'買進',     target:'+15~25%', thesis:'GB300組裝+EV平台雙引擎未變，殖利率4%+具一定防守性' },
  { code:'3231', name:'緯創',    rating:'買進',     target:'+22~35%', thesis:'AI伺服器代工訂單能見度未變，是本波個股中率先止穩反彈的指標之一' },
  { code:'6669', name:'緯穎',    rating:'買進',     target:'+18~28%', thesis:'三大CSP訂單能見度未變，惟股價波動大，適合能承受較高波動的進攻型客戶' },
  { code:'2308', name:'台達電',  rating:'買進',     target:'+15~22%', thesis:'AI伺服器電源供應鏈地位未變，防守進攻平衡特性使其為跌幅較輕族群之一' },
  { code:'2345', name:'智邦',    rating:'買進',     target:'+22~35%', thesis:'800G/1.6T交換機訂單能見度未變，AI資料中心網路設備需求為中長線核心邏輯' },
  { code:'3324', name:'雙鴻',    rating:'買進',     target:'+28~42%', thesis:'液冷散熱題材未變，與奇鋐同為散熱雙雄，波動相對較大' },
  { code:'2376', name:'技嘉',    rating:'觀察/買進',target:'+15~25%', thesis:'AI PC主板題材未變，惟個股波動偏大，建議觀察止穩訊號後再進場' },
  { code:'8299', name:'群聯',    rating:'買進',     target:'+25~38%', thesis:'PCIe Gen5企業級SSD控制器需求邏輯未變' },
  { code:'3661', name:'世芯-KY', rating:'積極買進', target:'+35~55%', thesis:'ASIC設計大客戶訂單結構未變，屬台股最強AI純玩題材之一，波動大需分批布局' },
  { code:'2356', name:'英業達',  rating:'持有/買進',target:'+12~22%', thesis:'AI伺服器ODM訂單基本面未變，殖利率4%+提供一定防守緩衝' },
  { code:'2303', name:'聯電',    rating:'持有',     target:'+8~15%',  thesis:'高殖利率5%+仍適合保守型防守配置' },
  { code:'2408', name:'南亞科',  rating:'觀察',     target:'+15~25%', thesis:'DDR5供需題材未變，惟股價波動仍大，建議等待止穩訊號後再分批布局' },
  { code:'2412', name:'中華電',  rating:'持有',     target:'+5~10%',  thesis:'防守型月配息概念展現抗跌韌性，適合保守客戶現金流層配置' },
  { code:'2881', name:'富邦金',  rating:'持有',     target:'+8~15%',  thesis:'壽險投資收益率題材未變，防守型客戶現金流首選' },
  { code:'2884', name:'玉山金',  rating:'買進',     target:'+12~20%', thesis:'數位轉型與東南亞布局題材未變' },
];

const US_UNIVERSE = [
  { code:'NVDA',  name:'輝達',       rating:'積極買進',              target:'+22~42%', thesis:'Rubin架構與GB300供不應求的基本面未變，進攻層核心地位不變' },
  { code:'MSFT',  name:'微軟',       rating:'積極買進',              target:'+20~30%', thesis:'Copilot與Azure AI動能未變，本波抗跌韌性最強的AI龍頭之一' },
  { code:'META',  name:'Meta',       rating:'積極買進',              target:'+28~48%', thesis:'Llama系列與AI廣告變現能力未變，估值仍相對合理' },
  { code:'AVGO',  name:'博通',       rating:'積極買進',              target:'+25~38%', thesis:'客製化AI ASIC訂單結構未變，回檔幅度較大提供加碼機會' },
  { code:'AMZN',  name:'亞馬遜',     rating:'買進',                  target:'+22~35%', thesis:'AWS自研AI晶片與電商利潤率題材未變' },
  { code:'MRVL',  name:'邁威爾',     rating:'買進（風險上調）',       target:'+32~55%', thesis:'1.6T乙太網路AI交換機需求未變，但短線波動放大需嚴控部位' },
  { code:'GOOGL', name:'字母',       rating:'買進',                  target:'+18~30%', thesis:'Gemini與Google Cloud AI動能未變' },
  { code:'CRWV',  name:'CoreWeave',  rating:'買進（風險上調）',       target:'+30~60%', thesis:'NVDA深度合作與微軟長約基本面未變，但屬高波動題材需嚴格控制部位大小' },
  { code:'PLTR',  name:'帕蘭提爾',   rating:'買進',                  target:'+28~50%', thesis:'NVDA主權AI合作與美軍合約題材持續發酵' },
  { code:'CEG',   name:'星座能源',   rating:'積極買進',              target:'+28~50%', thesis:'AI電力需求與核能長約題材未受科技股回檔影響' },
  { code:'CRWD',  name:'CrowdStrike',rating:'買進',                  target:'+22~35%', thesis:'AI原生資安平台需求剛性，法人目標價陸續上修' },
  { code:'AMD',   name:'超微',       rating:'買進',                  target:'+25~40%', thesis:'Zen 6架構進度為近期重要催化劑' },
  { code:'TSLA',  name:'特斯拉',     rating:'買進',                  target:'+25~65%', thesis:'交車數與財報為下一觀察點，AI/機器人題材長線未變' },
  { code:'NOW',   name:'ServiceNow',rating:'買進',                   target:'+20~32%', thesis:'AI企業流程自動化需求未變' },
  { code:'ARM',   name:'安謀',       rating:'買進（風險上調）',       target:'+22~40%', thesis:'授權費成長題材未變，惟短線波動風險需留意部位控管' },
  { code:'ANET',  name:'Arista',    rating:'買進',                   target:'+20~30%', thesis:'AI資料中心網路設備需求邏輯未變' },
  { code:'LLY',   name:'禮來',       rating:'買進',                  target:'+22~35%', thesis:'GLP-1減重藥物需求與法人目標價上修趨勢未變' },
  { code:'ASML',  name:'ASML',      rating:'持有/買進',              target:'+15~28%', thesis:'EUV設備獨占地位與2026年營收展望上修題材未變' },
  { code:'AAPL',  name:'蘋果',       rating:'持有/買進',              target:'+15~25%', thesis:'本波表現最抗跌的科技巨頭之一' },
  { code:'TSM',   name:'台積電ADR', rating:'積極買進',               target:'+18~28%', thesis:'Q2營收/毛利率仍創高，長線基本面未變' },
];

module.exports = { TW_UNIVERSE, US_UNIVERSE };
