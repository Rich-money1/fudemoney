/* 與前端 index_2.html 的 FUNDS / FUND_APPROX_DAY 保持同步 */
const FUNDS = [
  { id:'allianz',   name:'安聯收益成長',       rate:0.08  },
  { id:'eastspring',name:'瀚亞多重收益',       rate:0.07  },
  { id:'schroder',  name:'施羅德多重收益',     rate:0.10  },
  { id:'usgrowth',  name:'美國成長 AP',        rate:0.13  },
  { id:'twinno',    name:'台灣新益',           rate:0.10  },
  { id:'allianzai', name:'安聯AI收益成長',     rate:0.081 },
  { id:'abamerican',name:'聯博美國收益',       rate:0.081 },
  { id:'abmultiai', name:'聯博多元資產收益AI', rate:0.095 },
  { id:'abusmi',    name:'聯博美國多重收益AI', rate:0.092 },
  { id:'jpminc',    name:'摩根多重收益',       rate:0.112 },
  { id:'brkdata',   name:'貝萊德全球智慧數據', rate:0.077 },
];

const FUND_APPROX_DAY = {
  allianz:14, eastspring:28, schroder:27, usgrowth:28, twinno:1,
  allianzai:14, abamerican:28, abmultiai:28, abusmi:29, jpminc:8, brkdata:27,
};

function findFund(id){ return FUNDS.find(f => f.id === id); }

module.exports = { FUNDS, FUND_APPROX_DAY, findFund };
