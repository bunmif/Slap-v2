/* ============================================================
   SLAP. — app logic
   Vanilla ES6. No framework, no bundler, no build step.
   State lives in localStorage under "slap.state.v1".
   ============================================================ */

(() => {
  'use strict';

  /* ---------------------------------------------------------
     0. Tiny helpers
     --------------------------------------------------------- */

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const esc = (str) =>
    String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

  const dayKey = (d = new Date()) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const dayLabel = (key) => {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  };

  const daysBetween = (a, b) =>
    Math.round((dayLabel(b) - dayLabel(a)) / 86400000);

  const relTime = (ts) => {
    const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 45) return 'just now';
    const m = Math.round(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.round(h / 24)}d ago`;
  };

  const mmss = (totalSeconds) => {
    const s = Math.max(0, Math.round(totalSeconds));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const announce = (msg) => { $('#live').textContent = msg; };

  /* ---------------------------------------------------------
     1. Persistence
     --------------------------------------------------------- */

  const KEY = 'slap.state.v1';

  const blank = () => ({
    version: 1,
    xp: 0,
    streak: 0,
    streakDay: null,
    bestStreak: 0,
    lastDay: null,
    days: {},
    tasks: [],
    focusTaskId: null,
    history: [],
    feed: [],
    feedUnread: 0,
    hypeLog: [],
    persona: 'hype',
    energy: 'ok',
    name: '',
    accent: 'violet',
    vibe: 'normal',
    arena: { wins: 0, losses: 0, streak: 0, rival: null, vs: {} },
    pomo: { phase: 'work', round: 0, shortMin: 5, auto: true, chime: true },
    park: [],
    sessions: [],
    notes: [],
    cards: [],
    study: { panel: 'timer', sview: 'notes', noteSubject: 'all', cardSubject: 'all' },
    settings: { haptics: true, confetti: true, liveFeed: true, sound: 'off', focusMins: 15, ui: 'slap', iosTheme: 'light' },
    timer: { len: 15 * 60, remain: 15 * 60, endAt: null },
    stats: {
      tasksDone: 0, tasksDoneToday: 0, stepsDone: 0, focusSessions: 0,
      focusMinutes: 0, breakdowns: 0, nudges: 0, perfectDays: 0, nightOwl: false,
      notes: 0, cards: 0, reviews: 0, sorts: 0
    },
    seeded: false
  });

  let S = blank();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== 1) return;
      S = Object.assign(blank(), parsed);
      S.settings = Object.assign(blank().settings, parsed.settings || {});
      S.stats = Object.assign(blank().stats, parsed.stats || {});
      S.timer = Object.assign(blank().timer, parsed.timer || {});
      S.arena = Object.assign(blank().arena, parsed.arena || {});
      S.pomo = Object.assign(blank().pomo, parsed.pomo || {});
      S.study = Object.assign(blank().study, parsed.study || {});
      S.park = Array.isArray(parsed.park) ? parsed.park.slice(0, 40) : [];
      S.sessions = Array.isArray(parsed.sessions) ? parsed.sessions.slice(0, 60) : [];
      S.notes = Array.isArray(parsed.notes) ? parsed.notes.slice(0, 200) : [];
      S.cards = Array.isArray(parsed.cards) ? parsed.cards.slice(0, 400) : [];
      if (S.arena.vs && typeof S.arena.vs === 'object') S.arena.vs = parsed.arena.vs;
      S.tasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];
      S.feed = Array.isArray(parsed.feed) ? parsed.feed : [];
      S.hypeLog = Array.isArray(parsed.hypeLog) ? parsed.hypeLog : [];
      S.days = parsed.days && typeof parsed.days === 'object' ? parsed.days : {};
    } catch (err) {
      console.warn('[SLAP] could not read saved state, starting fresh.', err);
    }
  }

  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(S));
      } catch (err) {
        console.warn('[SLAP] save failed (storage full or blocked).', err);
      }
    }, 120);
  }

  /* ---------------------------------------------------------
     1b. Personalisation: name, accent, vibe
     --------------------------------------------------------- */

  const ACCENTS = {
    violet: { base: '#a78bfa', a2: '#34d399', a3: '#f472b6' },
    blue:   { base: '#60a5fa', a2: '#2dd4bf', a3: '#f0abfc' },
    teal:   { base: '#2dd4bf', a2: '#60a5fa', a3: '#fbbf24' },
    lime:   { base: '#a3e635', a2: '#34d399', a3: '#60a5fa' },
    amber:  { base: '#fbbf24', a2: '#fb923c', a3: '#34d399' },
    rose:   { base: '#fb7185', a2: '#f0abfc', a3: '#fbbf24' }
  };

  function applyAccent(name) {
    const key = ACCENTS[name] ? name : 'violet';
    const a = ACCENTS[key];
    const root = document.documentElement.style;
    root.setProperty('--acc', a.base);
    root.setProperty('--acc-2', a.a2);
    root.setProperty('--acc-3', a.a3);
    root.setProperty('--acc-ink', '#0a0612');
    S.accent = key;
    $$('#accentRow .swatch').forEach((b) => {
      const on = b.dataset.accent === key;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', a.base);
    applyUI();
  }

  function applyVibe(v) {
    const key = ['calm', 'loud'].includes(v) ? v : 'normal';
    document.documentElement.dataset.vibe = key;
    S.vibe = key;
    $$('#vibeSeg button').forEach((b) => b.classList.toggle('on', b.dataset.vibe === key));
  }

  const IOS_TINT = { base: '#007AFF', a2: '#34C759', a3: '#FF375F' };
  const UI_MODES = ['slap', 'prism', 'ios'];

  function applyUI() {
    const mode = UI_MODES.includes(S.settings.ui) ? S.settings.ui : 'slap';
    const theme = S.settings.iosTheme === 'dark' ? 'dark' : 'light';
    const root = document.documentElement;

    root.dataset.ui = mode;
    if (mode === 'ios') {
      root.dataset.ios = theme;
      const custom = S.accent && S.accent !== 'violet' && ACCENTS[S.accent];
      const t = custom ? ACCENTS[S.accent] : IOS_TINT;
      root.style.setProperty('--acc', t.base);
      root.style.setProperty('--acc-2', t.a2);
      root.style.setProperty('--acc-3', t.a3);
      root.style.setProperty('--acc-ink', '#0a0612');
    } else {
      root.removeAttribute('data-ios');
      const a = ACCENTS[S.accent] || ACCENTS.violet;
      root.style.setProperty('--acc', a.base);
      root.style.setProperty('--acc-2', a.a2);
      root.style.setProperty('--acc-3', a.a3);
      root.style.setProperty('--acc-ink', '#0a0612');
    }

    $$('#uiSeg button').forEach((b) => b.classList.toggle('on', b.dataset.uiMode === mode));
    $$('#iosThemeSeg button').forEach((b) => b.classList.toggle('on', b.dataset.ios === theme));
    const themeSeg = $('#iosThemeSeg');
    if (themeSeg) themeSeg.classList.toggle('ios-only', mode !== 'ios');

    const hint = $('#uiHint');
    if (hint) {
      hint.textContent =
        mode === 'ios'
          ? theme === 'dark'
            ? 'iOS dark — Apple system colours, flat surfaces.'
            : 'iOS light — flat, quiet and system-standard.'
          : mode === 'prism'
            ? 'Prism — spectral glass, always in motion.'
            : "SLAP's own look.";
    }

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', mode === 'ios'
      ? (theme === 'dark' ? '#000000' : '#F2F2F7')
      : (ACCENTS[S.accent] ? ACCENTS[S.accent].base : '#08080f'));
  }

  function applyName(value) {
    S.name = (value || '').trim().slice(0, 18);
    const input = $('#nameInput');
    if (input && input.value !== S.name) input.value = S.name;
    renderGreeting();
  }

  function displayName() { return S.name || 'you'; }

  function renderGreeting() {
    const el = $('#greeting');
    if (el) el.textContent = greeting();
  }

  /* ---------------------------------------------------------
     2. Day rollover + streaks
     --------------------------------------------------------- */

  function rollover() {
    const today = dayKey();
    if (S.lastDay === today) return;

    const prevTotal = S.tasks.length;
    const unfinished = S.tasks.filter((t) => !t.done);
    const doneCount = prevTotal - unfinished.length;

    if (S.lastDay) {
      S.history.unshift({ day: S.lastDay, done: doneCount, total: prevTotal });
      S.history = S.history.slice(0, 30);
      if (prevTotal > 0 && doneCount === prevTotal) {
        S.stats.perfectDays = (S.stats.perfectDays || 0) + 1;
      }
    }

    S.tasks = unfinished.map((t) => ({
      ...t,
      done: false,
      doneAt: null,
      carried: true,
      steps: (t.steps || []).map((s) => ({ ...s, done: false }))
    }));

    if (S.focusTaskId && !S.tasks.some((t) => t.id === S.focusTaskId)) S.focusTaskId = null;
    S.stats.tasksDoneToday = 0;
    S.lastDay = today;
    save();
  }

  function touchStreak() {
    const today = dayKey();
    S.days[today] = true;
    if (S.streakDay === today) return false;

    let next = 1;
    if (S.streakDay) {
      const gap = daysBetween(S.streakDay, today);
      if (gap === 1) next = S.streak + 1;
      else if (gap === 2) next = S.streak + 1;
      else next = 1;
    }
    S.streak = next;
    S.streakDay = today;
    S.bestStreak = Math.max(S.bestStreak, next);
    return true;
  }

  /* ---------------------------------------------------------
     3. Levels, XP, badges
     --------------------------------------------------------- */

  const RANKS = [
    { at: 0, name: 'Procrastinator' },
    { at: 150, name: 'Momentum Rookie' },
    { at: 450, name: 'Task Sniper' },
    { at: 950, name: 'Locked In' },
    { at: 1800, name: 'Slap Machine' },
    { at: 3200, name: 'Legend (annoying)' }
  ];

  function levelInfo(xp) {
    let i = 0;
    while (i + 1 < RANKS.length && xp >= RANKS[i + 1].at) i++;
    const floor = RANKS[i].at;
    const maxed = i + 1 >= RANKS.length;
    const ceil = maxed ? floor : RANKS[i + 1].at;
    const pct = maxed ? 1 : clamp((xp - floor) / (ceil - floor), 0, 1);
    return {
      level: i + 1,
      name: RANKS[i].name,
      nextName: maxed ? '' : RANKS[i + 1].name,
      floor, ceil, pct, maxed,
      toNext: maxed ? 0 : Math.max(0, ceil - xp)
    };
  }

  const BADGES = [
    { id: 'first', emo: '🫡', name: 'First Slap', test: (s) => s.tasksDone >= 1 },
    { id: 'chore', emo: '🧹', name: 'Chore Slayer', test: (s) => s.tasksDone >= 10 },
    { id: 'ai', emo: '⚡', name: 'Chop Shop', test: (s) => s.breakdowns >= 10 },
    { id: 'steps', emo: '👣', name: 'Tiny Win Streak', test: (s) => s.stepsDone >= 25 },
    { id: 'focus', emo: '⏱️', name: 'Deep Work', test: (s) => s.focusSessions >= 5 },
    { id: 'zen', emo: '🧘', name: '90 Mins Deep', test: (s) => s.focusMinutes >= 90 },
    { id: 's3', emo: '🔥', name: '3 Day Fire', test: (s) => s.bestStreak >= 3 },
    { id: 's7', emo: '🌋', name: '7 Day Inferno', test: (s) => s.bestStreak >= 7 },
    { id: 'lvl', emo: '🏆', name: 'Level 3+', test: (s) => levelInfo(s.xp).level >= 3 },
    { id: 'buddy', emo: '🫶', name: 'Good Pod Member', test: (s) => s.nudges >= 5 },
    { id: 'perfect', emo: '💎', name: 'Perfect Day', test: (s) => (s.perfectDays || 0) >= 1 },
    { id: 'night', emo: '🦉', name: 'Night Slapper', test: (s) => !!s.nightOwl },
    { id: 'notes', emo: '📝', name: 'Note Taker', test: (s) => (s.notes || 0) >= 10 },
    { id: 'cards', emo: '🃏', name: 'Card Shark', test: (s) => (s.reviews || 0) >= 5 }
  ];

  const BADGE_HINTS = {
    first: 'Finish one task.',
    chore: 'Finish 10 tasks.',
    ai: 'Use ⚡ Break It Down 10 times.',
    steps: 'Complete 25 micro-steps.',
    focus: 'Finish 5 focus sessions.',
    zen: 'Bank 90 focused minutes.',
    s3: 'Hit a 3 day streak.',
    s7: 'Hit a 7 day streak.',
    lvl: 'Reach Level 3.',
    buddy: 'Send 5 pod nudges.',
    perfect: 'Clear the whole list in one day.',
    night: 'Finish something between 11pm and 5am.',
    notes: 'Save 10 notes.',
    cards: 'Finish 5 card reviews.'
  };

  // FIX: badge tests need XP/streak fields that live on S, not S.stats.
  const earned = () =>
    new Set(
      BADGES.filter((b) =>
        b.test({ ...S.stats, xp: S.xp, streak: S.streak, bestStreak: S.bestStreak })
      ).map((b) => b.id)
    );

  function addXP(amount) {
    const before = levelInfo(S.xp).level;
    S.xp += amount;
    const after = levelInfo(S.xp);
    if (after.level > before) {
      toast(`${after.name} unlocked · LEVEL ${after.level} 🏆`);
      burst(1.2);
    }
    return after;
  }

  /* ---------------------------------------------------------
     3b. Fighter avatar + power
     --------------------------------------------------------- */

  let avSeq = 0;

  const AV_UNLOCKS = [
    { lv: 2, key: 'band', name: 'Headband', emo: '🎽' },
    { lv: 3, key: 'visor', name: 'Visor', emo: '🥽' },
    { lv: 4, key: 'cans', name: 'Cans', emo: '🎧' },
    { lv: 5, key: 'crown', name: 'Crown', emo: '👑' },
    { lv: 6, key: 'wings', name: 'Wings', emo: '🪽' }
  ];

  function power() {
    return Math.max(0, Math.round(
      S.xp + S.streak * 30 + (S.stats.tasksDone || 0) * 10 + (S.stats.focusSessions || 0) * 15
    ));
  }

  function myAvatarSize() {
    const i = levelInfo(S.xp);
    return 64 + (i.level - 1) * 11 + Math.round(i.pct * 13);
  }
  function lvlSize(lvl) { return 64 + (clamp(lvl, 1, 6) - 1) * 11; }

  function avatarSVG(lvl, opt) {
    opt = opt || {};
    const id = 'avg' + (avSeq++);
    const c1 = opt.c1 || 'var(--acc)';
    const c2 = opt.c2 || 'var(--acc-2)';
    const ink = opt.ink || '#12121c';
    const size = Math.round(opt.size || 96);
    const lv = clamp(Math.round(lvl || 1), 1, 6);

    const rx = 20 + lv * 4;
    const ry = rx * 0.95;
    const ground = 104;
    const cx = 60;
    const cy = ground - ry;
    const top = cy - ry;
    const chord = (y) => {
      const t = (y - cy) / ry;
      return rx * Math.sqrt(Math.max(0, 1 - t * t));
    };

    const eyeY = cy - ry * 0.12;
    const eyeDX = rx * 0.36;
    const eyeR = Math.max(4.5, rx * 0.21);
    const eye = (sx) => `
      <ellipse class="av-eye" cx="${cx + sx * eyeDX}" cy="${eyeY}" rx="${eyeR}" ry="${eyeR * 1.15}" fill="#fff"/>
      <circle class="av-pupil" cx="${cx + sx * eyeDX + sx * eyeR * 0.12}" cy="${eyeY + eyeR * 0.2}" r="${eyeR * 0.55}" fill="${ink}"/>
      <circle cx="${cx + sx * eyeDX - sx * eyeR * 0.2}" cy="${eyeY - eyeR * 0.25}" r="${eyeR * 0.22}" fill="#fff" opacity=".9"/>`;

    const mY = cy + ry * 0.34;
    const mW = rx * (0.24 + lv * 0.035);
    const mouth = lv >= 4
      ? `<path d="M${cx - mW} ${mY - rx * 0.05} Q${cx} ${mY + rx * 0.3} ${cx + mW} ${mY - rx * 0.05} Q${cx} ${mY + rx * 0.12} ${cx - mW} ${mY - rx * 0.05} Z" fill="${ink}"/>`
      : `<path d="M${cx - mW} ${mY} Q${cx} ${mY + rx * (lv < 3 ? 0.16 : 0.26)} ${cx + mW} ${mY}" fill="none" stroke="${ink}" stroke-width="${rx * 0.09}" stroke-linecap="round"/>`;

    let gear = '';
    if (lv >= 2) {
      const y = top + ry * 0.30;
      const w = chord(y) * 2;
      gear += `<rect x="${cx - w / 2}" y="${y - rx * 0.1}" width="${w}" height="${rx * 0.2}" rx="${rx * 0.1}" fill="#fff" opacity=".92"/>`;
    }
    if (lv >= 3) {
      const y = top + ry * 0.14;
      const w = chord(y) * 2;
      gear += `<rect x="${cx - w * 0.46}" y="${y - rx * 0.09}" width="${w * 0.92}" height="${rx * 0.2}" rx="${rx * 0.1}" fill="${ink}"/>`
        + `<rect x="${cx - w * 0.3}" y="${y - rx * 0.055}" width="${w * 0.24}" height="${rx * 0.05}" rx="${rx * 0.025}" fill="#fff" opacity=".55"/>`;
    }
    if (lv >= 4) {
      const hw = rx * 0.99;
      const hpy = top + ry * 0.42;
      gear += `<path d="M${cx - hw} ${hpy} Q${cx} ${top - rx * 0.52} ${cx + hw} ${hpy}" fill="none" stroke="${ink}" stroke-width="${rx * 0.15}" stroke-linecap="round"/>`
        + `<rect x="${cx - hw - rx * 0.13}" y="${hpy - rx * 0.17}" width="${rx * 0.26}" height="${rx * 0.36}" rx="${rx * 0.12}" fill="${ink}"/>`
        + `<rect x="${cx + hw - rx * 0.13}" y="${hpy - rx * 0.17}" width="${rx * 0.26}" height="${rx * 0.36}" rx="${rx * 0.12}" fill="${ink}"/>`;
    }
    if (lv >= 5) {
      const cw = rx * 0.56, ch = rx * 0.34, b = top + rx * 0.1;
      gear += `<path d="M${cx - cw} ${b + ch} L${cx - cw} ${b - ch * 0.15} L${cx - cw * 0.5} ${b + ch * 0.2} L${cx} ${b - ch} L${cx + cw * 0.5} ${b + ch * 0.2} L${cx + cw} ${b - ch * 0.15} L${cx + cw} ${b + ch} Z" fill="#fbbf24" stroke="#f59e0b" stroke-width="${rx * 0.05}" stroke-linejoin="round"/>`;
    }

    let back = '';
    if (lv >= 6) {
      const span = Math.min(rx * 1.15, 46);
      const wy = cy - ry * 0.35, wy2 = cy + ry * 0.5;
      back += `<path d="M${cx - rx * 0.55} ${wy} C${cx - span} ${wy - ry * 0.5} ${cx - span} ${wy2} ${cx - rx * 0.5} ${wy2} Z" fill="#fff" opacity=".82"/>`
        + `<path d="M${cx + rx * 0.55} ${wy} C${cx + span} ${wy - ry * 0.5} ${cx + span} ${wy2} ${cx + rx * 0.5} ${wy2} Z" fill="#fff" opacity=".82"/>`
        + `<ellipse cx="${cx}" cy="${top - rx * 0.3}" rx="${rx * 0.52}" ry="${rx * 0.15}" fill="none" stroke="#fde68a" stroke-width="${rx * 0.09}" opacity=".95"/>`;
    }

    const brows = lv >= 5
      ? `<path d="M${cx - eyeDX - eyeR} ${eyeY - eyeR * 1.7} L${cx - eyeDX + eyeR * 0.7} ${eyeY - eyeR * 2.1}" stroke="${ink}" stroke-width="${rx * 0.08}" stroke-linecap="round"/>
         <path d="M${cx + eyeDX - eyeR * 0.7} ${eyeY - eyeR * 2.1} L${cx + eyeDX + eyeR} ${eyeY - eyeR * 1.7}" stroke="${ink}" stroke-width="${rx * 0.08}" stroke-linecap="round"/>`
      : '';

    const label = opt.alt || `Level ${lv} avatar`;

    return `<svg class="av" viewBox="0 0 120 124" width="${size}" height="${size}" role="img" aria-label="${esc(label)}">
      <defs>
        <linearGradient id="${id}" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>
        </linearGradient>
      </defs>
      <g class="av-idle">
        ${back}
        <ellipse cx="${cx}" cy="${ground + 7}" rx="${rx * 0.86}" ry="5.5" fill="#000" opacity=".34"/>
        <ellipse cx="${cx - rx * 0.42}" cy="${ground - 1}" rx="${rx * 0.26}" ry="${rx * 0.14}" fill="${c2}"/>
        <ellipse cx="${cx + rx * 0.42}" cy="${ground - 1}" rx="${rx * 0.26}" ry="${rx * 0.14}" fill="${c2}"/>
        <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#${id})"/>
        <ellipse cx="${cx - rx * 0.34}" cy="${top + ry * 0.36}" rx="${rx * 0.3}" ry="${rx * 0.15}" fill="#fff" opacity=".3"/>
        <ellipse cx="${cx}" cy="${cy + ry * 0.42}" rx="${rx * 0.56}" ry="${ry * 0.44}" fill="#fff" opacity=".18"/>
        <ellipse cx="${cx - rx * 0.62}" cy="${cy + ry * 0.16}" rx="${rx * 0.16}" ry="${rx * 0.1}" fill="#fb7185" opacity=".45"/>
        <ellipse cx="${cx + rx * 0.62}" cy="${cy + ry * 0.16}" rx="${rx * 0.16}" ry="${rx * 0.1}" fill="#fb7185" opacity=".45"/>
        ${brows}
        <g class="av-eyes">${eye(-1)}${eye(1)}</g>
        ${mouth}
        ${gear}
      </g>
    </svg>`;
  }

  /* ---------------------------------------------------------
     4. Three-step "break it down" engine
     --------------------------------------------------------- */

  const RULES = [
    {
      test: /\b(dishes|washing up|dishwasher|put the washing)\b/i,
      steps: [
        'Fill the sink or dishwasher — no scrubbing yet',
        'Load or scrub exactly 3 plates, then stop',
        'Rinse, stack, and get out. 3 plates counts as dishes.'
      ]
    },
    {
      test: /\b(laundry|washing|fold|iron|clothes|outfit|wardrobe|towels)\b/i,
      steps: [
        'Put the machine on, whatever load is closest',
        'Fold 5 items while it runs (or just start the timer)',
        'Hang 3 things up and call the laundry handled'
      ]
    },
    {
      test: /\b(plants?|garden|feed the pet|feed the dog|feed the cat|fish tank)\b/i,
      steps: [
        'Fill one watering can / one food bowl',
        'Do just one pot, tray or bowl',
        'Stop, put the can away, and walk off guilt-free'
      ]
    },
    {
      test: /\b(clean|tidy|declutter|room|garbage|trash|vacuum|mop|bed)\b/i,
      steps: [
        'Grab a bag or bin — pick up just 3 pieces of trash',
        'Put the shoes away (that is the whole step, go)',
        'Wipe one single surface, then stop and walk off'
      ]
    },
    {
      test: /\b(essay|homework|assignment|math|science|history|english|research|project|report|presentation|ppt)\b/i,
      steps: [
        'Open the doc and type only the title + today\'s date',
        'Do ONE question or read ONE page — 2 min timer on',
        'Write one sentence about what it\'s about, then close it'
      ]
    },
    {
      test: /\b(study|revise|review|exam|quiz|test|flashcard|memoris|memoriz|learn)\b/i,
      steps: [
        'Open the notes / book to the right page only',
        'Read or recall 3 facts out loud, then stop',
        'Close it and say the topic in one sentence'
      ]
    },
    {
      test: /\b(gym|workout|run|exercise|walk|sports|train|yoga|pushup|situp)\b/i,
      steps: [
        'Put on the shoes / gear. That\'s the win.',
        'Warm up 60 seconds, move however you want',
        'Do 5 reps of the first exercise, then re-evaluate'
      ]
    },
    {
      test: /\b(shower|bath|teeth|brush|skin|face|hair|get ready|glow)\b/i,
      steps: [
        'Get in / turn the tap on and wait 10 seconds',
        'Do the first half only — half still counts',
        'Finish it and feel the glow, you earned it'
      ]
    },
    {
      test: /\b(email|inbox|message|text|dm|reply|replying|whatsapp|discord|parent|teacher)\b/i,
      steps: [
        'Open the app, do not reply yet — just look',
        'Reply to the ONE oldest message, 2 sentences max',
        'Send it before you overthink. Close the app.'
      ]
    },
    {
      test: /\b(code|program|project|bug|deploy|website|app|python|javascript|cs)\b/i,
      steps: [
        'Open the project and run it once',
        'Fix or add exactly ONE small thing',
        'Commit + push, then step away from the keyboard'
      ]
    },
    {
      test: /\b(eat|cook|meal|dinner|lunch|breakfast|snack|food|order)\b/i,
      steps: [
        'Put water on / open the fridge and decide',
        'Prep just the first ingredient (or tap order)',
        'Eat for 10 minutes without your phone in your hand'
      ]
    },
    {
      test: /\b(edit|video|photo|design|draw|paint|art|content|post|capcut|canva)\b/i,
      steps: [
        'Open the file and scrub to the roughest part',
        'Make ONE change, however small',
        'Save + export, or just save. Done is a setting.'
      ]
    },
    {
      test: /\b(plan|organis|organiz|schedule|timetable|week|to.?do|budget|money|declutter)/i,
      steps: [
        'Open notes, write tomorrow\'s #1 task only',
        'Block 25 minutes for it in your calendar',
        'Close the app. That plan is legally binding.'
      ]
    },
    {
      test: /\b(call|phone|speak|talk|ask|interview|presentation for)\b/i,
      steps: [
        'Write down 2 things you need to say',
        'Type the message or dial the number',
        'Send / hang up within 60 seconds of starting'
      ]
    }
  ];

  function subjectOf(title) {
    const s = String(title)
      .replace(/^(please\s+)?(i\s+(really\s+)?(need|have|should|must)\s+to\s+)/i, '')
      .replace(/^(clean|do|finish|complete|start|make|write|organi[sz]e|tidy|wash|fix|handle)\s+(my|our|your|the|a|an|this|that)\s+/i, '')
      .replace(/^(clean|do|finish|complete|start|make|write|tidy|organi[sz]e)\s+/i, '')
      .replace(/[.!?]+$/, '')
      .trim();
    return s.length >= 3 ? s : String(title).trim();
  }

  const ENERGY = {
    flat: { mins: 1, label: 'flat battery', frame: 'Nothing heroic today. One minute is a win.' },
    ok: { mins: 2, label: 'steady energy', frame: 'Classic two-minute rule.' },
    fired: { mins: 5, label: 'full send', frame: 'You have runway. Let us use it.' }
  };

  function energyMins() {
    return (ENERGY[S.energy] || ENERGY.ok).mins;
  }

  function breakdown(title) {
    const text = String(title || '').trim();
    const subject = subjectOf(text);
    const hit = RULES.find((r) => r.test.test(text));
    const mins = energyMins();

    let steps = hit
      ? hit.steps.slice()
      : [
          `Set a ${mins}-minute timer, then just start: ${subject}`,
          `Do the smallest possible first bit of: ${subject}`,
          `Stop at the ${mins}-minute mark — even halfway counts`
        ];

    if (S.energy === 'flat') {
      steps = [
        `Set a 1-minute timer, then just start: ${subject}`,
        `Do one single small thing about: ${subject}`,
        `Stop after 1 minute. Half done still counts.`
      ];
    } else if (S.energy === 'fired') {
      steps = [
        `Set a 5-minute timer and go: ${subject}`,
        `Ride the momentum for the full 5 minutes on: ${subject}`,
        `5 minutes deep on: ${subject} — bank it and stop`
      ];
    }

    return steps.map((s) => ({ id: uid(), title: s, done: false, mins }));
  }

  /**
   * Splits a multi-part task ("clean room, kitchen and bathroom") into
   * one micro-task per clause, each of which can then be broken down.
   */
  function splitCompound(title) {
    const text = String(title || '').trim();
    const head = subjectOf(text);

    const raw = text
      .split(/,| and | & | plus | then |;/i)
      .map((p) => p.replace(/^(my|our|the|a|an)\s+/i, '').trim())
      .filter((p) => p.length >= 3 && !/^(then|and)$/i.test(p));

    const parts = raw.filter(Boolean);
    if (parts.length < 2) return [];

    // FIX: only split on a plain "and" when enough clauses are real tasks.
    // Prevents "Read and review chapter 4" becoming ["read", "review chapter 4"].
    const hasComma = /[,;]/.test(text);
    const multiWord = parts.filter((p) => p.split(/\s+/).length >= 2).length;
    if (!hasComma && multiWord < 2) return [];

    return parts.slice(0, 4).map((p) => ({
      id: uid(),
      title: p.length > 90 ? p.slice(0, 87) + '…' : p,
      done: false,
      doneAt: null,
      createdAt: Date.now(),
      steps: [],
      open: false,
      carried: false,
      from: head,
      subject: classify(p) // FIX: inherit a sensible subject instead of dropping it
    }));
  }

  /* ---------------------------------------------------------
     5. Hype Slap engine (3 personalities)
     --------------------------------------------------------- */

  const HYPE = {
    hype: {
      label: 'Hype-Man', emo: '🔥', blurb: 'Pure energy. All caps. Maximum serotonin.',
      step: [
        'YOOO YOU DID IT. Two minutes? That is a WHOLE task in the eyes of God.',
        'MICRO WIN DETECTED. Your brain is confused how easy that was.',
        'THAT\'S THE MOVE. Momentum is officially online.',
        'Two minutes of focus?? You are a different species today.',
        'SLAP. Done. That task is 2% smaller now. Keep going, king/queen.'
      ],
      task: [
        'SLAP COMPLETE 🔥 That task just apologised to you.',
        'YOU ATE THAT UP. Confetti is mandatory and deserved.',
        'WHO NEEDS MOTIVATION WHEN YOU HAVE A TRACK RECORD LIKE THAT.',
        'That was a whole task. On purpose. Look at you go.'
      ],
      all: [
        'LIST CLEARED 🏆 Every single thing done. Screenshot this energy.',
        'DAY. COMPLETE. You beat the "I don\'t feel like it" demon today.'
      ],
      session: [
        'FOCUS SESSION COMPLETE ⏱️ Your brain just got a little stronger.',
        'TIMER DONE. You out-stayed your own attention span. Elite.'
      ],
      rest: ['Rest days are part of the plan, not a failure. See you tomorrow 👋']
    },
    witty: {
      label: 'Witty Coach', emo: '😏', blurb: 'Sarcastic, clever, gently roasting your excuses.',
      step: [
        'Two minutes, gone. Your "I have no time" defence is looking very thin right now.',
        'Micro-step complete. Somewhere, "I\'ll do it later" just lost a citizen.',
        'Done. Astonishing how much fits in a lunch break.',
        'That took two minutes. The drama you had about it? Free of charge.',
        'Tick. That is one less excuse living in your head.'
      ],
      task: [
        'Task annihilated. It had a good run, but you had a better one.',
        'Completed. The house, the essay, the void — all slightly less annoying now.',
        'Done. Somewhere a motivational poster just rolled over in its grave.'
      ],
      all: [
        'Entire list cleared. I need a moment.',
        'Everything done. Should I call someone? Are you okay?'
      ],
      session: [
        'Focus session survived. Your attention span filed a restraining order.',
        'Timer done. Most people quit at minute four, for the record.'
      ],
      rest: ['Day off logged. Even machines cool down. See you tomorrow.']
    },
    gentle: {
      label: 'Gentle Mentor', emo: '🧸', blurb: 'Soft, warm, zero pressure. For the low-energy days.',
      step: [
        'You did a small thing, and small things are still things. Well done.',
        'That\'s done. You showed up for two minutes — that counts, genuinely.',
        'Finished. Notice how that felt? Not that bad, right?',
        'A gentle step, taken. I\'m proud of you for it.',
        'Done. Two minutes of your own company, well spent.'
      ],
      task: [
        'That task is behind you now. Breathe out — you carried it.',
        'You finished something today. That is real, and it adds up.',
        'Done. You didn\'t have to feel like it to do it, and you did anyway.'
      ],
      all: [
        'Everything on the list is done. Look at you, from the very start of today.',
        'The whole list, finished. You should feel proud — you earned that.'
      ],
      session: [
        'You gave yourself real, quiet focus time. That matters.',
        'Session complete. Rest is part of the work too.'
      ],
      rest: ['Resting counts. Your streak will still be here tomorrow.']
    }
  };

  const HYPE_SUBS = {
    step: 'that was one tiny step. momentum unlocked.',
    task: 'one down. that list just got shorter.',
    all: 'the whole list. today is handled.',
    session: 'you gave it your full attention. that counts for a lot.'
  };

  let lastHype = { byKey: '' };

  function hypeFor(kind) {
    const p = HYPE[S.persona] || HYPE.hype;
    const pool = p[kind] || p.task;
    let msg = pick(pool);
    let guard = 0;
    while (msg === lastHype.byKey && guard++ < 6) msg = pick(pool);
    lastHype.byKey = msg;
    return { msg, emo: p.emo };
  }

  /* ---------------------------------------------------------
     6. Feedback: toast, confetti, haptics, floating XP
     --------------------------------------------------------- */

  const NEON = ['#22d3ee', '#a855f7', '#ec4899', '#a3e635', '#fbbf24', '#ffffff'];

  function accGrad(a, b) {
    const cs = getComputedStyle(document.documentElement);
    const pk = (name, fb) => cs.getPropertyValue(name).trim() || fb;
    return 'linear-gradient(140deg,' + pk('--acc', a) + ',' + pk('--acc-3', b) + ')';
  }

  function toast(text) {
    const wrap = $('#toasts');
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = esc(text);
    wrap.appendChild(el);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 320);
    }, 2200);
    while (wrap.children.length > 3) wrap.firstElementChild.remove();
  }

  function burst(scale = 1) {
    if (!S.settings.confetti || reduceMotion) return;
    if (typeof window.confetti !== 'function') return;
    const base = { colors: NEON, zIndex: 95, disableForReducedMotion: true, ticks: 150 };
    window.confetti({ ...base, particleCount: Math.round(60 * scale), spread: 76, startVelocity: 42, scalar: 1.05, origin: { y: 0.62 } });
    setTimeout(() => window.confetti({ ...base, particleCount: Math.round(24 * scale), angle: 60, spread: 55, origin: { x: 0, y: 0.7 } }), 110);
    setTimeout(() => window.confetti({ ...base, particleCount: Math.round(24 * scale), angle: 120, spread: 55, origin: { x: 1, y: 0.7 } }), 190);
  }

  function buzz(pattern) {
    if (!S.settings.haptics) return;
    if (navigator.vibrate) {
      try { navigator.vibrate(pattern); } catch { /* unsupported */ }
    }
  }

  function flyText(text, x, y) {
    if (reduceMotion) return;
    const el = document.createElement('div');
    el.className = 'fly';
    el.textContent = text;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }

  function bumpCard(node) {
    if (!node || reduceMotion) return;
    node.classList.remove('task-bump');
    void node.offsetWidth;
    node.classList.add('task-bump');
  }

  function ripple(host, x, y) {
    if (!host || reduceMotion) return;
    const box = host.getBoundingClientRect();
    const size = Math.max(box.width, box.height);
    const el = document.createElement('span');
    el.className = 'ripple';
    el.style.width = el.style.height = size * 0.55 + 'px';
    el.style.left = (x - box.left - size * 0.275) + 'px';
    el.style.top = (y - box.top - size * 0.275) + 'px';
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.appendChild(el);
    setTimeout(() => el.remove(), 640);
  }

  function countUp(node, to, suffix = '') {
    if (!node) return;
    const from = Number(node.dataset.val || 0);
    if (from === to) { node.textContent = to + suffix; return; }
    node.dataset.val = String(to);
    if (reduceMotion) { node.textContent = to + suffix; return; }
    const dur = 620;
    const t0 = performance.now();
    const step = (t) => {
      const k = clamp((t - t0) / dur, 0, 1);
      const eased = 1 - Math.pow(1 - k, 3);
      node.textContent = Math.round(from + (to - from) * eased) + suffix;
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function typewriter(node, text) {
    if (!node) return;
    if (reduceMotion) { node.textContent = text; return; }
    const caret = '<span class="caret"></span>';
    node.textContent = caret;
    let i = 0;
    const tick = () => {
      i += 1;
      node.textContent = esc(text.slice(0, i)) + caret;
      if (i < text.length) setTimeout(tick, 14 + Math.random() * 26);
      else setTimeout(() => { node.textContent = text; }, 420);
    };
    setTimeout(tick, 90);
  }

  function comboTier() {
    const n = S.streak;
    if (n >= 14) return { on: true, label: '🔥🔥 LEGENDARY · 14 day streak' };
    if (n >= 7) return { on: true, label: '🔥🔥 ON FIRE · 7 day streak' };
    if (n >= 3) return { on: true, label: '🔥 combo mode · ' + n + ' day streak' };
    return { on: false, label: '' };
  }

  /* ---------------------------------------------------------
     7. Hype Slap modal
     --------------------------------------------------------- */

  const hypeScrim = $('#hypeScrim');
  let lastSlap = { kind: 'task', what: '' };

  function openHype(kind, what) {
    const { msg, emo } = hypeFor(kind);
    lastSlap = { kind, what: what || '' };

    $('#hypeOrb').textContent = emo;
    typewriter($('#hypeMsg'), msg);
    const combo = comboTier();
    const comboEl = $('#hypeCombo');
    comboEl.textContent = combo.label;
    comboEl.classList.toggle('on', combo.on);
    $('#hypeSub').textContent = HYPE_SUBS[kind] || HYPE_SUBS.task;
    $('#mXp').textContent = '+' + (kind === 'session' ? 40 : kind === 'step' ? 15 : 50);
    $('#mStreak').textContent = '🔥 ' + S.streak;
    const done = S.tasks.filter((t) => t.done).length;
    $('#mDone').textContent = done + '/' + S.tasks.length;

    S.hypeLog.unshift({ at: Date.now(), what, msg, persona: S.persona });
    S.hypeLog = S.hypeLog.slice(0, 14);
    save();

    const sheet = $('#hypeSheet');
    sheet.classList.remove('anim');
    void sheet.offsetWidth;
    sheet.classList.add('anim');

    hypeScrim.classList.add('open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => $('#btnHypeClose').focus({ preventScroll: true }), 260);
    announce(msg);
  }

  function closeHype() {
    hypeScrim.classList.remove('open');
    if (!$('#setScrim').classList.contains('open') && !memScrim.classList.contains('open')) {
      document.body.style.overflow = '';
    }
  }

  /* ---------------------------------------------------------
     8. Pods — simulated accountability feed
     --------------------------------------------------------- */

  const FRIENDS = [
    { id: 'alex', name: 'Alex', emo: '🦊', grad: 'linear-gradient(140deg,#fb923c,#ec4899)' },
    { id: 'maya', name: 'Maya', emo: '🐱', grad: 'linear-gradient(140deg,#22d3ee,#a855f7)' },
    { id: 'sam', name: 'Sam', emo: '🐸', grad: 'linear-gradient(140deg,#a3e635,#22d3ee)' },
    { id: 'jo', name: 'Jo', emo: '🐼', grad: 'linear-gradient(140deg,#e879f9,#8b5cf6)' },
    { id: 'nia', name: 'Nia', emo: '🦄', grad: 'linear-gradient(140deg,#fbbf24,#fb7185)' }
  ];

  const POD_BASE = { Alex: 4, Maya: 6, Sam: 3, Jo: 5, Nia: 4 };

  const MOCK_TASKS = [
    'Math Homework', 'history essay', 'biology revision', 'clean their room',
    'gym session', 'email their teacher', 'read 10 pages', 'fix the bike',
    'wash the dishes', 'finish the presentation', 'chemistry quiz', 'laundry',
    'study Spanish', 'edit a photo', 'make a playlist', 'pack their bag'
  ];

  const MOCK_LINES = ['just slapped', 'crushed', 'finally started', 'cleared', 'survived', 'locked in on'];

  let liveFeedId = null;

  function feedItem(who, text, self = false) {
    return { id: uid(), who, text, at: Date.now(), self, nudged: false, slaps: 0 };
  }

  function pushFeed(item) {
    S.feed.unshift(item);
    S.feed = S.feed.slice(0, 40);
    const onPods = $('#view-pods').classList.contains('is-active');
    if (onPods) renderFeed();
    else if (!item.self) { S.feedUnread = (S.feedUnread || 0) + 1; bumpPodPip(); }
    renderBoard();
    save();
  }

  function bumpPodPip() {
    const pip = $('#podPip');
    pip.hidden = false;
    pip.textContent = S.feedUnread > 9 ? '9+' : String(S.feedUnread);
  }

  function mockEvent() {
    const f = pick(FRIENDS);
    const task = pick(MOCK_TASKS);
    const line = pick(MOCK_LINES);
    const mins = pick([15, 25, 25, 45]);
    const roll = Math.random();
    let text;
    if (roll < 0.42) text = `${line} <b>${esc(task)}</b> 🔥`;
    else if (roll < 0.66) text = `started a ${mins}m focus timer ⏱️`;
    else if (roll < 0.82) text = `unlocked 2 micro-steps for <b>${esc(task)}</b> ⚡`;
    else if (roll < 0.94) text = `is on a <b>${mins}m</b> streak right now 🔥`;
    else text = `nudged the whole pod: "go go go 👏"`;
    return feedItem(f.name, text);
  }

  function seedFeed() {
    const now = Date.now();
    const mins = [2, 7, 14, 26, 41, 63, 95];
    S.feed = mins.map((m, i) => {
      const f = FRIENDS[i % FRIENDS.length];
      const task = MOCK_TASKS[(i * 3) % MOCK_TASKS.length];
      const text = i % 3 === 0
        ? `just slapped <b>${esc(task)}</b> 🔥`
        : i % 3 === 1
          ? `started a ${pick([15, 25])}m focus timer ⏱️`
          : `cleared <b>${esc(task)}</b> 🏆`;
      return { ...feedItem(f.name, text), at: now - m * 60000, slaps: Math.floor(Math.random() * 4) };
    });
  }

  function startLiveFeed() {
    stopLiveFeed();
    if (!S.settings.liveFeed) return;
    liveFeedId = setInterval(() => {
      if (document.hidden) return;
      pushFeed(mockEvent());
    }, 22000);
  }

  function stopLiveFeed() {
    if (liveFeedId) clearInterval(liveFeedId);
    liveFeedId = null;
  }

  function renderFeed() {
    const list = $('#feedList');
    if (!S.feed.length) {
      list.innerHTML = '<div class="empty"><i>🫥</i><p>Pod is quiet</p><small>Complete a task and the chat wakes up.</small></div>';
      return;
    }
    list.innerHTML = S.feed
      .map((it) => {
        const me = it.self;
        const f = FRIENDS.find((x) => x.id === (it.who || '').toLowerCase());
        const grad = me
          ? accGrad('#22d3ee', '#a855f7')
          : f ? f.grad : 'linear-gradient(140deg,#64748b,#334155)';
        const emo = me ? '😎' : f ? f.emo : '👤';
        const fresh = it.id === S.feed[0].id && Date.now() - it.at < 8000;
        const whoLabel = me ? (S.name || 'You') : it.who;
        return `
          <article class="feed-item ${me ? 'me' : ''} ${fresh ? 'just' : ''}" data-id="${it.id}">
            <button class="avatar" style="background:${grad}" data-who="${esc(it.who)}" aria-label="View ${esc(whoLabel)}'s profile">${emo}</button>
            <div class="feed-body">
              <div class="feed-name" data-who="${esc(it.who)}" role="button" tabindex="0">${esc(whoLabel)} <span class="when">· ${relTime(it.at)}</span></div>
              <div class="feed-text">${it.text}</div>
              ${me ? '' : `<div class="feed-acts">
                <button class="act" data-act="nudge" data-id="${it.id}">${it.nudged ? '👋 nudged' : 'Send nudge 👋'}</button>
                <button class="act ${it.slaps ? 'done' : ''}" data-act="slap" data-id="${it.id}">👏 Slap back ${it.slaps ? it.slaps : ''}</button>
              </div>`}
            </div>
          </article>`;
      })
      .join('');
  }

  function renderBoard() {
    const dayAgo = Date.now() - 86400000;
    const recent = S.feed.filter((it) => it.at > dayAgo);
    const counts = {};
    recent.forEach((it) => { counts[it.who] = (counts[it.who] || 0) + 1; });

    const rows = FRIENDS.map((f) => ({
      name: f.name, emo: f.emo, grad: f.grad, n: (POD_BASE[f.name] || 0) + (counts[f.name] || 0)
    }));
    rows.push({
      name: 'You', emo: '😎', grad: accGrad('#22d3ee', '#a855f7'),
      n: (S.stats.tasksDoneToday || 0) + (counts['You'] || 0)
    });
    rows.sort((a, b) => b.n - a.n);
    const max = Math.max(1, rows[0].n);

    $('#podBoard').innerHTML = rows
      .map(
        (r) => `
        <div class="board-row ${r.name === 'You' ? 'me' : ''}" data-who="${esc(r.name)}" role="button" tabindex="0">
          <div class="avatar" style="width:30px;height:30px;font-size:.9rem;border-radius:10px;background:${r.grad};cursor:inherit">${r.emo}</div>
          <b class="text-xs w-14 shrink-0">${esc(r.name === 'You' ? displayName() : r.name)}</b>
          <div class="flex-1 h-2 rounded-full overflow-hidden" style="background:rgba(255,255,255,.07)">
            <i style="display:block;height:100%;width:${Math.round((r.n / max) * 100)}%;border-radius:999px;background:${r.grad}"></i>
          </div>
          <span class="text-[.7rem] font-bold text-white/55 w-5 text-right">${r.n}</span>
        </div>`
      )
      .join('');
  }

  function onFeedAction(e) {
    const who = e.target.closest('[data-who]');
    if (who) { openMember(who.dataset.who); return; }

    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const id = btn.dataset.id;
    const item = S.feed.find((x) => x.id === id);
    if (!item) return;
    const friend = FRIENDS.find((f) => f.name === item.who);
    buzz(12);

    if (btn.dataset.act === 'nudge') {
      if (item.nudged) { toast(`${item.who} already got one from you 👋`); return; }
      item.nudged = true;
      S.stats.nudges = (S.stats.nudges || 0) + 1;
      save();
      renderFeed();
      toast(`Nudge sent to ${item.who} 👋`);
      flyText('GO GO GO 👏', btn.getBoundingClientRect().left, btn.getBoundingClientRect().top - 6);
      setTimeout(() => {
        S.feed.unshift(feedItem(friend ? friend.name : item.who, 'says: "ok ok, doing it now 😤" — thanks for the slap', false));
        S.feed = S.feed.slice(0, 40);
        save();
        renderFeed();
      }, 2600);
    } else {
      item.slaps = (item.slaps || 0) + 1;
      save();
      renderFeed();
      flyText('👏', btn.getBoundingClientRect().left, btn.getBoundingClientRect().top - 6);
      if (item.slaps === 1) toast(`Slapped back ${item.who} — they felt that`);
    }
  }

  /* ---------------------------------------------------------
     8b. Avatar arena
     --------------------------------------------------------- */

  const arena = { busy: false };
  const FRIEND_POWER = { alex: 120, maya: 300, sam: 80, jo: 460, nia: 200 };
  const wait = (ms) => new Promise((r) => setTimeout(r, reduceMotion ? 0 : ms));

  function friendPower(f) {
    const base = FRIEND_POWER[f.id] || 140;
    const beaten = (S.arena.vs && S.arena.vs[f.id]) || 0;
    return base + beaten * 30;
  }
  function friendLvl(f) { return clamp(1 + Math.floor(friendPower(f) / 110), 1, 6); }
  function friendColour(f) {
    const all = (f.grad || '').match(/#[0-9a-f]{6}/ig) || ['#64748b', '#334155'];
    return { c1: all[0], c2: all[1] || all[0] };
  }
  function rivalOf(id) { return FRIENDS.find((f) => f.id === id) || null; }

  function arenaMaxHp(lvl) { return 70 + lvl * 14; }

  function renderArena() {
    if (!S.arena.vs || typeof S.arena.vs !== 'object') S.arena.vs = {};
    if (!S.arena.rival || !rivalOf(S.arena.rival)) S.arena.rival = FRIENDS[0].id;

    const row = $('#rivalRow');
    if (row) {
      row.innerHTML = FRIENDS.map((f) => {
        const on = f.id === S.arena.rival;
        const c = friendColour(f);
        const w = S.arena.vs[f.id] || 0;
        return `<button type="button" class="rival ${on ? 'on' : ''}" data-rival="${f.id}"
            role="radio" aria-checked="${on}" aria-label="Fight ${esc(f.name)}, level ${friendLvl(f)}">
          <span class="rival-av">${avatarSVG(friendLvl(f), { size: 44, c1: c.c1, c2: c.c2, alt: f.name + "'s avatar" })}</span>
          <b>${esc(f.name)}</b>
          <small>Lv ${friendLvl(f)}${w ? ` · ${w}W` : ''}</small>
        </button>`;
      }).join('');
    }

    const me = levelInfo(S.xp);
    const f = rivalOf(S.arena.rival);
    const arenaSize = (lvl, pct) => 54 + (clamp(lvl, 1, 6) - 1) * 7 + Math.round((pct || 0) * 7);
    const myEl = $('#avMe'), foeEl = $('#avFoe');
    if (myEl) myEl.innerHTML = avatarSVG(me.level, { size: arenaSize(me.level, me.pct), alt: displayName() + "'s avatar" });
    if (foeEl && f) {
      const c = friendColour(f);
      foeEl.innerHTML = avatarSVG(friendLvl(f), { size: arenaSize(friendLvl(f), 0.4), c1: c.c1, c2: c.c2, alt: f.name + "'s avatar" });
    }
    const mn = $('#avMeName'); if (mn) mn.textContent = displayName();
    const fn = $('#avFoeName'); if (fn && f) fn.textContent = f.name;
    const ml = $('#avMeLvl'); if (ml) ml.textContent = 'Lv ' + me.level + ' · ' + power() + ' pw';
    const fl = $('#avFoeLvl'); if (fl && f) fl.textContent = 'Lv ' + friendLvl(f) + ' · ' + friendPower(f) + ' pw';
    const rec = $('#arenaRecord');
    if (rec) {
      const w = S.arena.wins || 0, l = S.arena.losses || 0;
      rec.textContent = `${w} wins · ${l} losses${S.arena.streak ? ` · ${S.arena.streak} streak 🔥` : ''}`;
    }
    const hpM = $('#hpMe'), hpF = $('#hpFoe');
    if (hpM) { hpM.style.width = '100%'; hpM.classList.remove('low'); }
    if (hpF) { hpF.style.width = '100%'; hpF.classList.remove('low'); }
    const btn = $('#btnFight');
    if (btn) { btn.disabled = false; btn.textContent = '⚔ Fight ' + (f ? f.name : ''); }
    const ann = $('#arenaAnn'); if (ann) ann.textContent = '';
    const tip = $('#arenaTip');
    if (tip) tip.textContent = f
      ? `Lv ${friendLvl(f)} · power ${friendPower(f)}. Beat them to steal 30 of their points.`
      : 'Pick a rival.';
  }

  function floatDmg(sideSel, amount, crit) {
    const side = $(sideSel);
    if (!side) return;
    const s = document.createElement('span');
    s.className = 'dmg-float' + (crit ? ' crit' : '');
    s.textContent = (amount > 0 ? '-' : '+') + Math.abs(amount);
    side.appendChild(s);
    setTimeout(() => s.remove(), reduceMotion ? 0 : 900);
  }

  function shake(sideSel) {
    const side = $(sideSel);
    if (!side) return;
    side.classList.remove('shake');
    void side.offsetWidth;
    side.classList.add('shake');
  }

  function setAnn(text) { const a = $('#arenaAnn'); if (a) a.textContent = text; }

  function rollDmg(lvl) {
    const base = 14 + lvl * 5;
    const crit = Math.random() < 0.16;
    const v = base * (0.72 + Math.random() * 0.62) * (crit ? 1.9 : 1);
    return { d: Math.max(4, Math.round(v)), crit };
  }

  async function fight() {
    if (arena.busy) return;
    const f = rivalOf(S.arena.rival);
    if (!f) { toast('Pick a rival first'); return; }
    arena.busy = true;

    const btn = $('#btnFight');
    if (btn) { btn.disabled = true; btn.textContent = '⚔ fighting…'; }

    const meLvl = levelInfo(S.xp).level;
    const foeLvl = friendLvl(f);
    let myHp = arenaMaxHp(meLvl);
    let foeHp = arenaMaxHp(foeLvl);
    const myMax = myHp, foeMax = foeHp;

    const paintHp = () => {
      const a = $('#hpMe'), b = $('#hpFoe');
      if (a) { a.style.width = Math.round((myHp / myMax) * 100) + '%'; a.classList.toggle('low', myHp / myMax < 0.34); }
      if (b) { b.style.width = Math.round((foeHp / foeMax) * 100) + '%'; b.classList.toggle('low', foeHp / foeMax < 0.34); }
    };
    paintHp();

    const ann = $('#arenaAnn');
    if (ann) ann.textContent = '';
    await wait(160);
    setAnn(`you vs ${f.name}`);
    buzz([20, 60, 20]);
    await wait(560);

    let myTurn = true, guard = 0;
    while (myHp > 0 && foeHp > 0 && guard++ < 40) {
      if (myTurn) {
        const { d, crit } = rollDmg(meLvl);
        foeHp = Math.max(0, foeHp - d);
        setAnn(crit ? `CRIT — you hit ${f.name} for ${d}!` : `you hit ${f.name} for ${d}`);
        floatDmg('.arena-side.foe', d, crit);
        shake('.arena-side.foe');
        buzz(crit ? 24 : 12);
        paintHp();
        if (foeHp > 0) { await wait(520); myTurn = false; }
      } else {
        const { d, crit } = rollDmg(foeLvl);
        myHp = Math.max(0, myHp - d);
        setAnn(crit ? `${f.name} CRITS you for ${d}!` : `${f.name} hits you for ${d}`);
        floatDmg('.arena-side.me', d, crit);
        shake('.arena-side.me');
        buzz(crit ? 18 : 9);
        paintHp();
        if (myHp > 0) { await wait(520); myTurn = true; }
      }
      await wait(90);
    }

    const won = foeHp <= 0 && myHp > 0;
    await wait(220);

    if (won) {
      S.arena.wins = (S.arena.wins || 0) + 1;
      S.arena.streak = (S.arena.streak || 0) + 1;
      S.arena.vs[f.id] = (S.arena.vs[f.id] || 0) + 1;
      const gain = 40 + foeLvl * 20;
      setAnn(`you flattened ${f.name} 🏆 +${gain} XP`);
      addXP(gain);
      buzz([24, 50, 24, 50, 40]);
      burst(1.1);
      pushFeed(feedItem('You', `beat <b>${esc(f.name)}</b> in the arena 🏆`, true));
      toast(`Arena win · +${gain} XP · ${f.name} is fuming`);
    } else {
      S.arena.losses = (S.arena.losses || 0) + 1;
      S.arena.streak = 0;
      setAnn(`${f.name} got you this time · +10 XP`);
      addXP(10);
      buzz(14);
      pushFeed(feedItem(f.name, `beat <b>you</b> in the arena 😤`, false));
      toast(`You lost to ${f.name} · +10 XP for showing up`);
    }
    save();
    renderRewards();
    renderArena();
    renderCounters();
    arena.busy = false;
  }

  /* ---------------------------------------------------------
     9. Pomodoro timer
     --------------------------------------------------------- */

  const RING_LEN = 2 * Math.PI * 104;
  const POMO_CYCLE = 4;

  function phaseLen(phase) {
    const p = phase || S.pomo.phase || 'work';
    if (p === 'short') return Math.max(1, S.pomo.shortMin || 5) * 60;
    if (p === 'long') return Math.max(1, (S.pomo.shortMin || 5) * 3) * 60;
    return Math.max(1, (S.settings.focusMins || 15)) * 60;
  }

  const PHASE_META = {
    work:  { btn: 'Start focus', running: 'stay locked in', idle: 'focus block ready' },
    short: { btn: 'Start break', running: 'go stretch', idle: '5 on the couch' },
    long:  { btn: 'Start break', running: 'proper rest now', idle: 'long break waiting' }
  };

  const timer = {
    running: false,
    tickId: null,

    get len() { return S.timer.len; },
    get remain() {
      if (this.running && S.timer.endAt) return Math.max(0, (S.timer.endAt - Date.now()) / 1000);
      return S.timer.remain;
    },

    setPhase(phase) {
      const p = PHASE_META[phase] ? phase : 'work';
      S.pomo.phase = p;
      S.timer.len = phaseLen(p);
      S.timer.remain = S.timer.len;
      S.timer.endAt = null;
      save();
      paint();
      renderPomo();
    },

    setLen(mins) {
      if (this.running) this.pause();
      S.settings.focusMins = mins;
      if (S.pomo.phase === 'work') {
        S.timer.len = mins * 60;
        S.timer.remain = mins * 60;
        S.timer.endAt = null;
      }
      save();
      paint();
    },

    start() {
      if (this.running) return;
      if (this.remain <= 0) S.timer.remain = S.timer.len;
      S.timer.endAt = Date.now() + S.timer.remain * 1000;
      this.running = true;
      buzz([18, 40, 18]);
      announce(PHASE_META[S.pomo.phase].btn + ' started');
      save();
      paint();
      this.startTicking();
    },

    pause() {
      if (!this.running) return;
      S.timer.remain = this.remain;
      S.timer.endAt = null;
      this.running = false;
      stopTick();
      save();
      paint();
    },

    reset() {
      this.running = false;
      stopTick();
      S.timer.remain = S.timer.len;
      S.timer.endAt = null;
      save();
      paint();
    },

    skip() {
      const from = S.pomo.phase;
      this.running = false;
      stopTick();
      S.timer.endAt = null;
      advancePhase(from, { skip: true });
    },

    complete() { timerComplete(); },

    startTicking() {
      stopTick();
      this.tickId = setInterval(() => {
        if (this.remain <= 0) this.complete();
        else paint();
      }, 250);
    }
  };

  function stopTick() {
    if (timer.tickId) clearInterval(timer.tickId);
    timer.tickId = null;
  }

  function paint() {
    const remain = timer.remain;
    const total = S.timer.len || 1;
    const pct = clamp(remain / total, 0, 1);
    $('#ring').style.strokeDasharray = String(RING_LEN);
    $('#ring').style.strokeDashoffset = String(RING_LEN * (1 - pct));
    $('#timeText').textContent = mmss(remain);
    $('#dial').classList.toggle('running', timer.running);
    $('#dial').dataset.phase = S.pomo.phase;
    const meta = PHASE_META[S.pomo.phase];
    $('#startLabel').textContent = timer.running ? 'Pause' : remain < total ? 'Resume' : meta.btn;
    $('#modeText').textContent = timer.running
      ? meta.running
      : remain < total
        ? 'paused — no guilt'
        : meta.idle;
  }

  function advancePhase(from, opts) {
    opts = opts || {};
    const pomo = S.pomo;
    let reachedLong = false;

    if (from === 'work') {
      if (!opts.skip) {
        reachedLong = pomo.round + 1 >= POMO_CYCLE;
        pomo.round = reachedLong ? 0 : pomo.round + 1;
        completeFocusBlock(opts.mins || 0);
      }
      pomo.phase = reachedLong ? 'long' : 'short';
    } else {
      pomo.phase = 'work';
    }

    S.timer.len = phaseLen(pomo.phase);
    S.timer.remain = S.timer.len;
    save();
    paint();
    renderPomo();
    renderSessionLog();

    if (!opts.skip) chime(from === 'work' ? 'break' : 'work');

    if (pomo.auto) {
      setTimeout(() => { if (!timer.running && S.pomo.phase === pomo.phase) timer.start(); }, opts.skip ? 250 : 900);
    }
  }

  function timerComplete() {
    const from = S.pomo.phase;
    const mins = Math.max(1, Math.round(S.timer.len / 60));
    timer.running = false;
    stopTick();
    S.timer.endAt = null;

    if (from === 'work') {
      logSession('focus', mins);
      buzz([40, 60, 40, 60, 90]);
      advancePhase(from, { mins });
      const task = S.tasks.find((t) => t.id === S.focusTaskId);
      if (task) pushFeed(feedItem('You', `finished a ${mins}m focus block on <b>${esc(task.title)}</b> ⏱️`, true));
      else pushFeed(feedItem('You', `finished a ${mins}m focus block ⏱️`, true));
      renderAll();
      openHype('session', `${mins}m focus session`);
    } else {
      logSession(from, mins);
      buzz([24, 40, 24]);
      advancePhase(from);
      toast(from === 'long' ? 'Long break done — round one, let us go ⚡' : 'Break over — back on it 🔥');
      announce('Break finished, focus is ready');
    }
  }

  function completeFocusBlock(mins) {
    S.stats.focusSessions = (S.stats.focusSessions || 0) + 1;
    S.stats.focusMinutes = (S.stats.focusMinutes || 0) + (mins || Math.max(1, Math.round(S.timer.len / 60)));
    addXP(40);
    touchStreak();
  }

  function logSession(kind, mins) {
    S.sessions.unshift({
      id: uid(), kind, mins, at: Date.now(),
      title: kind === 'focus'
        ? (S.tasks.find((t) => t.id === S.focusTaskId) || {}).title || 'Untimed focus'
        : (kind === 'long' ? 'Long break' : 'Short break')
    });
    S.sessions = S.sessions.slice(0, 60);
  }

  function chime(kind) {
    if (!S.pomo.chime || reduceMotion) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = chime.ctx || (chime.ctx = new Ctx());
      if (ctx.state === 'suspended') ctx.resume();
      const now = ctx.currentTime;
      (kind === 'break' ? [523.25, 659.25] : [659.25, 523.25]).forEach((f, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, now + i * 0.16);
        g.gain.exponentialRampToValueAtTime(0.14, now + i * 0.16 + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.16 + 0.5);
        o.connect(g).connect(ctx.destination);
        o.start(now + i * 0.16); o.stop(now + i * 0.16 + 0.55);
      });
    } catch (err) { /* audio blocked */ }
  }

  function renderPomo() {
    const round = S.pomo.round || 0;
    const onWork = S.pomo.phase === 'work';
    $('#pomoPips').innerHTML = Array.from({ length: POMO_CYCLE }, (_, i) => {
      const filled = i < round || (!onWork && i <= round && S.pomo.phase === 'long');
      return `<i class="${filled ? 'on' : ''} ${onWork && i === round ? 'now' : ''}"></i>`;
    }).join('');
    $('#pomoPips').setAttribute('aria-label', `Pomodoro ${Math.min(round + 1, POMO_CYCLE)} of ${POMO_CYCLE}`);

    $$('#phaseSeg button').forEach((b) => {
      const on = b.dataset.phase === S.pomo.phase;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });

    const auto = $('#swAuto'), ch = $('#swChime');
    if (auto) { auto.classList.toggle('on', !!S.pomo.auto); auto.setAttribute('aria-checked', String(!!S.pomo.auto)); }
    if (ch) { ch.classList.toggle('on', !!S.pomo.chime); ch.setAttribute('aria-checked', String(!!S.pomo.chime)); }

    $$('#brkSeg button').forEach((b) => b.classList.toggle('on', Number(b.dataset.brk) === (S.pomo.shortMin || 5)));
  }

  function renderPark() {
    const list = $('#parkList');
    if (!list) return;
    if (!S.park.length) {
      list.innerHTML = '<p class="park-empty">Nothing parked. A wandering thought? Drop it here and keep going.</p>';
      return;
    }
    list.innerHTML = S.park.map((p) => `
      <div class="park-item" data-park="${p.id}">
        <span class="min-w-0">${esc(p.text)}</span>
        <button type="button" class="park-x" data-park-x="${p.id}" aria-label="Remove ${esc(p.text)}">×</button>
      </div>`).join('');
  }

  function renderSessionLog() {
    const el = $('#sessionLog');
    if (!el) return;
    const today = dayKey();
    const todays = S.sessions.filter((s) => dayKey(new Date(s.at)) === today);
    const focusN = todays.filter((s) => s.kind === 'focus').length;
    const brkN = todays.filter((s) => s.kind !== 'focus').length;
    const mins = todays.filter((s) => s.kind === 'focus').reduce((n, s) => n + s.mins, 0);
    const lbl = $('#pomoToday');
    if (lbl) lbl.textContent = `${focusN} focus · ${brkN} break · ${mins}m`;

    if (!todays.length) {
      el.innerHTML = '<div class="empty"><i>⏱️</i><p>No sessions yet today</p><small>Finish a focus block and it lands here.</small></div>';
      return;
    }
    const emo = { focus: '🎯', short: '☕', long: '🛋️' };
    el.innerHTML = todays.slice(0, 8).map((s) => `
      <div class="session-row">
        <i>${emo[s.kind] || '⏱️'}</i>
        <span class="min-w-0"><b>${esc(s.title)}</b><small>${relTime(s.at)}</small></span>
        <em>${s.mins}m</em>
      </div>`).join('');
  }


  /* ---------------------------------------------------------
     9b. Study desk
     --------------------------------------------------------- */

  const SUBJECTS = [
    { id: 'math',    label: 'Maths',      emo: '📐' },
    { id: 'science', label: 'Science',    emo: '🔬' },
    { id: 'history', label: 'History',    emo: '🏛️' },
    { id: 'english', label: 'English',    emo: '📖' },
    { id: 'geo',     label: 'Geography',  emo: '🌍' },
    { id: 'code',    label: 'Code',       emo: '💻' },
    { id: 'art',     label: 'Art',        emo: '🎨' },
    { id: 'music',   label: 'Music',      emo: '🎵' },
    { id: 'sport',   label: 'Sport',      emo: '🏅' },
    { id: 'admin',   label: 'Life admin', emo: '🧾' },
    { id: 'work',    label: 'Work',       emo: '💼' },
    { id: 'other',   label: 'Unsorted',   emo: '📦' }
  ];

  const SUBJECT_RE = {
    math:    /\b(math|maths|algebra|geometry|calculus|trigonometry|quadratic|equations?|fractions?|matrix|matrices|statistics?|probabilit(y|ies)|arithmetic|derivatives?|integral|formulas?|percentages?|percents?|graphs?|numbers|angles?|polygon|simultaneous)\b/gi,
    science: /\b(science|physics|chemistry|biology|atoms?|molecules?|experiments?|cells?|forces?|reactions?|enzymes?|photosynthesis|laborator(y|ies)|velocity|gravity|elements?|electrons?|organisms?|genetics|climate change)\b/gi,
    history: /\b(history|wars?|empires?|revolutions?|centur(y|ies)|medieval|treat(y|ies)|kings?|queens?|dynast(y|ies)|ancient|civilisations?|civilizations?|timelines?|battles?|feudal|renaissance)\b/gi,
    english: /\b(english|essays?|poems?|poetry|novels?|grammar|shakespeare|literature|theses|comprehension|vocabulary|spelling|metaphors?|prose|reading|comprehend)\b/gi,
    geo:     /\b(geograph(y|ies)|climates?|rivers?|mountains?|continents?|oceans?|capitals?|countries?|populations?|volcanoes?|latitudes?|borders?|biomes?|landscapes?|equator|deserts?)\b/gi,
    code:    /\b(code|coding|programming|python|javascript|typescript|react|css|html|sql|git|repos?|deploys?|algorithms?|frontends?|backends?|compilers?|debug|variables?|functions?|bugs?|logins?|apis?|websites?|apps?|servers?|databases?|loops?|classes?)\b/gi,
    art:     /\b(art|draw|drawing|paint|painting|sketch|design|designs|illustrat\w*|photoshop|canva|posters?|sculpt\w*|animation|typography|colour|palette)\b/gi,
    music:   /\b(music|piano|guitar|drums?|singing|orchestra|chords?|melod(y|ies)|instruments?|violin|trumpet|bands?|harmony|tempo|scales?|lyrics?)\b/gi,
    sport:   /\b(sports?|gym|football|basketball|tennis|running|swim|swimming|workouts?|training|matches?|coachs?|fitness|yoga|cricket|rugby|hockey|athletics|sprints?|laps?)\b/gi,
    admin:   /\b(chores?|laundry|dishes|cleaning|tidy|tidying|vacuum\w*|shopping|groceries|appointments?|dentists?|doctors?|bills?|insurance|passports?|errands?|bins?|trash|garbage|rooms?|organis\w*|organiz\w*|budget\w*)\b/gi,
    work:    /\b(work|meetings?|clients?|bosses|invoices?|emails?|deadlines?|shifts?|offices?|colleagues?|quarterly|standups?|presentations?|resumes?|cv|internships?)\b/gi
  };

  const subjectMeta = (id) => SUBJECTS.find((s) => s.id === id) || SUBJECTS[SUBJECTS.length - 1];

  /** Highest keyword score wins; first-listed subject breaks ties. */
  function classify(text) {
    const src = String(text || '');
    let best = 'other', top = 0;
    for (const s of SUBJECTS) {
      const re = SUBJECT_RE[s.id];
      if (!re) continue;
      re.lastIndex = 0; // FIX: shared /g regexes leak lastIndex between calls
      const hits = src.match(re);
      const n = hits ? hits.length : 0;
      if (n > top) { top = n; best = s.id; }
    }
    return best;
  }

  const subjectTag = (id) => {
    const m = subjectMeta(id);
    return `<span class="tag tag-sub" title="Filed under ${m.label} — change it in Study">${m.emo} ${m.label}</span>`;
  };

  function autoSort(btn) {
    const targets = S.tasks.filter((t) => !t.subject);
    if (!targets.length) {
      toast('Everything is already filed 🗂️');
      buzz(8);
      renderSubjectBoard();
      return;
    }
    const tally = {};
    targets.forEach((t) => {
      t.subject = classify(t.title);
      tally[t.subject] = (tally[t.subject] || 0) + 1;
    });
    S.stats.sorts = (S.stats.sorts || 0) + 1;
    save();
    if (btn) { btn.disabled = true; btn.textContent = '🧩 sorting…'; }
    setTimeout(() => {
      if (btn) { btn.disabled = false; btn.textContent = '🧩 Sort my list into subjects'; }
      renderTasks();
      renderSubjectChips();
      renderSubjectBoard();
      addXP(10);
      save();
      burst(0.7);
      buzz([12, 24, 12]);
      const n = Object.keys(tally).length;
      toast(`Filed ${targets.length} task${targets.length === 1 ? '' : 's'} into ${n} subject${n === 1 ? '' : 's'}`);
      announce('Task list sorted into subjects.');
    }, 450);
  }

  function renderSubjectChips() {
    const el = $('#subjectChips');
    if (!el) return;
    const tally = {};
    S.tasks.forEach((t) => { const id = t.subject || 'other'; tally[id] = (tally[id] || 0) + 1; });
    const used = SUBJECTS.filter((s) => tally[s.id]);
    el.innerHTML = used.length
      ? used.map((s) => `<span class="schip"><i>${s.emo}</i>${s.label}<b>${tally[s.id]}</b></span>`).join('')
      : '<p class="park-empty">Nothing to file yet — add a task first.</p>';
  }

  function renderSubjectBoard() {
    const el = $('#subjectBoard');
    if (!el) return;
    const groups = {};
    S.tasks.forEach((t) => { const id = t.subject || 'other'; (groups[id] = groups[id] || []).push(t); });
    const used = SUBJECTS.filter((s) => groups[s.id]);
    if (!used.length) {
      el.innerHTML = '<p class="park-empty">Your list is empty. Add a task and auto-sort will file it.</p>';
      return;
    }
    el.innerHTML = used.map((s) => {
      const rows = groups[s.id].map((t) => `
        <div class="subj-task">
          <span class="min-w-0 ${t.done ? 'is-done' : ''}">${esc(t.title)}</span>
          <select data-subj-for="${t.id}" aria-label="Change subject for ${esc(t.title)}">
            ${SUBJECTS.map((o) => `<option value="${o.id}" ${o.id === s.id ? 'selected' : ''}>${o.emo} ${o.label}</option>`).join('')}
          </select>
        </div>`).join('');
      return `<div class="subj-group"><h4><i>${s.emo}</i>${s.label}<b>${groups[s.id].length}</b></h4>${rows}</div>`;
    }).join('');
  }

  function noteChips() {
    const el = $('#noteChips');
    if (!el) return;
    if (!S.notes.length) { el.innerHTML = '<p class="park-empty">No notes yet.</p>'; return; }
    const tally = {};
    S.notes.forEach((n) => { tally[n.subject] = (tally[n.subject] || 0) + 1; });
    const cur = S.study.noteSubject;
    el.innerHTML = [`<button type="button" class="schip ${cur === 'all' ? 'on' : ''}" data-note-chip="all">🗂 all <b>${S.notes.length}</b></button>`]
      .concat(SUBJECTS.filter((s) => tally[s.id]).map((s) =>
        `<button type="button" class="schip ${cur === s.id ? 'on' : ''}" data-note-chip="${s.id}">${s.emo} ${s.label} <b>${tally[s.id]}</b></button>`
      )).join('');
  }

  function renderNotes() {
    noteChips();
    const el = $('#noteList');
    if (!el) return;
    if (!S.notes.length) {
      el.innerHTML = '<div class="empty"><i>📝</i><p>No notes yet</p><small>Capture the thing you keep forgetting. It files itself.</small></div>';
      return;
    }
    const cur = S.study.noteSubject;
    const pool = S.notes.filter((n) => cur === 'all' || n.subject === cur);
    if (!pool.length) {
      el.innerHTML = '<div class="empty"><i>🗂</i><p>Nothing filed here yet</p><small>Pick another subject, or save a note.</small></div>';
      return;
    }

    const one = (n) => `
      <article class="note ${n.open ? 'open' : ''} ${n.pin ? 'pinned' : ''}" data-note="${n.id}">
        <button type="button" class="note-main" data-note-open="${n.id}">
          <span class="note-head">${subjectTag(n.subject)}${n.pin ? '<span class="note-pin">📌 pinned</span>' : ''}</span>
          <b>${esc(n.title)}</b>
          <span class="note-body">${esc(n.body || '—')}</span>
          <small>${relTime(n.at)}</small>
        </button>
        <span class="note-acts">
          <button type="button" class="park-x" data-note-pin="${n.id}" aria-label="${n.pin ? 'Unpin' : 'Pin'} ${esc(n.title)}">📌</button>
          <button type="button" class="park-x" data-note-del="${n.id}" aria-label="Delete ${esc(n.title)}">×</button>
        </span>
      </article>`;

    if (cur !== 'all') {
      el.innerHTML = pool.slice().sort((a, b) => (b.pin - a.pin) || (b.at - a.at)).map(one).join('');
      return;
    }

    const byAt = (a, b) => (b.at - a.at);
    const pinned = pool.filter((n) => n.pin).sort(byAt);
    const rest = pool.filter((n) => !n.pin);
    const head = pinned.length
      ? `<div class="note-group"><h4><i>📌</i>Pinned<b>${pinned.length}</b></h4>${pinned.map(one).join('')}</div>`
      : '';
    el.innerHTML = head + SUBJECTS.map((s) => {
      const g = rest.filter((n) => n.subject === s.id).sort(byAt);
      if (!g.length) return '';
      return `<div class="note-group"><h4><i>${s.emo}</i>${s.label}<b>${g.length}</b></h4>${g.map(one).join('')}</div>`;
    }).join('');
  }

  function addNote() {
    const title = $('#noteTitle').value.replace(/\s+/g, ' ').trim().slice(0, 70);
    const body = $('#noteBody').value.trim().slice(0, 700);
    const pick0 = $('#noteSubject').value;
    if (!title) { toast('Give the note a title first ✍️'); buzz(8); return false; }
    const subject = pick0 === 'auto' ? classify(title + ' ' + body) : pick0;
    S.notes.unshift({ id: uid(), title, body, subject, at: Date.now(), pin: false, open: false });
    S.notes = S.notes.slice(0, 200);
    S.stats.notes = (S.stats.notes || 0) + 1;
    save();
    $('#noteTitle').value = '';
    $('#noteBody').value = '';
    $('#noteSubject').value = 'auto';
    $('#noteGuess').textContent = '';
    if (S.study.noteSubject !== 'all' && S.study.noteSubject !== subject) S.study.noteSubject = 'all';
    renderNotes();
    renderCounters();
    addXP(10);
    buzz(10);
    const m = subjectMeta(subject);
    toast(pick0 === 'auto' ? `Saved and filed under ${m.emo} ${m.label}` : 'Note saved 📝');
    announce('Note saved.');
    return true;
  }

  const CARD_IVL = [0, 1, 3, 7, 14];

  const cardDue = (c) => !c.seen || (c.due || 0) <= Date.now();
  const dueCount = (list) => list.filter(cardDue).length;

  function cardChips() {
    const el = $('#cardChips');
    if (!el) return;
    const tally = { all: S.cards.length };
    S.cards.forEach((c) => { tally[c.subject] = (tally[c.subject] || 0) + 1; });
    if (!tally.all) { el.innerHTML = '<p class="park-empty">No cards yet.</p>'; return; }
    const cur = S.study.cardSubject;
    el.innerHTML = [
      `<button type="button" class="schip ${cur === 'all' ? 'on' : ''}" data-card-chip="all">🗂 all <b>${tally.all}</b></button>`
    ].concat(SUBJECTS.filter((s) => tally[s.id]).map((s) =>
      `<button type="button" class="schip ${cur === s.id ? 'on' : ''}" data-card-chip="${s.id}">${s.emo} ${s.label} <b>${tally[s.id]}</b></button>`
    )).join('');
  }

  function renderCards() {
    cardChips();
    const btn = $('#btnReview'), hint = $('#dueHint');
    const scoped = S.cards.filter((c) => S.study.cardSubject === 'all' || c.subject === S.study.cardSubject);
    const due = dueCount(scoped);
    if (hint) hint.textContent = !S.cards.length
      ? 'No cards yet — add one above.'
      : `${due} due now · ${scoped.length} in this view`;
    if (btn) {
      btn.disabled = !scoped.length || review.on;
      btn.textContent = due ? `🧠 Review ${due} due card${due === 1 ? '' : 's'}` : `🧠 Review all ${scoped.length}`;
    }

    const el = $('#cardList');
    if (!el) return;
    if (!scoped.length) {
      el.innerHTML = '<div class="empty"><i>🃏</i><p>No cards yet</p><small>Front and back of one fact. That is a card.</small></div>';
      return;
    }
    el.innerHTML = scoped.slice().sort((a, b) => (b.at || 0) - (a.at || 0)).map((c) => {
      const m = subjectMeta(c.subject);
      const badge = !c.seen
        ? '<span class="due new">new</span>'
        : cardDue(c) ? '<span class="due">due</span>'
        : `<span class="due ok">${Math.max(1, Math.round(((c.due || 0) - Date.now()) / 86400000))}d</span>`;
      return `
        <article class="fcard ${c.flipped ? 'flipped' : ''}" data-card="${c.id}" tabindex="0" role="button"
                 aria-label="Memory card: ${esc(c.front)}. Activate to flip.">
          <div class="fcard-inner">
            <div class="fcard-face fcard-front">
              <span class="fcard-top">${m.emo} ${m.label}${badge}</span>
              <b>${esc(c.front)}</b>
              <small>tap to flip</small>
            </div>
            <div class="fcard-face fcard-back">
              <span class="fcard-top">answer</span>
              <b>${esc(c.back)}</b>
              <button type="button" class="park-x" data-card-del="${c.id}" aria-label="Delete card">×</button>
            </div>
          </div>
        </article>`;
    }).join('');
  }

  function addCard() {
    const front = $('#cardFront').value.replace(/\s+/g, ' ').trim().slice(0, 90);
    const back = $('#cardBack').value.replace(/\s+/g, ' ').trim().slice(0, 260);
    const picked = $('#cardSubject').value;
    if (!front || !back) { toast('A card needs a front and a back 🃏'); buzz(8); return false; }
    const subject = picked === 'auto' ? classify(front + ' ' + back) : picked;
    S.cards.unshift({ id: uid(), front, back, subject, at: Date.now(), box: 0, due: 0, seen: false, flipped: false });
    S.cards = S.cards.slice(0, 400);
    S.stats.cards = (S.stats.cards || 0) + 1;
    save();
    $('#cardFront').value = '';
    $('#cardBack').value = '';
    $('#cardSubject').value = 'auto';
    $('#cardGuess').textContent = '';
    if (S.study.cardSubject !== 'all' && S.study.cardSubject !== subject) S.study.cardSubject = 'all';
    renderCards();
    renderCounters();
    addXP(8);
    buzz(10);
    const m = subjectMeta(subject);
    toast(picked === 'auto' ? `Card saved · filed under ${m.emo} ${m.label}` : 'Card saved 🃏');
    announce('Memory card saved.');
    return true;
  }

  const review = { on: false, deck: [], i: 0, known: 0, again: 0, shown: false, done: false };

  function startReview() {
    const scoped = S.cards.filter((c) => S.study.cardSubject === 'all' || c.subject === S.study.cardSubject);
    const pool = scoped.filter(cardDue);
    const use = pool.length ? pool : scoped;
    if (!use.length) { toast('Add a card first 🃏'); return; }
    review.on = true;
    review.deck = use.slice().sort(() => Math.random() - 0.5);
    review.i = 0; review.known = 0; review.again = 0; review.shown = false; review.done = false;
    buzz([10, 20, 10]);
    renderReview();
    renderCards();
    announce('Review started.');
  }

  function stopReview() {
    if (review.on) save();
    review.on = false;
    review.deck = [];
    review.shown = false;
    const box = $('#reviewBox');
    if (box) { box.hidden = true; box.innerHTML = ''; }
    renderCards();
  }

  function renderReview() {
    const box = $('#reviewBox');
    if (!box) return;
    if (!review.on) { box.hidden = true; return; }
    box.hidden = false;

    if (review.i >= review.deck.length) {
      const total = review.known + review.again;
      const label = review.again ? `${review.known} got it · ${review.again} still shaky` : `all ${review.known} landed 🎯`;
      box.innerHTML = `
        <div class="rev-top"><span class="rev-prog">done</span>
          <button type="button" class="rev-x" data-rev="close" aria-label="Close review">×</button></div>
        <div class="rev-done">
          <i>🧠</i><b>${total} card${total === 1 ? '' : 's'} reviewed</b>
          <small>${label}</small>
          <button type="button" class="btn" data-rev="close">Back to cards</button>
        </div>`;
      finishReview(total);
      return;
    }

    const c = review.deck[review.i];
    const m = subjectMeta(c.subject);
    box.innerHTML = `
      <div class="rev-top">
        <span class="rev-prog">${review.i + 1} / ${review.deck.length}</span>
        <span class="rev-score">✓ ${review.known} · ✗ ${review.again}</span>
        <button type="button" class="rev-x" data-rev="quit" aria-label="Quit review">×</button>
      </div>
      <div class="rev-card ${review.shown ? 'flipped' : ''}" id="revCard" tabindex="0" role="button" aria-label="Card. Activate to flip.">
        <div class="rev-inner">
          <div class="rev-face rev-front">
            <span class="fcard-top">${m.emo} ${m.label}</span>
            <b>${esc(c.front)}</b>
            <small>${review.shown ? '' : 'tap or press show answer'}</small>
          </div>
          <div class="rev-face rev-back">
            <span class="fcard-top">answer</span>
            <b>${esc(c.back)}</b>
            <small>did you have it?</small>
          </div>
        </div>
      </div>
      <div class="rev-actions">
        ${review.shown
          ? `<button type="button" class="btn btn-ghost rev-no" data-rev="again">Again</button>
             <button type="button" class="btn rev-yes" data-rev="known">Got it</button>`
          : `<button type="button" class="btn" data-rev="show">Show answer</button>`}
      </div>`;
  }

  function gradeCard(again) {
    const c = review.deck[review.i];
    if (!c) return;
    if (again) {
      c.box = 0; c.due = 0; c.seen = true;
      review.again += 1;
      review.deck.push(c);
    } else {
      c.box = Math.min(CARD_IVL.length - 1, (c.box || 0) + 1);
      c.due = Date.now() + CARD_IVL[c.box] * 86400000;
      c.seen = true;
      review.known += 1;
    }
    review.i += 1;
    review.shown = false;
    buzz(again ? 10 : 14);
    renderReview();
  }

  function finishReview(total) {
    if (review.done) return;
    review.done = true;
    review.on = false;
    S.stats.reviews = (S.stats.reviews || 0) + 1;
    const gained = total ? 20 + Math.min(30, review.known * 3) : 0;
    save();
    setTimeout(() => {
      review.done = false;
      review.deck = [];
      if (gained) addXP(gained);
      touchStreak();
      pushFeed(feedItem('You', `crammed ${total} memory card${total === 1 ? '' : 's'} 🃏`, true));
      save();
      renderAll();
      burst(0.9);
      buzz([14, 26, 14]);
      toast(`Review done · +${gained} XP`);
      announce('Review complete.');
    }, 60);
  }

  function renderStudy() {
    const panel = S.study.panel === 'study' ? 'study' : 'timer';
    const t0 = $('#panel-timer'), t1 = $('#panel-study');
    if (!t0 || !t1) return;
    t0.classList.toggle('is-active', panel === 'timer');
    t1.classList.toggle('is-active', panel === 'study');
    $$('#focusSeg button').forEach((b) => b.classList.toggle('on', b.dataset.panel === panel));

    const v = S.study.sview === 'cards' ? 'cards' : 'notes';
    $('#notesPane').classList.toggle('is-active', v === 'notes');
    $('#cardsPane').classList.toggle('is-active', v === 'cards');
    $$('#studySeg button').forEach((b) => b.classList.toggle('on', b.dataset.sview === v));

    renderSubjectChips();
    renderSubjectBoard();
    renderNotes();
    renderCards();
  }

  function setGuess(inputSel, guessSel) {
    const el = $(guessSel);
    if (!el) return;
    const title = $(inputSel).value.trim();
    if (!title) { el.textContent = ''; return; }
    const m = subjectMeta(classify(title));
    el.textContent = `→ will file under ${m.emo} ${m.label}`;
  }

  function fillSubjectSelects() {
    ['#noteSubject', '#cardSubject'].forEach((sel) => {
      const el = $(sel);
      if (!el || el.dataset.filled) return;
      SUBJECTS.forEach((s) => {
        const o = document.createElement('option');
        o.value = s.id;
        o.textContent = `${s.emo} ${s.label}`;
        el.appendChild(o);
      });
      el.dataset.filled = '1';
    });
  }

  /* ---------------------------------------------------------
     10. Ambient sound engine
     --------------------------------------------------------- */

  const sound = {
    ctx: null, master: null, analyser: null, live: [], ticker: null, current: 'off',

    ensure() {
      if (!this.ctx) {
        const Ctor = window.AudioContext || window.webkitAudioContext;
        if (!Ctor) return null;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.5;
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 64;
        this.analyser.smoothingTimeConstant = 0.8;
        this.master.connect(this.analyser);
        this.analyser.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    },

    noiseBuffer(kind) {
      const ctx = this.ctx;
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      let last = 0, b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (kind === 'white') data[i] = w * 0.5;
        else if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; data[i] = last * 3.2; }
        else { b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0527; data[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2; }
      }
      return buf;
    },

    src(kind) {
      const s = this.ctx.createBufferSource();
      s.buffer = this.noiseBuffer(kind);
      s.loop = true;
      s.start();
      this.live.push({ stop: () => { try { s.stop(); } catch { } s.disconnect(); } });
      return s;
    },

    node(n) { this.live.push({ stop: () => { try { n.disconnect(); } catch { } } }); return n; },

    filter(type, freq, q) {
      const f = this.ctx.createBiquadFilter();
      f.type = type; f.frequency.value = freq; if (q) f.Q.value = q;
      return this.node(f);
    },

    gain(v) { const g = this.ctx.createGain(); g.gain.value = v; return this.node(g); },

    every(ms, fn) { const id = setInterval(fn, ms); this.live.push({ stop: () => clearInterval(id) }); },

    play(id) {
      this.stop();
      this.current = id;
      if (id === 'off') { S.settings.sound = 'off'; save(); renderSoundPills(); return; }
      const ctx = this.ensure();
      if (!ctx) { toast('Audio not supported here 🎧'); return; }
      S.settings.sound = id;
      save();

      if (id === 'rain') {
        const s = this.src('white');
        const hp = this.filter('highpass', 320);
        const lp = this.filter('lowpass', 1200);
        const g = this.gain(0.24);
        s.connect(hp).connect(lp).connect(g).connect(this.master);
      } else if (id === 'waves') {
        const s = this.src('brown');
        const lp = this.filter('lowpass', 600);
        const g = this.gain(0.18);
        const lfo = this.node(this.ctx.createOscillator());
        const lfoGain = this.gain(0.12);
        lfo.frequency.value = 0.08;
        lfo.connect(lfoGain).connect(g.gain);
        lfo.start();
        this.live.push({ stop: () => { try { lfo.stop(); } catch { } } });
        s.connect(lp).connect(g).connect(this.master);
      } else if (id === 'cafe') {
        const s = this.src('pink');
        const bp = this.filter('bandpass', 520, 0.7);
        const g = this.gain(0.28);
        s.connect(bp).connect(g).connect(this.master);
        this.every(1600, () => this.ping(1200 + Math.random() * 900, 0.04, 0.25));
      } else if (id === 'lofi') {
        const crackle = this.src('white');
        const hp = this.filter('highpass', 2600);
        const cg = this.gain(0.05);
        crackle.connect(hp).connect(cg).connect(this.master);

        const chords = [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65]];
        const bus = this.filter('lowpass', 1400, 0.6);
        const bg = this.gain(0.55);
        bus.connect(bg).connect(this.master);
        let i = Math.floor(Math.random() * chords.length);
        const bar = 2400;
        const playBar = () => {
          const chord = chords[i % chords.length];
          i += 1;
          chord.forEach((m, k) => this.pad(440 * Math.pow(2, (m - 69) / 12), k ? 0.04 : 0.055, bar / 1000, bus));
        };
        playBar();
        this.ticker = setInterval(playBar, bar);
      }
      renderSoundPills();
    },

    pad(freq, gain, dur, dest) {
      const now = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = freq;
      o.detune.value = (Math.random() - 0.5) * 8;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(gain, now + 0.4);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      o.connect(g).connect(dest);
      o.start(now);
      o.stop(now + dur + 0.1);
    },

    ping(freq, gain, dur) {
      const now = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(gain, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      o.connect(g).connect(this.master);
      o.start(now);
      o.stop(now + dur + 0.05);
    },

    stop() {
      if (this.ticker) { clearInterval(this.ticker); this.ticker = null; }
      this.live.forEach((n) => n.stop());
      this.live = [];
      this.current = 'off';
    }
  };

  function renderSoundPills() {
    $$('#soundRow .pill').forEach((b) => b.classList.toggle('on', b.dataset.sound === sound.current));
  }

  const viz = $('#viz');
  const vctx = viz && viz.getContext ? viz.getContext('2d') : null;
  const BARS = 28;

  function drawViz(t) {
    if (!vctx) return;
    const w = viz.width;
    const h = viz.height;
    vctx.clearRect(0, 0, w, h);
    const gap = 4;
    const bw = (w - gap * (BARS - 1)) / BARS;
    let data = null;
    if (sound.current !== 'off' && sound.analyser) {
      data = new Uint8Array(sound.analyser.frequencyBinCount);
      sound.analyser.getByteFrequencyData(data);
    }
    const cs = getComputedStyle(document.documentElement);
    const acc = [cs.getPropertyValue('--acc').trim() || '#a78bfa',
                 cs.getPropertyValue('--acc-2').trim() || '#7dd3fc',
                 cs.getPropertyValue('--acc-3').trim() || '#f0abfc'];
    for (let i = 0; i < BARS; i++) {
      let amp;
      if (data && data[i] !== undefined) {
        amp = clamp((data[i] / 255) * 1.5, 0.04, 1);
      } else {
        amp = 0.12 + 0.08 * Math.sin(t / 480 + i * 0.5);
      }
      const bh = Math.max(4, amp * (h - 16));
      const x = i * (bw + gap);
      const y = (h - bh) / 2;
      const g = vctx.createLinearGradient(0, y, 0, y + bh);
      g.addColorStop(0, acc[1]);
      g.addColorStop(0.5, acc[0]);
      g.addColorStop(1, acc[2]);
      vctx.fillStyle = g;
      vctx.globalAlpha = data ? 0.95 : 0.4;
      roundRect(vctx, x, y, bw, bh, 3);
      vctx.fill();
    }
    vctx.globalAlpha = 1;
    requestAnimationFrame(drawViz);
  }

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  /* ---------------------------------------------------------
     11. Quote carousel
     --------------------------------------------------------- */

  const QUOTES = [
    { t: 'You don\'t have to feel like it. You just have to start for 2 minutes.', b: 'the 2-minute rule' },
    { t: 'The hardest part of a task is the 30 seconds before you begin.', b: 'start ugly' },
    { t: 'Future you is watching. Make them proud for 15 minutes.', b: 'no excuses era' },
    { t: 'Discipline is just motivation that survived a bad day.', b: 'low-energy day protocol' },
    { t: 'Done is better than perfect. Slap it and move on.', b: 'ship it' },
    { t: 'You can\'t motivation-sandwich a nap into the afternoon. Pick one.', b: 'pick a lane' },
    { t: 'Tiny steps still move you. Big steps just scare you.', b: 'micro wins' },
    { t: 'Your room isn\'t going to clean itself. Your future self is begging.', b: 'be nice to future you' },
    { t: 'One task. Right now. That\'s the whole assignment.', b: 'single focus' },
    { t: 'Energy follows action, not the other way around.', b: 'move first' },
    { t: 'Procrastination is just excitement that forgot its direction.', b: 'redirect it' },
    { t: 'Nobody\'s coming to save you. But your pod is watching. Go.', b: 'accountability unlocked' }
  ];

  let quoteIndex = 0;
  let quoteTimer = null;

  function buildQuotes() {
    $('#quoteTrack').innerHTML = QUOTES.map(
      (q) => `<div class="quote-slide"><p>“${esc(q.t)}”</p><small>— ${esc(q.b)}</small></div>`
    ).join('');
    $('#quoteDots').innerHTML = QUOTES.map((_, i) => `<i class="${i === 0 ? 'on' : ''}"></i>`).join('');
    goQuote(0);
    startQuoteAuto();
  }

  function goQuote(i) {
    quoteIndex = (i + QUOTES.length) % QUOTES.length;
    $('#quoteTrack').style.transform = `translateX(-${quoteIndex * 100}%)`;
    $$('#quoteDots i').forEach((d, k) => d.classList.toggle('on', k === quoteIndex));
  }

  function startQuoteAuto() {
    clearInterval(quoteTimer);
    quoteTimer = setInterval(() => goQuote(quoteIndex + 1), 7000);
  }

  function initQuoteGestures() {
    const card = $('#quoteCard');
    let x0 = null, dx = 0;

    card.addEventListener('pointerdown', (e) => {
      x0 = e.clientX; dx = 0;
      card.setPointerCapture(e.pointerId);
      clearInterval(quoteTimer);
    });
    card.addEventListener('pointermove', (e) => {
      if (x0 === null) return;
      dx = e.clientX - x0;
      if (Math.abs(dx) < 4) return;
      const pct = -quoteIndex * 100 + (dx / card.clientWidth) * 100;
      $('#quoteTrack').style.transition = 'none';
      $('#quoteTrack').style.transform = `translateX(${pct}%)`;
    });
    const end = () => {
      if (x0 === null) return;
      const w = card.clientWidth || 1;
      if (dx < -w * 0.18) goQuote(quoteIndex + 1);
      else if (dx > w * 0.18) goQuote(quoteIndex - 1);
      else goQuote(quoteIndex);
      $('#quoteTrack').style.transition = '';
      x0 = null; dx = 0;
      startQuoteAuto();
    };
    card.addEventListener('pointerup', end);
    card.addEventListener('pointercancel', end);
  }

  /* ---------------------------------------------------------
     12. Tasks view
     --------------------------------------------------------- */

  const CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5 9.5 18 20 6.5"/></svg>';

  function addTask(title) {
    const clean = String(title).replace(/\s+/g, ' ').trim().slice(0, 90);
    if (!clean) return;
    S.tasks.push({ id: uid(), title: clean, done: false, doneAt: null, createdAt: Date.now(), steps: [], open: false, carried: false, subject: classify(clean) });
    save();
    renderTasks();
    renderFocusSelect();
    bumpCard($('#taskList').lastElementChild);
    buzz(10);
    toast('Added. now break it down ⚡');
  }

  function renderTasks() {
    const list = $('#taskList');
    if (!S.tasks.length) {
      list.innerHTML = `<div class="empty"><i>🪫</i><p>Nothing on the list</p><small>Add one thing above. Even the tiny ones count.</small></div>`;
      renderCounters();
      return;
    }

    list.innerHTML = S.tasks
      .map((t) => {
        const steps = (t.steps || [])
          .map(
            (s) => `<div class="step ${s.done ? 'done' : ''}" data-step="${s.id}" data-task="${t.id}" role="checkbox" tabindex="0" aria-checked="${s.done}">
              <span class="dot">${CHECK_SVG}</span>
              <span>${esc(s.title)}</span>
              <span class="mins">${s.mins || 2}m</span>
            </div>`
          )
          .join('');

        const hasSteps = (t.steps || []).length > 0;
        return `<div class="task-row" data-row="${t.id}">
          <div class="swipe-bg" aria-hidden="true">🗑 delete</div>
          <div class="swipe-track">
          <article class="task ${t.done ? 'done' : ''} ${t.carried ? 'carried' : ''}" data-task="${t.id}">
          <button class="tick" data-toggle="${t.id}" aria-label="${t.done ? 'Undo' : 'Complete'} ${esc(t.title)}" aria-pressed="${t.done}">${CHECK_SVG}</button>
          <div class="task-body">
            <p class="task-title m-0">${esc(t.title)}</p>
            <div class="task-meta">
              ${t.carried && !t.done ? '<span class="tag tag-carry">carried over</span>' : ''}
              ${t.subject ? subjectTag(t.subject) : ''}
              ${hasSteps ? `<span class="tag tag-steps">⚡ ${t.steps.filter((s) => s.done).length}/${t.steps.length} steps</span>` : ''}
              <button class="mini" data-break="${t.id}">${hasSteps ? (t.open ? 'hide steps' : `show ${t.steps.length} steps`) : '⚡ Break It Down'}</button>
              ${hasSteps ? '' : `<button class="mini" data-split="${t.id}">✂ split</button>`}
              <button class="mini" data-focus="${t.id}">🎯 focus</button>
              <button class="mini" data-del="${t.id}" aria-label="Delete ${esc(t.title)}">✕</button>
            </div>
            ${hasSteps ? `<div class="steps ${t.open ? 'open' : ''}" data-steps="${t.id}">${steps}</div>` : ''}
          </div>
        </article>
          </div>
        </div>`;
      })
      .join('');

    initTaskSwipe();
    renderCounters();
  }

  function initTaskSwipe() {
    if (reduceMotion) return;
    $$('#taskList .task-row').forEach((row) => {
      const track = row.querySelector('.swipe-track');
      let id = null, x0 = 0, dx = 0, moved = false;

      const reset = () => {
        row.classList.remove('dragging');
        track.style.transform = '';
        dx = 0;
      };

      row.addEventListener('pointerdown', (e) => {
        if (e.target.closest('button')) return;
        id = row.dataset.row;
        x0 = e.clientX;
        moved = false;
        row.setPointerCapture(e.pointerId);
      });

      row.addEventListener('pointermove', (e) => {
        if (id !== row.dataset.row) return;
        dx = e.clientX - x0;
        if (!moved && Math.abs(dx) > 8) { moved = true; row.classList.add('dragging'); }
        if (!moved) return;
        if (dx > 0) dx = dx * 0.15;
        track.style.transform = `translateX(${dx}px)`;
      });

      const end = () => {
        if (!moved) { reset(); return; }
        if (dx < -110) {
          buzz([16, 30, 16]);
          deleteTask(id);
        } else {
          reset();
        }
        id = null; moved = false;
      };

      row.addEventListener('pointerup', end);
      row.addEventListener('pointercancel', () => { reset(); id = null; moved = false; });
    });
  }

  function deleteTask(id) {
    const t = S.tasks.find((x) => x.id === id);
    S.tasks = S.tasks.filter((x) => x.id !== id);
    if (S.focusTaskId === id) S.focusTaskId = null;
    save();
    renderTasks();
    renderFocusSelect();
    renderCounters();
    if (t) toast(`Deleted "${t.title.slice(0, 24)}"`);
  }

  function renderCounters() {
    const total = S.tasks.length;
    const done = S.tasks.filter((t) => t.done).length;
    const info = levelInfo(S.xp);

    countUp($('#statStreak'), S.streak);
    countUp($('#statXp'), S.xp);
    $('#statDone').textContent = `${done}/${total}`;
    countUp($('#statMin'), S.stats.focusMinutes || 0, 'm');
    countUp($('#chipStreak').querySelector('[data-x]'), S.streak);
    countUp($('#chipXp').querySelector('[data-x]'), S.xp);
    $('#chipLevel').textContent = '🏆 LVL ' + info.level;
    $('#rankName').textContent = info.name;
    $('#xpToNext').textContent = info.maxed ? 'max level · absolute unit' : `${info.toNext} XP to ${info.nextName}`;
    $('#xpFill').style.width = Math.round(info.pct * 100) + '%';
    $('#listCount').textContent = total ? `· ${done} of ${total}` : '';
    $('#dayNum').textContent = Object.keys(S.days).length + 1;
    $('#greeting').textContent = greeting();
    $('#focusCount').textContent = S.stats.focusSessions || 0;
  }

  function greeting() {
    const who = S.name ? `, ${S.name}` : '';
    const h = new Date().getHours();
    if (S.tasks.every((t) => t.done) && S.tasks.length) return `list cleared${who}. unreal 🏆`;
    if (h < 5) return `still up${who}? small steps only 🌙`;
    if (h < 11) return `morning${who}. pick the easiest one ☀️`;
    if (h < 15) return `midday slump${who}? start with 2 minutes ⚡`;
    if (h < 19) return `evening push${who} — 25 min, go 🔥`;
    return `last chance today${who}. tiny and done 🌙`;
  }

  function renderEnergy() {
    $$('#energyRow button').forEach((b) => {
      const on = b.dataset.energy === S.energy;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }

  function suggestNext() {
    const open = S.tasks.filter((t) => !t.done);
    if (!open.length) {
      $('#upNextTitle').textContent = S.tasks.length ? 'List cleared 🏆' : 'Add something first';
      $('#upNextWhy').textContent = S.tasks.length
        ? 'Nothing left today. Genuinely, well done.'
        : 'Type a task below and I will pick the best one.';
      return;
    }

    const score = (t) => {
      let n = t.carried ? 1.5 : 0;
      n += 3 - Math.min(3, (t.title.trim().split(/\s+/).length) / 3);
      if ((t.steps || []).length && t.steps.every((s) => s.done)) n -= 2;
      return n;
    };

    const best = open.slice().sort((a, b) => score(b) - score(a))[0];
    $('#upNextTitle').textContent = best.title;

    const hrs = new Date().getHours();
    const timeWord = hrs < 11 ? 'morning' : hrs < 15 ? 'midday' : hrs < 19 ? 'evening' : 'night';
    const bits = [];
    if (best.carried) bits.push('carried over');
    bits.push(ENERGY[S.energy] ? ENERGY[S.energy].label : 'steady energy');
    bits.push(`${timeWord} pick`);
    $('#upNextWhy').textContent = 'Suggested · ' + bits.join(' · ');
    announce('Up next: ' + best.title);
  }

  function completeTask(task, node, xpBox) {
    task.done = true;
    task.doneAt = Date.now();
    task.carried = false;
    S.stats.tasksDone = (S.stats.tasksDone || 0) + 1;
    S.stats.tasksDoneToday = (S.stats.tasksDoneToday || 0) + 1;
    if (new Date().getHours() >= 23 || new Date().getHours() < 5) S.stats.nightOwl = true;

    if (xpBox) {
      const r = xpBox.getBoundingClientRect();
      flyText('+50 XP', r.left + r.width / 2, r.top - 4);
    }

    pushFeed(feedItem('You', `just slapped <b>${esc(task.title)}</b> 🔥`, true));
    touchStreak();
    addXP(50);
    bumpCard(node);
    save();

    const all = S.tasks.length > 0 && S.tasks.every((t) => t.done);
    renderAll();
    burst(1);
    buzz([14, 30, 14]);
    openHype(all ? 'all' : 'task', task.title);
  }

  function onTaskClick(e) {
    const del = e.target.closest('[data-del]');
    if (del) { deleteTask(del.dataset.del); return; }

    const spl = e.target.closest('[data-split]');
    if (spl) { runSplit(spl.dataset.split, spl); return; }

    const foc = e.target.closest('[data-focus]');
    if (foc) {
      S.focusTaskId = foc.dataset.focus;
      save();
      renderFocusSelect();
      go('focus');
      toast('Attached to the timer 🎯');
      return;
    }

    const brk = e.target.closest('[data-break]');
    if (brk) { runBreakdown(brk.dataset.break, brk); return; }

    const tog = e.target.closest('[data-toggle]');
    if (tog) {
      const task = S.tasks.find((x) => x.id === tog.dataset.toggle);
      if (!task) return;
      if (task.done) {
        task.done = false; task.doneAt = null;
        S.stats.tasksDone = Math.max(0, (S.stats.tasksDone || 0) - 1);
        save(); renderTasks();
      } else {
        completeTask(task, tog.closest('.task'), tog);
      }
      return;
    }

    const stepEl = e.target.closest('[data-step]');
    if (stepEl) { toggleStep(stepEl); return; }

    const title = e.target.closest('.task-title');
    if (title) {
      const card = title.closest('.task');
      const task = S.tasks.find((t) => t.id === card.dataset.task);
      if (task && (task.steps || []).length) {
        task.open = !task.open;
        save();
        renderTasks();
      }
    }
  }

  function onStepKey(e) {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    const stepEl = e.target.closest('[data-step]');
    if (!stepEl) return;
    e.preventDefault();
    toggleStep(stepEl);
  }

  function toggleStep(stepEl) {
    const task = S.tasks.find((t) => t.id === stepEl.dataset.task);
    if (!task) return;
    const step = (task.steps || []).find((s) => s.id === stepEl.dataset.step);
    if (!step) return;

    step.done = !step.done;
    buzz(step.done ? [12, 24, 12] : 8);

    if (!step.done) {
      S.stats.stepsDone = Math.max(0, (S.stats.stepsDone || 0) - 1);
      S.xp = Math.max(0, S.xp - 15);
      save();
      renderAll();
      return;
    }

    S.stats.stepsDone = (S.stats.stepsDone || 0) + 1;
    const allDone = task.steps.every((s) => s.done);
    const r = stepEl.getBoundingClientRect();
    flyText('+15 XP', r.left + r.width / 2, r.top - 2);
    touchStreak();
    addXP(15);
    save();
    renderAll();

    if (allDone && !task.done) {
      setTimeout(() => {
        const tick = $(`.task[data-task="${task.id}"] .tick`);
        completeTask(task, tick, tick);
      }, 240);
    } else {
      burst(0.55);
      openHype('step', step.title);
    }
  }

  function runBreakdown(taskId, btn) {
    const task = S.tasks.find((t) => t.id === taskId);
    if (!task) return;

    if (task.steps && task.steps.length) {
      task.open = !task.open;
      save();
      renderTasks();
      return;
    }

    btn.textContent = '⚡ thinking…';
    btn.disabled = true;
    const holder = btn.closest('.task-body') || btn.parentElement;
    const loading = document.createElement('div');
    loading.className = 'loading-lines';
    loading.innerHTML = '<i></i><i></i><i></i>';
    if (holder) holder.appendChild(loading);

    setTimeout(() => {
      task.steps = breakdown(task.title);
      task.open = true;
      S.stats.breakdowns = (S.stats.breakdowns || 0) + 1;
      save();
      if (loading.parentNode) loading.remove();
      renderTasks();
      renderFocusSelect();
      burst(0.6);
      buzz([10, 20, 10]);
      const node = $(`.task[data-task="${taskId}"]`);
      bumpCard(node);
      const freshBtn = $(`[data-break="${taskId}"]`);
      if (freshBtn) { freshBtn.classList.add('fresh'); setTimeout(() => freshBtn.classList.remove('fresh'), 700); }
      announce('Breakdown ready: three two minute steps.');
      toast('Done — split into 3 tiny moves');
    }, 850);
  }

  function runSplit(taskId, btn) {
    const idx = S.tasks.findIndex((t) => t.id === taskId);
    const task = S.tasks[idx];
    if (!task) return;

    const parts = splitCompound(task.title);
    if (!parts.length) {
      toast('One job only — break it down instead ⚡');
      buzz(8);
      return;
    }

    S.tasks.splice(idx, 1, ...parts);
    if (S.focusTaskId === taskId) S.focusTaskId = parts[0].id;
    save();
    renderTasks();
    renderFocusSelect();
    bumpCard($(`.task-row[data-row="${parts[0].id}"] .task`));
    burst(0.7);
    buzz([12, 24, 12]);
    toast(`Split into ${parts.length} smaller tasks ✂️`);
    announce(`Task split into ${parts.length} smaller tasks.`);
  }

  function renderFocusSelect() {
    const sel = $('#focusSelect');
    const opts = S.tasks.length
      ? S.tasks.map((t) => `<option value="${t.id}" ${t.id === S.focusTaskId ? 'selected' : ''}>${t.done ? '✓ ' : ''}${esc(t.title)}</option>`).join('')
      : '<option value="">nothing on the list yet</option>';
    sel.innerHTML = opts;

    const task = S.tasks.find((t) => t.id === S.focusTaskId);
    $('#focusTaskName').textContent = task ? task.title : 'Nothing selected';
    $('#focusTaskHint').textContent = task
      ? `${(task.steps || []).filter((s) => s.done).length}/${(task.steps || []).length} micro-steps done`
      : 'Pick something above, or tap 🎯 focus on a task.';

    const box = $('#focusSteps');
    if (!box) return;
    const steps = (task && task.steps) || [];
    if (!steps.length) {
      box.innerHTML = task
        ? '<button class="mini" type="button" data-break="' + task.id + '">⚡ Break It Down</button>'
        : '';
      return;
    }
    box.innerHTML = `<p class="set-lbl">Micro-steps</p>` + steps.map((s) => `
      <div class="step ${s.done ? 'done' : ''}" data-step="${s.id}" data-task="${task.id}" role="checkbox" tabindex="0" aria-checked="${s.done}">
        <span class="dot">${CHECK_SVG}</span>
        <span>${esc(s.title)}</span>
        <span class="mins">${s.mins || 2}m</span>
      </div>`).join('');
  }

  /* ---------------------------------------------------------
     13. Rewards view
     --------------------------------------------------------- */

  const seenBadges = new Set();

  function renderFighter() {
    const info = levelInfo(S.xp);
    const stage = $('#myAvatar');
    if (stage) stage.innerHTML = avatarSVG(info.level, { size: myAvatarSize(), alt: displayName() + "'s fighter" });
    const box = $('#myStage');
    if (box) {
      const s = myAvatarSize() + 34;
      box.style.width = s + 'px';
      box.style.height = s + 'px';
      box.classList.toggle('maxed', info.maxed);
    }
    const r = $('#ftrRank'); if (r) r.textContent = info.name;
    const p = $('#ftrPower'); if (p) p.textContent = power();
    const x = $('#ftrXpFill'); if (x) x.style.width = Math.round(info.pct * 100) + '%';
    const n = $('#ftrNext');
    if (n) n.textContent = info.maxed
      ? 'Maxed out. Your fighter is a menace.'
      : `${info.toNext} XP to Level ${info.level + 1} · ${info.nextName}`;

    const list = $('#fighterUnlocks');
    if (list) {
      list.innerHTML = AV_UNLOCKS.map((u) => {
        const on = info.level >= u.lv;
        return `<div class="unlock ${on ? 'on' : ''}">
          <i>${u.emo}</i>
          <span class="min-w-0"><b>Lv ${u.lv} · ${u.name}</b><small>${on ? 'unlocked' : `${RANKS[u.lv - 1] ? RANKS[u.lv - 1].at : 0} XP`}</small></span>
        </div>`;
      }).join('');
    }
  }

  function renderRewards() {
    renderFighter();
    const info = levelInfo(S.xp);
    $('#rwLevel').textContent = info.level;
    $('#rwRank').textContent = info.name;
    $('#rwXp').textContent = S.xp;
    $('#rwBest').textContent = S.bestStreak;
    $('#rwXpFill').style.width = Math.round(info.pct * 100) + '%';
    $('#rwNext').textContent = info.maxed
      ? 'Maxed out. Absolute unit.'
      : `${info.toNext} XP to Level ${info.level + 1} · ${info.nextName}`;

    const have = earned();
    seenBadges.forEach((id) => { if (!have.has(id)) seenBadges.delete(id); });
    $('#badgeGrid').innerHTML = BADGES.map((b) => {
      const on = have.has(b.id);
      const fresh = on && !seenBadges.has(b.id);
      if (on) seenBadges.add(b.id);
      return `<button class="badge ${on ? 'on' : 'locked'}${fresh ? ' unlocked' : ''}" data-badge="${b.id}" title="${esc(b.name)}">
        <i>${b.emo}</i><small>${esc(b.name)}</small>
      </button>`;
    }).join('');

    const strip = $('#streakStrip');
    const rows = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = dayKey(d);
      const on = !!S.days[key];
      const isToday = i === 0;
      rows.push(`<div class="day-dot ${on ? 'on' : ''} ${isToday ? 'today' : ''}">
        <i>${on ? '🔥' : '·'}</i>
        <small>${d.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 3)}</small>
      </div>`);
    }
    strip.innerHTML = rows.join('');

    const log = $('#hypeLog');
    if (!S.hypeLog.length) {
      log.innerHTML = '<div class="empty"><i>💬</i><p>No slaps yet</p><small>Finish a micro-step and a note lands here.</small></div>';
      return;
    }
    const emo = { hype: '🔥', witty: '😏', gentle: '🧸' };
    log.innerHTML = S.hypeLog
      .map(
        (h) => `<div class="hype-log-item">
          <div class="avatar" style="width:30px;height:30px;font-size:.95rem;border-radius:10px;background:${accGrad('#a855f7', '#ec4899')}">${emo[h.persona] || '🔥'}</div>
          <div class="min-w-0">
            <p>${esc(h.msg)}</p>
            <div class="what">${esc(h.what || '—')} · ${relTime(h.at)}</div>
          </div>
        </div>`
      )
      .join('');
  }

  /* ---------------------------------------------------------
     14. Navigation
     --------------------------------------------------------- */

  const SUBS = {
    tasks: "today's moves",
    focus: 'lock in',
    pods: 'they are watching',
    rewards: 'your receipts'
  };

  function movePill(btn) {
    const pill = $('#tabPill');
    const bar = $('#tabbar');
    if (!pill || !bar) return;
    const r = btn.getBoundingClientRect();
    const b = bar.getBoundingClientRect();
    if (!r.width) return;
    pill.style.width = r.width + 'px';
    pill.style.height = r.height + 'px';
    pill.style.transform = `translateX(${r.left - b.left}px)`;
    pill.classList.add('ready');
  }

  function go(tab) {
    $$('.view').forEach((v) => v.classList.toggle('is-active', v.id === 'view-' + tab));
    $$('.tab').forEach((b) => {
      const on = b.dataset.tab === tab;
      b.classList.toggle('on', on);
      if (on) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
      if (on) movePill(b);
    });
    $('#barSub').textContent = SUBS[tab] || '';
    if (tab === 'focus') { paint(); renderFocusSelect(); renderPomo(); renderSessionLog(); renderStudy(); }
    if (tab === 'pods') {
      S.feedUnread = 0;
      $('#podPip').hidden = true;
      renderFeed();
      renderBoard();
      renderArena();
    }
    if (tab === 'rewards') renderRewards();
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  /* ---------------------------------------------------------
     15. Settings sheet
     --------------------------------------------------------- */

  const memScrim = $('#memScrim');

  const MEMBER_BIOS = {
    Alex: 'Allergic to idle time. Has cleared 3 study sessions before 8am this week.',
    Maya: 'Micro-step machine. Claims any task fits inside 2 minutes if you frame it right.',
    Sam: 'Currently in a 9 day streak and will not shut up about it.',
    Jo: 'Study group enabler. Answers WhatsApp in 4 minutes, tops.',
    Nia: 'Night owl. Finishes the day at 1am and regrets nothing.'
  };

  function openMember(name) {
    const f = FRIENDS.find((x) => x.name === name);
    const mine = name === 'You';
    const dayAgo = Date.now() - 86400000;
    const acts = S.feed.filter((it) => it.who === name && it.at > dayAgo).length;
    const total = S.feed.filter((it) => it.who === name).length;
    const slaps = S.feed.reduce((n, it) => n + (it.who === name ? it.slaps || 0 : 0), 0);

    $('#memAvatar').textContent = mine ? '😎' : f ? f.emo : '👤';
    $('#memAvatar').style.background = mine
      ? accGrad('#22d3ee', '#a855f7')
      : f ? f.grad : 'linear-gradient(140deg,#64748b,#334155)';
    $('#memName').textContent = mine ? (S.name || 'You') : name;
    $('#memTag').textContent = 'Hustle Pod · 3AM Club';
    $('#memBio').textContent = mine
      ? 'Your own receipts. Every slap you have logged lands right here.'
      : MEMBER_BIOS[name] || 'Part of the 3AM Club. Keeps the feed warm.';

    $('#memStats').innerHTML = `
      <div><b>${acts}</b><small>today</small></div>
      <div><b>${total}</b><small>total</small></div>
      <div><b>${slaps}</b><small>slaps</small></div>`;

    memScrim.classList.add('open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => $('#btnMemClose').focus({ preventScroll: true }), 260);
  }

  function closeMember() {
    memScrim.classList.remove('open');
    if (!hypeScrim.classList.contains('open') && !setScrim.classList.contains('open')) {
      document.body.style.overflow = '';
    }
  }

  const setScrim = $('#setScrim');
  const PERSONAS = [
    { id: 'hype', emo: '🔥', name: 'Hype-Man', blurb: 'Pure hype & energy' },
    { id: 'witty', emo: '😏', name: 'Witty Coach', blurb: 'Sarcastic & clever' },
    { id: 'gentle', emo: '🧸', name: 'Gentle Mentor', blurb: 'Soft & zero pressure' }
  ];

  function renderPersonas() {
    $('#personaList').innerHTML = PERSONAS.map(
      (p) => `<button class="persona ${S.persona === p.id ? 'on' : ''}" data-persona="${p.id}">
        <span class="emo">${p.emo}</span>
        <span class="min-w-0"><b>${p.name}</b><small>${p.blurb}</small></span>
      </button>`
    ).join('');
  }

  function openSettings() {
    renderPersonas();
    syncSwitches();
    setScrim.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeSettings() {
    setScrim.classList.remove('open');
    if (!hypeScrim.classList.contains('open') && !memScrim.classList.contains('open')) {
      document.body.style.overflow = '';
    }
  }

  function syncSwitches() {
    const map = { swHaptics: 'haptics', swConfetti: 'confetti', swFeed: 'liveFeed' };
    Object.entries(map).forEach(([el, key]) => {
      const sw = $('#' + el);
      sw.classList.toggle('on', !!S.settings[key]);
      sw.setAttribute('aria-checked', String(!!S.settings[key]));
    });
  }

  function toggleSwitch(el, key, after) {
    S.settings[key] = !S.settings[key];
    syncSwitches();
    save();
    if (after) after();
  }

  /* ---------------------------------------------------------
     16. Wiring
     --------------------------------------------------------- */

  function renderAll() {
    renderCounters();
    renderTasks();
    renderFocusSelect();
    renderBoard();
    renderEnergy();
    renderFighter();
    renderArena();
    renderPomo();
    renderStudy();
    suggestNext();
  }

  function init() {
    load();
    rollover();
    applyAccent(S.accent);
    applyVibe(S.vibe);
    applyName(S.name);

    if (!S.seeded) {
      seedFeed();
      S.seeded = true;
      const starters = ['Clean my room', 'Finish history essay'];
      starters.forEach((t) => S.tasks.push({ id: uid(), title: t, done: false, doneAt: null, createdAt: Date.now(), steps: [], open: false, carried: false, subject: classify(t) }));
      save();
    }

    // Browsers block autoplay audio, so a saved "on" sound is stale on load.
    if (S.settings.sound !== 'off') { S.settings.sound = 'off'; save(); }

    // Restore an in-progress timer (the page may have been reloaded mid-session).
    S.timer.len = phaseLen(S.pomo.phase);
    if (S.timer.endAt && S.timer.endAt > Date.now()) {
      timer.running = true;
    } else if (S.timer.endAt && S.timer.endAt <= Date.now()) {
      // FIX: a block that finished while the page was closed counts.
      S.timer.endAt = null;
      timer.running = false;
      S.timer.remain = 0;
      setTimeout(() => timerComplete(), 400);
    } else {
      S.timer.endAt = null;
      // FIX: don't wipe a paused mid-session timer on reload.
      if (!S.timer.remain || S.timer.remain <= 0 || S.timer.remain > S.timer.len) S.timer.remain = S.timer.len;
    }
    $$('#lenSeg button').forEach((b) => b.classList.toggle('on', Number(b.dataset.min) === S.settings.focusMins));

    buildQuotes();
    initQuoteGestures();
    renderAll();
    renderFeed();
    paint();
    renderPomo();
    renderPark();
    renderSessionLog();
    renderSoundPills();
    fillSubjectSelects();
    renderStudy();
    renderPersonas();
    syncSwitches();
    startLiveFeed();
    if (timer.running) timer.startTicking();
    requestAnimationFrame(drawViz);

    setInterval(() => {
      if ($('#view-pods').classList.contains('is-active')) renderFeed();
    }, 30000);

    window.addEventListener('storage', (e) => {
      if (e.key !== KEY) return;
      load();
      rollover();
      // FIX: re-apply personalization, not just re-render.
      applyAccent(S.accent);
      applyVibe(S.vibe);
      applyUI();
      applyName(S.name);
      renderAll();
      renderFeed();
    });

    document.addEventListener('pointerdown', (e) => {
      const host = e.target.closest('.btn, .icon-btn, .mini, .tick, .act, .pill, .seg button, .energy button, .tab');
      if (host) ripple(host, e.clientX, e.clientY);
    });

    const firstTab = $('.tab.on');
    if (firstTab) setTimeout(() => movePill(firstTab), 60);
    window.addEventListener('resize', () => {
      const on = $('.tab.on');
      if (on) movePill(on);
    });

    $('#addForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $('#addInput');
      const v = input.value;
      input.value = '';
      addTask(v);
      input.blur();
    });
    $$('[data-quick]').forEach((b) =>
      b.addEventListener('click', () => {
        addTask(b.dataset.quick);
        buzz(10);
      })
    );

    $$('#energyRow button').forEach((b) =>
      b.addEventListener('click', () => {
        S.energy = b.dataset.energy;
        save();
        renderEnergy();
        suggestNext();
        buzz(10);
        toast(`Energy: ${ENERGY[S.energy].label} · ${ENERGY[S.energy].frame}`);
      })
    );

    const fireUpNext = () => {
      const open = S.tasks.filter((t) => !t.done);
      if (!open.length) { toast('Nothing on the list yet — add one below'); return; }
      const title = $('#upNextTitle').textContent;
      const match = open.find((t) => t.title === title);
      if (match) {
        S.focusTaskId = match.id;
        save();
        renderFocusSelect();
        go('focus');
        toast('Attached to the timer 🎯');
      }
    };
    $('#upnext').addEventListener('click', fireUpNext);
    $('#upnext').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fireUpNext(); }
    });
    $('#taskList').addEventListener('click', onTaskClick);
    $('#taskList').addEventListener('keydown', onStepKey);

    $('#btnStart').addEventListener('click', () => (timer.running ? timer.pause() : timer.start()));
    $('#btnReset').addEventListener('click', () => { timer.reset(); toast('Timer reset'); });
    $('#btnSkip').addEventListener('click', () => {
      const was = S.pomo.phase;
      timer.skip();
      toast(was === 'work' ? 'Skipped — no XP for a block you ducked' : 'Break skipped ⏭');
    });
    $$('#phaseSeg button').forEach((b) =>
      b.addEventListener('click', () => {
        if (timer.running) timer.pause();
        timer.setPhase(b.dataset.phase);
        buzz(8);
        const names = { work: 'Focus block', short: 'Short break', long: 'Long break' };
        toast(`${names[b.dataset.phase]} · ${mmss(S.timer.len)}`);
      })
    );
    $$('#brkSeg button').forEach((b) =>
      b.addEventListener('click', () => {
        S.pomo.shortMin = Number(b.dataset.brk);
        save();
        if (S.pomo.phase !== 'work') timer.setPhase(S.pomo.phase);
        else { paint(); renderPomo(); }
        toast(`Breaks set to ${b.dataset.brk}m`);
      })
    );
    const swapPomoSwitch = (el, key, label) => {
      el.addEventListener('click', () => {
        S.pomo[key] = !S.pomo[key];
        save();
        renderPomo();
        buzz(8);
        toast(`${label} ${S.pomo[key] ? 'on' : 'off'}`);
      });
      el.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); el.click(); }
      });
    };
    swapPomoSwitch($('#swAuto'), 'auto', 'Auto-start');
    swapPomoSwitch($('#swChime'), 'chime', 'Chime');

    $$('#lenSeg button').forEach((b) =>
      b.addEventListener('click', () => {
        $$('#lenSeg button').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
        timer.setLen(Number(b.dataset.min));
        toast(b.dataset.min + ' minute focus block queued ⚡');
      })
    );

    $('#focusSteps').addEventListener('click', (e) => {
      const step = e.target.closest('[data-step]');
      if (step) { toggleStep(step); return; }
      const brk = e.target.closest('[data-break]');
      if (brk) { runBreakdown(brk.dataset.break, brk); return; }
      const split = e.target.closest('[data-split]');
      if (split) runSplit(split.dataset.split, split);
    });
    $('#focusSteps').addEventListener('keydown', (e) => {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      const step = e.target.closest('[data-step]');
      if (step) { e.preventDefault(); toggleStep(step); }
    });

    $('#parkForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $('#parkInput');
      const text = (input.value || '').trim();
      if (!text) return;
      input.value = '';
      S.park.unshift({ id: uid(), text: text.slice(0, 70), at: Date.now() });
      S.park = S.park.slice(0, 40);
      save();
      renderPark();
      buzz(10);
      toast('Parked — it will be here after 🔖');
      if (timer.running) announce('Thought parked');
    });
    $('#parkList').addEventListener('click', (e) => {
      const x = e.target.closest('[data-park-x]');
      if (x) {
        S.park = S.park.filter((p) => p.id !== x.dataset.parkX);
        save();
        renderPark();
        return;
      }
      const item = e.target.closest('[data-park]');
      if (item) {
        const p = S.park.find((z) => z.id === item.dataset.park);
        item.classList.add('done');
        setTimeout(() => {
          S.park = S.park.filter((z) => z.id !== item.dataset.park);
          save();
          renderPark();
        }, 420);
        if (p) toast(`Done with "${p.text}"? Nice.`);
      }
    });

    $$('#soundRow .pill').forEach((b) =>
      b.addEventListener('click', () => {
        sound.play(b.dataset.sound);
        if (b.dataset.sound === 'off') toast('Ambient sound off 🤫');
      })
    );
    $('#focusSelect').addEventListener('change', (e) => {
      S.focusTaskId = e.target.value || null;
      save();
      renderFocusSelect();
    });

    $('#focusSeg').addEventListener('click', (e) => {
      const b = e.target.closest('[data-panel]');
      if (!b) return;
      S.study.panel = b.dataset.panel;
      save();
      buzz(8);
      renderStudy();
      if (b.dataset.panel === 'study') announce('Study desk open.');
    });

    $('#studySeg').addEventListener('click', (e) => {
      const b = e.target.closest('[data-sview]');
      if (!b) return;
      S.study.sview = b.dataset.sview;
      save();
      buzz(8);
      renderStudy();
    });

    $('#btnAutoSort').addEventListener('click', function () { autoSort(this); });

    $('#subjectBoard').addEventListener('change', (e) => {
      const sel = e.target.closest('[data-subj-for]');
      if (!sel) return;
      const t = S.tasks.find((x) => x.id === sel.dataset.subjFor);
      if (!t) return;
      t.subject = sel.value;
      save();
      renderTasks();
      renderSubjectChips();
      renderSubjectBoard();
      buzz(10);
      const m = subjectMeta(sel.value);
      toast(`Moved to ${m.emo} ${m.label}`);
    });

    $('#noteChips').addEventListener('click', (e) => {
      const b = e.target.closest('[data-note-chip]');
      if (!b) return;
      S.study.noteSubject = b.dataset.noteChip;
      save();
      buzz(8);
      renderNotes();
    });

    $('#noteForm').addEventListener('submit', (e) => { e.preventDefault(); addNote(); });
    $('#noteTitle').addEventListener('input', () => setGuess('#noteTitle', '#noteGuess'));
    $('#noteBody').addEventListener('input', () => setGuess('#noteTitle', '#noteGuess'));

    $('#noteList').addEventListener('click', (e) => {
      const pin = e.target.closest('[data-note-pin]');
      if (pin) {
        const n = S.notes.find((x) => x.id === pin.dataset.notePin);
        if (n) { n.pin = !n.pin; save(); renderNotes(); buzz(8); }
        return;
      }
      const del = e.target.closest('[data-note-del]');
      if (del) {
        S.notes = S.notes.filter((x) => x.id !== del.dataset.noteDel);
        save(); renderNotes(); buzz(10); toast('Note deleted');
        return;
      }
      const open = e.target.closest('[data-note-open]');
      if (open) {
        const n = S.notes.find((x) => x.id === open.dataset.noteOpen);
        if (n) { n.open = !n.open; save(); renderNotes(); buzz(8); }
      }
    });

    $('#cardChips').addEventListener('click', (e) => {
      const b = e.target.closest('[data-card-chip]');
      if (!b) return;
      S.study.cardSubject = b.dataset.cardChip;
      save();
      buzz(8);
      renderCards();
    });

    $('#cardForm').addEventListener('submit', (e) => { e.preventDefault(); addCard(); });
    $('#cardFront').addEventListener('input', () => setGuess('#cardFront', '#cardGuess'));
    $('#cardBack').addEventListener('input', () => setGuess('#cardFront', '#cardGuess'));

    $('#cardList').addEventListener('click', (e) => {
      const del = e.target.closest('[data-card-del]');
      if (del) {
        S.cards = S.cards.filter((x) => x.id !== del.dataset.cardDel);
        save(); renderCards(); buzz(10); toast('Card deleted');
        return;
      }
      const card = e.target.closest('[data-card]');
      if (card) {
        const c = S.cards.find((x) => x.id === card.dataset.card);
        if (c) { c.flipped = !c.flipped; save(); renderCards(); buzz(8); }
      }
    });
    $('#cardList').addEventListener('keydown', (e) => {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      const card = e.target.closest('[data-card]');
      if (card) { e.preventDefault(); card.click(); }
    });

    $('#btnReview').addEventListener('click', startReview);

    $('#reviewBox').addEventListener('click', (e) => {
      const b = e.target.closest('[data-rev]');
      if (b) {
        const act = b.dataset.rev;
        if (act === 'show') { review.shown = true; buzz(8); renderReview(); }
        else if (act === 'known') gradeCard(false);
        else if (act === 'again') gradeCard(true);
        else if (act === 'close') { stopReview(); buzz(8); }
        else if (act === 'quit') {
          const done = review.known + review.again;
          stopReview();
          toast(done ? `Stopped · ${done} card${done === 1 ? '' : 's'} marked` : 'Review stopped');
        }
        return;
      }
      if (e.target.closest('#revCard')) {
        review.shown = !review.shown;
        buzz(8);
        renderReview();
      }
    });
    $('#reviewBox').addEventListener('keydown', (e) => {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      if (e.target.closest('#revCard')) { e.preventDefault(); review.shown = !review.shown; renderReview(); }
    });

    $('#feedList').addEventListener('click', onFeedAction);
    $('#podBoard').addEventListener('click', onFeedAction);
    $('#podBoard').addEventListener('keydown', (e) => {
      const row = e.target.closest('[data-who]');
      if (row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openMember(row.dataset.who); }
    });
    $('#btnRefreshFeed').addEventListener('click', () => {
      pushFeed(mockEvent());
      buzz(8);
      toast('Pod pinged — new activity');
    });

    $('#rivalRow').addEventListener('click', (e) => {
      const b = e.target.closest('[data-rival]');
      if (!b || arena.busy) return;
      S.arena.rival = b.dataset.rival;
      save();
      renderArena();
      buzz(8);
      const f = rivalOf(S.arena.rival);
      if (f) toast(`${f.name} steps up · Lv ${friendLvl(f)}`);
    });
    $('#btnFight').addEventListener('click', () => { buzz(16); fight(); });

    $('#badgeGrid').addEventListener('click', (e) => {
      const b = e.target.closest('[data-badge]');
      if (!b) return;
      const badge = BADGES.find((x) => x.id === b.dataset.badge);
      if (!badge) return;
      toast(
        earned().has(badge.id)
          ? `${badge.emo} ${badge.name} — already in the bag`
          : `${badge.emo} ${badge.name}: ${BADGE_HINTS[badge.id] || 'keep going'}`
      );
      buzz(8);
    });

    $('#btnMemClose').addEventListener('click', closeMember);
    memScrim.addEventListener('click', (e) => { if (e.target === memScrim) closeMember(); });

    $('#tabbar').addEventListener('click', (e) => {
      const b = e.target.closest('[data-tab]');
      if (!b) return;
      buzz(8);
      go(b.dataset.tab);
    });

    $('#btnHypeClose').addEventListener('click', closeHype);
    $('#btnHypeAgain').addEventListener('click', () => openHype(lastSlap.kind, lastSlap.what));
    hypeScrim.addEventListener('click', (e) => { if (e.target === hypeScrim) closeHype(); });

    $('#btnSettings').addEventListener('click', openSettings);
    $('#btnSetClose').addEventListener('click', closeSettings);
    setScrim.addEventListener('click', (e) => { if (e.target === setScrim) closeSettings(); });
    $('#personaList').addEventListener('click', (e) => {
      const b = e.target.closest('[data-persona]');
      if (!b) return;
      S.persona = b.dataset.persona;
      save();
      renderPersonas();
      buzz([10, 18, 10]);
      const p = HYPE[S.persona];
      toast(`${p.emo} now coaching you`);
    });
    $('#nameForm').addEventListener('submit', (e) => {
      e.preventDefault();
      applyName($('#nameInput').value);
      save();
      renderFeed();
      renderBoard();
      buzz(14);
      toast(S.name ? `hey ${S.name} 👋` : 'name cleared');
    });
    $('#accentRow').addEventListener('click', (e) => {
      const b = e.target.closest('.swatch');
      if (!b) return;
      applyAccent(b.dataset.accent);
      save();
      buzz(12);
    });
    $('#vibeSeg').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      applyVibe(b.dataset.vibe);
      save();
      buzz(12);
    });
    $('#uiSeg').addEventListener('click', (e) => {
      const b = e.target.closest('[data-ui-mode]');
      if (!b) return;
      S.settings.ui = b.dataset.uiMode;
      save();
      applyUI();
      buzz(12);
      const words = {
        slap: ['Back to the SLAP look', 'SLAP interface enabled'],
        prism: ['Prism on ✦', 'Prism interface enabled'],
        ios: ['iOS skin on ✨', 'iOS interface enabled']
      }[b.dataset.uiMode] || ['Look changed', 'Interface changed'];
      toast(words[0]);
      announce(words[1]);
    });
    $('#iosThemeSeg').addEventListener('click', (e) => {
      const b = e.target.closest('[data-ios]');
      if (!b) return;
      S.settings.iosTheme = b.dataset.ios;
      save();
      applyUI();
      buzz(12);
      toast(b.dataset.ios === 'dark' ? 'iOS dark 🌙' : 'iOS light ☀️');
    });
    $('#swHaptics').addEventListener('click', function () { toggleSwitch(this, 'haptics'); buzz(10); });
    $('#swConfetti').addEventListener('click', function () { toggleSwitch(this, 'confetti', () => burst(0.8)); });
    $('#swFeed').addEventListener('click', function () { toggleSwitch(this, 'liveFeed', startLiveFeed); });
    $$('.switch').forEach((sw) =>
      sw.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); sw.click(); }
      })
    );
    $('#btnWipe').addEventListener('click', () => {
      if (!confirm('Erase all SLAP data? XP, streaks, tasks and pod history all go.')) return;
      // FIX: stop a running timer before discarding state, or it keeps ticking.
      timer.running = false;
      stopTick();
      S.timer.endAt = null;
      localStorage.removeItem(KEY);
      S = blank();
      rollover();
      S.seeded = true;
      seedFeed();
      applyAccent(S.accent);
      applyVibe(S.vibe);
      applyName(S.name);
      S.timer.len = phaseLen(S.pomo.phase);
      S.timer.remain = S.timer.len;
      save();
      closeSettings();
      go('tasks');
      renderAll();
      renderFeed();
      paint();
      renderPomo();
      renderPark();
      renderSessionLog();
      toast('Clean slate. let\'s build it back 🫡');
    });

    document.addEventListener('keydown', (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);

      if (e.key === 'Escape') {
        if (hypeScrim.classList.contains('open')) closeHype();
        else if (setScrim.classList.contains('open')) closeSettings();
        else if (memScrim.classList.contains('open')) closeMember();
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;

      const openSheet =
        hypeScrim.classList.contains('open') ||
        setScrim.classList.contains('open') ||
        memScrim.classList.contains('open');
      if (openSheet) return;

      const tabs = ['tasks', 'focus', 'pods', 'rewards'];
      const n = Number(e.key);
      if (n >= 1 && n <= 4) { go(tabs[n - 1]); return; }

      if (e.key === '/') { e.preventDefault(); go('tasks'); $('#addInput').focus(); return; }
      if (e.key === 'f' || e.key === 'F') { go('focus'); }
      if (e.key === 's' || e.key === 'S') { go('rewards'); }
      if (e.key === 'b' || e.key === 'B') { go('pods'); }
      if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        const on = timer.running;
        on ? timer.pause() : timer.start();
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && timer.running) { paint(); timer.startTicking(); }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
