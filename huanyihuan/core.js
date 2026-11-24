/* ============================================================
   缓一缓 · 核心逻辑层（无 DOM 依赖）
   ============================================================ */
(function () {
  'use strict';

  const KEY = 'huanyihuan.v1';
  const $ = s => document.querySelector(s);

  /* ---------- 存储 ---------- */
  function defaultData() {
    return {
      records: [],
      settings: { wage: 50, budget: 2000, categories: null, payday: 10 },
      collection: {},
      templates: [],        // 固定账模板 [{id,name,kind,category,amount,note}]
      wishlist: [],         // 冷静期清单 [{id,name,amount,addedTs,decidedTs,decision}]
      categoryBudgets: {},  // 分类预算 {catId: 金额}
      lastExportTs: 0
    };
  }

  /* ---------- 记账分类 ---------- */
  const DEFAULT_CATEGORIES = {
    expense: [
      { id: 'food',   name: '吃饭',   icon: '🍚' },
      { id: 'drink',  name: '奶茶咖啡', icon: '🧋' },
      { id: 'transport', name: '交通', icon: '🚌' },
      { id: 'shop',   name: '购物',   icon: '🛍️' },
      { id: 'home',   name: '居住',   icon: '🏠' },
      { id: 'fun',    name: '娱乐',   icon: '🎮' },
      { id: 'health', name: '医疗',   icon: '💊' },
      { id: 'study',  name: '学习',   icon: '📚' },
      { id: 'social', name: '人情',   icon: '🎁' },
      { id: 'other',  name: '其他',   icon: '✨' }
    ],
    income: [
      { id: 'salary', name: '工资',   icon: '💼' },
      { id: 'bonus',  name: '奖金',   icon: '🏆' },
      { id: 'side',   name: '兼职',   icon: '🛠️' },
      { id: 'invest', name: '理财',   icon: '📈' },
      { id: 'redpack',name: '红包',   icon: '🧧' },
      { id: 'in_other', name: '其他', icon: '✨' }
    ]
  };
  function categories(d) {
    const custom = d && d.settings && d.settings.categories;
    if (custom && Array.isArray(custom.expense) && Array.isArray(custom.income)) return custom;
    return DEFAULT_CATEGORIES;
  }
  function categoryName(id, type) {
    const list = categories(null)[type === 'income' ? 'income' : 'expense'];
    const hit = list.find(c => c.id === id);
    return hit ? hit.name : (id || '其他');
  }
  function categoryIcon(id, type) {
    const list = categories(null)[type === 'income' ? 'income' : 'expense'];
    const hit = list.find(c => c.id === id);
    return hit ? hit.icon : '✨';
  }
  /* 数据入口清洗：外部存储可能被手动改坏，统一在这里规范化 */
  function sanitizeRecords(arr) {
    if (!Array.isArray(arr)) return [];
    const out = [];
    const ACTIONS = ['buy', 'skip', 'need', 'normal'];
    arr.forEach(r => {
      if (!r || typeof r !== 'object' || Array.isArray(r)) return;
      if (ACTIONS.indexOf(r.action) === -1) return;
      const ts = new Date(r.ts).getTime();
      if (!isFinite(ts)) return;
      const amt = Number(r.amount);
      out.push({
        id: typeof r.id === 'string' ? r.id : uid(),
        action: r.action,
        kind: r.kind === 'income' ? 'income' : 'expense',
        category: typeof r.category === 'string' ? r.category.slice(0, 40) : '',
        amount: isFinite(amt) && amt > 0 ? amt : 0,
        name: typeof r.name === 'string' ? r.name.slice(0, 100) : '',
        emotion: typeof r.emotion === 'string' ? r.emotion : '',
        note: typeof r.note === 'string' ? r.note.slice(0, 500) : '',
        ts
      });
    });
    return out;
  }
  function sanitizeSettings(s) {
    const def = defaultData().settings;
    if (!s || typeof s !== 'object' || Array.isArray(s)) return def;
    const wage = Number(s.wage), budget = Number(s.budget);
    const custom = s.categories;
    const validCats = custom && Array.isArray(custom.expense) && Array.isArray(custom.income)
      && custom.expense.length && custom.income.length ? custom : null;
    const payday = Number(s.payday);
    return {
      wage: isFinite(wage) && wage > 0 ? wage : def.wage,
      budget: isFinite(budget) && budget > 0 ? budget : def.budget,
      categories: validCats,
      payday: isFinite(payday) && payday >= 1 && payday <= 31 ? Math.floor(payday) : def.payday
    };
  }
  const CAT_IDS = DEFAULT_CATEGORIES.expense.concat(DEFAULT_CATEGORIES.income).map(c => c.id);
  function sanitizeTemplates(arr) {
    if (!Array.isArray(arr)) return [];
    return arr.filter(t => t && typeof t === 'object' && t.name).slice(0, 50).map(t => {
      const amt = Number(t.amount);
      return {
        id: typeof t.id === 'string' ? t.id : uid(),
        name: String(t.name).slice(0, 40),
        kind: t.kind === 'income' ? 'income' : 'expense',
        category: typeof t.category === 'string' && CAT_IDS.indexOf(t.category) >= 0 ? t.category : 'other',
        amount: isFinite(amt) && amt > 0 ? amt : 0,
        note: typeof t.note === 'string' ? t.note.slice(0, 100) : ''
      };
    });
  }
  function sanitizeWishlist(arr) {
    if (!Array.isArray(arr)) return [];
    return arr.filter(w => w && typeof w === 'object' && w.name).slice(0, 100).map(w => {
      const amt = Number(w.amount);
      return {
        id: typeof w.id === 'string' ? w.id : uid(),
        name: String(w.name).slice(0, 60),
        amount: isFinite(amt) && amt > 0 ? amt : 0,
        addedTs: new Date(w.addedTs).getTime() || Date.now(),
        decidedTs: w.decidedTs ? (new Date(w.decidedTs).getTime() || null) : null,
        decision: w.decision === 'buy' || w.decision === 'skip' ? w.decision : null
      };
    });
  }
  function sanitizeCatBudgets(o) {
    const out = {};
    if (!o || typeof o !== 'object' || Array.isArray(o)) return out;
    Object.keys(o).forEach(k => {
      const n = Number(o[k]);
      if (isFinite(n) && n > 0 && CAT_IDS.indexOf(k) >= 0) out[k] = n;
    });
    return out;
  }
  function sanitizeCollection(c) {
    const out = {};
    if (!c || typeof c !== 'object' || Array.isArray(c)) return out;
    Object.keys(c).forEach(k => {
      const n = Number(c[k]);
      if (isFinite(n) && n > 0) out[k] = Math.floor(n);
    });
    return out;
  }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaultData();
      const d = JSON.parse(raw);
      if (!d || typeof d !== 'object' || Array.isArray(d)) return defaultData();
      return {
        records: sanitizeRecords(d.records),
        settings: sanitizeSettings(d.settings),
        collection: sanitizeCollection(d.collection),
        templates: sanitizeTemplates(d.templates),
        wishlist: sanitizeWishlist(d.wishlist),
        categoryBudgets: sanitizeCatBudgets(d.categoryBudgets),
        lastDropSalt: Number(d.lastDropSalt) || 0,
        lastBadgeSalt: Number(d.lastBadgeSalt) || 0,
        lastMilestone: Number(d.lastMilestone) || 0,
        lastExportTs: Number(d.lastExportTs) || 0
      };
    } catch (e) { return defaultData(); }
  }
  function save(d) {
    try { localStorage.setItem(KEY, JSON.stringify(d)); return true; }
    catch (e) { return false; }
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function monthKey(ts) {
    const d = new Date(ts);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  function inThisMonth(ts) { return monthKey(ts) === monthKey(Date.now()); }

  /* ---------- 情绪表 ---------- */
  const EMOTIONS = [
    { id: 'tired',  label: '太累了',   face: '😮‍💨' },
    { id: 'lonely', label: '有点孤独', face: '🌙' },
    { id: 'happy',  label: '想奖励自己', face: '🎉' },
    { id: 'anxious', label: '有点焦虑', face: '🌀' },
    { id: 'bored',  label: '好无聊',   face: '🥱' },
    { id: 'angry',  label: '有点气',   face: '😤' },
    { id: 'social', label: '别人都有', face: '👀' },
    { id: 'love',   label: '想对自己好', face: '🫶' },
    { id: 'impulse',label: '没为什么', face: '⚡' }
  ];

  /* ---------- 文案引擎：同一种意思备多句，用稳定种子挑，真人说话的口吻 ---------- */
  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function pick(pool, seed) {
    if (!pool || !pool.length) return '';
    return pool[hash(String(seed == null ? Math.random() : seed)) % pool.length];
  }

  const COPY = {
    // 判断句 · 有同情绪的历史吐槽
    emoHistory: [
      '上次你{emo}的时候买了「{name}」，自己写的是「{note}」。这回又这心情？',
      '翻了下记录——{emo}那回你买了「{name}」，还留了句「{note}」。手是不是又痒了？',
      '「{note}」这话你说过一次，那天你{emo}，然后就买了「{name}」。今天呢？'
    ],
    // 判断句 · 冲动高发时段
    peakTime: [
      '又到{peak}了，你这个点最容易心软。不着急，先放一晚上看看。',
      '{peak}——你的高危时段。深夜下单的，第二天多半会后悔。',
      '老时间点，{peak}。你在这个点买的东西，还少吗？'
    ],
    // 判断句 · 有忍住战绩
    hasSkip: [
      '你已经拦下{n}次了，兜里{amt}块。这一下花出去，前面就白攒了点。',
      '之前{n}次都忍住了，{amt}块攒着呢。这回要不要继续保持？',
      '忍了{n}次、{amt}块在手里。别在这一下上翻车啊。'
    ],
    // 判断句 · 大额
    big: [
      '不便宜啊，这得你{cost}的班。放一晚上，明天还想要再说。',
      '{cost}的班换这一下。今晚先别付，明早醒来还惦记就买。',
      '这个数，够你干{cost}了。真的那么需要吗？'
    ],
    // 判断句 · 兜底
    fallback: [
      '这一下等于你{cost}的班。买不买随你，但我问了，你至少清醒过三秒。',
      '{cost}的班，换这一下。花钱容易，挣回来要命。',
      '先别急着付——这钱是你{cost}换来的，想想值不值。',
      '{cost}的班。你品，你细品。'
    ],
    // 存钱罐
    piggyActive: [
      '这{n}次，都是你亲手按下去的。',
      '没花出去的{n}笔，攒成了你的底气。',
      '忍住{n}次了。你比自己想象中扛得住。',
      '这{n}次心动，最后都没得逞。'
    ],
    piggyZero: [
      '第一次忍住之后，这里就热闹了。',
      '还空着。不急，会有的。',
      '等你第一次说「算了」，这里就有东西了。'
    ],
    // 忍住后的反馈
    savedTitle: ['漂亮，忍住了', '这一下你赢了', '稳住', '好样的', '手缩回来了'],
    savedSub: [
      '钱还在卡里，快乐也没少。',
      '它没消失，只是变成了你兜里的底气。',
      '想要的东西会忘，省下的钱是真的。',
      '别心疼，你刚给自己发了笔奖金。'
    ],
    // 忍住 · 掉落金句卡（三档稀有度，图鉴收集用；图标/配色/权重见 CARD_POOL）
    dropCard: [
      // —— 普通 · 克制日常 ——
      { id:'c01', r:'common', icon:'🛑', t:'冷静特区', d:'冲动边缘成功刹住，授予「暂时清醒」勋章。' },
      { id:'c02', r:'common', icon:'💰', t:'钱包的贵人', d:'你的钱包不知道，但它欠你一句谢谢。' },
      { id:'c03', r:'common', icon:'🛒', t:'购物车减肥成功', d:'这一下没买，购物车又空了一格。' },
      { id:'c04', r:'common', icon:'🤚', t:'手滑失败卡', d:'手伸向付款键那一刻，你硬生生收了回来。' },
      { id:'c05', r:'common', icon:'🫧', t:'三秒清醒', d:'就这三秒，够你省下一顿火锅。' },
      { id:'c06', r:'common', icon:'🌱', t:'克制界新星', d:'不管第几次，反正这一下你赢了。' },
      { id:'c07', r:'common', icon:'🎯', t:'意志力在线', d:'今天的理智，暂时战胜了购物车。' },
      { id:'c08', r:'common', icon:'🧊', t:'冷静 +1', d:'没上头，就是今天最大的胜利。' },
      { id:'c09', r:'common', icon:'🐷', t:'小猪存钱罐', d:'又往里投了一枚，虽然它不会说话。' },
      { id:'c10', r:'common', icon:'✋', t:'刹得住', d:'想买，没买。故事到这里就该鼓掌。' },
      { id:'c11', r:'common', icon:'🪨', t:'稳如老狗', d:'这波情绪波动，没能带走你的钱包。' },
      { id:'c12', r:'common', icon:'🧠', t:'理性短暂上线', d:'它来了，它看见了，它拦住了。' },
      // —— 稀有 · 心态高手 ——
      { id:'c13', r:'rare', icon:'🧘', t:'延迟满足大师', d:'把想要的先放一晚，这本事不是谁都有。' },
      { id:'c14', r:'rare', icon:'🌊', t:'情绪冲浪选手', d:'浪打过来，你站住了，没被卷走。' },
      { id:'c15', r:'rare', icon:'🔮', t:'未卜先知', d:'你躲过的这个冲动，未来会感谢你。' },
      { id:'c16', r:'rare', icon:'⚖️', t:'内心天平校准师', d:'想要和需要之间，你这一次称对了。' },
      { id:'c17', r:'rare', icon:'🎐', t:'心如止水 · 体验版', d:'这份平静是限时的，但此刻是真的。' },
      { id:'c18', r:'rare', icon:'🛡️', t:'消费欲盾牌', d:'这一击，被你稳稳挡下了。' },
      { id:'c19', r:'rare', icon:'🌙', t:'深夜清醒者', d:'这个点还能忍住，你比大多数人强。' },
      { id:'c20', r:'rare', icon:'🎁', t:'给未来的自己送礼', d:'今天省下的，是明天多出来的选择权。' },
      { id:'c21', r:'rare', icon:'🪞', t:'看见自己了', d:'你问了那句"能等吗"，然后真的等了。' },
      { id:'c22', r:'rare', icon:'🔑', t:'掌控感 +1', d:'钱没花出去，主动权回到你手里。' },
      // —— 传说 · 稀有时刻 ——
      { id:'c23', r:'legend', icon:'👑', t:'人间清醒', d:'传说级克制。这一下，值得刻进族谱。' },
      { id:'c24', r:'legend', icon:'🐉', t:'剁手克星', d:'冲动见你绕道走，传说由此诞生。' },
      { id:'c25', r:'legend', icon:'💎', t:'铁律加身', d:'你说不买，就真的没买。这叫说到做到。' },
      { id:'c26', r:'legend', icon:'🌟', t:'消费界的定力天花板', d:'这一忍，已臻化境，受我一拜。' },
      { id:'c27', r:'legend', icon:'🦅', t:'俯视购物车', d:'你在高处看了一眼欲望，然后转身走了。' },
      { id:'c28', r:'legend', icon:'🏆', t:'本周最强刹车', d:'这种定力，建议写进年终总结。' }
    ],
    // 连击文案
    streakLine: [
      '已经连着{n}天没乱花了',
      '连续{n}天，有点东西',
      '{n}天连击，稳住别断',
      '第{n}天了，习惯正在长出来'
    ],
    // 买了 · 反向成就徽章（自嘲式幽默，化解羞耻；分主题带稀有度，图鉴收集用）
    buyBadge: [
      // —— 时段主题 ——
      { id:'b01', r:'common', icon:'🌃', theme:'时段', t:'深夜剁手王', d:'这个点下单的，都不止你一个。' },
      { id:'b02', r:'common', icon:'🌅', theme:'时段', t:'早起第一单', d:'睁眼第一件事是花钱，很有仪式感。' },
      { id:'b03', r:'common', icon:'🌆', theme:'时段', t:'下班补偿款', d:'累了一天，钱包替你说了句辛苦了。' },
      { id:'b04', r:'rare', icon:'🕐', theme:'时段', t:'凌晨勇士', d:'这个点还在消费，你和月亮都没睡。' },
      { id:'b05', r:'rare', icon:'📅', theme:'时段', t:'周一自救者', d:'用一笔消费，对抗周一的暴击。' },
      { id:'b06', r:'legend', icon:'⏰', theme:'时段', t:'全年无休剁手王', d:'不分昼夜，你对消费一视同仁。' },
      // —— 情绪主题 ——
      { id:'b07', r:'common', icon:'😮‍💨', theme:'情绪', t:'情绪性消费实锤', d:'买的时候爽，写下来的时候沉默了。' },
      { id:'b08', r:'common', icon:'😤', theme:'情绪', t:'气到花钱', d:'这一单，是对着生活甩过去的。' },
      { id:'b09', r:'common', icon:'🥱', theme:'情绪', t:'无聊到下单', d:'手指太闲，钱包遭殃。' },
      { id:'b10', r:'common', icon:'🌙', theme:'情绪', t:'孤独消费学', d:'买的是东西，填的是别的。' },
      { id:'b11', r:'rare', icon:'🎉', theme:'情绪', t:'奖励自己专业户', d:'"我值得"这三个字，你今天用得很熟。' },
      { id:'b12', r:'rare', icon:'🫶', theme:'情绪', t:'对自己太好协会', d:'你的温柔，全都给了购物车。' },
      { id:'b13', r:'rare', icon:'👀', theme:'情绪', t:'别人有我也有', d:'跟风买的，快乐是别人的，账单是自己的。' },
      { id:'b14', r:'legend', icon:'🌀', theme:'情绪', t:'情绪通胀受害者', d:'心情越乱，下单越猛，你被拿捏得明明白白。' },
      // —— 金额主题 ——
      { id:'b15', r:'common', icon:'☕', theme:'金额', t:'奶茶续命选手', d:'这一杯，买的是命，不是饮料。' },
      { id:'b16', r:'common', icon:'🍜', theme:'金额', t:'外卖常客', d:'今天也没做饭，钱包表示理解。' },
      { id:'b17', r:'common', icon:'🛵', theme:'金额', t:'打车自由', d:'两步路也要打车，这叫对自己好。' },
      { id:'b18', r:'rare', icon:'💸', theme:'金额', t:'大额冲动选手', d:'付款那一下手很稳，事后心跳很稳。' },
      { id:'b19', r:'rare', icon:'🛍️', theme:'金额', t:'购物车清仓员', d:'你把"加入购物车"执行到了最后一步。' },
      { id:'b20', r:'rare', icon:'💳', theme:'金额', t:'数字无感症', d:'刷脸支付的代价，就是花钱没了痛感。' },
      { id:'b21', r:'legend', icon:'🔥', theme:'金额', t:'怒花一千', d:'这个数字，够你冷静一整个月。' },
      // —— 行为主题 ——
      { id:'b22', r:'common', icon:'🤚', theme:'行为', t:'手比脑快协会', d:'脑子还在犹豫，手已经付完款了。' },
      { id:'b23', r:'common', icon:'📱', theme:'行为', t:'指尖失控', d:'本来只想刷刷，结果刷出了订单。' },
      { id:'b24', r:'common', icon:'🔁', theme:'行为', t:'重复下单选手', d:'这个东西，你好像买过不止一次。' },
      { id:'b25', r:'rare', icon:'🧠', theme:'行为', t:'理性崩塌现场', d:'刚才那个说"再想想"的人，是你吗？' },
      { id:'b26', r:'rare', icon:'🎭', theme:'行为', t:'真实人类认证', d:'偶尔失控，才说明你是活生生的人。' },
      { id:'b27', r:'rare', icon:'🌊', theme:'行为', t:'冲动冲浪者', d:'你跟着欲望的浪走了，还挺丝滑。' },
      { id:'b28', r:'rare', icon:'📦', theme:'行为', t:'开箱快乐党', d:'买的快乐很短，拆快递的快乐很长。' },
      { id:'b29', r:'legend', icon:'🎪', theme:'行为', t:'消费行为艺术家', d:'花钱花出了行为艺术，你是生活的导演。' },
      { id:'b30', r:'legend', icon:'🕳️', theme:'行为', t:'月光族荣誉主席', d:'钱包空了，但故事很精彩。' }
    ],
    // 零食/轻提示 toast
    toastNeed: ['记下了，这笔不算冲动', '行，刚需单独记', '收到，不影响你的刹车成绩'],
    toastBuy: ['记下了，下回用得上', '存好了，下次刹车参考它', '收到，这才是真实的你'],
    toastEmptyAmount: ['先填个数呗', '多少钱？填一下'],
    toastEmptyEmotion: ['说说啥心情嘛', '挑一个最接近的'],
    // 分享卡 · 洞察句
    cardPeak: ['你最容易在<strong>{v}</strong>心动', '<strong>{v}</strong>，是你的高危时刻', '一到<strong>{v}</strong>，钱包就松动'],
    cardEmo: ['<strong>{v}</strong>的时候，你最容易掏钱', '让你破防的是<strong>{v}</strong>', '「<strong>{v}</strong>」几乎每次都能得手'],
    cardName: ['<strong>{v}</strong>，你买得最勤', '对你来说，<strong>{v}</strong>没有抵抗力', '<strong>{v}</strong>是你的固定心头好'],
    cardRate: ['{v}%的心动，被你按住了', '十次里有{v}次，你赢了', '拦下{v}%——你比自己以为的能扛'],
    cardNeed: ['另有<strong>¥{v}</strong>是生活必需，该花', '<strong>¥{v}</strong>花在刀刃上，不亏', '其中<strong>¥{v}</strong>是刚需，没毛病'],
    // 账本洞察（让只记账不踩刹车的用户也有画像）
    cardTopCat: ['这个月，<strong>{v}</strong>花得最多', '<strong>{v}</strong>是你的开销大头', '钱主要流向了<strong>{v}</strong>'],
    cardExpense: ['这个月花了 <strong>¥{v}</strong>，心里有数了', '<strong>¥{v}</strong>的去向，你都记下来了', '本月支出 <strong>¥{v}</strong>，笔笔清楚'],
    cardIncome: ['进账 <strong>¥{v}</strong>，是你挣下的', '这个月到手 <strong>¥{v}</strong>'],
    cardBalance: ['剩下 <strong>¥{v}</strong>，是你自己攒的', '结余 <strong>¥{v}</strong>，这才是真底气'],
    cardRecordN: ['记了 <strong>{v}</strong> 笔，把日子过成了账', '<strong>{v}</strong> 笔记录，一笔没落'],
    cardTitle: ['这个月，我按住了 {v}% 的冲动', '十次上头，我拦下 {v} 次', '我的 {v}%，没被冲动带走', '这个月，我赢了 {v}% 的心动'],
    cardMoneyLabel: ['这个月，我没花出去的', '兜里因此多出来的', '攒下的，是这些'],
    cardFoot: ['想买之前，先看见', '慢三秒，再决定', '钱花在值得的地方'],
    // 前视预测
    forecastOver: [
      '照这个节奏，月底大概要花 ¥{v}，比预算多 ¥{d}。剩下的日子悠着点。',
      '按眼下的速度，月底估计 ¥{v}，预算会超 ¥{d}。',
      '再这么花下去，月底 ¥{v}，超出预算 ¥{d}。'
    ],
    forecastUnder: [
      '照这个节奏，月底大概花 ¥{v}，预算里还能剩 ¥{d}。',
      '按眼下的速度，月底估计 ¥{v}，还有 ¥{d} 余量。',
      '再这么花下去，月底 ¥{v}，预算内稳得住。'
    ],
    forecastFew: ['这个月才刚开始，再记几笔就能估出月底的数。', '数据还太少，先记着，月底前我会给你个数。'],
    // 周月复盘
    reviewLines: {
      expenseDown: ['比上{period}少花了 ¥{d}，这点值得记一笔。', '花了 ¥{v}，比上{period}省下 ¥{d}。'],
      expenseUp: ['这个{period}花了 ¥{v}，比上{period}多 ¥{d}。', '花了 ¥{v}，比上{period}多了 ¥{d}，回头看看值不值。'],
      flat: ['这个{period}花了 ¥{v}，和上{period}差不多。'],
      noPrev: ['这个{period}花了 ¥{v}，已经记下了。'],
      topCat: ['钱主要去了{v}', '{v}是这{period}的开销大头'],
      skip: ['忍住 {v} 次，钱包替你谢过了'],
      days: ['有{v}天记了账，日子没白过']
    },
    toastVoice: ['听清了，填好了', '识别到一笔，改改就能存', '记下了大概，你再看看'],
    toastVoiceFail: ['没听清，再说一次', '这句没识别出来，手打吧'],
    toastWish: ['放进清单了，过几天再看', '先存着，冷静两天再说'],
    toastWishBuy: ['想清楚了就买，不算冲动'],
    toastWishSkip: ['漂亮，这东西你不需要'],
    toastTpl: ['存成常用了', '下次一点就来'],
    toastImport: ['备份恢复了，账都回来了']
  };

  /* ---------- 等价物表：把抽象金额翻译成具体的生活物件 ---------- */
  const EQUIVALENTS = [
    { name: '杯奶茶',     price: 18 },
    { name: '顿外卖',     price: 35 },
    { name: '杯咖啡',     price: 30 },
    { name: '次打车',     price: 40 },
    { name: '张电影票',   price: 45 },
    { name: '顿食堂饭',   price: 15 },
    { name: '瓶水',       price: 3 },
    { name: '天公交地铁', price: 8 },
    { name: '支冰淇淋',   price: 12 },
    { name: '包辣条',     price: 6 }
  ];
  function fmtNum(n) {
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  }
  /* 选 2 个最接近整数倍、且数量不过分夸张的等价物 */
  function equivalents(amount) {
    const scored = EQUIVALENTS.map(e => {
      const c = amount / e.price;
      const rounded = Math.max(1, Math.round(c));
      // 越接近整数越好；数量在 1~40 之间更可感
      const closeness = Math.abs(c - rounded);
      const penalty = rounded > 40 ? 10 : 0;
      return { name: e.name, count: rounded, score: closeness + penalty };
    });
    scored.sort((a, b) => a.score - b.score);
    const picked = [];
    for (const s of scored) {
      if (picked.some(p => p.name === s.name)) continue;
      picked.push(s);
      if (picked.length === 2) break;
    }
    return picked.map(p => ({ name: p.name, count: p.count }));
  }

  /* ---------- 代价翻译 ---------- */
  function translate(amount, settings, d) {
    const wage = Math.max(1, Number(settings.wage) || 50);
    const budget = Math.max(1, Number(settings.budget) || 2000);
    const hours = amount / wage;
    let hoursText;
    if (hours < 1) hoursText = fmtNum(Math.round(hours * 60)) + ' 分钟';
    else if (hours < 8) hoursText = fmtNum(Math.round(hours * 10) / 10) + ' 小时';
    else hoursText = fmtNum(Math.round(hours / 8 * 10) / 10) + ' 个工作日';

    // 预算剩余：预算是支出上限，只扣真实支出（买/必需/普通记账）；收入是另一维度，不回补额度；忍住没花钱不算
    const recs = (d.records || []).filter(r => r && r.ts != null && inThisMonth(r.ts));
    const spent = recs.filter(r => r.kind !== 'income' && r.action !== 'skip')
      .reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const left = Math.max(0, budget - spent);
    const ratio = Math.min(100, (amount / left) * 100);

    return {
      hoursText,
      hoursRaw: hours,
      equiv: equivalents(amount),
      left, budget, ratio,
      willUse: amount > left
    };
  }

  /* ---------- 账本：月度收支汇总 / 分类统计 ---------- */
  /* kind=income 记收入；其余为支出，但 skip（忍住）没花钱，不计支出 */
  function isIncome(r) { return r && r.kind === 'income'; }
  function isRealExpense(r) { return r && r.kind !== 'income' && r.action !== 'skip'; }
  function ledger(d, month) {
    const recs = Array.isArray(d.records) ? d.records : [];
    const key = month || monthKey(Date.now());
    const inMonth = recs.filter(r => r && typeof r === 'object' && r.ts != null && monthKey(r.ts) === key);
    const incomes = inMonth.filter(isIncome);
    const expenses = inMonth.filter(isRealExpense);
    const income = incomes.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const expense = expenses.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    // 分类支出排行
    const byCat = {};
    expenses.forEach(r => {
      const c = r.category || 'other';
      byCat[c] = (byCat[c] || 0) + (Number(r.amount) || 0);
    });
    const cats = Object.keys(byCat).map(id => ({
      id, name: categoryName(id, 'expense'), icon: categoryIcon(id, 'expense'), amount: byCat[id]
    })).sort((a, b) => b.amount - a.amount);
    return {
      month: key, income, expense, balance: income - expense,
      incomeN: incomes.length, expenseN: expenses.length,
      cats, catTotal: cats.reduce((s, c) => s + c.amount, 0)
    };
  }
  /* 本月每日支出趋势（按天聚合，供画像/账本画 sparkline） */
  function dailyTrend(d, month) {
    const key = month || monthKey(Date.now());
    const [y, m] = key.split('-').map(Number);
    const days = new Date(y, m, 0).getDate();
    const arr = new Array(days).fill(0);
    (d.records || []).forEach(r => {
      if (!r || r.ts == null || monthKey(r.ts) !== key || !isRealExpense(r)) return;
      const day = new Date(r.ts).getDate();
      if (day >= 1 && day <= days) arr[day - 1] += Number(r.amount) || 0;
    });
    return arr;
  }
  function monthsWithRecords(d) {
    const set = {};
    (d.records || []).forEach(r => { if (r && r.ts != null) set[monthKey(r.ts)] = 1; });
    set[monthKey(Date.now())] = 1;
    return Object.keys(set).sort().reverse();
  }

  /* ---------- 冲动画像 ---------- */
  function portrait(d) {
    const recs = Array.isArray(d.records) ? d.records : [];
    const thisMonth = recs.filter(r => r && typeof r === 'object' && r.ts != null && inThisMonth(r.ts));
    const buys = thisMonth.filter(r => r.action === 'buy');
    const skips = thisMonth.filter(r => r.action === 'skip');
    const needs = thisMonth.filter(r => r.action === 'need');
    // 冲动相关总量只算「买」和「忍住」，必需开销不进分母，避免污染成功率
    const total = buys.length + skips.length;

    // 高发时段（按 3 小时分桶）
    const buckets = {};
    buys.forEach(r => {
      const h = new Date(r.ts).getHours();
      const key = Math.floor(h / 3) * 3;
      buckets[key] = (buckets[key] || 0) + 1;
    });
    let peak = null, peakN = 0;
    Object.keys(buckets).forEach(k => {
      if (buckets[k] > peakN) { peakN = buckets[k]; peak = Number(k); }
    });
    const peakLabel = peak === null ? null : peakLabelOf(peak);

    // 最容易被击穿的情绪
    const emoCount = {};
    buys.forEach(r => { if (r.emotion) emoCount[r.emotion] = (emoCount[r.emotion] || 0) + 1; });
    let topEmo = null, emoN = 0;
    Object.keys(emoCount).forEach(k => {
      if (emoCount[k] > emoN) { emoN = emoCount[k]; topEmo = k; }
    });

    // 最常买的东西
    const nameCount = {};
    buys.forEach(r => {
      const n = (r.name || '').trim().replace(/[，。！？\s]/g, '');
      if (n) nameCount[n] = (nameCount[n] || 0) + 1;
    });
    let topName = null, nameN = 0;
    Object.keys(nameCount).forEach(k => {
      if (nameCount[k] > nameN) { nameN = nameCount[k]; topName = k; }
    });

    const skipAmt = skips.reduce((s, r) => s + r.amount, 0);
    const buyAmt = buys.reduce((s, r) => s + r.amount, 0);
    const needAmt = needs.reduce((s, r) => s + r.amount, 0);
    const rate = total ? Math.round(skips.length / total * 100) : 0;

    // 全量账本洞察：普通记账/收入/必需也算数，画像不再只认冲动
    const lg = ledger(d);
    const realExpenseRecs = thisMonth.filter(isRealExpense);
    const normalRecs = realExpenseRecs.filter(r => r.action === 'normal');
    return {
      total, buyN: buys.length, skipN: skips.length, needN: needs.length,
      skipAmt, buyAmt, needAmt, rate,
      peak, peakLabel, peakN,
      topEmo, emoN, topName, nameN,
      // 账本维度（新增，不影响旧口径）
      recordN: thisMonth.length,
      expenseN: realExpenseRecs.length,
      normalN: normalRecs.length,
      incomeN: lg.incomeN,
      monthIncome: lg.income,
      monthExpense: lg.expense,
      monthBalance: lg.balance,
      topCat: lg.cats.length ? lg.cats[0] : null,
      catCount: lg.cats.length
    };
  }

  /* 刚需名字记忆：被标记为「必需」≥2 次的名字，视为用户的固定刚需 */
  function knownNeeds(d) {
    const count = {};
    (d.records || []).filter(r => r.action === 'need' && r.name).forEach(r => {
      const n = r.name.trim();
      if (n) count[n] = (count[n] || 0) + 1;
    });
    return Object.keys(count).filter(n => count[n] >= 2);
  }
  function isKnownNeed(name, d) {
    if (!name) return false;
    const n = name.trim();
    return knownNeeds(d).some(x => x === n);
  }
  function peakLabelOf(h) {
    const map = {
      0: '凌晨 0–3 点', 3: '凌晨 3–6 点', 6: '清晨 6–9 点',
      9: '上午 9–12 点', 12: '中午 12–15 点', 15: '下午 3–6 点',
      18: '傍晚 6–9 点', 21: '夜里 9–12 点'
    };
    return map[h] || (h + ' 点前后');
  }
  function emotionLabel(id) {
    const e = EMOTIONS.find(x => x.id === id);
    return e ? e.label : id;
  }

  function fill(tpl, vars) {
    return tpl.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : ''));
  }
  function daySeed() { return new Date().toDateString(); }

  /* ---------- 判断句：读历史，越用越懂你 ---------- */
  function judge(amount, name, d, t) {
    const p = portrait(d);
    const recs = d.records || [];
    const nowH = new Date().getHours();
    const cost = (t && t.hoursText) ? t.hoursText : '';
    const seed = daySeed() + '|' + p.emoN + '|' + p.skipN + '|' + Math.floor(amount);

    // 1) 有同情绪的历史吐槽 → 把那句 Original 翻出来，最戳心
    const emoBuys = recs.filter(r => r.action === 'buy' && r.emotion === p.topEmo && r.note);
    if (emoBuys.length && p.topEmo) {
      const last = emoBuys[emoBuys.length - 1];
      return fill(pick(COPY.emoHistory, seed), {
        emo: emotionLabel(p.topEmo),
        name: last.name || '那一下',
        note: last.note
      });
    }
    // 2) 正处于冲动高发时段
    if (p.peak !== null && Math.floor(nowH / 3) * 3 === p.peak && p.peakN >= 2) {
      return fill(pick(COPY.peakTime, seed), { peak: p.peakLabel });
    }
    // 3) 有过忍住的战绩
    if (p.skipN >= 1) {
      return fill(pick(COPY.hasSkip, seed), { n: p.skipN, amt: fmtNum(p.skipAmt) });
    }
    // 4) 首次或数据不足
    const pool = amount >= 200 ? COPY.big : COPY.fallback;
    return fill(pick(pool, seed), { cost: cost });
  }

  /* ---------- 各种短文案 ---------- */
  function piggyNote(p) {
    const seed = daySeed() + '|piggy|' + p.skipN;
    return pick(p.skipN ? COPY.piggyActive : COPY.piggyZero, seed).replace(/\{n\}/g, p.skipN);
  }
  function savedCopy(p, amount) {
    const seed = daySeed() + '|saved|' + p.skipN + '|' + amount;
    return {
      title: pick(COPY.savedTitle, seed),
      sub: fill(pick(COPY.savedSub, seed + 'x'), { amt: fmtNum(amount) }),
      money: '¥ ' + fmtNum(amount) + ' 还在兜里'
    };
  }
  function line(scene, seed) { return pick(COPY[scene], seed); }

  /* ---------- 连击：连续有「忍住」记录的天数（断签不清零，重新数） ---------- */
  function streak(d) {
    const days = new Set();
    (d.records || []).filter(r => r.action === 'skip').forEach(r => {
      const dt = new Date(r.ts);
      days.add(dt.getFullYear() + '-' + (dt.getMonth() + 1) + '-' + dt.getDate());
    });
    if (!days.size) return 0;
    const key = dt => dt.getFullYear() + '-' + (dt.getMonth() + 1) + '-' + dt.getDate();
    const cur = new Date();
    // 今天还没忍过，就从昨天起算，别把人家的连击抹了
    if (!days.has(key(cur))) cur.setDate(cur.getDate() - 1);
    let n = 0;
    while (days.has(key(cur))) { n++; cur.setDate(cur.getDate() - 1); }
    return n;
  }
  function streakLine(n) {
    return fill(pick(COPY.streakLine, daySeed() + '|streak|' + n), { n: n });
  }

  /* ---------- 权重抽卡：传说稀有，开盲盒的手感 ---------- */
  function weightedPick(pool, seed) {
    const RANK = { common: 70, rare: 24, legend: 6 };
    const n = hash(String(seed)) % 100;
    let tier = 'common';
    if (n < RANK.legend) tier = 'legend';
    else if (n < RANK.legend + RANK.rare) tier = 'rare';
    const tierPool = pool.filter(x => x.r === tier);
    const chosen = pick(tierPool.length ? tierPool : pool, seed + '|card');
    return chosen;
  }

  /* 收进图鉴：记录 id 与获得次数；返回是否为首次解锁 */
  function collect(d, id) {
    if (!d.collection) d.collection = {};
    const isNew = !d.collection[id];
    d.collection[id] = (d.collection[id] || 0) + 1;
    return isNew;
  }

  /* ---------- 忍住掉落卡 ---------- */
  function dropCard(d, amount) {
    const n = (d.records || []).length;
    const seed = n + '|drop|' + amount + '|' + (d.lastDropSalt || 0);
    const card = weightedPick(COPY.dropCard, seed);
    const isNew = collect(d, card.id);
    const st = streak(d);
    return {
      id: card.id, title: card.t, desc: card.d, icon: card.icon, rank: card.r,
      rankLabel: RANK_LABEL[card.r], isNew,
      streak: st, streakText: streakLine(st)
    };
  }

  /* ---------- 买了：反向成就徽章 ---------- */
  function buyBadge(d, amount) {
    const n = (d.records || []).length;
    const seed = n + '|badge|' + amount + '|' + (d.lastBadgeSalt || 0);
    const b = weightedPick(COPY.buyBadge, seed);
    const isNew = collect(d, b.id);
    return {
      id: b.id, title: b.t, desc: b.d, icon: b.icon, rank: b.r,
      rankLabel: RANK_LABEL[b.r], theme: b.theme, isNew
    };
  }

  const RANK_LABEL = { common: '普通', rare: '稀有', legend: '传说' };

  /* ---------- 段位：按累计忍住次数进阶 ---------- */
  const RANKS = [
    { min: 0,   name: '刹车学徒',   icon: '🐣', desc: '第一次踩刹车，从这里开始' },
    { min: 3,   name: '克制新人',   icon: '🌱', desc: '手开始听得进话了' },
    { min: 8,   name: '冷静选手',   icon: '🧊', desc: '冲动来了，你能接住' },
    { min: 15,  name: '延迟满足师', icon: '🧘', desc: '你懂得把快乐存到明天' },
    { min: 25,  name: '情绪掌舵人', icon: '🧭', desc: '情绪再大，也带偏不了你' },
    { min: 40,  name: '人间清醒',   icon: '👑', desc: '购物车对你失效了' },
    { min: 60,  name: '消费禅师',   icon: '🪷', desc: '想要，但不被想要牵着走' },
    { min: 100, name: '无欲则刚',   icon: '✨', desc: '传说级存在，已臻化境' }
  ];
  function rankOf(d) {
    const totalSkip = (d.records || []).filter(r => r.action === 'skip').length;
    let idx = 0;
    for (let i = 0; i < RANKS.length; i++) if (totalSkip >= RANKS[i].min) idx = i;
    const cur = RANKS[idx], next = RANKS[idx + 1] || null;
    const prevMin = cur.min;
    const span = next ? next.min - prevMin : 1;
    const progress = next ? Math.min(100, Math.round((totalSkip - prevMin) / span * 100)) : 100;
    return {
      idx, name: cur.name, icon: cur.icon, desc: cur.desc,
      totalSkip, nextName: next ? next.name : null,
      need: next ? next.min - totalSkip : 0, progress
    };
  }

  /* ---------- 记账段位：按累计记账笔数进阶，让只记账的人也有成长 ---------- */
  const SAVE_RANKS = [
    { min: 0,   name: '刚开本',   icon: '📒', desc: '第一笔记账，从今天开始' },
    { min: 5,   name: '记账新手', icon: '✏️', desc: '记了几笔，习惯正在长' },
    { min: 15,  name: '流水账客', icon: '🗂️', desc: '钱的去向，你开始有数了' },
    { min: 30,  name: '明细控',   icon: '🔍', desc: '一笔不落，这叫心里有数' },
    { min: 60,  name: '账本行家', icon: '📊', desc: '你的账，比多数人都清楚' },
    { min: 120, name: '数据管家', icon: '🧮', desc: '日子被你记得明明白白' },
    { min: 250, name: '账本封神', icon: '🏅', desc: '记账这件事，你做到了极致' }
  ];
  function saveRankOf(d) {
    const recs = d.records || [];
    const n = recs.filter(r => r && r.ts != null && r.kind !== 'income' && r.action !== 'skip').length;
    let idx = 0;
    for (let i = 0; i < SAVE_RANKS.length; i++) if (n >= SAVE_RANKS[i].min) idx = i;
    const cur = SAVE_RANKS[idx], next = SAVE_RANKS[idx + 1] || null;
    const span = next ? next.min - cur.min : 1;
    const progress = next ? Math.min(100, Math.round((n - cur.min) / span * 100)) : 100;
    return {
      idx, count: n, name: cur.name, icon: cur.icon, desc: cur.desc,
      nextName: next ? next.name : null, need: next ? next.min - n : 0, progress
    };
  }
  /* 记账里程碑：每记满 5 笔掉一张卡，静默进图鉴，不打断记账 */
  function milestoneDrop(d) {
    const sr = saveRankOf(d);
    const bucket = Math.floor(sr.count / 5);
    if (bucket < 1 || bucket === (d.lastMilestone || 0)) return null;
    d.lastMilestone = bucket;
    const seed = 'milestone|' + bucket + '|' + (d.lastDropSalt || 0);
    const card = weightedPick(COPY.dropCard, seed);
    const isNew = collect(d, card.id);
    return { id: card.id, title: card.t, icon: card.icon, rank: card.r, rankLabel: RANK_LABEL[card.r], isNew };
  }

  /* ---------- 图鉴：收集进度与卡片状态 ---------- */
  function codex(d) {
    const col = d.collection || {};
    const cards = COPY.dropCard.map(c => ({ ...c, got: !!col[c.id], count: col[c.id] || 0 }));
    const badges = COPY.buyBadge.map(b => ({ ...b, got: !!col[b.id], count: col[b.id] || 0 }));
    const all = cards.concat(badges);
    return {
      cards, badges,
      gotN: all.filter(x => x.got).length,
      totalN: all.length,
      cardN: cards.filter(x => x.got).length,
      badgeN: badges.filter(x => x.got).length,
      legendN: all.filter(x => x.got && x.r === 'legend').length
    };
  }

  /* ---------- 分享卡文案 ---------- */
  function cardLines(d) {
    const p = portrait(d);
    const seed = daySeed() + '|card|' + p.total + '|' + p.recordN;
    const lines = [];

    // 账本维度优先：只记账的人也能看到自己的画像
    if (p.recordN > 0) {
      if (p.topCat && p.topCat.amount > 0) lines.push(fill(pick(COPY.cardTopCat, seed + 'tc'), { v: p.topCat.name }));
      if (p.monthExpense > 0) lines.push(fill(pick(COPY.cardExpense, seed + 'ex'), { v: fmtNum(p.monthExpense) }));
      if (p.monthIncome > 0) lines.push(fill(pick(COPY.cardIncome, seed + 'in'), { v: fmtNum(p.monthIncome) }));
      if (p.monthBalance > 0) lines.push(fill(pick(COPY.cardBalance, seed + 'ba'), { v: fmtNum(p.monthBalance) }));
      if (p.recordN >= 3) lines.push(fill(pick(COPY.cardRecordN, seed + 'rn'), { v: p.recordN }));
    }

    // 冲动维度：有踩刹车数据才出
    if (p.peakLabel) lines.push(fill(pick(COPY.cardPeak, seed + 'p'), { v: p.peakLabel }));
    if (p.topEmo) lines.push(fill(pick(COPY.cardEmo, seed + 'e'), { v: emotionLabel(p.topEmo) }));
    if (p.topName) lines.push(fill(pick(COPY.cardName, seed + 'n'), { v: p.topName }));
    if (p.rate > 0) lines.push(fill(pick(COPY.cardRate, seed + 'r'), { v: p.rate }));
    if (p.needAmt > 0) lines.push(fill(pick(COPY.cardNeed, seed + 'd'), { v: fmtNum(p.needAmt) }));

    if (!lines.length) lines.push('你才开始记，故事还长着呢');
    return lines;
  }

  /* ==========================================================
     升级模块：固定账 / 语音 / 预测 / 分类预算 / 冷静期 / 复盘 / 迁移
     ========================================================== */

  /* ---------- 固定账模板 ---------- */
  function saveTemplate(d, tpl) {
    if (!d || !tpl || !tpl.name) return null;
    const amt = Number(tpl.amount);
    if (!isFinite(amt) || amt <= 0) return null;
    if (!Array.isArray(d.templates)) d.templates = [];
    const item = {
      id: typeof tpl.id === 'string' && tpl.id ? tpl.id : uid(),
      name: String(tpl.name).slice(0, 40),
      kind: tpl.kind === 'income' ? 'income' : 'expense',
      category: CAT_IDS.indexOf(tpl.category) >= 0 ? tpl.category : 'other',
      amount: Math.round(amt * 100) / 100,
      note: typeof tpl.note === 'string' ? tpl.note.slice(0, 100) : ''
    };
    const idx = d.templates.findIndex(t => t.id === item.id || (t.name === item.name && t.kind === item.kind));
    if (idx >= 0) d.templates[idx] = item;
    else { d.templates.unshift(item); d.templates = d.templates.slice(0, 50); }
    return item;
  }
  function removeTemplate(d, id) {
    if (d && Array.isArray(d.templates)) d.templates = d.templates.filter(t => t.id !== id);
  }
  /* 从历史里找出现≥2 次、名字相同的账，作为「一键存常用」的候选 */
  function inferTemplates(d) {
    const map = {};
    (d.records || []).forEach(r => {
      if (!r || r.action === 'skip' || !r.name) return;
      const n = String(r.name).trim().slice(0, 40);
      if (!n) return;
      const k = (r.kind === 'income' ? 'i' : 'e') + '|' + n;
      if (!map[k]) map[k] = { name: n, kind: r.kind === 'income' ? 'income' : 'expense', category: r.category || 'other', amount: 0, n: 0 };
      map[k].n++;
      if (map[k].n === 1) map[k].amount = Number(r.amount) || 0;
      else map[k].amount = Math.round((map[k].amount + (Number(r.amount) || 0)) / 2 * 100) / 100;
    });
    return Object.keys(map).map(k => map[k])
      .filter(x => x.n >= 2 && x.amount > 0)
      .sort((a, b) => b.n - a.n)
      .slice(0, 6)
      .map(x => ({ name: x.name, kind: x.kind, category: x.category, amount: x.amount, guessed: true }));
  }

  /* ---------- 语音记账：把口语翻成一条账 ---------- */
  const CN_DIGIT = { 零: 0, '〇': 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  function cnNumber(s) {
    if (!s) return 0;
    if (/^\d+$/.test(s)) return Number(s);
    let section = 0, num = 0;
    for (const ch of s) {
      if (CN_DIGIT[ch] != null) num = CN_DIGIT[ch];
      else if (ch === '十') { section += (num || 1) * 10; num = 0; }
      else if (ch === '百') { section += (num || 1) * 100; num = 0; }
      else if (ch === '千') { section += (num || 1) * 1000; num = 0; }
      else return 0;
    }
    return section + num;
  }
  const VOICE_CATS = [
    { id: 'drink', re: /奶茶|咖啡|饮料|可乐|果茶|拿铁/ },
    { id: 'food', re: /饭|外卖|食堂|火锅|烧烤|面条|米粉|早茶|吃饭|买菜|水果|零食/ },
    { id: 'transport', re: /打车|地铁|公交|车费|油费|高铁|机票|单车|停车/ },
    { id: 'home', re: /房租|水电|物业|电费|水费|燃气|房贷|宽带/ },
    { id: 'fun', re: /电影|游戏|唱歌|门票|娱乐|会员|演唱会|按摩/ },
    { id: 'health', re: /药|医院|看病|体检|挂号|牙/ },
    { id: 'study', re: /书|课程|学费|培训|考试/ },
    { id: 'social', re: /送礼|人情|份子|随礼/ },
    { id: 'shop', re: /衣服|鞋|购物|快递|淘宝|拼多多|日用品|化妆|买/ }
  ];
  const VOICE_INCOME = [
    { id: 'salary', re: /工资|薪水|发薪/ },
    { id: 'bonus', re: /奖金|年终/ },
    { id: 'side', re: /兼职|外快|接单/ },
    { id: 'invest', re: /理财|基金|股票|收益/ },
    { id: 'redpack', re: /红包|压岁钱/ }
  ];
  function parseVoice(text) {
    if (!text) return null;
    let s = String(text).replace(/[\s,，。！？!?]/g, '');
    if (!s) return null;
    let amount = 0, amountText = '';
    const arab = s.match(/(\d+(?:\.\d+)?)(?:块钱|块|元|圆)/);
    const chinese = s.match(/([一二三四五六七八九十百千零〇两]+)(?:块钱|块|元|圆)/);
    if (arab) { amount = parseFloat(arab[1]); amountText = arab[0]; }
    else if (chinese) { amount = cnNumber(chinese[1]); amountText = chinese[0]; }
    else {
      const only = s.match(/\d+(?:\.\d+)?/g);
      if (only && only.length === 1) { amount = parseFloat(only[0]); amountText = only[0]; }
    }
    if (!isFinite(amount) || amount <= 0) return null;

    let kind = 'expense', category = 'other';
    const inc = VOICE_INCOME.find(x => x.re.test(s));
    if (inc) { kind = 'income'; category = inc.id; }
    else {
      const cat = VOICE_CATS.find(x => x.re.test(s));
      if (cat) category = cat.id;
    }
    let name = s.replace(amountText, '')
      .replace(/^(我|刚刚?|今天|昨天|早上|中午|晚上|上午|下午|花了|买了|支出|人民币|一共|总共|支付|进账)+/, '')
      .replace(/(花了|买了|支出|块钱|块|元|圆)$/, '')
      .trim().slice(0, 24);
    if (!name) name = categoryName(category, kind);
    return { amount: Math.round(amount * 100) / 100, name, kind, category };
  }

  /* ---------- 前视预测：按已有节奏估月底 ---------- */
  function forecast(d) {
    const key = monthKey(Date.now());
    const [y, m] = key.split('-').map(Number);
    const days = new Date(y, m, 0).getDate();
    const day = new Date().getDate();
    const lg = ledger(d, key);
    const prevKeys = [1, 2, 3].map(i => monthKey(new Date(y, m - 1 - i, 1).getTime()));
    const prevVals = prevKeys.map(k => ledger(d, k).expense).filter(v => v > 0);
    const basis = prevVals.length ? prevVals.reduce((a, b) => a + b, 0) / prevVals.length : 0;
    const pace = day > 0 ? lg.expense / day * days : 0;
    const enough = lg.expense > 0 && day >= 4;
    const raw = basis && pace ? basis * 0.4 + pace * 0.6 : (pace || basis);
    const projected = Math.round(raw * 100) / 100;
    const budget = Math.max(1, Number(d.settings && d.settings.budget) || 2000);
    const diff = Math.round(Math.abs(projected - budget) * 100) / 100;
    const pool = projected > budget ? COPY.forecastOver : COPY.forecastUnder;
    const text = enough
      ? fill(pick(pool, daySeed() + '|fc|' + Math.round(projected)), { v: fmtNum(projected), d: fmtNum(diff) })
      : pick(COPY.forecastFew, daySeed() + '|fc|few');
    return {
      projected, budget, diff, over: projected > budget, enough,
      daysLeft: Math.max(0, days - day),
      daily: day > 0 ? Math.round(lg.expense / day * 100) / 100 : 0,
      text
    };
  }

  /* ---------- 洞察转预算：把花得多的分类变成上限 ---------- */
  function catBudgetSuggestions(d) {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth() + 1;
    const keys = [1, 2, 3].map(i => monthKey(new Date(y, m - i, 1).getTime()));
    const usable = keys.filter(k => ledger(d, k).expense > 0);
    const list = usable.length ? usable : [monthKey(now.getTime())];
    const map = {};
    list.forEach(k => ledger(d, k).cats.forEach(c => {
      map[c.id] = (map[c.id] || 0) + c.amount / list.length;
    }));
    const cur = d.categoryBudgets || {};
    return Object.keys(map).map(id => {
      const avg = map[id];
      return {
        id, name: categoryName(id, 'expense'), icon: categoryIcon(id, 'expense'),
        avg: Math.round(avg * 100) / 100,
        suggested: Math.max(50, Math.ceil(avg / 50) * 50),
        current: Number(cur[id]) || 0
      };
    }).filter(x => x.avg >= 20).sort((a, b) => b.avg - a.avg).slice(0, 6);
  }
  function applyCatBudgets(d, items) {
    if (!d.categoryBudgets || typeof d.categoryBudgets !== 'object') d.categoryBudgets = {};
    let n = 0;
    (Array.isArray(items) ? items : []).forEach(x => {
      const v = Number(x && x.suggested);
      if (x && CAT_IDS.indexOf(x.id) >= 0 && isFinite(v) && v > 0) { d.categoryBudgets[x.id] = v; n++; }
    });
    return n;
  }
  function catBudgetOf(d, id) {
    const v = Number(d.categoryBudgets && d.categoryBudgets[id]);
    return isFinite(v) && v > 0 ? v : 0;
  }

  /* ---------- 冷静期清单 ---------- */
  function addWish(d, name, amount) {
    if (!d || !name || !amount || amount <= 0) return null;
    if (!Array.isArray(d.wishlist)) d.wishlist = [];
    const w = {
      id: uid(), name: String(name).slice(0, 60), amount: Math.round(Number(amount) * 100) / 100,
      addedTs: Date.now(), decidedTs: null, decision: null
    };
    d.wishlist.unshift(w);
    d.wishlist = d.wishlist.slice(0, 100);
    return w;
  }
  function removeWish(d, id) {
    if (d && Array.isArray(d.wishlist)) d.wishlist = d.wishlist.filter(w => w.id !== id);
  }
  function wishDays(w) {
    if (!w || !w.addedTs) return 0;
    return Math.max(0, Math.floor((Date.now() - w.addedTs) / 86400000));
  }
  function decideWish(d, id, decision) {
    if (!d || !Array.isArray(d.wishlist)) return null;
    const w = d.wishlist.find(x => x.id === id);
    if (!w || w.decidedTs) return null;
    w.decision = decision === 'buy' ? 'buy' : 'skip';
    w.decidedTs = Date.now();
    if (!Array.isArray(d.records)) d.records = [];
    d.records.push({
      id: uid(), ts: Date.now(), action: w.decision === 'buy' ? 'normal' : 'skip', kind: 'expense',
      category: 'shop', amount: w.amount, name: w.name,
      emotion: null, note: '冷静期后决定' + (w.decision === 'buy' ? '买' : '不买')
    });
    if (w.decision === 'skip') d.lastDropSalt = (d.lastDropSalt || 0) + 1;
    return w;
  }

  /* ---------- 周 / 月复盘 ---------- */
  function review(d, period) {
    const isWeek = period !== 'month';
    const now = new Date();
    const y = now.getFullYear(), mo = now.getMonth(), da = now.getDate();
    let start, prevStart, prevEnd, label;
    if (isWeek) {
      const back = (now.getDay() + 6) % 7;
      start = new Date(y, mo, da - back);
      prevStart = new Date(start.getTime() - 7 * 86400000);
      prevEnd = start;
      label = '周';
    } else {
      start = new Date(y, mo, 1);
      prevStart = new Date(y, mo - 1, 1);
      prevEnd = start;
      label = '月';
    }
    const end = new Date(y, mo, da + 1);
    const between = (r, a, b) => r && r.ts != null && r.ts >= a.getTime() && r.ts < b.getTime();
    const recs = (d.records || []).filter(r => between(r, start, end));
    const prev = (d.records || []).filter(r => between(r, prevStart, prevEnd));
    const expenseOf = arr => arr.filter(isRealExpense).reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const expense = Math.round(expenseOf(recs) * 100) / 100;
    const prevExpense = Math.round(expenseOf(prev) * 100) / 100;
    const delta = prevExpense > 0 ? Math.round((expense - prevExpense) * 100) / 100 : null;
    const byCat = {};
    recs.filter(isRealExpense).forEach(r => { const c = r.category || 'other'; byCat[c] = (byCat[c] || 0) + (Number(r.amount) || 0); });
    const catIds = Object.keys(byCat).sort((a, b) => byCat[b] - byCat[a]);
    const topCat = catIds.length ? { id: catIds[0], name: categoryName(catIds[0], 'expense'), amount: Math.round(byCat[catIds[0]] * 100) / 100 } : null;
    const skipN = recs.filter(r => r.action === 'skip').length;
    const days = new Set(recs.filter(isRealExpense).map(r => new Date(r.ts).getDate())).size;
    const seed = daySeed() + '|rv|' + period + '|' + Math.round(expense);
    let base;
    if (delta === null) base = pick(COPY.reviewLines.noPrev, seed);
    else if (Math.abs(delta) < 1) base = pick(COPY.reviewLines.flat, seed);
    else base = pick(delta < 0 ? COPY.reviewLines.expenseDown : COPY.reviewLines.expenseUp, seed);
    const lines = [fill(base, { period: label, v: fmtNum(expense), d: fmtNum(Math.abs(delta || 0)) })];
    if (topCat) lines.push(fill(pick(COPY.reviewLines.topCat, seed + 'c'), { v: topCat.name, period: label }));
    if (skipN) lines.push(fill(pick(COPY.reviewLines.skip, seed + 's'), { v: skipN }));
    if (days) lines.push(fill(pick(COPY.reviewLines.days, seed + 'd'), { v: days }));
    return { period: period || 'week', label, expense, prevExpense, delta, topCat, skipN, days, lines };
  }

  /* ---------- 备份导入 / 换机迁移 ---------- */
  function importData(raw) {
    try {
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, error: '文件格式不对' };
      const src = obj.data && typeof obj.data === 'object' && !Array.isArray(obj.data) ? obj.data : obj;
      if (!Array.isArray(src.records)) return { ok: false, error: '文件里没有账目记录' };
      const d = {
        records: sanitizeRecords(src.records),
        settings: sanitizeSettings(src.settings),
        collection: sanitizeCollection(src.collection),
        templates: sanitizeTemplates(src.templates),
        wishlist: sanitizeWishlist(src.wishlist),
        categoryBudgets: sanitizeCatBudgets(src.categoryBudgets),
        lastDropSalt: Number(src.lastDropSalt) || 0,
        lastBadgeSalt: Number(src.lastBadgeSalt) || 0,
        lastMilestone: Number(src.lastMilestone) || 0,
        lastExportTs: Number(src.lastExportTs) || 0
      };
      return { ok: true, data: d, count: d.records.length };
    } catch (e) { return { ok: false, error: '读不出来，可能不是备份文件' }; }
  }

  /* ---------- 导出 ---------- */
  window.SY = {
    $, load, save, uid, defaultData,
    DEFAULT_CATEGORIES, categories, categoryName, categoryIcon,
    ledger, monthsWithRecords, dailyTrend,
    EMOTIONS, translate, portrait, judge, cardLines,
    piggyNote, savedCopy, line, streak, streakLine, dropCard, buyBadge,
    rankOf, codex, RANKS, RANK_LABEL, collect, saveRankOf, SAVE_RANKS, milestoneDrop,
    knownNeeds, isKnownNeed, emotionLabel, monthKey, inThisMonth, fmtNum,
    saveTemplate, removeTemplate, inferTemplates,
    parseVoice, forecast, catBudgetSuggestions, applyCatBudgets, catBudgetOf,
    addWish, removeWish, wishDays, decideWish,
    review, importData
  };
})();
