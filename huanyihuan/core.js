/* ============================================================
   缓一缓 · 核心逻辑层（无 DOM 依赖）
   ============================================================ */
(function () {
  'use strict';

  const KEY = 'huanyihuan.v1';
  const $ = s => document.querySelector(s);

  /* ---------- 存储 ---------- */
  function defaultData() {
    return { records: [], settings: { wage: 50, budget: 2000, categories: null }, collection: {} };
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
    return {
      wage: isFinite(wage) && wage > 0 ? wage : def.wage,
      budget: isFinite(budget) && budget > 0 ? budget : def.budget,
      categories: validCats
    };
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
        collection: sanitizeCollection(d.collection)
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
    cardNeed: ['另有<strong>¥{v}</strong>是生活必需，花得坦荡', '<strong>¥{v}</strong>花在刀刃上，不心虚', '其中<strong>¥{v}</strong>是刚需，该花'],
    // 账本洞察（让只记账不踩刹车的用户也有画像）
    cardTopCat: ['这个月，<strong>{v}</strong>花得最多', '<strong>{v}</strong>是你的开销大头', '钱主要流向了<strong>{v}</strong>'],
    cardExpense: ['这个月花了 <strong>¥{v}</strong>，心里有数了', '<strong>¥{v}</strong>的去向，你都记下来了', '本月支出 <strong>¥{v}</strong>，笔笔清楚'],
    cardIncome: ['进账 <strong>¥{v}</strong>，是你挣下的', '这个月到手 <strong>¥{v}</strong>'],
    cardBalance: ['剩下 <strong>¥{v}</strong>，是你自己攒的', '结余 <strong>¥{v}</strong>，这才是真底气'],
    cardRecordN: ['记了 <strong>{v}</strong> 笔，把日子过成了账', '<strong>{v}</strong> 笔记录，一笔没落'],
    cardTitle: ['这个月，我按住了 {v}% 的冲动', '十次上头，我拦下 {v} 次', '我的 {v}%，没被冲动带走', '这个月，我赢了 {v}% 的心动'],
    cardMoneyLabel: ['这个月，我没花出去的', '兜里因此多出来的', '攒下的，是这些'],
    cardFoot: ['想买之前，先看见', '慢三秒，再决定', '钱花在值得的地方']
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

  /* ---------- 导出 ---------- */
  window.SY = {
    $, load, save, uid, defaultData,
    DEFAULT_CATEGORIES, categories, categoryName, categoryIcon,
    ledger, monthsWithRecords, dailyTrend,
    EMOTIONS, translate, portrait, judge, cardLines,
    piggyNote, savedCopy, line, streak, streakLine, dropCard, buyBadge,
    rankOf, codex, RANKS, RANK_LABEL, collect, saveRankOf, SAVE_RANKS, milestoneDrop,
    knownNeeds, isKnownNeed, emotionLabel, monthKey, inThisMonth, fmtNum
  };
})();
