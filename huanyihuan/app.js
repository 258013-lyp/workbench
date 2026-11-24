/* ============================================================
   笔笔清 · 交互层
   ============================================================ */
(function () {
  'use strict';
  const S = window.SY;
  const $ = S.$;
  let data = S.load();
  let pending = null;      // 当前正在处理的一笔 {amount,name}
  let chosenEmotion = null;
  // 记账入口状态
  let entryKind = 'expense';
  let entryCat = 'food';
  let editingId = null;    // 正在编辑的记录 id
  // 账本视图状态
  let ledgerMonth = S.monthKey(Date.now());
  let ledgerFilter = 'all';
  let ledgerQuery = '';
  // 升级模块状态
  let voiceRec = null;
  let budgetSuggestions = [];
  let reviewPeriod = 'week';
  let ledgerMode = 'list';
  let ledgerDay = 0;

  /* ---------- 温度 ---------- */
  function setTemp(t) { document.body.dataset.temp = t; }

  /* ---------- toast ---------- */
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2000);
  }
  function toastWithUndo(msg, undo) {
    const t = $('#toast');
    t.textContent = '';
    const label = document.createElement('span');
    label.textContent = msg;
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'toast-undo'; btn.textContent = '撤销';
    btn.addEventListener('click', () => { clearTimeout(toastTimer); t.hidden = true; undo(); });
    t.appendChild(label); t.appendChild(btn);
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 4000);
  }

  /* ---------- 品牌 mark ---------- */
  function drawBrand() {
    const el = $('#brandMark');
    if (!el) return;
    el.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round">' +
      '<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>';
  }

  /* ---------- 视图切换（含子状态） ---------- */
  function showSub(which) {
    $('#brakeHome').hidden = which !== 'home';
    $('#costView').hidden = which !== 'cost';
    $('#checkoutView').hidden = which !== 'checkout';
    $('#savedView').hidden = which !== 'saved';
    $('#badgeView').hidden = which !== 'badge';
    if (which === 'cost') setTemp('cool');
  }
  function switchView(name) {
    $$('.view').forEach(v => v.classList.remove('is-on'));
    $('#view-' + name).classList.add('is-on');
    $$('.tab').forEach(t => t.classList.toggle('is-on', t.dataset.view === name));
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (name === 'brake') { setTemp('warm'); showSub('home'); }
    if (name === 'held') renderHeld();
    if (name === 'codex') renderCodex();
    if (name === 'portrait') renderPortrait();
    if (name === 'settings') fillSettings();
    updateTopStat();
  }
  function $$(s, root) { return Array.prototype.slice.call((root || document).querySelectorAll(s)); }

  function updateTopStat() {
    const rk = S.rankOf(data);
    $('#topStat').textContent = rk.totalSaved > 0 ? (rk.icon + ' ' + rk.name) : '';
  }

  /* ---------- 首页：攒钱罐（本月结余） ---------- */
  function renderPiggy() {
    const p = S.portrait(data);
    const balance = p.monthBalance;
    $('#piggyMoney').textContent = '¥ ' + S.fmtNum(Math.max(0, balance));
    const bar = $('#piggyBar');
    // 结余占收入的比例；没记收入时用记账笔数给个温和进度
    let ratio;
    if (p.monthIncome > 0) ratio = Math.max(0, Math.min(1, balance / p.monthIncome));
    else ratio = Math.min(0.9, p.recordN / 10);
    $('#piggyNum').textContent = (p.monthIncome > 0 ? Math.round(ratio * 100) : 0) + '%';
    bar.style.strokeDashoffset = 264 - 264 * ratio;
    $('#piggyNote').textContent = balance > 0
      ? '收入减支出，这个月攒下这么多。'
      : (p.recordN ? '这个月还没攒下，下月留意。' : '记下收入支出，这里就是你这个月的底气。');
    renderGoal();
    renderCycles();
  }

  /* ---------- 常用账模板 ---------- */
  function applyDraft(draft) {
    if (!draft) return;
    editingId = null;
    $('#btnAddLabel').textContent = '记下这一笔';
    $('#btnCancelEdit').hidden = true;
    $('#heroTitle').textContent = '记一笔';
    setEntryKind(draft.kind === 'income' ? 'income' : 'expense');
    const list = S.categories(data)[entryKind];
    const learned = S.guessCategory(data, draft.name);
    const cat = learned || draft.category;
    if (cat && list.some(c => c.id === cat)) {
      entryCat = cat;
      $$('.cat-chip').forEach(x => x.classList.toggle('is-on', x.dataset.cat === entryCat));
    }
    $('#amountInput').value = draft.amount;
    $('#nameInput').value = draft.name || '';
    $('#needQuick').hidden = true;
    $('#amountInput').focus();
  }
  function renderTemplates() {
    const row = $('#tplRow');
    if (!row) return;
    const saved = (data.templates || []).slice(0, 8);
    const guessed = S.inferTemplates(data).filter(g => !saved.some(t => t.name === g.name)).slice(0, 3);
    if (!saved.length && !guessed.length) { row.hidden = true; row.innerHTML = ''; return; }
    row.hidden = false;
    row.innerHTML =
      saved.map(t => '<span class="tpl-item"><button class="tpl-chip" type="button" data-tpl="' + t.id + '">' + esc(t.name) + '</button>' +
        '<button class="tpl-del" type="button" data-tpl-del-home="' + t.id + '" aria-label="删除常用账">×</button></span>').join('') +
      guessed.map((g, i) => '<button class="tpl-chip guess" type="button" data-guess="' + i + '">＋' + esc(g.name) + '</button>').join('');
    $$('[data-tpl]', row).forEach(b => b.addEventListener('click', () => {
      const t = (data.templates || []).find(x => x.id === b.dataset.tpl);
      if (t) applyDraft(t);
    }));
    $$('[data-tpl-del-home]', row).forEach(b => b.addEventListener('click', e => {
      e.stopPropagation();
      S.removeTemplate(data, b.dataset.tplDelHome); S.save(data);
      renderTemplates(); renderTplManage(); toast('常用账已删');
    }));
    $$('[data-guess]', row).forEach(b => b.addEventListener('click', () => {
      const g = S.inferTemplates(data).filter(x => !(data.templates || []).some(t => t.name === x.name)).slice(0, 3)[+b.dataset.guess];
      if (!g) return;
      const t = S.saveTemplate(data, g);
      S.save(data);
      renderTemplates(); renderTplManage();
      if (t) applyDraft(t);
    }));
  }
  function renderTplManage() {
    const box = $('#tplManageList');
    if (!box) return;
    const list = data.templates || [];
    box.innerHTML = list.length
      ? list.map(t => '<div class="tpl-manage-row"><span class="tm-name">' + esc(t.name) + ' · ¥' + S.fmtNum(t.amount) + '</span>' +
          '<span class="tm-cycle"><button type="button" data-cycle-toggle="' + t.id + '" class="' + (t.cycle ? 'on' : '') + '">每月</button>' +
          (t.cycle ? '<input type="number" min="1" max="31" value="' + t.cycleDay + '" data-cycle-day="' + t.id + '" aria-label="每月几号">' : '') +
          '</span><button type="button" data-tpl-del="' + t.id + '">×</button></div>').join('')
      : '<p class="panel-empty">还没有常用账</p>';
    $$('[data-tpl-del]', box).forEach(b => b.addEventListener('click', () => {
      S.removeTemplate(data, b.dataset.tplDel); S.save(data);
      renderTemplates(); renderTplManage(); renderCycles();
    }));
    $$('[data-cycle-toggle]', box).forEach(b => b.addEventListener('click', () => {
      const t = (data.templates || []).find(x => x.id === b.dataset.cycleToggle);
      if (!t) return;
      S.saveTemplate(data, { id: t.id, name: t.name, amount: t.amount, kind: t.kind, category: t.category, note: t.note, cycle: t.cycle ? 0 : 1, cycleDay: t.cycleDay });
      S.save(data); renderTplManage(); renderCycles();
    }));
    $$('[data-cycle-day]', box).forEach(inp => inp.addEventListener('change', () => {
      const t = (data.templates || []).find(x => x.id === inp.dataset.cycleDay);
      if (!t) return;
      const day = Math.max(1, Math.min(31, parseInt(inp.value, 10) || 1));
      S.saveTemplate(data, { id: t.id, name: t.name, amount: t.amount, kind: t.kind, category: t.category, note: t.note, cycle: 1, cycleDay: day });
      S.save(data); renderTplManage(); renderCycles();
    }));
  }
  $('#btnSaveTpl').addEventListener('click', () => {
    const amt = parseFloat($('#amountInput').value);
    if (!amt || amt <= 0) { toast(S.line('toastEmptyAmount')); return; }
    const name = ($('#nameInput').value || '').trim() || S.categoryName(entryCat, entryKind);
    const t = S.saveTemplate(data, { name, amount: Math.round(amt * 100) / 100, kind: entryKind, category: entryCat });
    if (!t) return;
    S.save(data); renderTemplates(); renderTplManage(); toast(S.line('toastTpl'));
  });

  /* ---------- 语音记账（浏览器支持才露出按钮） ---------- */
  function initVoice() {
    const btn = $('#btnVoice');
    if (!btn) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    btn.hidden = false;
    btn.addEventListener('click', () => {
      if (voiceRec) {
        try { voiceRec.stop(); } catch (e) {}
        voiceRec = null; btn.classList.remove('is-listening');
        return;
      }
      try {
        voiceRec = new SR();
        voiceRec.lang = 'zh-CN';
        voiceRec.interimResults = false;
        voiceRec.maxAlternatives = 1;
        voiceRec.onresult = e => {
          const txt = (e.results && e.results[0] && e.results[0][0] && e.results[0][0].transcript) || '';
          const parsed = S.parseVoice(txt);
          if (parsed) { applyDraft(parsed); toast(S.line('toastVoice')); }
          else toast(S.line('toastVoiceFail'));
        };
        voiceRec.onerror = () => toast(S.line('toastVoiceFail'));
        voiceRec.onend = () => { btn.classList.remove('is-listening'); voiceRec = null; };
        voiceRec.start();
        btn.classList.add('is-listening');
      } catch (e) { voiceRec = null; btn.classList.remove('is-listening'); }
    });
  }

  /* ---------- 冷静期清单 ---------- */
  function renderWishes() {
    const box = $('#wishList');
    if (!box) return;
    const list = (data.wishlist || []).filter(w => !w.decidedTs);
    $('#wishCount').textContent = list.length;
    if (!list.length) { box.innerHTML = '<p class="wish-empty">◌</p>'; return; }
    box.innerHTML = list.map(w =>
      '<div class="wish-row"><div class="wish-info"><b>' + esc(w.name) + '</b>' +
      '<span>¥' + S.fmtNum(w.amount) + ' · 放了 ' + S.wishDays(w) + ' 天</span></div>' +
      '<div class="wish-acts"><button type="button" data-wish-skip="' + w.id + '">算了</button>' +
      '<button type="button" data-wish-buy="' + w.id + '">还是买</button>' +
      '<button class="wish-x" type="button" data-wish-del="' + w.id + '">×</button></div></div>'
    ).join('');
    $$('[data-wish-del]', box).forEach(b => b.addEventListener('click', () => {
      S.removeWish(data, b.dataset.wishDel); S.save(data); renderWishes();
    }));
    $$('[data-wish-skip]', box).forEach(b => b.addEventListener('click', () => decideWish(b.dataset.wishSkip, 'skip')));
    $$('[data-wish-buy]', box).forEach(b => b.addEventListener('click', () => decideWish(b.dataset.wishBuy, 'buy')));
  }
  function decideWish(id, decision) {
    const w = S.decideWish(data, id, decision);
    if (!w) return;
    S.save(data);
    renderWishes(); renderPiggy(); updateTopStat(); renderHeld();
    toast(S.line(decision === 'buy' ? 'toastWishBuy' : 'toastWishSkip'));
  }
  $('#btnWishToggle').addEventListener('click', () => {
    const body = $('#wishBody');
    body.hidden = !body.hidden;
  });
  $('#btnAddWish').addEventListener('click', () => {
    const name = ($('#wishName').value || '').trim();
    const amt = parseFloat($('#wishAmount').value);
    if (!name || !amt || amt <= 0) { toast('写下想买什么和价钱'); return; }
    S.addWish(data, name, amt); S.save(data);
    $('#wishName').value = ''; $('#wishAmount').value = '';
    renderWishes(); toast(S.line('toastWish'));
  });

  /* ---------- 前视预测 + 分类预算 ---------- */
  function renderForecast() {
    const card = $('#forecastCard');
    if (!card) return;
    if (ledgerMonth !== S.monthKey(Date.now())) { card.hidden = true; return; }
    const f = S.forecast(data);
    card.hidden = false;
    card.classList.toggle('is-over', f.over);
    $('#forecastText').textContent = f.text;
  }
  function renderBudgetTip() {
    budgetSuggestions = S.catBudgetSuggestions(data);
    const box = $('#budgetTipList');
    if (!box) return;
    box.innerHTML = budgetSuggestions.length
      ? budgetSuggestions.map(x => '<div class="bt-row"><span>' + x.icon + ' ' + esc(x.name) + '</span>' +
          '<span>往月 ¥' + S.fmtNum(x.avg) + '</span><b>¥' + S.fmtNum(x.suggested) + '</b></div>').join('')
      : '<p class="panel-empty">还没有足够的历史数据</p>';
    $('#btnApplyBudget').hidden = !budgetSuggestions.length;
  }
  $('#btnBudgetTip').addEventListener('click', () => { renderBudgetTip(); $('#budgetTip').hidden = false; });
  $('#btnCloseBudget').addEventListener('click', () => { $('#budgetTip').hidden = true; });
  $('#btnApplyBudget').addEventListener('click', () => {
    const n = S.applyCatBudgets(data, budgetSuggestions);
    S.save(data); $('#budgetTip').hidden = true;
    renderHeld(); toast(n ? '上限定好了' : '没定成');
  });

  /* ---------- 周 / 月复盘 ---------- */
  function renderReview() {
    const box = $('#reviewBody');
    if (!box) return;
    const r = S.review(data, reviewPeriod);
    box.innerHTML = '<div class="review-big">¥' + S.fmtNum(r.expense) + '</div>' +
      '<div class="review-lines">' + r.lines.map(l => '<p>' + l + '</p>').join('') + '</div>';
    $$('#reviewTabs button').forEach(b => b.classList.toggle('is-on', b.dataset.period === reviewPeriod));
  }
  $('#reviewTabs').addEventListener('click', e => {
    const b = e.target.closest('button[data-period]');
    if (!b) return;
    reviewPeriod = b.dataset.period;
    renderReview();
  });

  /* ---------- 周期账：到期给卡，点了才落账 ---------- */
  function renderCycles() {
    const box = $('#cycleCard');
    if (!box) return;
    const list = S.dueCycles(data);
    box.hidden = !list.length;
    if (!list.length) { $('#cycleList').innerHTML = ''; return; }
    $('#cycleList').innerHTML = list.map(t =>
      '<div class="cycle-row"><span class="cy-ico">' + S.categoryIcon(t.category, t.kind) + '</span>' +
      '<div class="cy-info"><b>' + esc(t.name) + '</b><span>每月 ' + t.cycleDay + ' 号 · ¥' + S.fmtNum(t.amount) + '</span></div>' +
      '<button type="button" data-cycle-ok="' + t.id + '">记好了</button></div>'
    ).join('');
    $$('[data-cycle-ok]', box).forEach(b => b.addEventListener('click', () => {
      const rec = S.confirmCycle(data, b.dataset.cycleOk);
      if (!rec) return;
      S.save(data);
      renderCycles(); renderPiggy(); renderTemplates(); updateTopStat();
      toast('固定账记下了');
    }));
  }

  /* ---------- 攒钱目标：忍住的钱流进目标 ---------- */
  function renderGoal() {
    const strip = $('#goalStrip');
    if (!strip) return;
    const g = S.goalProgress(data);
    strip.hidden = !g;
    if (!g) return;
    $('#goalStripName').textContent = '攒来' + g.name;
    $('#goalStripNum').textContent = '¥' + S.fmtNum(g.saved) + ' / ' + S.fmtNum(g.target);
    $('#goalFill').style.width = g.pct + '%';
  }

  /* ---------- 账本工具：查账 / 订阅 / 日历 ---------- */
  function renderSubscriptions() {
    const card = $('#subCard');
    if (!card) return;
    const list = S.detectSubscriptions(data);
    card.hidden = !list.length;
    if (!list.length) { $('#subList').innerHTML = ''; return; }
    $('#subList').innerHTML = list.map(x =>
      '<div class="sub-row"><div class="sub-info"><b>' + esc(x.name) + '</b>' +
      '<span>每月约 ¥' + S.fmtNum(x.amount) + ' · 出现 ' + x.months + ' 个月</span></div>' +
      '<div class="sub-year"><b>¥' + S.fmtNum(x.yearly) + '</b><span>一年</span></div></div>'
    ).join('');
  }
  function renderCalendar() {
    const grid = $('#calGrid');
    if (!grid) return;
    const [y, m] = ledgerMonth.split('-').map(Number);
    const days = new Date(y, m, 0).getDate();
    const first = (new Date(y, m - 1, 1).getDay() + 6) % 7;
    const trend = S.dailyTrend(data, ledgerMonth);
    const max = Math.max.apply(null, trend.concat([1]));
    let html = '';
    for (let i = 0; i < first; i++) html += '<div class="cal-cell blank"></div>';
    for (let d = 1; d <= days; d++) {
      const v = trend[d - 1] || 0;
      const lvl = v ? Math.min(4, Math.max(1, Math.ceil(v / max * 4))) : 0;
      html += '<button class="cal-cell lv' + lvl + (ledgerDay === d ? ' is-on' : '') + '" data-day="' + d + '" type="button">' +
        '<span>' + d + '</span>' + (v ? '<b>' + S.fmtNum(v) + '</b>' : '') + '</button>';
    }
    grid.innerHTML = html;
    $$('[data-day]', grid).forEach(b => b.addEventListener('click', () => {
      const day = +b.dataset.day;
      ledgerDay = ledgerDay === day ? 0 : day;
      ledgerMode = 'list';
      renderHeld();
    }));
    const spendDays = trend.filter(v => v > 0).length;
    $('#calFoot').textContent = spendDays
      ? ('有 ' + spendDays + ' 天花了钱 · 最深那天 ¥' + S.fmtNum(max))
      : '这个月还没有支出';
  }
  function renderLedgerModes() {
    $$('#ledgerModes button').forEach(b => b.classList.toggle('is-on', b.dataset.mode === ledgerMode));
    $('#calView').hidden = ledgerMode !== 'cal';
    $('#heldList').hidden = ledgerMode === 'cal';
  }
  function doAsk() {
    const q = ($('#askInput').value || '').trim();
    if (!q) return;
    const a = S.queryLedger(data, q);
    if (!a) return;
    $('#askText').textContent = a.text;
    $('#askDetail').textContent = a.detail || '';
    $('#askDetail').hidden = !a.detail;
    $('#askAnswer').hidden = false;
  }
  $('#btnAsk').addEventListener('click', doAsk);
  $('#askInput').addEventListener('keydown', e => { if (e.key === 'Enter') doAsk(); });
  $('#ledgerModes').addEventListener('click', e => {
    const b = e.target.closest('button[data-mode]');
    if (!b) return;
    ledgerMode = b.dataset.mode; ledgerDay = 0;
    renderHeld();
  });
  /* ---------- 记一笔（第一功能） ---------- */
  function todayStr() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function renderCats() {
    const list = S.categories(data)[entryKind];
    if (!list.some(c => c.id === entryCat)) entryCat = list[0].id;
    $('#catGrid').innerHTML = list.map(c =>
      '<button class="cat-chip' + (c.id === entryCat ? ' is-on' : '') + '" data-cat="' + c.id + '" type="button">' +
      '<span class="cat-ico">' + c.icon + '</span><span>' + c.name + '</span></button>'
    ).join('');
    $$('.cat-chip').forEach(b => b.addEventListener('click', () => {
      entryCat = b.dataset.cat;
      $$('.cat-chip').forEach(x => x.classList.toggle('is-on', x === b));
    }));
  }
  function setEntryKind(kind) {
    entryKind = kind;
    entryCat = S.categories(data)[kind][0].id;
    $$('.type-btn').forEach(b => b.classList.toggle('is-on', b.dataset.kind === kind));
    $('#catBlock').hidden = false;
    $('#catBlock').querySelector('.field-cap').textContent = kind === 'income' ? '进账来源' : '花在哪了';
    $('#amountSymbol').textContent = '¥';
    renderCats();
  }
  $$('.type-btn').forEach(b => b.addEventListener('click', () => setEntryKind(b.dataset.kind)));

  function readEntry() {
    const amt = parseFloat($('#amountInput').value);
    if (!amt || amt <= 0) { toast(S.line('toastEmptyAmount')); $('#amountInput').focus(); return null; }
    const dateVal = $('#dateInput').value;
    let ts = Date.now();
    if (dateVal) {
      const parts = dateVal.split('-');
      if (parts.length === 3) {
        const d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
        if (!isNaN(d.getTime())) ts = d.getTime() + 12 * 3600000; // 中午，避开时区边界
      }
    }
    return {
      amount: Math.round(amt * 100) / 100,
      name: ($('#nameInput').value || '').trim(),
      category: entryCat,
      kind: entryKind,
      ts
    };
  }
  function saveEntry() {
    const rec = readEntry();
    if (!rec) return;
    if (editingId) {
      const idx = data.records.findIndex(r => r.id === editingId);
      if (idx >= 0) {
        data.records[idx] = Object.assign({}, data.records[idx], rec);
        if (rec.name && rec.category) S.learnCategory(data, rec.name, rec.category);
        toast('改好了');
      }
      editingId = null;
      $('#btnAddLabel').textContent = '记下这一笔';
      $('#btnCancelEdit').hidden = true;
      $('#heroTitle').textContent = '记一笔';
    } else {
      const action = 'normal'; // 普通记账不计入冲动统计
      data.records.push(Object.assign({ id: S.uid(), action, emotion: null, note: '' }, rec));
      // 记账里程碑：每 5 笔静默掉一张金句卡进图鉴
      const drop = S.milestoneDrop(data);
      // 预算提醒：这笔记完后的剩余额度
      const t = S.translate(rec.amount, data.settings, data);
      if (drop) toast(drop.isNew ? '记下了 · 解锁一张金句卡' : '记下了 · 又收一张卡');
      else if (rec.kind === 'income') toast('进账记下了');
      else if (t.willUse || t.left <= 0) toast('记下了 · 这个月预算见底了');
      else toast('记下了');
    }
    S.save(data);
    $('#amountInput').value = '';
    $('#nameInput').value = '';
    $('#dateInput').value = todayStr();
    renderPiggy(); renderTemplates(); updateTopStat();
  }
  $('#btnQuickAdd').addEventListener('click', saveEntry);
  $('#amountInput').addEventListener('keydown', e => { if (e.key === 'Enter') saveEntry(); });
  $('#btnCancelEdit').addEventListener('click', () => {
    editingId = null;
    $('#amountInput').value = ''; $('#nameInput').value = '';
    $('#btnAddLabel').textContent = '记下这一笔';
    $('#btnCancelEdit').hidden = true;
    $('#heroTitle').textContent = '记一笔';
  });

  /* ---------- 踩刹车（记账的可选增强） ---------- */
  $('#btnBrake').addEventListener('click', () => {
    const amt = parseFloat($('#amountInput').value);
    if (!amt || amt <= 0) { toast(S.line('toastEmptyAmount')); $('#amountInput').focus(); return; }
    pending = {
      amount: Math.round(amt * 100) / 100,
      name: ($('#nameInput').value || '').trim(),
      category: entryCat,
      kind: 'expense'
    };
    renderCost();
    showSub('cost');
  });

  /* 输入名字时，若命中已知刚需，露出「直接记」快捷条（≥2 次标记为必需） */
  $('#nameInput').addEventListener('input', () => {
    const name = ($('#nameInput').value || '').trim();
    const hit = name && S.isKnownNeed(name, data);
    $('#needQuick').hidden = !hit;
    if (hit) $('#needQuickLabel').textContent = '「' + name + '」是你的固定开销';
  });

  function renderCost() {
    const t = S.translate(pending.amount, data.settings, data);
    $('#costAmount').textContent = S.fmtNum(pending.amount);
    $('#costName').textContent = pending.name || '这一笔';
    const cards = [
      {
        cls: 'time',
        ico: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
        label: '等于你多久的工资',
        value: t.hoursText
      },
      {
        cls: 'stuff',
        ico: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
        label: '这笔钱还能买这些',
        value: t.equiv.map(e => e.count + e.name).join(' ≈ ')
      },
      {
        cls: 'left',
        ico: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M17 8a4 4 0 010 8M7 6a4 4 0 000 12"/></svg>',
        label: t.willUse ? '花完就超这个月的预算了' : '这个月还剩能花的',
        value: '¥ ' + S.fmtNum(t.left),
        meter: Math.max(3, Math.min(100, 100 - t.ratio))
      }
    ];
    $('#costCards').innerHTML = cards.map(c =>
      '<div class="cost-card"><div class="cc-ico ' + c.cls + '">' + c.ico + '</div>' +
      '<div class="cc-body"><p class="cc-label">' + c.label + '</p>' +
      '<p class="cc-value">' + c.value + '</p>' +
      (c.meter != null ? '<div class="cc-meter"><i style="width:' + c.meter + '%"></i></div>' : '') +
      '</div></div>'
    ).join('');
    $('#judgeText').textContent = S.judge(pending.amount, pending.name, data, t);
  }

  $('#btnBackCost').addEventListener('click', () => { showSub('home'); setTemp('warm'); });
  $('#btnBuy').addEventListener('click', () => { renderEmotions(); showSub('checkout'); });
  $('#btnBackCheckout').addEventListener('click', () => showSub('cost'));

  /* 必需消费：直接记一笔，不计冲动、不弹情绪结账 */
  function recordNeed() {
    if (!pending) return;
    addRecord('need');
    toast(S.line('toastNeed'));
    resetAndHome();
  }
  $('#btnNeed').addEventListener('click', recordNeed);
  $('#btnNeedQuick').addEventListener('click', () => {
    const amt = parseFloat($('#amountInput').value);
    if (!amt || amt <= 0) { toast(S.line('toastEmptyAmount')); $('#amountInput').focus(); return; }
    pending = { amount: Math.round(amt * 100) / 100, name: ($('#nameInput').value || '').trim() };
    recordNeed();
  });

  /* ---------- 情绪结账 ---------- */
  function renderEmotions() {
    chosenEmotion = null;
    $('#checkoutNote').value = '';
    $('#emotionGrid').innerHTML = S.EMOTIONS.map(e =>
      '<button class="emo" data-emo="' + e.id + '"><span class="emo-face">' + e.face + '</span>' + e.label + '</button>'
    ).join('');
    $$('#emotionGrid .emo').forEach(b => {
      b.addEventListener('click', () => {
        $$('#emotionGrid .emo').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        chosenEmotion = b.dataset.emo;
      });
    });
  }
  $('#btnCheckoutSave').addEventListener('click', () => {
    if (!chosenEmotion) { toast(S.line('toastEmptyEmotion')); return; }
    addRecord('buy', chosenEmotion, $('#checkoutNote').value.trim());
    // 解锁反向成就徽章（自嘲式幽默，接住「买了」的挫败）
    const badge = S.buyBadge(data, pending.amount);
    S.save(data);
    const bc = $('#badgeCard');
    bc.className = 'badge-card rank-' + badge.rank;
    $('#badgeRank').textContent = badge.rankLabel;
    $('#badgeIcon').textContent = badge.icon;
    $('#badgeNew').hidden = !badge.isNew;
    $('#badgeTitle').textContent = badge.title;
    $('#badgeDesc').textContent = badge.desc;
    showSub('badge');
    bc.style.animation = 'none'; void bc.offsetWidth; bc.style.animation = '';
  });

  /* ---------- 忍住（可选增强，不计入段位与目标） ---------- */
  $('#btnSkip').addEventListener('click', () => {
    addRecord('skip');
    renderSaved();
    $('#rankupBanner').hidden = true;
    showSub('saved');
  });
  function renderSaved() {
    const p = S.portrait(data);
    const c = S.savedCopy(p, pending.amount);
    $('#savedTitle').textContent = c.title;
    $('#savedMoney').textContent = c.money;
    $('#savedSub').textContent = c.sub;
    // 掉落卡 + 连击（dropCard 内部会把卡写进图鉴，这里落库）
    const drop = S.dropCard(data, pending.amount);
    S.save(data);
    const dc = $('#dropCard');
    dc.className = 'drop-card rank-' + drop.rank;
    $('#dropRank').textContent = drop.rankLabel;
    $('#dropIcon').textContent = drop.icon;
    $('#dropNew').hidden = !drop.isNew;
    $('#dropTitle').textContent = drop.title;
    $('#dropDesc').textContent = drop.desc;
    $('#dropStreak').textContent = drop.streak >= 2 ? drop.streakText : '';
    $('#dropStreak').hidden = drop.streak < 2;
    dc.hidden = false;
    const g = $('#savedGlyph');
    g.style.animation = 'none'; void g.offsetWidth; g.style.animation = '';
    const card = $('#dropCard');
    card.style.animation = 'none'; void card.offsetWidth; card.style.animation = '';
  }
  $('#btnSavedDone').addEventListener('click', resetAndHome);
  $('#btnBadgeDone').addEventListener('click', () => { toast(S.line('toastBuy')); resetAndHome(); });

  function addRecord(action, emotion, note) {
    data.records.push({
      id: S.uid(), ts: Date.now(), action,
      kind: (pending && pending.kind) || 'expense',
      category: (pending && pending.category) || '',
      amount: pending.amount,
      name: pending.name || '',
      emotion: emotion || null,
      note: note || ''
    });
    // 抽卡盐：每记一笔就变，保证「开盲盒」每次结果不同
    if (action === 'skip') data.lastDropSalt = (data.lastDropSalt || 0) + 1;
    if (action === 'buy') data.lastBadgeSalt = (data.lastBadgeSalt || 0) + 1;
    S.save(data);
    renderTemplates();
    updateTopStat();
  }
  function resetAndHome() {
    pending = null;
    editingId = null;
    $('#amountInput').value = '';
    $('#nameInput').value = '';
    $('#dateInput').value = todayStr();
    $('#needQuick').hidden = true;
    $('#btnAddLabel').textContent = '记下这一笔';
    $('#btnCancelEdit').hidden = true;
    $('#heroTitle').textContent = '记一笔';
    setTemp('warm');
    renderPiggy();
    showSub('home');
  }

  /* ---------- 账本 ---------- */
  function monthLabelText(key) {
    const p = key.split('-');
    return p[0] + ' 年 ' + (+p[1]) + ' 月';
  }
  function shiftMonth(key, delta) {
    const p = key.split('-');
    const d = new Date(+p[0], +p[1] - 1 + delta, 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  function renderHeld() {
    const months = S.monthsWithRecords(data);
    if (months.indexOf(ledgerMonth) === -1) ledgerMonth = months[0];
    $('#monthLabel').textContent = monthLabelText(ledgerMonth);
    $('#monthNext').disabled = ledgerMonth >= S.monthKey(Date.now());

    const lg = S.ledger(data, ledgerMonth);
    $('#heldSummary').innerHTML =
      '<div class="ls-item income"><div class="ls-label">收入</div><div class="ls-num">' + S.fmtNum(lg.income) + '</div></div>' +
      '<div class="ls-item expense"><div class="ls-label">支出</div><div class="ls-num">' + S.fmtNum(lg.expense) + '</div></div>' +
      '<div class="ls-item balance"><div class="ls-label">结余</div><div class="ls-num">' + S.fmtNum(lg.balance) + '</div></div>';

    // 预算进度：仅当月显示
    const isNow = ledgerMonth === S.monthKey(Date.now());
    $('#budgetStrip').hidden = !isNow;
    if (isNow) {
      const budget = Math.max(1, Number(data.settings.budget) || 2000);
      // 预算进度只看支出，收入是另一维度，不混进来（否则出现"已用-721%"）
      const spent = lg.expense;
      const left = Math.max(0, budget - spent);
      const usedPct = Math.min(100, Math.round(spent / budget * 1000) / 10);
      $('#bsLeft').textContent = '¥ ' + S.fmtNum(left);
      $('#bsFill').style.width = usedPct + '%';
      $('#bsFill').classList.toggle('over', spent > budget);
      $('#bsNote').textContent = spent > budget
        ? ('已超支 ¥' + S.fmtNum(spent - budget) + ' · 下月留意')
        : ('预算 ¥' + S.fmtNum(budget) + ' · 已用 ' + usedPct + '%');
    }

    renderForecast();

    // 分类支出条（当月且设过上限时，附上预算刻度）
    if (lg.cats.length) {
      const top = lg.cats.slice(0, 5);
      const showBudget = ledgerMonth === S.monthKey(Date.now());
      $('#catBars').innerHTML = '<p class="cat-bars-title">钱花在哪了</p>' + top.map(c => {
        const pct = lg.catTotal ? Math.round(c.amount / lg.catTotal * 100) : 0;
        const cap = showBudget ? S.catBudgetOf(data, c.id) : 0;
        const over = cap && c.amount > cap;
        return '<div class="cat-bar"><span class="cb-ico">' + c.icon + '</span>' +
          '<span class="cb-name">' + c.name + '</span>' +
          '<span class="cb-track"><i style="width:' + pct + '%"></i></span>' +
          '<span class="cb-num' + (over ? ' over' : '') + '">¥' + S.fmtNum(c.amount) + (cap ? ' / ' + S.fmtNum(cap) : '') + '</span></div>';
      }).join('');
    } else $('#catBars').innerHTML = '';

    // 当月真实流水（收入 + 支出，不含忍住）
    let recs = data.records.filter(r => r && r.ts != null && S.monthKey(r.ts) === ledgerMonth && r.action !== 'skip');
    if (ledgerFilter === 'income') recs = recs.filter(r => r.kind === 'income');
    if (ledgerFilter === 'expense') recs = recs.filter(r => r.kind !== 'income');
    if (ledgerDay) recs = recs.filter(r => new Date(r.ts).getDate() === ledgerDay);
    if (ledgerQuery) {
      const q = ledgerQuery.toLowerCase();
      recs = recs.filter(r => {
        const cat = r.category ? S.categoryName(r.category, r.kind === 'income' ? 'income' : 'expense') : '';
        return ((r.name || '') + ' ' + cat + ' ' + (r.note || '')).toLowerCase().indexOf(q) >= 0;
      });
    }
    recs.sort((a, b) => b.ts - a.ts);

    if (!recs.length) {
      $('#heldList').innerHTML = '<div class="empty-list">这个月还没有记录。<br>回到首页，记下第一笔。</div>';
    } else {
      // 按日分组
      const groups = [];
      let cur = null;
      recs.forEach(r => {
        const d = new Date(r.ts);
        const key = d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
        if (!cur || cur.key !== key) {
          cur = { key, label: dayLabel(d), items: [] };
          groups.push(cur);
        }
        cur.items.push(r);
      });
      $('#heldList').innerHTML = groups.map(g =>
        '<div class="day-group"><p class="day-label">' + g.label + '</p>' +
        g.items.map(r => recHtml(r, r.kind === 'income' ? 'income' : (r.action === 'need' ? 'need' : 'expense'))).join('') +
        '</div>'
      ).join('');
    }

    // 冲动三分类区块（保留原有审查依赖的容器）
    const skips = data.records.filter(r => r.action === 'skip').slice().reverse();
    const buys = data.records.filter(r => r.action === 'buy').slice().reverse();
    const needs = data.records.filter(r => r.action === 'need').slice().reverse();
    if (buys.length) {
      $('#boughtBlock').hidden = false;
      $('#boughtList').innerHTML = buys.map(r => recHtml(r, 'warm')).join('');
    } else $('#boughtBlock').hidden = true;
    if (needs.length) {
      $('#needBlock').hidden = false;
      $('#needList').innerHTML = needs.map(r => recHtml(r, 'need')).join('');
    } else $('#needBlock').hidden = true;
    if (skips.length) {
      $('#skipBlock').hidden = false;
      $('#skipList').innerHTML = skips.map(r => recHtml(r, 'calm')).join('');
    } else $('#skipBlock').hidden = true;

    renderLedgerModes();
    renderCalendar();
    renderSubscriptions();
    bindRecActions();
  }
  function dayLabel(d) {
    const now = new Date();
    const yest = new Date(now.getTime() - 86400000);
    const same = (x, y) => x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
    if (same(d, now)) return '今天';
    if (same(d, yest)) return '昨天';
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }
  function bindRecActions() {
    $$('.rec-del').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation();
      const id = b.dataset.del;
      const idx = data.records.findIndex(r => r.id === id);
      if (idx < 0) return;
      const removed = data.records[idx];
      data.records.splice(idx, 1);
      S.save(data);
      renderHeld(); renderPiggy(); renderTemplates(); updateTopStat();
      toastWithUndo('删掉了', () => {
        data.records.splice(Math.min(idx, data.records.length), 0, removed);
        S.save(data);
        renderHeld(); renderPiggy(); renderTemplates(); updateTopStat();
        toast('回来了');
      });
    }));
    $$('.record[data-edit]').forEach(row => row.addEventListener('click', () => {
      const r = data.records.find(x => x.id === row.dataset.edit);
      if (!r) return;
      editingId = r.id;
      setEntryKind(r.kind === 'income' ? 'income' : 'expense');
      if (r.category) {
        entryCat = r.category;
        $$('.cat-chip').forEach(x => x.classList.toggle('is-on', x.dataset.cat === entryCat));
      }
      $('#amountInput').value = r.amount;
      $('#nameInput').value = r.name || '';
      if (r.ts) {
        const d = new Date(r.ts);
        $('#dateInput').value = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      }
      $('#btnAddLabel').textContent = '保存修改';
      $('#btnCancelEdit').hidden = false;
      $('#heroTitle').textContent = '改一笔';
      switchView('brake');
      window.scrollTo({ top: 0 });
      $('#amountInput').focus();
    }));
  }
  function recHtml(r, tone) {
    const d = new Date(r.ts);
    const time = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    const isIncome = r.kind === 'income';
    const isNeed = r.action === 'need';
    const isSkip = r.action === 'skip';
    // 账本流水：分类图标 + 分类名 / 备注
    const catIcon = r.category ? S.categoryIcon(r.category, isIncome ? 'income' : 'expense') : (isIncome ? '💰' : '✨');
    const catName = r.category ? S.categoryName(r.category, isIncome ? 'income' : 'expense') : (isIncome ? '进账' : '其他');
    let name;
    if (isSkip) name = '忍住了';
    else if (isNeed) name = esc(r.name) || '日常必需';
    else name = esc(r.name) || catName;
    let meta = time + ' · ' + catName;
    if (r.emotion) meta += ' · ' + S.emotionLabel(r.emotion);
    if (r.note) meta += ' · 「' + esc(r.note) + '」';
    const prefix = isIncome ? '+' : (isSkip ? '+' : '−');
    const amtTone = isIncome || isSkip ? 'income' : 'expense';
    return '<div class="record" data-edit="' + r.id + '"><span class="rec-cat-ico">' + (isSkip ? '🛑' : catIcon) + '</span>' +
      '<div class="rec-main"><div class="rec-name">' + name + '</div>' +
      '<div class="rec-meta">' + meta + '</div></div>' +
      '<div class="rec-amt ' + amtTone + '">' + prefix + S.fmtNum(r.amount) + '</div>' +
      '<button class="rec-del" data-del="' + r.id + '">×</button></div>';
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  /* ---------- 图鉴 + 段位 ---------- */
  let codexKind = 'card';
  function renderCodex() {
    const rk = S.rankOf(data);
    $('#rankEmblem').textContent = rk.icon;
    $('#rankName').textContent = rk.name;
    $('#rankDesc').textContent = rk.desc;
    $('#rankProgressFill').style.width = rk.progress + '%';
    $('#rankProgressText').textContent = rk.nextName
      ? ('再攒 ¥' + S.fmtNum(rk.need) + ' → ' + rk.nextName)
      : '已满级，你就是传说本身';

    // 记账段位
    const sr = S.saveRankOf(data);
    $('#srEmblem').textContent = sr.icon;
    $('#srName').textContent = sr.name;
    $('#srCount').textContent = sr.count + ' 笔支出';
    $('#srFill').style.width = sr.progress + '%';
    $('#srNext').textContent = sr.nextName ? ('再记 ' + sr.need + ' 笔 → ' + sr.nextName) : '记账这件事，你已封神';

    const cx = S.codex(data);
    $('#codexSummary').innerHTML =
      '<div class="cs-item"><div class="cs-num">' + cx.gotN + '/' + cx.totalN + '</div><div class="cs-label">已收集</div></div>' +
      '<div class="cs-item rare"><div class="cs-num">' + cx.cardN + '</div><div class="cs-label">金句卡</div></div>' +
      '<div class="cs-item legend"><div class="cs-num">' + cx.legendN + '</div><div class="cs-label">传说卡</div></div>';

    drawCodexGrid(cx);
  }
  function drawCodexGrid(cx) {
    const list = codexKind === 'card' ? cx.cards : cx.badges;
    $('#codexGrid').innerHTML = list.map(c => {
      if (!c.got) {
        return '<div class="codex-cell locked rank-' + c.r + '">' +
          '<span class="cx-rank-dot"></span>' +
          '<div class="cx-icon">◌</div><div class="cx-q">?</div>' +
          '<div class="cx-name">未解锁</div></div>';
      }
      const countLine = c.count > 1 ? ('×' + c.count) : '已获得';
      return '<div class="codex-cell rank-' + c.r + '">' +
        '<span class="cx-rank-dot"></span>' +
        '<div class="cx-icon">' + c.icon + '</div>' +
        '<div class="cx-name">' + esc(c.t) + '</div>' +
        '<div class="cx-count">' + countLine + '</div></div>';
    }).join('');
  }
  $('#codexTabs').addEventListener('click', e => {
    const b = e.target.closest('.codex-tab');
    if (!b) return;
    codexKind = b.dataset.kind;
    $$('.codex-tab').forEach(t => t.classList.toggle('is-on', t === b));
    drawCodexGrid(S.codex(data));
  });

  /* ---------- 画像 ---------- */
  function renderPortrait() {
    const p = S.portrait(data);
    if (!p.recordN) {
      $('#portraitEmpty').hidden = false;
      $('#portraitBody').hidden = true;
      return;
    }
    $('#portraitEmpty').hidden = true;
    $('#portraitBody').hidden = false;
    // 账本为主视角：哪怕从没踩过刹车，也有完整画像
    const cards = [
      { wide: false, label: '这个月花了', value: '¥' + S.fmtNum(p.monthExpense), sub: p.expenseN + ' 笔支出，笔笔清楚' },
      { wide: false, label: '这个月进账', value: '¥' + S.fmtNum(p.monthIncome), sub: p.incomeN ? (p.incomeN + ' 笔收入') : '还没记收入' },
      { wide: false, label: '花得最多的', value: p.topCat ? esc(p.topCat.name) : '还没摸清', sub: p.topCat ? ('¥' + S.fmtNum(p.topCat.amount) + ' 用在这') : '多记几笔就知道了' },
      { wide: false, label: '本月结余', value: '¥' + S.fmtNum(p.monthBalance), sub: p.monthBalance >= 0 ? '攒下来的底气' : '花超了，下月留意' },
      { wide: true, label: '记账坚持', value: S.streak(data) + '<small> 天连击</small>',
        sub: p.recordN ? ('这个月记了 ' + p.recordN + ' 笔，接着记') : '从今天起，把日子记成账' }
    ];
    $('#portraitGrid').innerHTML = cards.map(c =>
      '<div class="pg-card' + (c.wide ? ' wide' : '') + '"><p class="pg-label">' + c.label + '</p>' +
      '<p class="pg-value">' + c.value + '</p><p class="pg-sub">' + c.sub + '</p></div>'
    ).join('');

    // 每日支出趋势（迷你柱图）
    const trend = S.dailyTrend(data);
    const max = Math.max.apply(null, trend.concat([1]));
    const today = new Date().getDate();
    $('#trendChart').innerHTML = trend.map((v, i) => {
      const h = v ? Math.max(6, Math.round(v / max * 100)) : 0;
      return '<div class="tc-col' + (i + 1 === today ? ' is-today' : '') + '" title="' + (i + 1) + '日 ¥' + S.fmtNum(v) + '">' +
        '<span class="tc-bar" style="height:' + h + '%"></span></div>';
    }).join('');
    const spendDays = trend.filter(v => v > 0).length;
    $('#trendFoot').textContent = '这个月有 ' + spendDays + ' 天记了支出 · 最高一天 ¥' + S.fmtNum(max);

    const lines = S.cardLines(data);
    $('#insight').innerHTML = lines.map(l => '<p>' + l + '</p>').join('');
    renderReview();
  }

  /* ---------- 分享卡 ---------- */
  $('#btnCard').addEventListener('click', () => {
    const p = S.portrait(data);
    const seed = new Date().toDateString() + '|share|' + p.recordN + '|' + p.monthBalance;
    const lines = S.cardLines(data).map(l => '<div class="sc-line">' + l + '</div>').join('');
    // 账本口径：攒下的结余为主角，没攒下就展示本月支出
    const title = p.monthBalance > 0 ? '这个月，我攒下了这些' : '这个月，我记下了每一笔';
    const bigNum = S.fmtNum(p.monthBalance > 0 ? p.monthBalance : p.monthExpense);
    const bigLabel = p.monthBalance > 0 ? '收入减支出，都是我攒的' : '本月花了这么多，心里有数';
    $('#shareCard').innerHTML =
      '<div class="sc-brand">笔笔清 · 这个月的我</div>' +
      '<div class="sc-title">' + title + '</div>' +
      '<div class="sc-big"><div class="sc-big-n">¥' + bigNum + '</div>' +
      '<div class="sc-big-l">' + bigLabel + '</div></div>' +
      '<div class="sc-lines">' + lines + '</div>' +
      '<div class="sc-foot">' + S.line('cardFoot', seed + 'f') + '</div>';
    $('#cardSheet').hidden = false;
  });
  $('#cardClose').addEventListener('click', () => { $('#cardSheet').hidden = true; });
  $('#cardSheet').addEventListener('click', e => { if (e.target.id === 'cardSheet') $('#cardSheet').hidden = true; });
  function wrapCardText(ctx, text, x, y, maxW, lineH) {
    let line = '', yy = y;
    for (const ch of String(text || '')) {
      const test = line + ch;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, yy);
        line = ch; yy += lineH;
      } else line = test;
    }
    if (line) ctx.fillText(line, x, yy);
    return yy + lineH;
  }
  function saveCardImage() {
    const card = $('#shareCard');
    if (!card) return;
    try {
      const W = 750, H = 1250;
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const c = cv.getContext('2d');
      const g = c.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, '#FCE9E1'); g.addColorStop(.46, '#FBF8F2'); g.addColorStop(1, '#DCEFE8');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      const txt = s => { const el = card.querySelector(s); return el ? el.textContent : ''; };
      c.textBaseline = 'top';
      c.fillStyle = '#BB4526'; c.font = 'bold 26px sans-serif';
      c.fillText(txt('.sc-brand'), 60, 64);
      c.fillStyle = '#202725'; c.font = 'bold 60px sans-serif';
      let y = wrapCardText(c, txt('.sc-title'), 60, 140, W - 120, 78) + 20;
      c.fillStyle = '#0B6455'; c.font = 'bold 96px sans-serif';
      c.fillText(txt('.sc-big-n'), 60, y); y += 122;
      c.fillStyle = '#5E6663'; c.font = '26px sans-serif';
      y = wrapCardText(c, txt('.sc-big-l'), 60, y, W - 120, 38) + 30;
      c.strokeStyle = 'rgba(32,39,37,.1)'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(60, y); c.lineTo(W - 60, y); c.stroke(); y += 30;
      c.fillStyle = '#5E6663'; c.font = '28px sans-serif';
      $$('.sc-line', card).forEach(el => { y = wrapCardText(c, el.textContent, 60, y, W - 120, 44) + 14; });
      c.fillStyle = '#9BA09C'; c.font = '24px sans-serif';
      c.fillText(txt('.sc-foot'), 60, y + 56);
      const out = document.createElement('canvas');
      out.width = W; out.height = Math.max(900, Math.ceil(y + 130));
      out.getContext('2d').drawImage(cv, 0, 0);
      out.toBlob(blob => {
        if (!blob) { toast('没存成，试试手机截图'); return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = '笔笔清-这个月的我.png';
        a.click(); URL.revokeObjectURL(url);
        toast('存好了');
      }, 'image/png');
    } catch (e) { toast('没存成，试试手机截图'); }
  }
  $('#btnSaveCard').addEventListener('click', saveCardImage);

  /* ---------- 设置 ---------- */
  function renderExportHint() {
    const el = $('#exportHint');
    if (!el) return;
    const ts = Number(data.lastExportTs) || 0;
    if (!ts) { el.textContent = ''; return; }
    const days = Math.floor((Date.now() - ts) / 86400000);
    el.textContent = days <= 0 ? '今天备份过' : (days === 1 ? '昨天备份过' : days + ' 天前备份过');
  }
  function fillSettings() {
    $('#cfgWage').value = data.settings.wage || '';
    $('#cfgBudget').value = data.settings.budget || '';
    $('#cfgPayday').value = data.settings.payday || '';
    renderTplManage();
    renderExportHint();
    const g = S.goalProgress(data);
    $('#goalState').innerHTML = g
      ? '<div class="goal-state"><b>' + esc(g.name) + '</b><span>已攒 ¥' + S.fmtNum(g.saved) + ' / ¥' + S.fmtNum(g.target) + ' · ' + g.pct + '%</span></div>'
      : '';
    $('#btnClearGoal').hidden = !g;
  }
  function bindCfg(sel, key, def) {
    $(sel).addEventListener('change', e => {
      const v = parseFloat(e.target.value);
      let val = (isFinite(v) && v > 0 && (key !== 'payday' || v <= 31)) ? v : def;
      if (key === 'payday') val = Math.floor(val);
      data.settings[key] = val;
      S.save(data);
      toast('已保存');
    });
  }
  bindCfg('#cfgWage', 'wage', 50);
  bindCfg('#cfgBudget', 'budget', 2000);
  bindCfg('#cfgPayday', 'payday', 10);

  $('#btnExport').addEventListener('click', () => {
    data.lastExportTs = Date.now(); S.save(data);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = '笔笔清-备份-' + todayStr() + '.json';
    a.click(); URL.revokeObjectURL(url);
    renderExportHint();
    toast('已导出');
  });
  $('#btnSetGoal').addEventListener('click', () => {
    const name = ($('#goalName').value || '').trim();
    const target = parseFloat($('#goalTarget').value);
    if (!name || !isFinite(target) || target <= 0) { toast('写下目标名字和金额'); return; }
    S.setGoal(data, name, target); S.save(data);
    $('#goalName').value = ''; $('#goalTarget').value = '';
    fillSettings(); renderGoal(); toast('目标定好了');
  });
  $('#btnClearGoal').addEventListener('click', () => {
    S.clearGoal(data); S.save(data);
    fillSettings(); renderGoal(); toast('目标取消了');
  });
  $('#btnImportBills').addEventListener('click', () => {
    const text = ($('#billText').value || '').trim();
    if (!text) { toast('先粘贴账单内容'); return; }
    const rows = S.parseBillText(text);
    if (!rows.length) { toast('没读到账单记录'); return; }
    if (!confirm('读到 ' + rows.length + ' 条记录，导入到账本？')) return;
    rows.forEach(r => data.records.push(Object.assign({ id: S.uid(), note: '', emotion: null }, r)));
    S.save(data);
    $('#billText').value = '';
    renderPiggy(); renderTemplates(); renderWishes(); updateTopStat();
    renderHeld(); renderPortrait();
    toast('导进来了');
  });
  $('#btnImport').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const res = S.importData(String(reader.result || ''));
      if (!res.ok) { toast(res.error); return; }
      if (!confirm('用备份里的 ' + res.count + ' 条记录覆盖当前数据？')) return;
      data = res.data; S.save(data);
      ledgerMonth = S.monthKey(Date.now());
      renderPiggy(); renderTemplates(); renderWishes(); renderTplManage(); renderExportHint(); updateTopStat();
      renderHeld(); renderPortrait(); renderCodex(); fillSettings();
      toast(S.line('toastImport'));
    };
    reader.readAsText(f);
    e.target.value = '';
  });
  $('#btnClear').addEventListener('click', () => {
    if (!confirm('清空全部记录？此操作不可恢复。')) return;
    data = S.defaultData();
    S.save(data);
    ledgerMonth = S.monthKey(Date.now());
    renderPiggy(); renderTemplates(); renderWishes(); renderTplManage(); renderExportHint(); updateTopStat();
    renderHeld(); renderPortrait();
    toast('已清空');
  });

  /* ---------- 账本导出分享：带数据分析的月度账单 ---------- */
  function roundRectPath(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  function shareLedgerReport() {
    const lg = S.ledger(data, ledgerMonth);
    const prev = S.ledger(data, shiftMonth(ledgerMonth, -1));
    const trend = S.dailyTrend(data, ledgerMonth);
    const budget = Math.max(1, Number(data.settings.budget) || 2000);
    const W = 750, X = 60, MW = W - 120;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = 1500;
    const c = cv.getContext('2d');
    const g = c.createLinearGradient(0, 0, W, 1500);
    g.addColorStop(0, '#FBF8F2'); g.addColorStop(.55, '#FFFFFF'); g.addColorStop(1, '#DCEFE8');
    c.fillStyle = g; c.fillRect(0, 0, W, 1500);
    c.textBaseline = 'top';
    c.fillStyle = '#BB4526'; c.font = 'bold 24px sans-serif';
    c.fillText('笔笔清 · 月度账单', X, 56);
    c.fillStyle = '#202725'; c.font = 'bold 64px sans-serif';
    c.fillText(monthLabelText(ledgerMonth), X, 116);

    const cardY = 226, cardW = (MW - 24) / 3, cardH = 168;
    [
      { label: '收入', val: '¥' + S.fmtNum(lg.income), color: '#12836F' },
      { label: '支出', val: '¥' + S.fmtNum(lg.expense), color: '#E2603F' },
      { label: '结余', val: '¥' + S.fmtNum(lg.balance), color: '#202725' }
    ].forEach((s, i) => {
      const x = X + i * (cardW + 12);
      c.fillStyle = 'rgba(255,255,255,.92)';
      roundRectPath(c, x, cardY, cardW, cardH, 18); c.fill();
      c.fillStyle = '#9BA09C'; c.font = '22px sans-serif';
      c.fillText(s.label, x + 20, cardY + 22);
      c.fillStyle = s.color; c.font = 'bold 33px sans-serif';
      c.fillText(s.val, x + 20, cardY + 68);
    });

    let y = cardY + cardH + 48;
    const usedPct = Math.min(100, Math.round(lg.expense / budget * 1000) / 10);
    c.fillStyle = '#5E6663'; c.font = '23px sans-serif';
    c.fillText('月度预算 ¥' + S.fmtNum(budget) + ' · 已用 ' + usedPct + '%', X, y);
    y += 40;
    c.fillStyle = 'rgba(32,39,37,.08)';
    roundRectPath(c, X, y, MW, 14, 7); c.fill();
    c.fillStyle = lg.expense > budget ? '#E2603F' : '#12836F';
    roundRectPath(c, X, y, Math.max(6, MW * Math.min(1, lg.expense / budget)), 14, 7); c.fill();
    y += 60;

    c.fillStyle = '#202725'; c.font = 'bold 30px sans-serif';
    c.fillText('钱花在哪了', X, y); y += 52;
    const top = lg.cats.slice(0, 5);
    if (!top.length) {
      c.fillStyle = '#9BA09C'; c.font = '24px sans-serif';
      c.fillText('这个月还没有支出记录', X, y); y += 60;
    }
    top.forEach(cat => {
      c.fillStyle = '#202725'; c.font = '25px sans-serif';
      c.fillText(cat.name, X, y);
      const amt = '¥' + S.fmtNum(cat.amount);
      c.fillStyle = '#5E6663'; c.font = '23px sans-serif';
      c.fillText(amt, X + MW - c.measureText(amt).width, y);
      c.fillStyle = 'rgba(32,39,37,.07)';
      roundRectPath(c, X, y + 38, MW, 12, 6); c.fill();
      const pct = lg.catTotal ? Math.max(2, Math.round(cat.amount / lg.catTotal * 100)) : 0;
      c.fillStyle = '#12836F';
      roundRectPath(c, X, y + 38, Math.max(6, MW * pct / 100), 12, 6); c.fill();
      y += 78;
    });

    y += 18;
    c.fillStyle = '#202725'; c.font = 'bold 30px sans-serif';
    c.fillText('每天的花钱节奏', X, y); y += 52;
    const max = Math.max.apply(null, trend.concat([1]));
    const bw = MW / trend.length;
    const today = new Date().getDate();
    trend.forEach((v, i) => {
      const h = v ? Math.max(6, Math.round(v / max * 110)) : 0;
      c.fillStyle = (i + 1 === today && ledgerMonth === S.monthKey(Date.now())) ? '#E2603F' : '#12836F';
      c.fillRect(X + i * bw, y + 116 - h, Math.max(2, bw - 3), h);
    });
    y += 148;

    const delta = prev.expense > 0 ? Math.round((lg.expense - prev.expense) / prev.expense * 100) : null;
    const cmp = delta === null
      ? '上个月没记录，从这份账单开始'
      : (delta >= 0 ? ('比上个月多花了 ' + delta + '%') : ('比上个月少花了 ' + Math.abs(delta) + '%'));
    c.fillStyle = '#5E6663'; c.font = '24px sans-serif';
    c.fillText(cmp, X, y);
    c.fillStyle = '#9BA09C'; c.font = '22px sans-serif';
    c.fillText('每一笔，都清楚', X, y + 56);

    const out = document.createElement('canvas');
    out.width = W; out.height = Math.max(1000, Math.ceil(y + 130));
    out.getContext('2d').drawImage(cv, 0, 0);
    out.toBlob(async blob => {
      if (!blob) { toast('没生成出来'); return; }
      const file = new File([blob], '笔笔清-账单-' + ledgerMonth + '.png', { type: 'image/png' });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: '笔笔清 · 月度账单' }); return; }
        catch (e) { if (e && e.name === 'AbortError') return; }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = file.name;
      a.click(); URL.revokeObjectURL(url);
      toast('账单存好了');
    }, 'image/png');
  }
  $('#btnLedgerShare').addEventListener('click', shareLedgerReport);

  /* ---------- 账本控件 ---------- */
  $('#monthPrev').addEventListener('click', () => { ledgerMonth = shiftMonth(ledgerMonth, -1); ledgerDay = 0; renderHeld(); });
  $('#monthNext').addEventListener('click', () => {
    if (ledgerMonth >= S.monthKey(Date.now())) return;
    ledgerMonth = shiftMonth(ledgerMonth, 1); ledgerDay = 0; renderHeld();
  });
  $('#ledgerFilters').addEventListener('click', e => {
    const b = e.target.closest('.lf');
    if (!b) return;
    ledgerFilter = b.dataset.filter;
    $$('.lf').forEach(x => x.classList.toggle('is-on', x === b));
    renderHeld();
  });
  $('#searchInput').addEventListener('input', e => { ledgerQuery = (e.target.value || '').trim(); renderHeld(); });

  /* ---------- tabbar ---------- */
  $('#tabbar').addEventListener('click', e => {
    const b = e.target.closest('.tab');
    if (b) switchView(b.dataset.view);
  });

  /* ---------- 启动 ---------- */
  drawBrand();
  $('#dateInput').value = todayStr();
  renderCats();
  renderPiggy();
  renderTemplates();
  renderWishes();
  renderExportHint();
  initVoice();
  updateTopStat();
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
