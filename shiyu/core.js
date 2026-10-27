/* ============================================================
   拾愈 · 核心引擎层
   纯离线可用：像素分析 → 情绪判定 → 文案 + 手绘注脚
   可选升级：配置 API 后由视觉大模型读图，覆盖离线结果
   ============================================================ */

window.SY = (function () {
  'use strict';

  /* ---------------- 基础工具 ---------------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  function uid() {
    return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return Math.abs(h);
  }

  function seededRandom(seed) {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return function () {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function dateKey(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function dayLabel(key) {
    const today = dateKey();
    if (key === today) return '今天';
    const t = new Date(); t.setDate(t.getDate() - 1);
    if (key === dateKey(t)) return '昨天';
    const parts = key.split('-');
    return parts[1].replace(/^0/, '') + '月' + parts[2].replace(/^0/, '') + '日';
  }

  function timeLabel(ts) {
    const d = new Date(ts);
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  /* ---------------- 情绪字典 ---------------- */
  const EMOTIONS = [
    { id: 'tired',  label: '疲惫', color: '#7E8CA0', soft: '#E6E9EF',
      note: '今天的消耗比补充多', stickers: ['lamp', 'moon', 'cloud'] },
    { id: 'calm',   label: '平静', color: '#7F9E93', soft: '#E4EDEA',
      note: '此刻不需要用力', stickers: ['wave', 'leaf', 'wind'] },
    { id: 'happy',  label: '愉悦', color: '#D99341', soft: '#F8EEDF',
      note: '有一秒是亮着的', stickers: ['sun', 'star', 'spark'] },
    { id: 'sad',    label: '委屈', color: '#7A8DA8', soft: '#E7EBF2',
      note: '有点沉，先别急着好吧', stickers: ['raindrop', 'cloud', 'moon'] },
    { id: 'anxious',label: '焦虑', color: '#AC8265', soft: '#F2E8E1',
      note: '心里有太多同时在响', stickers: ['yarn', 'wave', 'rain'] },
    { id: 'hope',   label: '期待', color: '#7BA168', soft: '#E9F0E3',
      note: '有件事还没发生，但已经在路上', stickers: ['sprout', 'bird', 'sun'] },
    { id: 'lonely', label: '孤独', color: '#8A87A0', soft: '#EAE9F0',
      note: '一个人待着，也算数', stickers: ['moon', 'star', 'window'] },
    { id: 'warm',   label: '温暖', color: '#C87B4A', soft: '#F7E9DF',
      note: '被接住了一小会儿', stickers: ['paw', 'cup', 'heart'] }
  ];

  const EMOTION_MAP = {};
  EMOTIONS.forEach(e => { EMOTION_MAP[e.id] = e; });

  /* ---------------- 文案库（直译优先、零烂词） ---------------- */
  const EMOTION_COPY = {
    tired: [
      '你已经做得够多了，剩下的明天再说。',
      '撑到现在的人，都很了不起了。',
      '今天先到这儿，没人规定要一路顺到底。',
      '累不是你的错，别把疲惫当成不够好。',
      '允许自己慢下来，路不会怪你。',
      '有些日子是用来过的，不是用来赢的。',
      '有些力气，得留着明天用。',
      '你不用一直有产出，停一下也是进度。',
      '今天已经很努力了，剩下的交给睡一觉。',
      '不是所有日子都要有进展，撑住就是进展。',
      '再撑一会儿就行，不用撑到完美。',
      '今天把你用得很凶，记得把自己还回来。',
      '电量低不是故障，是提醒。',
      '眼皮在替你说话，听它的。',
      '把肩放下来，没人一直看着。',
      '累的时候，连呼吸都可以偷懒。',
      '你不用回应所有事，先回应自己。',
      '电量红了的你，也值得被好好对待。',
      '今天先躺平，宇宙不会怪你。',
      '已经营业一整天，下班就关机吧。',
      '不是懒，是今天额度用完了。',
      '把自己调成省电模式，没什么丢人。',
      '今天的KPI，是不用再动就行。',
      '累到不想说话，那就别说。',
      '你又不是永动机，停一下很正常。',
      '今天的你，已经够够的了。',
      '先瘫一会儿，灵感都在沙发里。',
      '允许今天的自己，只完成呼吸。',
      '别硬撑了，没人给你发全勤奖。',
      '下班后的你，归你自己所有。',
      '今天就算摆烂，也是认真摆的。',
      '累是身体在帮你喊停。',
      '把今天翻篇，明天再当好人。',
      '你刚才那一通硬扛，我都看见了。',
      '电量见底的人，先充自己。',
      '不需要时刻在线，偶尔掉线也行。',
      '今天先不进步了，保命要紧。'
    ],
    calm: [
      '此刻没有必须解决的事，那就先没有。',
      '世界很吵，你这里挺安静。',
      '慢一点，也不会被落下。',
      '安静待着，也算一种前进。',
      '这一分钟只属于你。',
      '什么都不发生，也挺好。',
      '有些时间就是拿来浪费的。',
      '你在一个不用力的地方待着。',
      '这种平，其实很难得。',
      '不用赶，也不用交代。',
      '这里的安静，刚好够用。',
      '不用找事做，待着就是事。',
      '这一段留白，是你自己挣的。',
      '慢下来的部分，也是今天的。',
      '没什么要紧事，这就很好。',
      '水没有波澜，但一直在流。',
      '你可以只是坐着，不算浪费。',
      '松弛感是借来的，先用着。',
      '今天没什么大事，挺奢侈的。',
      '允许自己什么都不卷。',
      '风很轻，你也轻一点。',
      '这会儿不赶路，只赶自己开心。',
      '心空出一块，正好装晚风。',
      '不慌不忙，时间也不会跑。',
      '把节奏调成0.5倍速。',
      '此刻的安静，是你赚到的。',
      '没什么要证明的，待着就行。',
      '今天的不作为，也是一种作为。',
      '把手机放下，世界还在。',
      '这一刻的平，是攒来的。',
      '不用找意义，存在本身就够。',
      '慢生活不是摆拍，是真好。',
      '允许日子毫无波澜。',
      '你现在的安静，很好看。',
      '什么都没发生，就是好消息。',
      '把紧绷松开一点，风就进来了。',
      '今天不做任何人的配角。'
    ],
    happy: [
      '这一下开心，记住了。',
      '今天有一秒是亮着的。',
      '你笑起来的样子，自己也该被感染。',
      '好事不必多，有一件就够。',
      '这一刻值得被多看两眼。',
      '把这份轻收好，明天会用到。',
      '你刚刚自己逗笑了自己。',
      '真好，这种事不用理由。',
      '今天的快乐是限量的，趁热收着。',
      '这一刻的轻盈，先记下来。',
      '这种小开心，攒着能用好几天。',
      '嘴角自己上去了，拦不住。',
      '今天运气往你这边偏了一点。',
      '好事发生了，你刚好在场。',
      '开心不用省着，用完了还会有。',
      '这一秒你在发光，自己没发现。',
      '笑出声也没关系，今天允许。',
      '今天的小确幸，被你捡到了。',
      '快乐限定款，今天归你。',
      '嘴角它自己有想法。',
      '这会儿的好心情，先存着。',
      '被自己可爱到了，藏不住。',
      '今天的好运，偏心你。',
      '开心不用发朋友圈，自己知道就行。',
      '这一秒的甜，够回味好久。',
      '好心情是今天的主角。',
      '拣到一地碎光，拼成了笑。',
      '今天的快乐，没道理但很真。',
      '你笑起来的样子，今天在线。',
      '小开心也是开心，不打折。',
      '这一刻轻得像要飘起来。',
      '好运这趟车，你赶上了。',
      '今天允许自己理直气壮地乐。',
      '把这点甜打包带走。',
      '快乐这种事，攒着不嫌多。',
      '嘴角上扬，是今天的小叛逆。',
      '被快乐撞了一下腰。'
    ],
    sad: [
      '你不需要一直坚强。',
      '有点难过是允许的。',
      '今天先别急着好吧。',
      '你的感受不需要解释。',
      '被误解的时候，先照顾自己。',
      '不开心就不开心，不用找原因。',
      '你不是玻璃做的，偶尔碎一下也没关系。',
      '先歇一歇，别把硬撑成习惯。',
      '有些委屈放一放会变小。',
      '今天允许自己不那么体面。',
      '难过就难过，不用解释成别的事。',
      '眼泪也不代表什么，流就流了。',
      '今天的风有点凉，你受着了。',
      '有些话没说出口，也是一种照顾自己。',
      '心里那块软的地方，碰一下很疼。',
      '你不需要马上恢复，慢慢来。',
      '被冤枉的感觉，先放一会儿。',
      '今天先丧着，不准不许。',
      'emo一下又不犯法。',
      '成年人的崩溃，自己悄悄消化。',
      '你不用时刻都发光。',
      '今天允许自己不坚强。',
      '难过不是矫情，是真的疼。',
      '先把眼泪收着，明天再说。',
      '这一刻的灰，不用马上擦掉。',
      '你不必把心事都讲明白。',
      '情绪低落时，允许自己慢半拍。',
      '今天先不快乐，也没关系。',
      '有些委屈，默默扛着也是扛着。',
      '你不是不够好，只是今天累了。',
      '哭一下又不掉价。',
      '把心里的雨，先下完。',
      '今天的不开心，不直播给别人看。',
      '撑住的这一面，只有你知道。',
      '你不需要马上好起来。',
      '丧完这一阵，再慢慢回血。',
      '今天的你，允许不太行。'
    ],
    anxious: [
      '先做一件最小的事。',
      '担心的事，大多不会来。',
      '你不需要现在就想明白全部。',
      '慢一点回复也没关系。',
      '把「万一」先放一放。',
      '现在能做的只有一件，那就做那一件。',
      '你脑子里的声音，不是命令。',
      '先睡一觉，很多事会变轻。',
      '慌的时候，先去洗把脸。',
      '你已经准备了比你想的多。',
      '心跳很快，但事情没那么快。',
      '一件一件来，别一起想。',
      '先把手机放下，十分钟就好。',
      '焦虑在催你，但它不是你。',
      '最坏的结果，你也接得住。',
      '深呼吸三次，再回来看。',
      '你不是来不及，只是着急。',
      '内耗暂停一下，电费很贵。',
      '先把万一放一边，先活当下。',
      '焦虑很吵，但你可以静音。',
      '想太多的时候，先去喝口水。',
      '你不一定要马上想清楚。',
      '把大问题拆成小步，一步步走。',
      '脑子里的弹幕，先关几条。',
      '深呼吸，把悬着的心放下来。',
      '你担心的，大部分不会发生。',
      '现在只做一件，就够。',
      '别急着给人生下结论。',
      '先完成，再完美。',
      '你比你想的稳。',
      '把手机扣下，世界没那么急。',
      '慌的时候，先洗把脸。',
      '你不是落后，只是节奏不同。',
      '先允许自己不知道。',
      '把悬着的事，一件件落地。',
      '焦虑不是你的错，是时代太吵。',
      '慢慢来，答案会自己出现。'
    ],
    hope: [
      '好事在路上，先留个位置。',
      '今天值得期待一下。',
      '有个还没到的日子在等你。',
      '先期待着，也不算浪费。',
      '有些答案要等它自己长出来。',
      '还没开始，也是一种开始。',
      '先往前走，风景会跟上来。',
      '你在等的那件事，正在成形。',
      '期待是很好用的力气。',
      '留一点空白，好事才有地方来。',
      '有个好东西在赶来的路上。',
      '现在的等待，都是在铺路。',
      '这一天还没写完，别急着总结。',
      '你想要的，正在慢慢对齐。',
      '先别急着下结论，还有下文。',
      '把这颗种子先埋好。',
      '下一个转角，可能就是它。',
      '好事正在赶来的路上。',
      '今天的期待，先充值。',
      '有个好结果，在排队等你。',
      '先把位置留好，惊喜要来。',
      '今天的努力，都在暗暗攒着。',
      '下个转角，可能就是它。',
      '好东西不怕晚，它正对齐你。',
      '今天先埋颗种子。',
      '你想要的，正在慢慢靠近。',
      '留一点空白，好事才有入口。',
      '一切都在变好的路上。',
      '今天先相信一次。',
      '还没到的好，先欠着。',
      '你的高光，在后面几页。',
      '先期待着，本身就是力气。',
      '时间会替你把对的带来。',
      '把心打开一点，好运好进。',
      '今天先不丧，留点希望。',
      '好事不响，但它在。',
      '你等的那个，正在长出来。'
    ],
    lonely: [
      '一个人也可以待得好。',
      '安静不等于孤单。',
      '你不用一直热闹着。',
      '世界很大，你有一个位置就够。',
      '想安静的时候，安静是允许的。',
      '你并不需要被填满。',
      '独处是充电，不是被剩下。',
      '这一刻只有你，也挺好。',
      '留一点只属于自己的时间。',
      '有些话先说给自己听，也算说过了。',
      '一个人的房间，也装得下你。',
      '热闹是别人的，安静是你的。',
      '没人回复也没关系，你在。',
      '今晚只有你陪你自己，也够了。',
      '孤独不是惩罚，是留白。',
      '你不需要一直被谁懂。',
      '把自己照顾好，已经很难得。',
      '一个人也能开成一小朵。',
      '今晚你陪你自己，够本了。',
      '安静是你自己的，谁也抢不走。',
      '没人懂也没事，你懂自己。',
      '一个人的房间，刚刚好。',
      '你不需要被谁填满。',
      '今天只和自己约会。',
      '一个人待着，也是一种营业。',
      '你不需要一直在线等回复。',
      '世界很大，你这一格够了。',
      '把自己照顾好，就很了不起。',
      '今晚的月亮，只照你一个。',
      '安静地待着，也是一种在场。',
      '你不需要合群来证明存在。',
      '一个人也有一个人的好。',
      '把孤单调成静音，自己听得见自己。',
      '今天你只负责陪好自己。'
    ],
    warm: [
      '有一点点暖，就够撑一会儿。',
      '今天的温度，记住了。',
      '有人对你好，是有回响的。',
      '被接住的瞬间，值得停下来。',
      '光落在你身上了一会儿。',
      '这种暖不用多，就一小块。',
      '你也被好好对待过。',
      '把这份温度带回去。',
      '有些温柔是悄悄发生的。',
      '今天的你，也值得被温柔对待。',
      '这点暖，够你记一个星期。',
      '刚才那一下，是被世界善待了。',
      '有人记得你，这件事本身就很好。',
      '把这份暖存起来，冷的时候用。',
      '你值得被这样对待，真的。',
      '今天的善意，你接住了。',
      '这一小块暖，是你的了。',
      '今天有人悄悄对你好。',
      '被世界温柔了一下，记着。',
      '这点暖，够你撑一阵。',
      '有人记得你，这就很好。',
      '今天的善意，你接住了。',
      '被接住的瞬间，停一下。',
      '光落在你身上，别躲。',
      '有人给你的好，是回响。',
      '今天的暖，存进兜里。',
      '你也被好好对待过，真的。',
      '这一小块暖，是你的了。',
      '有人把温柔，分了你一点。',
      '今天的你，值得被疼。',
      '被善待的那一刻，别否认。',
      '暖这种事，攒着不嫌少。',
      '有人替你想过，这件事很轻。',
      '今天的好，先收好。',
      '你接住的暖，会变成光。',
      '被爱着的证据，今天有一条。',
      '这点温度，够暖一整个深夜。'
    ]
  };

  /* 画面线索触发的补充句（直译照片，不空喊） */
  const HINT_COPY = {
    '光': [
      '今天这点光，是借给你的。',
      '光刚好落在这一块，别辜负。',
      '有一束光停住了，就当是提醒。',
      '被光照到的地方，先站一会儿。',
      '这束光没照别人，照的是你。',
      '今天的补光是老天给的，不用还。',
      '光打过来的角度，刚好够你喘口气。',
      '亮的那一块，先留给眼睛歇会儿。',
      '这束斜光，像有人替你开了盏小灯。',
      '被点亮的不只是这一角，还有今天。',
      '光是免费的，今天先收下这份。',
      '它没说几点的，只说"现在刚好"。',
      '暗的地方先搁着，亮的地方先过。'
    ],
    '天空': [
      '抬头那一下，天空刚好。',
      '天很大，你占的那一小块也挺好。',
      '云走过去了，剩下的就是你的。',
      '天这么敞，心事也可以摊开。',
      '那一块蓝，替你透了个气。',
      '云不赶路，你也不必。',
      '今天的抬头权，你用掉了一次。',
      '天没盖戳说"今天不行"，那就还行。',
      '那片留白，是给你发呆用的。',
      '风把云推走了，你也被推着往前了。',
      '抬头不用理由，就是想喘口气而已。',
      '天空今天营业，免费看了。',
      '蓝得这么大方，你也大方点休息。'
    ],
    '夜': [
      '夜里也有一小块是亮的。',
      '晚一点没关系，灯还亮着。',
      '今天撑到这一格的，都算数。',
      '夜色收走了声音，留下了你。',
      '这么晚了还在的人，辛苦了。',
      '深夜 emo 但不发疯，这就很厉害。',
      '月亮是今晚唯一的 KPI，已达成。',
      '夜里的安静，是给清醒的人留的。',
      '把灯关小一点，世界就小一点，刚好。',
      '今晚不赶进度，进度自己会来。',
      '夜班是和城市错峰休息，也挺好。',
      '黑暗里那点微光，是你还没睡透的劲儿。',
      '深夜不营业烦恼，只营业你和自己。'
    ],
    '绿': [
      '有这一处绿，就够了。',
      '会长的都在慢慢长。',
      '这点颜色，比你想的耐用。',
      '它没着急，你也可以不急。',
      '绿着绿着，一天就过去了。',
      '植物不内卷，你也不必。',
      '它今天长了一点，你也是。',
      '这点绿，是城市给你的限定款呼吸。',
      '养活它是小事，被它养活是大事。',
      '绿得这么安静，像在说"慢慢来"。',
      '叶子上那点光，是免费的充电。',
      '它不催你，你就借它喘口气。',
      '看着它，手机就少看了十分钟。'
    ],
    '人': [
      '先照顾好自己，再照顾别的。',
      '被拍下来的这个人，今天已经很努力。',
      '你的脸不用有表情也可以。',
      '你在就够了。',
      '画面里有你，今天就有了主角。',
      '今天也是独自营业的一天，营收是清醒。',
      '你不用一直在线，偶尔掉线也行。',
      '这一帧的你，比朋友圈里真实。',
      '被记录下来的普通人，今天也很珍贵。',
      '你没摆拍，但这一刻刚好。',
      '镜头里的你，先放过自己一次。',
      '一个人的画面不空，是刚好装下你自己。',
      '你出现在照片里，就是今天的意义。'
    ],
    '桌面': [
      '桌上那点东西，替你撑了一会儿。',
      '收拾不收拾，都不影响今天。',
      '这堆乱糟糟，也是一种在生活。',
      '杯子空了，事情也就差不多到头了。',
      '这些小东西陪你待了一天。',
      '工位也是我的小天地，虽然只有一平米。',
      '桌面乱说明脑子在高速运转，信我。',
      '这杯水的温度，是今天唯一的刻度。',
      '键盘敲了一天，也该给自己敲个赞。',
      '桌角那点光，是加班人的限定浪漫。',
      '乱是乱了点，但每样都是你选的。',
      '收工前的桌面，像打完一场硬仗的战场。',
      '这些杂物加起来，就是一个普通却真实的你。'
    ],
    '窗': [
      '窗外那点动静，也是今天的一部分。',
      '光从那边进来，先落在这。',
      '看着外面，就当透了口气。',
      '窗把远方裁了一小块给你。',
      '隔着玻璃，也算和世界打了个照面。',
      '窗是出租屋最便宜的风景，也够看。',
      '从这儿往外看，烦恼自动缩小一倍。',
      '玻璃上的那点雾，是你呼出的慢生活。',
      '窗框把世界框成一幅画，免费挂你家。',
      '坐窗边的人，手里都握着一半放空。',
      '往外看一眼，比刷十分钟手机管用。',
      '这扇窗没换过风景，但你换了好几次心情。',
      '隔着窗的烟火气，是别人的也是你的。'
    ],
    '雨': [
      '雨天也可以是好天，只是慢一点。',
      '雨替你把今天的声音都包了。',
      '淋不着的地方，就安心待着。',
      '下雨的日子，适合把自己收好。',
      '这场雨过去，天就洗过了。',
      '雨声是白噪音 VIP，免费听。',
      '没带伞也不慌，淋湿的只是外套不是心情。',
      '雨天限定的慢节奏，城市被迫养生。',
      '雨把路人催回家，你把手机催进怀里。',
      '积水里那点倒影，是天空借给你的镜子。',
      '下雨天适合发呆，理由是"天意"。',
      '雨停之前，你可以名正言顺地慢下来。',
      '雨天的窗，比晴天的窗多点故事。'
    ]
  };

  /* ---------------- 手绘注脚库（治愈系：圆润萌宠 / 自然 / 生活物件，柔和填色 + 拟人小表情） ----------------
     每个贴纸 = parts（形状，支持 circle/ellipse/rect/path，可逐件覆盖 fill/line/sw/noHalo）
               + 可选 face（眼睛/腮红/微笑，自动画在主色上） */
  const STICKERS = {
    /* ---------- 天体与自然 ---------- */
    sun: { name: '小太阳', fill: '#FBE2A0', line: '#C9962C',
      parts: [ { t: 'path', d: 'M32 10v7M32 47v7M10 28h7M47 28h7M16 14l5 5M48 14l-5 5M16 42l5-5M48 42l-5-5', noHalo: true },
               { t: 'circle', cx: 32, cy: 33, r: 14 } ],
      face: [ { t: 'circle', cx: 26, cy: 33, r: 2.2 }, { t: 'circle', cx: 38, cy: 33, r: 2.2 },
              { t: 'ellipse', cx: 22, cy: 38, rx: 3, ry: 2, blush: '#F6B7A0' }, { t: 'ellipse', cx: 42, cy: 38, rx: 3, ry: 2, blush: '#F6B7A0' },
              { t: 'path', d: 'M27 39 q5 4 10 0', noFill: true } ] },
    moon: { name: '弯月', fill: '#E9E6F2', line: '#6E6390',
      parts: [ { t: 'path', d: 'M41.5 11.5c-9.6 2.8-15.6 12.4-13.2 22.2 2.6 10.6 13.8 16.2 22.2 12.9C41.6 50.4 33.9 44.2 32.6 35 31.4 27 34.2 16.9 41.5 11.5Z' } ],
      face: [ { t: 'circle', cx: 35, cy: 28, r: 1.8 }, { t: 'circle', cx: 35, cy: 36, r: 1.8 },
              { t: 'ellipse', cx: 31, cy: 31, rx: 2.4, ry: 1.6, blush: '#D9B9E0' }, { t: 'ellipse', cx: 31, cy: 39, rx: 2.4, ry: 1.6, blush: '#D9B9E0' },
              { t: 'path', d: 'M32 33 q3 3 6 1', noFill: true } ] },
    star: { name: '小星星', fill: '#FBE6A6', line: '#C9A23A',
      parts: [ { t: 'path', d: 'M32 11l4.9 10.4 11.3 1.5-8.3 7.9 2.1 11.3L32 36.6 22 42.1l2.1-11.3-8.3-7.9 11.3-1.5Z' } ],
      face: [ { t: 'circle', cx: 29, cy: 28, r: 1.8 }, { t: 'circle', cx: 36, cy: 28, r: 1.8 },
              { t: 'ellipse', cx: 27, cy: 32, rx: 2.4, ry: 1.6, blush: '#F6B7A0' }, { t: 'ellipse', cx: 38, cy: 32, rx: 2.4, ry: 1.6, blush: '#F6B7A0' },
              { t: 'path', d: 'M28 33 q4 3 8 0', noFill: true } ] },
    cloud: { name: '云', fill: '#EAF1F6', line: '#8AA0B0',
      parts: [ { t: 'path', d: 'M17 43c-5.2 0-9-3.7-9-8.2 0-4.2 3.2-7.6 7.4-8 1.2-6.3 6.6-10.9 13.1-10.9 7 0 12.8 5.3 13.7 12 4.9.4 8.8 4.3 8.8 8.8 0 4.9-4 8.3-9.1 8.3H17Z' } ],
      face: [ { t: 'circle', cx: 27, cy: 30, r: 1.8 }, { t: 'circle', cx: 38, cy: 30, r: 1.8 },
              { t: 'ellipse', cx: 24, cy: 34, rx: 2.4, ry: 1.6, blush: '#F4B9C2' }, { t: 'ellipse', cx: 41, cy: 34, rx: 2.4, ry: 1.6, blush: '#F4B9C2' },
              { t: 'path', d: 'M27 35 q5 3 10 0', noFill: true } ] },
    rain: { name: '小雨', fill: '#C9DCEC', line: '#5C7A90',
      parts: [ { t: 'path', d: 'M17 35c-4.6 0-7.9-3.2-7.9-7.1 0-3.7 2.8-6.6 6.4-6.9 1.1-5.5 5.7-9.5 11.4-9.5 6.1 0 11.1 4.6 11.9 10.4 4.3.4 7.6 3.8 7.6 7.6 0 4.2-3.4 6.9-7.9 6.9H17Z' },
              { t: 'path', d: 'M22 41l-2.4 7M32 41l-2.4 7M42 41l-2.4 7', noHalo: true, fill: 'none', line: '#5C7A90' } ] },
    raindrop: { name: '一滴水', fill: '#BFDCEC', line: '#5C84A0',
      parts: [ { t: 'path', d: 'M32 10c7 9.8 11.3 16.6 11.3 22.4C43.3 40.8 38.2 46 32 46s-11.3-5.2-11.3-13.6C20.7 26.6 25 19.8 32 10Z' } ] },
    leaf: { name: '叶子', fill: '#CDE6C0', line: '#5C8A4A',
      parts: [ { t: 'path', d: 'M12.5 45C12.5 29 23 15.5 45 13c1.2 21-9.2 34.5-24.4 34.5-5 0-8.1-1-8.1-2.5Z' },
              { t: 'path', d: 'M19.5 41c8.6-6.4 15-13.5 21-23', noHalo: true, fill: 'none', line: '#5C8A4A' } ] },
    sprout: { name: '小芽', fill: '#CDE6C0', line: '#5C8A4A',
      parts: [ { t: 'path', d: 'M32 52V29' }, { t: 'path', d: 'M32 31c-8.6 0-13-5.4-13-10.8 7.6-1.3 13 3.4 13 10.8Z' },
              { t: 'path', d: 'M32 31c8.6 0 13.6-5.6 13.6-11.2-8.2-1.3-13.6 4.2-13.6 11.2Z' } ] },
    wave: { name: '水面', fill: '#CFE6EC', line: '#5C90A0',
      parts: [ { t: 'path', d: 'M9 27c4-3.4 8-3.4 12 0s8 3.4 12 0 8-3.4 12 0 8 3.4 10 0', noHalo: true, fill: 'none' },
              { t: 'path', d: 'M9 38c4-3.4 8-3.4 12 0s8 3.4 12 0 8-3.4 12 0 8 3.4 10 0', noHalo: true, fill: 'none' },
              { t: 'path', d: 'M9 49c4-3.4 8-3.4 12 0s8 3.4 12 0 8-3.4 12 0 8 3.4 10 0', noHalo: true, fill: 'none' } ] },
    wind: { name: '风', fill: '#E6E0D4', line: '#8A8270',
      parts: [ { t: 'path', d: 'M10 22h22a6.5 6.5 0 1 0-6.4-7.8', noHalo: true, fill: 'none' },
              { t: 'path', d: 'M10 33h28a6.5 6.5 0 1 1-6.4 7.8', noHalo: true, fill: 'none' },
              { t: 'path', d: 'M10 27.5h13', noHalo: true, fill: 'none' } ] },
    spark: { name: '小闪', fill: '#FBE6A6', line: '#C9A23A',
      parts: [ { t: 'path', d: 'M32 11l3.4 12.2L47.5 26l-12 3.4L32 42l-3.4-12.6L16.5 26l12.1-2.8Z' } ] },
    flower: { name: '小花', fill: '#F7D2E0', line: '#B56688',
      parts: [ { t: 'circle', cx: 32, cy: 16, r: 6, fill: '#F7C0D4', line: '#B56688' }, { t: 'circle', cx: 48, cy: 26, r: 6, fill: '#F7C0D4', line: '#B56688' },
              { t: 'circle', cx: 44, cy: 46, r: 6, fill: '#F7C0D4', line: '#B56688' }, { t: 'circle', cx: 20, cy: 46, r: 6, fill: '#F7C0D4', line: '#B56688' },
              { t: 'circle', cx: 16, cy: 26, r: 6, fill: '#F7C0D4', line: '#B56688' }, { t: 'circle', cx: 32, cy: 32, r: 7, fill: '#FBE38A', line: '#D9A93A' } ] },
    rainbow: { name: '彩虹', fill: '#F6D9E0', line: '#B07A90',
      parts: [ { t: 'path', d: 'M10 47 a22 16 0 0 1 44 0', noHalo: true, fill: 'none', line: '#F6B8C2', sw: 5 },
              { t: 'path', d: 'M16 47 a16 12 0 0 1 32 0', noHalo: true, fill: 'none', line: '#F8D9A0', sw: 5 },
              { t: 'path', d: 'M22 47 a10 8 0 0 1 20 0', noHalo: true, fill: 'none', line: '#BFE0C0', sw: 5 } ] },

    /* ---------- 生活物件 ---------- */
    lamp: { name: '小台灯', fill: '#F6D9A8', line: '#B07A2C',
      parts: [ { t: 'path', d: 'M13.5 30.5h37L43 16H21Z' }, { t: 'path', d: 'M32 30.5V46' }, { t: 'path', d: 'M23 49h18' } ] },
    cup: { name: '杯子', fill: '#EFD9C2', line: '#8A6A4A',
      parts: [ { t: 'path', d: 'M15 25h27v17.5A7.5 7.5 0 0 1 34.5 50h-12A7.5 7.5 0 0 1 15 42.5Z' },
              { t: 'path', d: 'M42 29h4.5a6.5 6.5 0 0 1 0 13H42' } ],
      face: [ { t: 'path', d: 'M23 34 h18', noFill: true } ] },
    paw: { name: '猫爪', fill: '#F6D2C4', line: '#A8645A',
      parts: [ { t: 'path', d: 'M32 47c6.6 0 12-4 12-9 0-4-4-6.4-12-6.4S20 34 20 38c0 5 5.4 9 12 9Z' },
              { t: 'path', d: 'M16 27.5c2.6 0 4.4-2.6 4.4-5.4 0-2.4-1.6-4.1-3.9-4.1-2.6 0-4.6 2.2-4.6 5 0 2.6 1.8 4.5 4.1 4.5Z' },
              { t: 'path', d: 'M27.5 20.5c2.7 0 4.7-2.7 4.7-5.6 0-2.5-1.7-4.3-4.1-4.3-2.7 0-4.8 2.3-4.8 5.2 0 2.7 1.9 4.7 4.2 4.7Z' },
              { t: 'path', d: 'M42 27.5c2.3 0 4.1-1.9 4.1-4.5 0-2.8-2-5-4.6-5-2.3 0-3.9 1.7-3.9 4.1 0 2.8 1.8 5.4 4.4 5.4Z' },
              { t: 'path', d: 'M50 27.5c2.3 0 4.1-1.9 4.1-4.5 0-2.8-2-5-4.6-5-2.3 0-3.9 1.7-3.9 4.1 0 2.8 1.8 5.4 4.4 5.4Z' } ] },
    heart: { name: '小爱心', fill: '#F6C2CE', line: '#B5607A',
      parts: [ { t: 'path', d: 'M32 50C17 40.5 12 32.6 12 25.5 12 18.6 16.9 14 23 14c4 0 7.4 2.1 9 5.2C33.6 16.1 37 14 41 14c6.1 0 11 4.6 11 11.5C52 32.6 47 40.5 32 50Z' } ],
      face: [ { t: 'path', d: 'M26 27 q3 3 6 0', noFill: true }, { t: 'path', d: 'M32 27 q3 3 6 0', noFill: true } ] },
    window: { name: '窗', fill: '#DCE8EC', line: '#6E8A98',
      parts: [ { t: 'path', d: 'M14 13h36v38H14Z' }, { t: 'path', d: 'M32 13v38' }, { t: 'path', d: 'M14 32h36' }, { t: 'path', d: 'M44 32h10l-6 6' } ] },
    yarn: { name: '毛线团', fill: '#E9C7B0', line: '#9A6A48',
      parts: [ { t: 'path', d: 'M32 14.5c9.6 0 16.3 6.6 16.3 16.3S41.6 50 32 50 15.7 40.4 15.7 30.8 22.4 14.5 32 14.5Z' },
              { t: 'path', d: 'M21.5 24.5c8 3 17 10 20.5 20', noHalo: true, fill: 'none', line: '#9A6A48' },
              { t: 'path', d: 'M26 16.5c2 10 9 18.5 18 21.5', noHalo: true, fill: 'none', line: '#9A6A48' },
              { t: 'path', d: 'M18 36c7-1 14 1 19.5 6', noHalo: true, fill: 'none', line: '#9A6A48' } ] },
    book: { name: '书', fill: '#E9D2B0', line: '#8A6A40',
      parts: [ { t: 'rect', x: 12, y: 20, width: 40, height: 28, rx: 4 },
              { t: 'path', d: 'M20 28h24M20 34h24M20 40h24', noHalo: true, fill: 'none', line: '#8A6A40' } ] },
    balloon: { name: '气球', fill: '#F6CFD6', line: '#B57088',
      parts: [ { t: 'ellipse', cx: 32, cy: 24, rx: 14, ry: 17 },
              { t: 'path', d: 'M32 41 q-3 9 0 16', noHalo: true, fill: 'none', line: '#B57088' } ] },
    umbrella: { name: '伞', fill: '#F6D2D2', line: '#A85050',
      parts: [ { t: 'path', d: 'M10 30 a22 13 0 0 1 44 0 Z' },
              { t: 'path', d: 'M32 30 v18 q0 5 6 5', noHalo: true, fill: 'none', line: '#A85050' },
              { t: 'path', d: 'M32 17 v-4', noHalo: true, fill: 'none', line: '#A85050' } ] },
    music: { name: '音符', fill: '#E7D6F0', line: '#7A5E90',
      parts: [ { t: 'ellipse', cx: 23, cy: 44, rx: 7, ry: 5 },
              { t: 'path', d: 'M30 44 V18', noHalo: true, fill: 'none', line: '#7A5E90' },
              { t: 'path', d: 'M30 18 q11 3 8 14', noHalo: true, fill: 'none', line: '#7A5E90' } ] },
    bird: { name: '小鸟', fill: '#CFE4F2', line: '#5C7A90',
      parts: [ { t: 'path', d: 'M20 40c0-8 6.4-14.5 14.5-14.5 6.6 0 11.5 4.2 13.5 9.8l6 2.7-6.6 2.2c-2.3 4.4-6.8 7.3-12.9 7.3-7.2 0-14.5-2.4-14.5-7.5Z' },
              { t: 'path', d: 'M28 30c4.6-4.6 10.4-5.4 15.4-2.2', noHalo: true, fill: 'none', line: '#5C7A90' } ],
      face: [ { t: 'circle', cx: 30, cy: 34, r: 1.8 } ] },

    /* ---------- 治愈系萌宠（圆润 · 腮红 · 微笑） ---------- */
    cat: { name: '小猫', fill: '#F8DCC6', line: '#8A5A44',
      parts: [ { t: 'path', d: 'M19 22 L16 9 L29 18 Z' }, { t: 'path', d: 'M45 22 L48 9 L35 18 Z' }, { t: 'circle', cx: 32, cy: 34, r: 15 } ],
      face: [ { t: 'circle', cx: 26, cy: 33, r: 2.3 }, { t: 'circle', cx: 38, cy: 33, r: 2.3 },
             { t: 'ellipse', cx: 22, cy: 38, rx: 3, ry: 2, blush: '#F4A9B4' }, { t: 'ellipse', cx: 42, cy: 38, rx: 3, ry: 2, blush: '#F4A9B4' },
             { t: 'path', d: 'M27 39 q5 4 10 0', noFill: true } ] },
    bear: { name: '小熊', fill: '#E8C9A0', line: '#7A5236',
      parts: [ { t: 'circle', cx: 20, cy: 20, r: 5 }, { t: 'circle', cx: 44, cy: 20, r: 5 }, { t: 'circle', cx: 32, cy: 34, r: 15 }, { t: 'ellipse', cx: 32, cy: 40, rx: 7, ry: 5 } ],
      face: [ { t: 'circle', cx: 26, cy: 33, r: 2.3 }, { t: 'circle', cx: 38, cy: 33, r: 2.3 },
             { t: 'ellipse', cx: 22, cy: 38, rx: 3, ry: 2, blush: '#E8A07C' }, { t: 'ellipse', cx: 42, cy: 38, rx: 3, ry: 2, blush: '#E8A07C' },
             { t: 'path', d: 'M27 41 q5 3 10 0', noFill: true } ] },
    bunny: { name: '兔子', fill: '#F3E2EC', line: '#9A6E84',
      parts: [ { t: 'ellipse', cx: 26, cy: 16, rx: 5, ry: 12 }, { t: 'ellipse', cx: 38, cy: 16, rx: 5, ry: 12 }, { t: 'circle', cx: 32, cy: 36, r: 13 } ],
      face: [ { t: 'circle', cx: 27, cy: 36, r: 2.2 }, { t: 'circle', cx: 37, cy: 36, r: 2.2 },
             { t: 'ellipse', cx: 24, cy: 40, rx: 2.6, ry: 1.8, blush: '#EFA9BC' }, { t: 'ellipse', cx: 40, cy: 40, rx: 2.6, ry: 1.8, blush: '#EFA9BC' },
             { t: 'path', d: 'M28 41 q4 3 8 0', noFill: true } ] },
    dog: { name: '小狗', fill: '#EBD3B0', line: '#8A6038',
      parts: [ { t: 'ellipse', cx: 15, cy: 33, rx: 6, ry: 10 }, { t: 'ellipse', cx: 49, cy: 33, rx: 6, ry: 10 }, { t: 'circle', cx: 32, cy: 34, r: 15 } ],
      face: [ { t: 'circle', cx: 26, cy: 33, r: 2.3 }, { t: 'circle', cx: 38, cy: 33, r: 2.3 },
             { t: 'ellipse', cx: 22, cy: 38, rx: 3, ry: 2, blush: '#E8A07C' }, { t: 'ellipse', cx: 42, cy: 38, rx: 3, ry: 2, blush: '#E8A07C' },
             { t: 'path', d: 'M27 40 q5 4 10 0', noFill: true } ] },
    duck: { name: '鸭鸭', fill: '#F7E6A8', line: '#9A7A30',
      parts: [ { t: 'circle', cx: 32, cy: 36, r: 14 }, { t: 'path', d: 'M43 35 l9 2 l-9 4 Z', fill: '#F2A93C', line: '#C9830F' } ],
      face: [ { t: 'circle', cx: 28, cy: 33, r: 2.2 }, { t: 'circle', cx: 38, cy: 33, r: 2.2 } ] },
    capybara: { name: '水豚', fill: '#D9B894', line: '#7A5A38',
      parts: [ { t: 'ellipse', cx: 32, cy: 38, rx: 18, ry: 12 }, { t: 'circle', cx: 20, cy: 26, r: 3 }, { t: 'circle', cx: 44, cy: 26, r: 3 } ],
      face: [ { t: 'circle', cx: 27, cy: 35, r: 2.3 }, { t: 'circle', cx: 37, cy: 35, r: 2.3 },
             { t: 'path', d: 'M28 41 q4 3 8 0', noFill: true } ] },
    dino: { name: '小恐龙', fill: '#BFE0B0', line: '#5C8A4A',
      parts: [ { t: 'ellipse', cx: 32, cy: 38, rx: 15, ry: 14 }, { t: 'path', d: 'M17 28 l4 -10 l4 10 l4 -10 l4 10 l4 -10 l4 10', noHalo: true, fill: 'none', line: '#5C8A4A' } ],
      face: [ { t: 'circle', cx: 27, cy: 35, r: 2.4 }, { t: 'circle', cx: 37, cy: 35, r: 2.4 },
             { t: 'ellipse', cx: 23, cy: 40, rx: 3, ry: 2, blush: '#9CC98A' }, { t: 'ellipse', cx: 41, cy: 40, rx: 3, ry: 2, blush: '#9CC98A' },
             { t: 'path', d: 'M28 42 q4 3 8 0', noFill: true } ] },
    pig: { name: '小猪', fill: '#F6CBD2', line: '#A85C68',
      parts: [ { t: 'path', d: 'M22 20 L18 10 L30 18 Z' }, { t: 'path', d: 'M42 20 L46 10 L34 18 Z' },
              { t: 'circle', cx: 32, cy: 34, r: 15 }, { t: 'ellipse', cx: 32, cy: 41, rx: 6, ry: 4, fill: '#F2B8C2', line: '#A85C68' } ],
      face: [ { t: 'circle', cx: 27, cy: 33, r: 2.2 }, { t: 'circle', cx: 37, cy: 33, r: 2.2 },
             { t: 'path', d: 'M28 44 q4 2 8 0', noFill: true } ] },
    chick: { name: '小鸡', fill: '#FBE7A0', line: '#B08A2A',
      parts: [ { t: 'circle', cx: 32, cy: 38, r: 13 }, { t: 'path', d: 'M41 37 l8 2 l-8 4 Z', fill: '#F2A93C', line: '#C9830F' } ],
      face: [ { t: 'circle', cx: 28, cy: 36, r: 2.2 }, { t: 'circle', cx: 36, cy: 36, r: 2.2 } ] },
    panda: { name: '熊猫', fill: '#EDEDED', line: '#3A3A3A',
      parts: [ { t: 'circle', cx: 20, cy: 20, r: 5, fill: '#3A3A3A', line: '#3A3A3A' }, { t: 'circle', cx: 44, cy: 20, r: 5, fill: '#3A3A3A', line: '#3A3A3A' },
              { t: 'ellipse', cx: 26, cy: 33, rx: 4, ry: 5, fill: '#3A3A3A', line: '#3A3A3A' }, { t: 'ellipse', cx: 38, cy: 33, rx: 4, ry: 5, fill: '#3A3A3A', line: '#3A3A3A' },
              { t: 'circle', cx: 32, cy: 35, r: 15 } ],
      face: [ { t: 'circle', cx: 26, cy: 33, r: 1.6, fill: '#fff', line: 'none' }, { t: 'circle', cx: 38, cy: 33, r: 1.6, fill: '#fff', line: 'none' },
             { t: 'path', d: 'M28 41 q4 3 8 0', noFill: true } ] },

    /* ---------- 食物饮品（网感治愈 · 高频） ---------- */
    milktea: { name: '奶茶', fill: '#E8D2B8', line: '#8A6A44',
      parts: [ { t: 'path', d: 'M19 22 L45 22 L41 50 Q32 54 23 50 Z' },
               { t: 'path', d: 'M17 22 Q32 14 47 22 Z', fill: '#F2E6D2', line: '#8A6A44' },
               { t: 'path', d: 'M33 8 L37 8 L40 22 L36 22 Z', fill: '#C99A6A', line: '#8A6A44' },
               { t: 'circle', cx: 27, cy: 45, r: 2, fill: '#6A4A2A', line: 'none' },
               { t: 'circle', cx: 33, cy: 47, r: 2, fill: '#6A4A2A', line: 'none' },
               { t: 'circle', cx: 38, cy: 44, r: 2, fill: '#6A4A2A', line: 'none' } ] },
    coffee: { name: '咖啡', fill: '#EDE0D0', line: '#8A6A48',
      parts: [ { t: 'path', d: 'M18 24 L46 24 L43 44 Q32 49 21 44 Z' },
               { t: 'path', d: 'M46 28 q9 2 9 9 q0 6 -8 7', noHalo: true, fill: 'none', line: '#8A6A48' },
               { t: 'ellipse', cx: 32, cy: 50, rx: 20, ry: 4, fill: '#E0D2C0', line: '#8A6A48' } ] },
    donut: { name: '甜甜圈', fill: '#C8895A', line: '#9A6034',
      parts: [ { t: 'circle', cx: 32, cy: 32, r: 12, fill: 'none', line: '#C8895A', sw: 9 },
               { t: 'circle', cx: 32, cy: 31, r: 12, fill: 'none', line: '#F4B6C2', sw: 4 },
               { t: 'circle', cx: 26, cy: 27, r: 1.4, fill: '#7AB0E0', line: 'none' },
               { t: 'circle', cx: 39, cy: 30, r: 1.4, fill: '#F2C84A', line: 'none' },
               { t: 'circle', cx: 30, cy: 38, r: 1.4, fill: '#9AD08A', line: 'none' },
               { t: 'circle', cx: 38, cy: 39, r: 1.4, fill: '#E0708A', line: 'none' } ] },
    cake: { name: '蛋糕', fill: '#F6D9E0', line: '#B57088',
      parts: [ { t: 'path', d: 'M22 44 L42 44 L38 24 L26 24 Z' },
               { t: 'ellipse', cx: 32, cy: 48, rx: 22, ry: 4, fill: '#E8E0D4', line: '#B0A890' },
               { t: 'path', d: 'M24 24 Q32 18 40 24', noHalo: true, fill: 'none', line: '#FBE7EF', sw: 4 },
               { t: 'circle', cx: 32, cy: 19, r: 3, fill: '#E0606E', line: '#B04050' } ] },
    watermelon: { name: '西瓜', fill: '#E8606E', line: '#B84050',
      parts: [ { t: 'path', d: 'M18 42 L46 42 L32 16 Z' },
               { t: 'path', d: 'M16 42 Q32 53 48 42 L45 46 Q32 56 19 46 Z', fill: '#6FAE5A', line: '#3F6A30' },
               { t: 'circle', cx: 30, cy: 36, r: 1.4, fill: '#2A2A2A', line: 'none' },
               { t: 'circle', cx: 35, cy: 38, r: 1.4, fill: '#2A2A2A', line: 'none' },
               { t: 'circle', cx: 32, cy: 31, r: 1.4, fill: '#2A2A2A', line: 'none' } ] },
    icecream: { name: '冰淇淋', fill: '#F4E2B0', line: '#C9A23A',
      parts: [ { t: 'path', d: 'M24 34 L40 34 L32 54 Z', fill: '#E0B070', line: '#A8762F' },
               { t: 'circle', cx: 32, cy: 28, r: 11, fill: '#F4E2B0', line: '#C9A23A' },
               { t: 'circle', cx: 32, cy: 17, r: 7, fill: '#F6C2CE', line: '#B5607A' },
               { t: 'path', d: 'M27 38 L37 48 M37 38 L27 48', noHalo: true, fill: 'none', line: '#A8762F' } ] },

    /* ---------- 潮流绿植 ---------- */
    cactus: { name: '仙人掌', fill: '#8FBF6A', line: '#5C8A4A',
      parts: [ { t: 'path', d: 'M22 44 L42 44 L39 54 L25 54 Z', fill: '#D98C5A', line: '#A05A30' },
               { t: 'path', d: 'M28 44 L28 26 Q28 20 32 20 Q36 20 36 26 L36 44 Z' },
               { t: 'path', d: 'M28 36 q-8 0 -8 -7 q0 -5 4 -5', noHalo: true, fill: 'none', line: '#5C8A4A' },
               { t: 'path', d: 'M36 33 q8 0 8 -7 q0 -5 -4 -5', noHalo: true, fill: 'none', line: '#5C8A4A' } ] },
    mushroom: { name: '蘑菇', fill: '#F2A0B0', line: '#C06070',
      parts: [ { t: 'path', d: 'M16 30 Q32 12 48 30 Z' },
               { t: 'path', d: 'M26 30 L38 30 L36 48 Q32 52 28 48 Z', fill: '#F4ECDD', line: '#B0A080' },
               { t: 'circle', cx: 26, cy: 24, r: 3, fill: '#fff', line: 'none' },
               { t: 'circle', cx: 38, cy: 26, r: 2.4, fill: '#fff', line: 'none' },
               { t: 'circle', cx: 32, cy: 20, r: 2, fill: '#fff', line: 'none' } ] },

    /* ---------- 潮流萌宠 ---------- */
    penguin: { name: '企鹅', fill: '#3A3A44', line: '#2A2A33',
      parts: [ { t: 'ellipse', cx: 32, cy: 36, rx: 14, ry: 16 },
               { t: 'ellipse', cx: 32, cy: 39, rx: 8, ry: 11, fill: '#FBFBFB', line: '#CFCFD6' },
               { t: 'path', d: 'M29 32 L35 32 L32 38 Z', fill: '#F2A93C', line: '#C9830F' },
               { t: 'ellipse', cx: 26, cy: 50, rx: 4, ry: 2.4, fill: '#F2A93C', line: '#C9830F' },
               { t: 'ellipse', cx: 38, cy: 50, rx: 4, ry: 2.4, fill: '#F2A93C', line: '#C9830F' } ],
      face: [ { t: 'circle', cx: 28, cy: 30, r: 1.8 }, { t: 'circle', cx: 36, cy: 30, r: 1.8 } ] },
    turtle: { name: '乌龟', fill: '#8FBF6A', line: '#5C8A4A',
      parts: [ { t: 'ellipse', cx: 30, cy: 34, rx: 17, ry: 13 },
               { t: 'circle', cx: 50, cy: 34, r: 6 },
               { t: 'ellipse', cx: 16, cy: 40, rx: 4, ry: 3, fill: '#8FBF6A', line: '#5C8A4A' },
               { t: 'ellipse', cx: 18, cy: 28, rx: 4, ry: 3, fill: '#8FBF6A', line: '#5C8A4A' },
               { t: 'path', d: 'M24 30 L30 34 M36 30 L30 34 M30 24 L30 30', noHalo: true, fill: 'none', line: '#5C8A4A' } ],
      face: [ { t: 'circle', cx: 52, cy: 32, r: 1.4 }, { t: 'circle', cx: 52, cy: 36, r: 1.4 } ] },
    fox: { name: '狐狸', fill: '#E8A05A', line: '#B5702A',
      parts: [ { t: 'path', d: 'M22 22 L18 10 L31 20 Z' }, { t: 'path', d: 'M42 22 L46 10 L33 20 Z' },
               { t: 'path', d: 'M32 18 L16 42 L48 42 Z' },
               { t: 'path', d: 'M32 30 L25 42 L39 42 Z', fill: '#FBF3E6', line: 'none' },
               { t: 'path', d: 'M30 40 L34 40 L32 45 Z', fill: '#3A2A22', line: 'none' } ],
      face: [ { t: 'circle', cx: 27, cy: 30, r: 1.8 }, { t: 'circle', cx: 37, cy: 30, r: 1.8 } ] },
    hamster: { name: '仓鼠', fill: '#E8C49A', line: '#A8784A',
      parts: [ { t: 'circle', cx: 24, cy: 22, r: 5 }, { t: 'circle', cx: 40, cy: 22, r: 5 },
               { t: 'circle', cx: 32, cy: 37, r: 15 },
               { t: 'ellipse', cx: 22, cy: 39, rx: 6, ry: 5, fill: '#F2C9A0', line: '#A8784A' },
               { t: 'ellipse', cx: 42, cy: 39, rx: 6, ry: 5, fill: '#F2C9A0', line: '#A8784A' },
               { t: 'ellipse', cx: 32, cy: 41, rx: 7, ry: 6, fill: '#FBF3E6', line: 'none' } ],
      face: [ { t: 'circle', cx: 27, cy: 35, r: 2.2 }, { t: 'circle', cx: 37, cy: 35, r: 2.2 },
              { t: 'ellipse', cx: 23, cy: 39, rx: 2.4, ry: 1.6, blush: '#F0A0A0' }, { t: 'ellipse', cx: 41, cy: 39, rx: 2.4, ry: 1.6, blush: '#F0A0A0' },
              { t: 'path', d: 'M30 40 q2 2 4 0', noFill: true } ] },
    owl: { name: '猫头鹰', fill: '#B89A7A', line: '#7A5A3A',
      parts: [ { t: 'path', d: 'M20 18 L16 10 L26 16 Z' }, { t: 'path', d: 'M44 18 L48 10 L38 16 Z' },
               { t: 'ellipse', cx: 32, cy: 36, rx: 14, ry: 17 },
               { t: 'ellipse', cx: 32, cy: 40, rx: 9, ry: 12, fill: '#E8D8C0', line: '#B89A7A' },
               { t: 'circle', cx: 26, cy: 30, r: 6, fill: '#FBFBFB', line: '#7A5A3A' },
               { t: 'circle', cx: 38, cy: 30, r: 6, fill: '#FBFBFB', line: '#7A5A3A' },
               { t: 'path', d: 'M30 33 L34 33 L32 38 Z', fill: '#F2A93C', line: '#C9830F' } ],
      face: [ { t: 'circle', cx: 26, cy: 30, r: 2.6 }, { t: 'circle', cx: 38, cy: 30, r: 2.6 } ] },

    /* ---------- 风景 / 出行 / 元気小物 ---------- */
    tent: { name: '帐篷', fill: '#E8A05A', line: '#B5702A',
      parts: [ { t: 'path', d: 'M12 48 L32 16 L52 48 Z' },
               { t: 'path', d: 'M32 46 L27 30 Q32 26 37 30 Z', fill: '#C8803A', line: 'none' },
               { t: 'path', d: 'M32 16 L32 11', noHalo: true, fill: 'none', line: '#B5702A' } ] },
    mountain: { name: '山', fill: '#9AB0C0', line: '#5A7080',
      parts: [ { t: 'path', d: 'M8 50 L24 24 L36 40 L50 16 L58 50 Z' },
               { t: 'path', d: 'M20 30 L24 24 L28 30 Z', fill: '#FFFFFF', line: 'none' },
               { t: 'path', d: 'M46 22 L50 16 L54 22 Z', fill: '#FFFFFF', line: 'none' } ] },
    snow: { name: '雪花', fill: '#8FB8D8', line: '#5A86A8',
      parts: [ { t: 'path', d: 'M32 10 L32 54 M10 32 L54 32 M16 16 L48 48 M48 16 L16 48', noHalo: true, fill: 'none', line: '#8FB8D8', sw: 3 },
               { t: 'circle', cx: 32, cy: 32, r: 2.4, fill: '#8FB8D8', line: 'none' } ] },
    plane: { name: '纸飞机', fill: '#E8EEF4', line: '#6E88A0',
      parts: [ { t: 'path', d: 'M12 34 L52 16 L34 50 L30 34 Z' },
               { t: 'path', d: 'M30 34 L52 16', noHalo: true, fill: 'none', line: '#6E88A0' } ] },
    boat: { name: '小船', fill: '#C8895A', line: '#8A5A30',
      parts: [ { t: 'path', d: 'M12 36 Q32 52 52 36 L46 41 Q32 51 18 41 Z' },
               { t: 'path', d: 'M32 12 L32 38', noHalo: true, fill: 'none', line: '#8A5A30' },
               { t: 'path', d: 'M32 14 L48 34 L32 38 Z', fill: '#F4E2B0', line: '#B09060' } ] },
    battery: { name: '电量', fill: '#CDE6C0', line: '#5C8A4A',
      parts: [ { t: 'rect', x: 15, y: 22, width: 28, height: 22, rx: 3 },
               { t: 'rect', x: 43, y: 28, width: 4, height: 10, rx: 1, fill: '#9A9A9A', line: '#5A5A5A' },
               { t: 'path', d: 'M33 25 L28 34 L32 34 L30 43 L38 32 L34 32 Z', fill: '#F2C84A', line: '#C9A23A' } ] },
    wand: { name: '星星棒', fill: '#FBE6A6', line: '#C9A23A',
      parts: [ { t: 'path', d: 'M16 48 L38 26', noHalo: true, fill: 'none', line: '#9A7A4A', sw: 4 },
               { t: 'path', d: 'M44 9 l2.4 8.6 8.6 2.4 -8.6 2.4 -2.4 8.6 -2.4 -8.6 -8.6 -2.4 8.6 -2.4 Z' } ] }
  };

  const STICKER_KEYS = Object.keys(STICKERS);

  /* 注脚落位（避开人脸常见区域：上中偏下为主） */
  const ANCHORS = [
    { x: 0.18, y: 0.78, r: -8 },
    { x: 0.80, y: 0.76, r: 7 },
    { x: 0.16, y: 0.30, r: 6 },
    { x: 0.82, y: 0.28, r: -6 },
    { x: 0.50, y: 0.88, r: 3 }
  ];

  /* ---------------- 像素级图像分析（离线） ---------------- */
  function analyzeImage(img) {
    const N = 96;
    const cv = document.createElement('canvas');
    cv.width = N; cv.height = N;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, N, N);
    let data;
    try { data = ctx.getImageData(0, 0, N, N).data; }
    catch (e) { return defaultFeatures(); }

    let sumL = 0, sumS = 0, sumW = 0, dark = 0, bright = 0, sat = 0;
    let green = 0, sky = 0, skin = 0, warmLight = 0;
    let faceSkin = 0, faceArea = 0;
    let topL = 0, botL = 0, cntTop = 0, cntBot = 0;
    let faceX = 0, faceY = 0, faceN = 0;
    const cellBright = new Array(9).fill(0), cellCnt = new Array(9).fill(0);
    const lums = [];
    const hueHist = new Array(12).fill(0);

    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      const s = max === 0 ? 0 : (max - min) / 255;
      sumL += l; sumS += s; sumW += (r - b) / 255;
      lums.push(l);
      if (l < 0.24) dark++;
      if (l > 0.78) bright++;
      if (s > 0.18) sat++;
      if (g > r + 6 && g > b + 6) green++;
      if (b > r + 8 && l > 0.55) sky++;
      if (r > 150 && g > 115 && b < 145 && l > 0.55) warmLight++;

      const isSkin = r > 112 && g > 68 && b > 48 && r > g && r > b &&
                     (r - b) > 24 && (r - g) > 12 && l > 0.30 && s > 0.10;
      if (isSkin) skin++;

      const x = p % N, y = (p / N) | 0;
      if (x > N * 0.22 && x < N * 0.78 && y > N * 0.04 && y < N * 0.55) {
        faceArea++;
        if (isSkin) { faceSkin++; faceX += x; faceY += y; faceN++; }
      }

      const gi = (((y / N * 3) | 0) * 3 + ((x / N * 3) | 0));
      cellBright[gi] += l; cellCnt[gi]++;

      if (y < N * 0.35) { topL += l; cntTop++; }
      else if (y > N * 0.65) { botL += l; cntBot++; }

      let h = 0;
      const dmax = max - min;
      if (dmax > 18) {
        if (max === r) h = ((g - b) / dmax) % 6;
        else if (max === g) h = (b - r) / dmax + 2;
        else h = (r - g) / dmax + 4;
        h = Math.round(h * 60 / 30) % 12;
        if (h < 0) h += 12;
      }
      hueHist[h] += s;
    }

    const total = data.length / 4;
    const avgL = sumL / total;
    const variance = lums.reduce((a, v) => a + (v - avgL) * (v - avgL), 0) / total;

    /* 边缘密度：相邻像素亮度跳变的频率。密集色块的全局标准差不高，
       但边缘极多——这正是"杂乱/焦虑"的特征，用它比标准差更敏感。 */
    let edge = 0, edgeCnt = 0;
    for (let y = 1; y < N - 1; y++) {
      for (let x = 1; x < N - 1; x++) {
        const i = (y * N + x) * 4;
        const l = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
        const r2 = (0.299 * data[i + 4] + 0.587 * data[i + 5] + 0.114 * data[i + 6]) / 255;
        const d2 = (0.299 * data[i + N * 4] + 0.587 * data[i + N * 4 + 1] + 0.114 * data[i + N * 4 + 2]) / 255;
        edge += Math.abs(l - r2) + Math.abs(l - d2);
        edgeCnt += 2;
      }
    }
    const edgeDensity = edgeCnt ? edge / edgeCnt : 0;

    let domHue = 0, domVal = -1;
    for (let i = 0; i < 12; i++) if (hueHist[i] > domVal) { domVal = hueHist[i]; domHue = i; }

    /* 最亮格中心（用于把"光/太阳"贴纸放在亮处附近） */
    let brightCell = 4, brightVal = -1;
    for (let i = 0; i < 9; i++) {
      const v = cellCnt[i] ? cellBright[i] / cellCnt[i] : 0;
      if (v > brightVal) { brightVal = v; brightCell = i; }
    }
    const brightX = ((brightCell % 3) + 0.5) / 3;
    const brightY = ((brightCell / 3 | 0) + 0.5) / 3;
    const faceCX = faceN ? faceX / faceN / N : 0.5;
    const faceCY = faceN ? faceY / faceN / N : 0.3;

    const f = {
      L: avgL,
      S: sumS / total,
      W: sumW / total,
      contrast: Math.sqrt(variance),
      edgeDensity: edgeDensity,
      darkRatio: dark / total,
      brightRatio: bright / total,
      satRatio: sat / total,
      greenRatio: green / total,
      skyRatio: sky / total,
      skinRatio: skin / total,
      faceRatio: faceArea ? faceSkin / faceArea : 0,
      warmLightRatio: warmLight / total,
      topL: cntTop ? topL / cntTop : avgL,
      botL: cntBot ? botL / cntBot : avgL,
      domHue: domHue * 30,
      brightX, brightY, faceCX, faceCY
    };

    /* 画面线索 */
    const hints = [];
    if (f.skyRatio > 0.16) hints.push('天空');
    if (f.warmLightRatio > 0.06) hints.push('光');
    if (f.L < 0.34 && f.darkRatio > 0.38) hints.push('夜');
    if (f.greenRatio > 0.11) hints.push('绿');
    /* 只有当"上部中央"聚集了足够肤色，才认为是画面里有人 */
    if (f.faceRatio > 0.14 && f.skinRatio > 0.03) hints.push('人');
    if (f.topL - f.botL > 0.12) hints.push('窗');
    /* 阴天/冷调/偏蓝且亮度不高的画面，判定为"雨/潮"氛围 */
    if (f.W < -0.02 && f.L < 0.56 && f.skyRatio > 0.08 && f.edgeDensity > 0.005) hints.push('雨');
    f.hints = hints;
    f.domColor = dominantColor(data);
    return f;
  }

  function defaultFeatures() {
    return {
      L: 0.5, S: 0.2, W: 0, contrast: 0.16, edgeDensity: 0.03, darkRatio: 0.2, brightRatio: 0.2,
      satRatio: 0.3, greenRatio: 0.05, skyRatio: 0.05, skinRatio: 0.03, faceRatio: 0,
      warmLightRatio: 0.04, topL: 0.5, botL: 0.5, domHue: 30,
      hints: [], domColor: '#B9AFA0'
    };
  }

  function dominantColor(data) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < data.length; i += 16) {
      r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
    }
    r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n);
    const mx = Math.max(r, g, b, 1);
    const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const s = (mx - Math.min(r, g, b)) / mx;
    const shift = l < 0.45 ? 0.75 : 1;
    const mix = (c) => Math.round(clamp(c * shift + 245 * (1 - shift) * 0.55, 0, 255));
    return '#' + [mix(r), mix(g), mix(b)].map(v => v.toString(16).padStart(2, '0')).join('');
  }

  /* ---------------- 情绪判定 ---------------- */
  function judgeEmotion(f, seed) {
    const s = {
      tired: 3.2 * (f.L < 0.42 ? 1 : 0) + 1.6 * (f.darkRatio > 0.32 ? 1 : 0)
           + 1.2 * (f.contrast > 0.19 ? 1 : 0) - 1.6 * (f.S > 0.42 ? 1 : 0),
      calm: 2.5 * (f.S < 0.18 ? 1 : 0) + 1.9 * (f.L > 0.44 && f.L < 0.72 ? 1 : 0)
           + 1.3 * (f.brightRatio < 0.12 ? 1 : 0) - 1.7 * (f.contrast > 0.25 ? 1 : 0),
      happy: 2.7 * (f.S > 0.34 ? 1 : 0) + 1.8 * (f.W > 0.05 ? 1 : 0)
           + 1.4 * (f.brightRatio > 0.14 ? 1 : 0) - 1.5 * (f.darkRatio > 0.36 ? 1 : 0),
      sad: 2.1 * (f.L < 0.38 ? 1 : 0) + 1.7 * (f.S > 0.28 && f.L < 0.46 ? 1 : 0)
          + 1.2 * (f.skyRatio > 0.14 && f.brightRatio > 0.18 ? 1 : 0),
      anxious: 2.8 * (f.edgeDensity > 0.011 ? 1 : 0) + 2.0 * (f.contrast > 0.20 ? 1 : 0)
              + 1.6 * (f.edgeDensity > 0.008 && f.S > 0.20 ? 1 : 0)
              + 1.0 * (f.darkRatio > 0.30 && f.S > 0.22 ? 1 : 0)
              - 2.0 * (f.edgeDensity < 0.007 ? 1 : 0),
      hope: 1.9 * (f.greenRatio > 0.11 ? 1 : 0) + 1.9 * (f.W > 0.02 && f.L > 0.58 ? 1 : 0)
           + 1.5 * (f.skyRatio > 0.17 && f.L > 0.54 ? 1 : 0),
      lonely: 2.1 * (f.L < 0.37 && f.S < 0.22 ? 1 : 0) + 1.5 * (f.darkRatio > 0.34 ? 1 : 0)
             + 1.1 * (f.topL - f.botL < -0.08 ? 1 : 0) - 1.4 * (f.skinRatio > 0.08 ? 1 : 0),
      warm: 2.7 * (f.warmLightRatio > 0.08 ? 1 : 0) + 2.1 * (f.W > 0.085 ? 1 : 0)
           + 1.4 * (f.faceRatio > 0.14 ? 1 : 0) + 0.8 * (f.S > 0.22 && f.L > 0.42 && f.L < 0.78 ? 1 : 0)
    };
    const rnd = seededRandom(seed || 1);
    Object.keys(s).forEach(k => { s[k] = Math.max(0, s[k] + (rnd() - 0.5) * 0.35); });
    const sorted = Object.entries(s).sort((a, b) => b[1] - a[1]);
    const top = sorted[0];
    /* 置信度由第一名与第二名的分差决定：分差越大越确信，贴近平时的不确定感 */
    const margin = top[1] - (sorted[1] ? sorted[1][1] : 0);
    const confidence = clamp(36 + margin * 15, 32, 93);
    return { emotionId: top[0], confidence: Math.round(confidence), scores: s };
  }

  /* ---------------- 文案挑选 ---------------- */
  const sessionUsed = new Set();

  function pickCopy(emotionId, hints, seed, avoidHint) {
    const pool = EMOTION_COPY[emotionId] || EMOTION_COPY.calm;
    const rnd = seededRandom(seed || 7);
    const usable = (hints || []).filter(h => h !== avoidHint);
    const hint = usable.length ? usable[Math.floor(rnd() * usable.length)] : null;

    let line, usedHint = null;
    if (hint && HINT_COPY[hint] && rnd() < 0.42) {
      const hp = HINT_COPY[hint];
      line = hp[Math.floor(rnd() * hp.length)];
      usedHint = hint;
    } else {
      const fresh = pool.filter(l => !sessionUsed.has(l));
      const arr = fresh.length ? fresh : pool;
      line = arr[Math.floor(rnd() * arr.length)];
    }
    sessionUsed.add(line);
    if (sessionUsed.size > 200) sessionUsed.clear();
    return { line, hint: usedHint };
  }

  function pickDetail(emotionId, hints, avoidHint) {
    const e = EMOTION_MAP[emotionId];
    const usable = (hints || []).filter(h => h !== avoidHint);
    const hint = usable.length ? usable[0] : (hints && hints[0]) || null;
    const map = {
      '光': '我看见了落在你身上的一点光。',
      '天空': '我看见了那一片天。',
      '夜': '我看见了夜里还亮着的一小块。',
      '绿': '我看见了那一处绿。',
      '人': '我看见了你自己。',
      '窗': '我看见了窗那边透进来的动静。'
    };
    const first = hint && map[hint] ? map[hint] : '我看见了这一下。';
    return first + (e ? e.note + '。' : '');
  }

  /* 组合文案 + 详情，保证两者不指向同一个线索 */
  function compose(emotionId, hints, seed) {
    const usable = (hints || []).filter(Boolean);
    const a = pickCopy(emotionId, usable, seed);
    const b = pickDetail(emotionId, usable, a.hint);
    return { copy: a.line, detail: b };
  }

  function pickSticker(emotionId, seed, exclude) {
    const e = EMOTION_MAP[emotionId];
    let list = e && e.stickers ? e.stickers.slice() : STICKER_KEYS.slice();
    if (exclude && list.length > 1) list = list.filter(k => k !== exclude);
    const rnd = seededRandom(seed || 3);
    return list[Math.floor(rnd() * list.length)];
  }

  /* 画面线索 → 贴纸候选池（按拍摄内容合理匹配，而非随机） */
  const HINT_POOL = {
    '天空': ['sun', 'cloud', 'bird', 'star', 'spark', 'balloon', 'plane', 'mountain'],
    '光':   ['sun', 'spark', 'lamp', 'star', 'flower'],
    '夜':   ['moon', 'star', 'lamp', 'window', 'spark', 'owl'],
    '绿':   ['leaf', 'sprout', 'flower', 'capybara', 'dino', 'cactus', 'mushroom'],
    '人':   ['heart', 'cup', 'paw', 'cat', 'star', 'balloon', 'milktea', 'coffee'],
    '桌面': ['cup', 'book', 'lamp', 'yarn', 'heart', 'milktea', 'coffee', 'donut'],
    '窗':   ['window', 'lamp', 'cloud', 'leaf', 'cactus'],
    '雨':   ['rain', 'raindrop', 'cloud', 'umbrella']
  };

  /* 内容感知：根据图片线索 + 情绪，挑选 2~3 个不重复的贴纸 */
  function pickStickers(emotionId, features, seed, count) {
    const f = features || {};
    const hints = (f.hints || []).filter(Boolean);
    let pool = [];
    hints.forEach(h => { if (HINT_POOL[h]) pool = pool.concat(HINT_POOL[h]); });
    const e = EMOTION_MAP[emotionId];
    if (!pool.length && e && e.stickers) pool = e.stickers.slice();
    if (!pool.length) pool = STICKER_KEYS.slice();
    const uniq = Array.from(new Set(pool));
    const rnd = seededRandom(seed || 5);
    const shuffled = uniq.slice().sort(() => rnd() - 0.5);
    const n = count || (emotionId === 'happy' || emotionId === 'hope' || emotionId === 'warm' ? 3 : 2);
    let chosen = shuffled.slice(0, Math.min(n, shuffled.length));
    if (chosen.length < n) {
      const extra = STICKER_KEYS.filter(k => !chosen.includes(k)).sort(() => rnd() - 0.5);
      chosen = chosen.concat(extra.slice(0, n - chosen.length));
    }
    return chosen;
  }

  /* 智能落位：避开人脸区域；主贴纸尽量靠近最亮处（光/太阳场景），多贴纸分散到对角 */
  function planStickers(features, keys, seed) {
    const f = features || {};
    const hasFace = (f.faceRatio > 0.14 && f.skinRatio > 0.03);
    const rnd = seededRandom(seed || 9);
    const corners = [
      { x: 0.16, y: 0.80, r: -8 },
      { x: 0.84, y: 0.78, r: 8 },
      { x: 0.18, y: 0.30, r: 6 },
      { x: 0.82, y: 0.28, r: -6 },
      { x: 0.50, y: 0.86, r: 3 }
    ];
    let main;
    if (f.brightX != null && (f.hints || []).includes('光')) {
      main = { x: clamp(f.brightX, 0.12, 0.88), y: clamp(f.brightY, 0.12, 0.88), r: (rnd() - 0.5) * 16 };
    } else {
      main = corners[Math.floor(rnd() * 2)];
    }
    const out = [{ key: keys[0], x: main.x, y: main.y, r: main.r }];
    const rest = corners.filter(c => Math.hypot(c.x - main.x, c.y - main.y) > 0.32);
    const restShuffled = rest.slice().sort(() => rnd() - 0.5);
    for (let i = 1; i < keys.length; i++) {
      const a = restShuffled[(i - 1) % restShuffled.length] || corners[(i + 2) % corners.length];
      const y = (hasFace && a.y < 0.4) ? 0.7 : a.y;
      out.push({ key: keys[i], x: a.x, y, r: a.r });
    }
    return out;
  }

  /* ---------------- IndexedDB 档案 ---------------- */
  const DB_NAME = 'shiyu', DB_STORE = 'moments';
  let dbPromise = null;

  function db() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains(DB_STORE)) d.createObjectStore(DB_STORE, { keyPath: 'id' });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbPromise;
  }

  async function idbAll() {
    try {
      const d = await db();
      return await new Promise((res, rej) => {
        const t = d.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).getAll();
        t.onsuccess = () => res(t.result || []);
        t.onerror = () => rej(t.error);
      });
    } catch (e) { return []; }
  }

  async function idbPut(item) {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction(DB_STORE, 'readwrite').objectStore(DB_STORE).put(item);
      t.onsuccess = () => res(true);
      t.onerror = () => rej(t.error);
    });
  }

  async function idbDel(id) {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction(DB_STORE, 'readwrite').objectStore(DB_STORE).delete(id);
      t.onsuccess = () => res(true);
      t.onerror = () => rej(t.error);
    });
  }

  /* ---------------- 设置 ---------------- */
  const SETTINGS_KEY = 'shiyu.settings.v1';

  function defaultSettings() {
    return {
      provider: 'off',      // off | openai | gemini （情绪识别增强）
      baseUrl: '',
      model: '',
      apiKey: '',
      genOn: false,         // 是否开启联网 AI 生成专属贴纸（双通道之二）
      genProvider: 'openai',// openai | gemini
      genBase: '',
      genVision: '',        // 读图用的视觉模型
      genImage: '',         // 生图模型
      genKey: '',
      style: 'ink',         // ink 手绘 | stamp 印章
      glow: false,          // 情绪柔光
      remindHour: 20,
      remindOn: false
    };
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      return Object.assign(defaultSettings(), raw ? JSON.parse(raw) : {});
    } catch (e) { return defaultSettings(); }
  }

  function saveSettings(s) {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) {}
  }

  /* ---------------- 可选：视觉大模型升级 ---------------- */
  async function callVLM(settings, dataUrl, features) {
    if (!settings.provider || settings.provider === 'off' || !settings.apiKey) return null;
    const prompt = [
      '你是中文情绪观察者。看图并只输出 JSON，不要任何多余文字。',
      '字段：emotion( tired|calm|happy|sad|anxious|hope|lonely|warm 八选一 ),',
      'confidence(0-100整数), copy(一句话中文文案,20字内,具体、像从心里说出来,',
      '禁止出现"治愈""岁月静好""加油""晚安""放下"等空词,禁止解释情绪),',
      'detail(一句"我看见了…",25字内,必须指向画面里的具体物件或光线),',
      'sticker(从 sun,star,moon,cloud,rain,raindrop,rainbow,spark,flower,leaf,sprout,wave,wind,cactus,mushroom,mountain,snow,plane,boat,tent,lamp,cup,book,yarn,paw,heart,window,balloon,umbrella,music,bird,milktea,coffee,donut,cake,watermelon,icecream,battery,wand,cat,bear,bunny,dog,duck,capybara,dino,pig,chick,panda,penguin,turtle,fox,hamster,owl 中选一个最贴合此刻的)',
      JSON.stringify({ 'ok': 1 })
    ].join('');

    const t0 = Date.now();
    try {
      if (settings.provider === 'gemini') {
        const base = (settings.baseUrl || 'https://generativelanguage.googleapis.com/v1beta/models').replace(/\/$/, '');
        const url = base + '/' + settings.model + ':generateContent?key=' + encodeURIComponent(settings.apiKey);
        const res = await fetch(url, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: 'image/jpeg', data: dataUrl.split(',')[1] } }] }],
            generationConfig: { responseMimeType: 'application/json', temperature: 0.9 }
          })
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const j = await res.json();
        const txt = (j.candidates?.[0]?.content?.parts || []).map(p => p.text).join('');
        return parseVLM(txt, features, Date.now() - t0);
      }
      const base = (settings.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
      const res = await fetch(base + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + settings.apiKey },
        body: JSON.stringify({
          model: settings.model || 'gpt-4o-mini',
          temperature: 0.9,
          response_format: { type: 'json_object' },
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: dataUrl } }
            ]
          }]
        })
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json();
      const txt = j.choices?.[0]?.message?.content || '';
      return parseVLM(txt, features, Date.now() - t0);
    } catch (e) {
      return { error: String(e.message || e) };
    }
  }

  function parseVLM(txt, features, ms) {
    if (!txt) return null;
    const m = txt.match(/\{[\s\S]*\}/);
    if (!m) return null;
    let obj;
    try { obj = JSON.parse(m[0]); } catch (e) { return null; }
    const emotionId = EMOTION_MAP[obj.emotion] ? obj.emotion : 'calm';
    const copy = (typeof obj.copy === 'string' ? obj.copy : (obj.copy || [])[0] || '').trim();
    const detail = (typeof obj.detail === 'string' ? obj.detail : '').trim();
    const sticker = STICKERS[obj.sticker] ? obj.sticker : pickSticker(emotionId, hashStr(copy || 'x'));
    if (!copy) return null;
    return {
      emotionId, confidence: clamp(Number(obj.confidence) || 70, 20, 99),
      copy: copy.slice(0, 40), detail: detail.slice(0, 60),
      sticker, source: 'vlm', ms
    };
  }

  /* ---------------- 双通道之二：联网 AI 生成贴合此照片的专属贴纸 ---------------- */
  /* 国产优先的服务商预设：base 为默认网关；image 为空表示仅支持读图、生图回退本地 */
  const GEN_PRESETS = {
    qwen:     { base: 'https://dashscope.aliyuncs.com/compatible-mode/v1', vision: 'qwen-vl-max',   image: 'qwen-image' },
    zhipu:    { base: 'https://open.bigmodel.cn/api/paas/v4',             vision: 'glm-4v-plus',   image: 'cogview-3-plus' },
    deepseek: { base: 'https://api.deepseek.com/v1',                       vision: 'deepseek-chat', image: '' },
    kimi:     { base: 'https://api.moonshot.cn/v1',                        vision: 'kimi-k2-vision', image: '' },
    doubao:   { base: 'https://ark.cn-beijing.volces.com/api/v3',          vision: 'doubao-seed-1-6-vision', image: '' },
    hunyuan:  { base: 'https://api.hunyuan.cloud.tencent.com/v1',          vision: 'hunyuan-vision', image: '' },
    openai:   { base: 'https://api.openai.com/v1',                         vision: 'gpt-4o-mini',   image: 'gpt-image-1' },
    gemini:   { base: 'https://generativelanguage.googleapis.com/v1beta/models', vision: 'gemini-2.0-flash', image: 'gemini-2.0-flash-preview-image-generation' }
  };
  function genBaseUrl(st) {
    return ((st.genBase || '').trim()) || (GEN_PRESETS[st.genProvider] || GEN_PRESETS.openai).base;
  }
  /* 视觉模型把照片读成一句贴纸创意 → 生图模型画出来；失败返回 null，由上层降级到本地图库 */
  async function describeSticker(st, dataUrl, emotionLabel, hints) {
    const prompt = [
      '你是贴纸设计师。看这张照片，设计一枚贴合它、能治愈人的小贴纸。',
      '只输出 JSON：{"prompt":"一句英文贴纸描述"}。',
      '要求：可爱治愈系、扁平/手绘风、透明背景、无文字；',
      '主体要与照片内容或此刻情绪呼应（情绪：' + (emotionLabel || '平静') + '；画面线索：' + (hints || []).join('/') + '）。',
      '例：a tiny sleepy capybara hugging a warm coffee cup, soft pastel, sticker, transparent background, no text。',
      '不要输出多余文字。'
    ].join('');
    try {
      if (st.genProvider === 'gemini') {
        const base = genBaseUrl(st).replace(/\/$/, '');
        const url = base + '/' + (st.genVision || 'gemini-2.0-flash') + ':generateContent?key=' + encodeURIComponent(st.genKey);
        const res = await fetch(url, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: 'image/jpeg', data: dataUrl.split(',')[1] } }] }],
            generationConfig: { responseMimeType: 'application/json', temperature: 1 }
          })
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const j = await res.json();
        const txt = (j.candidates?.[0]?.content?.parts || []).map(p => p.text).join('');
        const m = txt.match(/\{[\s\S]*\}/); if (!m) throw new Error('no json');
        return (JSON.parse(m[0]).prompt || '').slice(0, 220);
      }
      const base = genBaseUrl(st).replace(/\/$/, '');
      const visionModel = st.genVision || (GEN_PRESETS[st.genProvider] || {}).vision || 'gpt-4o-mini';
      const res = await fetch(base + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + st.genKey },
        body: JSON.stringify({
          model: visionModel, temperature: 1, response_format: { type: 'json_object' },
          messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: dataUrl } }] }]
        })
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json();
      const txt = j.choices?.[0]?.message?.content || '';
      const m = txt.match(/\{[\s\S]*\}/); if (!m) throw new Error('no json');
      return (JSON.parse(m[0]).prompt || '').slice(0, 220);
    } catch (e) { return null; }
  }

  async function genImage(st, prompt) {
    try {
      if (st.genProvider === 'gemini') {
        const base = genBaseUrl(st).replace(/\/$/, '');
        const url = base + '/' + (st.genImage || 'gemini-2.0-flash-preview-image-generation') + ':generateContent?key=' + encodeURIComponent(st.genKey);
        const res = await fetch(url, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt + ' Sticker, transparent background, no text.' }] }],
            generationConfig: { responseModalities: ['IMAGE', 'TEXT'] }
          })
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const j = await res.json();
        const parts = j.candidates?.[0]?.content?.parts || [];
        for (const p of parts) if (p.inline_data && p.inline_data.data)
          return 'data:' + (p.inline_data.mime_type || 'image/png') + ';base64,' + p.inline_data.data;
        throw new Error('no image');
      }
      /* 其余服务商走 OpenAI 兼容的 images/generations；无生图能力的服务商直接回退本地 */
      const preset = GEN_PRESETS[st.genProvider] || GEN_PRESETS.openai;
      if (!preset.image) return null;
      const base = genBaseUrl(st).replace(/\/$/, '');
      const res = await fetch(base + '/images/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + st.genKey },
        body: JSON.stringify({
          model: st.genImage || preset.image, prompt: prompt + ' Sticker design, transparent background, no text, flat cute healing style.',
          n: 1, size: '1024x1024', response_format: 'b64_json'
        })
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json();
      const d = j.data && j.data[0];
      if (d && d.b64_json) return 'data:image/png;base64,' + d.b64_json;
      if (d && d.url) return d.url;
      throw new Error('no image');
    } catch (e) { return null; }
  }

  async function genSticker(st, dataUrl, emotionLabel, hints) {
    if (!st.genOn || !st.genKey) return { error: '未配置' };
    const desc = await describeSticker(st, dataUrl, emotionLabel, hints);
    if (!desc) return { error: '读图创意失败' };
    const img = await genImage(st, desc);
    if (!img) return { error: '生图失败' };
    return { img, prompt: desc };
  }

  /* ---------------- 注脚渲染 ---------------- */
  function stickerSVG(key, opts) {
    opts = opts || {};
    const s = STICKERS[key] || STICKERS.spark;
    const size = opts.size || 96;
    const rot = opts.rotate || 0;
    const stamp = opts.stamp;
    const haloW = opts.haloW || 9;

    const open = (p) => {
      const fill = (p.fill !== undefined ? p.fill : s.fill) || 'none';
      const line = (p.line !== undefined ? p.line : s.line) || '#5A4A38';
      const sw = p.sw || 2.6;
      return ' fill="' + fill + '" stroke="' + line + '" stroke-width="' + sw +
             '" stroke-linejoin="round" stroke-linecap="round"';
    };
    const shapeTag = (p) => {
      if (p.t === 'circle') return '<circle cx="' + p.cx + '" cy="' + p.cy + '" r="' + p.r + '"' + open(p) + '/>';
      if (p.t === 'ellipse') return '<ellipse cx="' + p.cx + '" cy="' + p.cy + '" rx="' + p.rx + '" ry="' + p.ry + '"' + open(p) + '/>';
      if (p.t === 'rect') return '<rect x="' + p.x + '" y="' + p.y + '" width="' + p.w + '" height="' + p.h + '" rx="' + (p.rx || 0) + '"' + open(p) + '/>';
      return '<path d="' + p.d + '"' + open(p) + '/>';
    };

    const parts = s.parts || [];
    const halo = parts.filter(p => !p.noHalo).map(p =>
      '<' + (p.t === 'circle' ? 'circle' : p.t === 'ellipse' ? 'ellipse' : p.t === 'rect' ? 'rect' : 'path') +
      (p.t === 'circle' ? ' cx="' + p.cx + '" cy="' + p.cy + '" r="' + p.r + '"' :
       p.t === 'ellipse' ? ' cx="' + p.cx + '" cy="' + p.cy + '" rx="' + p.rx + '" ry="' + p.ry + '"' :
       p.t === 'rect' ? ' x="' + p.x + '" y="' + p.y + '" width="' + p.w + '" height="' + p.h + '" rx="' + (p.rx || 0) + '"' :
       ' d="' + p.d + '"') +
      ' fill="none" stroke="rgba(255,255,255,0.92)" stroke-width="' + haloW + '" stroke-linejoin="round" stroke-linecap="round"/>'
    ).join('');
    const fills = parts.map(shapeTag).join('');
    const face = (s.face || []).map(p => {
      if (p.blush) return '<ellipse cx="' + p.cx + '" cy="' + p.cy + '" rx="' + p.rx + '" ry="' + p.ry + '" fill="' + p.blush + '" stroke="none"/>';
      if (p.noFill) return '<path d="' + p.d + '" fill="none" stroke="' + s.line + '" stroke-width="1.8" stroke-linecap="round"/>';
      return '<circle cx="' + p.cx + '" cy="' + p.cy + '" r="' + p.r + '" fill="' + s.line + '" stroke="none"/>';
    }).join('');

    let inner;
    if (stamp) {
      inner = '<g transform="rotate(' + rot + ' 32 32)">' +
        '<circle cx="32" cy="32" r="29" fill="none" stroke="rgba(255,255,255,0.92)" stroke-width="6"/>' +
        '<circle cx="32" cy="32" r="29" fill="none" stroke="' + (s.line || '#5A4A38') + '" stroke-width="2.4"/>' +
        '<circle cx="32" cy="32" r="25" fill="none" stroke="' + (s.line || '#5A4A38') + '" stroke-width="1" stroke-dasharray="2 5"/>' +
        '<g transform="translate(10 10) scale(0.69)">' + halo + fills + face + '</g></g>';
    } else {
      inner = '<g transform="rotate(' + rot + ' 32 32)">' + halo + fills + face + '</g>';
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" class="sticker-svg" viewBox="0 0 64 64" width="' + size + '" height="' + size + '" aria-hidden="true">' + inner + '</svg>';
  }

  /* ---------------- 导出海报 ---------------- */
  function exportPoster(item, style) {
    return new Promise((resolve, reject) => {
      const W = 1080, H = 1350, PH = 1080;
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const ctx = cv.getContext('2d');

      ctx.fillStyle = '#FBF7F0';
      ctx.fillRect(0, 0, W, H);

      const img = new Image();
      img.onload = () => {
        const r = Math.max(W / img.width, PH / img.height);
        const dw = img.width * r, dh = img.height * r;
        ctx.drawImage(img, (W - dw) / 2, (PH - dh) / 2, dw, dh);

        const emo = EMOTION_MAP[item.emotionId] || EMOTION_MAP.calm;
        const inkColor = '#3A342C';

        /* 底部文案带 */
        const bandY = PH;
        const grad = ctx.createLinearGradient(0, bandY, 0, H);
        grad.addColorStop(0, '#FBF7F0');
        grad.addColorStop(1, '#F4EDE2');
        ctx.fillStyle = grad;
        ctx.fillRect(0, bandY, W, H - bandY);

        ctx.fillStyle = emo.color;
        ctx.beginPath(); ctx.arc(64, bandY + 52, 7, 0, Math.PI * 2); ctx.fill();

        ctx.font = '500 26px "PingFang SC","Microsoft YaHei",sans-serif';
        ctx.fillStyle = '#6E6558';
        ctx.fillText(emo.label + ' · ' + timeLabel(item.ts), 86, bandY + 60);

        ctx.fillStyle = inkColor;
        ctx.font = '500 46px "Songti SC","SimSun","PingFang SC",serif';
        const line = wrapText(ctx, item.copy, W - 128, 2);
        line.forEach((t, i) => ctx.fillText(t, 64, bandY + 132 + i * 66));

        ctx.font = '400 22px "PingFang SC","Microsoft YaHei",sans-serif';
        ctx.fillStyle = '#9A9082';
        ctx.fillText('拾愈 · ' + dateKey(new Date(item.ts)), 64, H - 46);

        cv.toBlob(b => {
          const url = URL.createObjectURL(b);
          resolve(url);
        }, 'image/png', 0.95);
      };
      img.onerror = reject;
      img.src = item.dataUrl;
    });
  }

  function wrapText(ctx, text, maxW, maxLines) {
    const chars = Array.from(text || '');
    const lines = [];
    let cur = '';
    for (const ch of chars) {
      const test = cur + ch;
      if (ctx.measureText(test).width > maxW && cur) {
        lines.push(cur);
        cur = ch;
        if (lines.length >= maxLines) break;
      } else cur = test;
    }
    if (cur && lines.length < maxLines) lines.push(cur);
    if (lines.length === maxLines && chars.length > lines.join('').length) {
      lines[maxLines - 1] = lines[maxLines - 1].slice(0, -1) + '…';
    }
    return lines;
  }

  function download(url, filename) {
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
  }

  return {
    $, $$, uid, hashStr, seededRandom, clamp, pad, dateKey, dayLabel, timeLabel,
    EMOTIONS, EMOTION_MAP, EMOTION_COPY, HINT_COPY, STICKERS, STICKER_KEYS, ANCHORS, HINT_POOL,
    analyzeImage, defaultFeatures, judgeEmotion, pickCopy, pickDetail, pickSticker,
    pickStickers, planStickers, idbAll, idbPut, idbDel, loadSettings, saveSettings, defaultSettings,
    callVLM, stickerSVG, exportPoster, download, wrapText,
    describeSticker, genImage, genSticker, GEN_PRESETS,
    analyze: analyzeImage, judge: judgeEmotion, copyFor: pickCopy, detailFor: pickDetail,
    stickerFor: pickSticker, stickersFor: pickStickers, plan: planStickers, compose
  };
})();
