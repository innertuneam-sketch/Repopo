/* מתח יומי — a gentle daily pull-up reminder PWA
   Everything runs locally on the phone; nothing leaves the device. */

'use strict';

// ---------- cute copy ----------
const MORNING_GREETINGS = [
  'בוקר טוב יפה שלי 💛',
  'בוקר אור חמודה 🤍',
  'יום מקסים יסמיני 🩵',
  'שיהיה לך יום נפלא וכיף ❤️',
];

const ENCOURAGEMENTS = [
  'תמשיכי כמו שאת מתוקה ❤️',
  'מקווה שעובר עלייך יום מקסים ונפלא!',
  'תתפנקי לך על משהו כיף מותק',
  'תניעי את הגוף ותעשי לך כיף 😘',
  'אם היית בטיפוס יש לך יום חופש 😘',
  'אם היית ביוגה אין לך יום חופש 😘',
  'עוד מתח עוד כיף ליסמיני!',
  'מה זה בכלל יום בלי מתח',
  'תמשיכי ותהני מכל רגע 🩵',
];

const DONE_LINES = [
  'שיוו איזה כיף שעשית!',
  'יופי חיים שלי 🤍',
  'את מעולה!!',
  'איזה כיף שאת עושה לך טוב 😍',
  'תמשיכי ככה מותק כל הכבוד',
  'מדהימה מדהימה מדהימה!',
  'הגב שלך מודה לך ✨️',
];

const DONE_EMOJIS = ['🎉', '💪', '🌟', '🥳', '💛', '🌈'];

// ---------- storage ----------
const KEY = 'mtachDaily.v1';

// The "day" rolls over at 04:00, not midnight — so a late-night stretch
// (e.g. 00:30) still counts for the day that's ending, not the next one.
const DAY_CUTOFF_HOUR = 4;

function todayKey(d = new Date()) {
  const s = new Date(d.getTime() - DAY_CUTOFF_HOUR * 3600 * 1000);
  return `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, '0')}-${String(s.getDate()).padStart(2, '0')}`;
}

const DEFAULT_NOTIFY = { morning: true, reminder: true, encourage: true };

function loadState() {
  let s;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) s = JSON.parse(raw);
  } catch (e) {}
  if (!s) {
    s = {
      onboarded: false,
      days: {},          // { 'YYYY-MM-DD': { time: '18:00', done: true } }
      streak: 0,
      longest: 0,
      lastQuoteIdx: -1,
      streakAdjust: 0,   // manual correction added to the computed streak
    };
  }
  // make sure the notification toggles exist (migrate older saved state)
  s.notify = Object.assign({}, DEFAULT_NOTIFY, s.notify || {});
  if (typeof s.streakAdjust !== 'number') s.streakAdjust = 0;
  return s;
}

let state = loadState();

// is a given notification type turned on?
function notifyOn(key) { return state.notify[key] !== false; }

// streak shown to the user = computed run + any manual correction
function displayedStreak() { return Math.max(0, state.streak + (state.streakAdjust || 0)); }

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
}

function today() {
  const k = todayKey();
  if (!state.days[k]) state.days[k] = { time: null, done: false };
  return state.days[k];
}

// ---------- helpers ----------
const $ = (id) => document.getElementById(id);
const screens = ['onboarding', 'morning', 'waiting', 'done', 'settings'];

function show(name) {
  screens.forEach((s) => { $(`screen-${s}`).hidden = s !== name; });
}

// ---------- settings screen ----------
const NOTIFY_ROWS = [
  { key: 'morning',   emoji: '☀️', title: 'ברכת בוקר',      desc: 'כל בוקר ב-8:00' },
  { key: 'reminder',  emoji: '💪', title: 'תזכורת מתח',     desc: 'בשעה שבחרת' },
  { key: 'encourage', emoji: '💗', title: 'משפט עידוד יומי', desc: 'מחשבה קטנה ומתוקה' },
];

function openSettings() {
  const list = $('settings-list');
  list.innerHTML = '';
  NOTIFY_ROWS.forEach((row) => {
    const on = notifyOn(row.key);
    const el = document.createElement('label');
    el.className = 'set-row';
    el.innerHTML =
      `<span class="set-emoji">${row.emoji}</span>` +
      `<span class="set-text"><span class="set-title">${row.title}</span>` +
      `<span class="set-desc">${row.desc}</span></span>` +
      `<span class="switch"><input type="checkbox" data-key="${row.key}" ${on ? 'checked' : ''}>` +
      `<span class="slider"></span></span>`;
    list.appendChild(el);
  });
  $('streak-edit-num').textContent = displayedStreak();
  $('btn-settings-top').style.display = 'none';   // hide the gear while inside settings
  show('settings');
}

function closeSettings() { render(); }

// manual streak correction (restore / add / remove)
function adjustStreak(delta) {
  if (displayedStreak() + delta < 0) return;
  state.streakAdjust = (state.streakAdjust || 0) + delta;
  save();
  $('streak-edit-num').textContent = displayedStreak();
}

function pick(arr, avoid = -1) {
  if (arr.length === 1) return 0;
  let i;
  do { i = Math.floor(Math.random() * arr.length); } while (i === avoid);
  return i;
}

function toast(msg, ms = 2600) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, ms);
}

// ---------- streak ----------
function recomputeStreak() {
  // count consecutive done-days ending today (or yesterday)
  let streak = 0;
  const d = new Date();
  // allow today-not-yet-done without breaking the streak view
  if (!state.days[todayKey(d)]?.done) d.setDate(d.getDate() - 1);
  while (state.days[todayKey(d)]?.done) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  state.streak = streak;
  if (streak > state.longest) state.longest = streak;
}

function renderWeekDots(containerId) {
  const el = $(containerId);
  if (!el) return;
  el.innerHTML = '';
  const labels = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const done = state.days[todayKey(d)]?.done;
    const dot = document.createElement('div');
    dot.className = 'week-dot' + (done ? ' hit' : '');
    dot.textContent = done ? '✓' : labels[d.getDay()];
    el.appendChild(dot);
  }
}

// ---------- notifications ----------
// Runs both as a web PWA and as a native Android app (via Capacitor).
// Native gets real scheduled local notifications that fire even when the
// app is fully closed; the web build falls back to the Notification API.
const Cap = window.Capacitor;
const isNative = !!(Cap && typeof Cap.isNativePlatform === 'function' && Cap.isNativePlatform());
const LN = () => Cap && Cap.Plugins && Cap.Plugins.LocalNotifications;

// stable notification ids on native
const NID = { morning: 1, encourage: 50, reminder: 100 };

function canNotify() {
  if (isNative) return true; // permission is checked async on native
  return 'Notification' in window && Notification.permission === 'granted';
}

async function requestNotifications() {
  if (isNative) {
    try {
      const ln = LN();
      let res = await ln.checkPermissions();
      if (res.display !== 'granted') res = await ln.requestPermissions();
      const granted = res.display === 'granted';
      if (granted) await scheduleMorningDaily();
      return granted;
    } catch (e) { return false; }
  }
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    const p = await Notification.requestPermission();
    return p === 'granted';
  } catch (e) { return false; }
}

async function notify(title, body, tag) {
  if (isNative) {
    try {
      await LN().schedule({ notifications: [{
        id: 2000 + Math.floor(Math.random() * 9000),
        title, body,
        schedule: { at: new Date(Date.now() + 400) },
        smallIcon: 'ic_stat_icon',
      }]});
    } catch (e) {}
    return;
  }
  if (!canNotify()) return;
  const opts = {
    body,
    tag: tag || 'mtach',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    dir: 'rtl',
    lang: 'he',
    vibrate: [90, 40, 90],
    renotify: true,
  };
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (reg) { await reg.showNotification(title, opts); return; }
  } catch (e) {}
  try { new Notification(title, opts); } catch (e) {}
}

// Native: a daily repeating "good morning" prompt to pick today's time.
async function scheduleMorningDaily() {
  if (!isNative) return;
  try {
    if (!notifyOn('morning')) {
      await LN().cancel({ notifications: [{ id: NID.morning }] });
      return;
    }
    await LN().schedule({ notifications: [{
      id: NID.morning,
      title: MORNING_GREETINGS[pick(MORNING_GREETINGS)],
      body: '',
      schedule: { on: { hour: 8, minute: 0 }, repeats: true, allowWhileIdle: true },
      smallIcon: 'ic_stat_icon',
    }]});
  } catch (e) {}
}

// Re-apply all notification schedules after a settings change.
async function applyNotifySettings() {
  if (isNative) {
    try {
      await scheduleMorningDaily();          // schedules or cancels morning
      await scheduleTodayReminder();         // schedules or cancels reminder + encourage
    } catch (e) {}
  } else {
    scheduleTodayReminder();                 // web timers respect the toggles
  }
}

// In-session scheduling. Fires while the app is open or backgrounded.
// (For guaranteed delivery when the app is fully closed, a push server
//  would be added later — see README.)
const timers = [];
function clearTimers() { while (timers.length) clearTimeout(timers.pop()); }

function scheduleAt(when, fn) {
  const ms = when.getTime() - Date.now();
  if (ms <= 0) return;
  // setTimeout caps at ~24.8 days; our horizons are always < 1 day.
  timers.push(setTimeout(fn, ms));
}

async function scheduleTodayReminder() {
  // Native: real OS-scheduled notifications (fire even when app is closed).
  if (isNative) {
    const ln = LN();
    const day = today();
    try {
      const list = [];
      // reminder at the chosen time (if enabled and still ahead today)
      const wantReminder = notifyOn('reminder') && day.time && !day.done;
      if (wantReminder) {
        const [h, m] = day.time.split(':').map(Number);
        const when = new Date();
        when.setHours(h, m, 0, 0);
        if (when > new Date()) {
          list.push({
            id: NID.reminder,
            title: ENCOURAGEMENTS[pick(ENCOURAGEMENTS)],
            body: '',
            schedule: { at: when, allowWhileIdle: true },
            smallIcon: 'ic_stat_icon',
          });
        }
      } else {
        await ln.cancel({ notifications: [{ id: NID.reminder }] });
      }
      // a gentle encouragement every day at 13:00 (if enabled)
      if (notifyOn('encourage')) {
        list.push({
          id: NID.encourage,
          title: ENCOURAGEMENTS[pick(ENCOURAGEMENTS)],
          body: '',
          schedule: { on: { hour: 13, minute: 0 }, repeats: true },
          smallIcon: 'ic_stat_icon',
        });
      } else {
        await ln.cancel({ notifications: [{ id: NID.encourage }] });
      }
      if (list.length) await ln.schedule({ notifications: list });
    } catch (e) {}
    return;
  }

  clearTimers();
  const day = today();
  if (!day.time || day.done) return;

  const [h, m] = day.time.split(':').map(Number);
  const when = new Date();
  when.setHours(h, m, 0, 0);

  if (notifyOn('reminder')) {
    scheduleAt(when, () => {
      notify(ENCOURAGEMENTS[pick(ENCOURAGEMENTS)], '', 'reminder');
    });
  }

  // one gentle encouragement partway to the reminder
  if (notifyOn('encourage')) {
    const now = Date.now();
    const mid = new Date(now + (when.getTime() - now) * 0.5);
    if (mid.getTime() > now + 60_000) {
      scheduleAt(mid, () => {
        const i = pick(ENCOURAGEMENTS, state.lastQuoteIdx);
        state.lastQuoteIdx = i; save();
        notify(ENCOURAGEMENTS[i], '', 'encourage');
      });
    }
  }
}

// ---------- quotes rotation ----------
function rotateQuote(elId) {
  const el = $(elId);
  if (!el) return;
  const i = pick(ENCOURAGEMENTS, state.lastQuoteIdx);
  state.lastQuoteIdx = i;
  save();
  el.style.opacity = '0';
  setTimeout(() => { el.textContent = ENCOURAGEMENTS[i]; el.style.opacity = '1'; }, 300);
}

// ---------- countdown ----------
let countdownTimer = null;
function startCountdown() {
  const day = today();
  clearInterval(countdownTimer);
  if (!day.time) return;
  const [h, m] = day.time.split(':').map(Number);

  const tick = () => {
    const now = new Date();
    const when = new Date();
    when.setHours(h, m, 0, 0);
    let diff = Math.floor((when - now) / 1000);
    const cd = $('countdown');
    if (!cd) return;
    if (diff <= 0) {
      cd.textContent = 'עכשיו!';
      $('btn-done-now').textContent = 'הגיע הזמן — עשיתי! ✅';
      return;
    }
    const hh = Math.floor(diff / 3600);
    const mm = Math.floor((diff % 3600) / 60);
    const ss = diff % 60;
    cd.textContent = hh > 0
      ? `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
      : `${mm}:${String(ss).padStart(2, '0')}`;
  };
  tick();
  countdownTimer = setInterval(tick, 1000);
}

// ---------- confetti ----------
function confetti() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const colors = ['#ff9ec4', '#c9a6ff', '#8ec5ff', '#ffd76b', '#ff7aa8'];
  for (let i = 0; i < 60; i++) {
    const c = document.createElement('div');
    c.className = 'confetti';
    c.style.insetInlineStart = Math.random() * 100 + 'vw';
    c.style.background = colors[i % colors.length];
    c.style.animationDuration = 2.2 + Math.random() * 1.6 + 's';
    c.style.animationDelay = Math.random() * 0.5 + 's';
    c.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 4200);
  }
}

// ---------- render / routing ----------
function render() {
  recomputeStreak();
  $('btn-settings-top').style.display = '';   // gear visible on all normal screens
  const day = today();

  if (!state.onboarded) {
    show('onboarding');
    $('onb-title').textContent = MORNING_GREETINGS[pick(MORNING_GREETINGS)];
    $('onb-sub').textContent = ENCOURAGEMENTS[pick(ENCOURAGEMENTS)];
    return;
  }

  if (day.done) {
    show('done');
    $('done-emoji').textContent = DONE_EMOJIS[pick(DONE_EMOJIS)];
    $('done-title').textContent = DONE_LINES[pick(DONE_LINES)];
    $('done-subtitle').textContent = DONE_LINES[pick(DONE_LINES)];
    $('done-quote').textContent = ENCOURAGEMENTS[pick(ENCOURAGEMENTS)];
    $('streak-num').textContent = displayedStreak();
    renderWeekDots('week-dots');
    return;
  }

  if (day.time) {
    show('waiting');
    $('waiting-title').textContent = ENCOURAGEMENTS[pick(ENCOURAGEMENTS)];
    $('scheduled-time').textContent = day.time;
    startCountdown();
    rotateQuote('quote-text');
    scheduleTodayReminder();
    return;
  }

  // needs a time for today → morning screen
  show('morning');
  $('morning-greeting').textContent = MORNING_GREETINGS[pick(MORNING_GREETINGS)];
  $('morning-sub').textContent = ENCOURAGEMENTS[pick(ENCOURAGEMENTS)];
  // default the picker to yesterday's time if we have one
  const prev = Object.values(state.days).reverse().find((d) => d.time);
  if (prev?.time) $('time-input').value = prev.time;
}

// ---------- events ----------
function wire() {
  $('btn-start').addEventListener('click', async () => {
    const ok = await requestNotifications();
    state.onboarded = true;
    save();
    if (!ok) toast('אפשר גם בלי התראות — פשוט תיכנסי לאפליקציה 💛');
    else toast('מעולה! נזכיר לך בעדינות 🔔');
    render();
  });

  // quick time chips
  $('quick-times').addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    $('time-input').value = b.dataset.time;
    document.querySelectorAll('.chip').forEach((c) => c.classList.remove('selected'));
    b.classList.add('selected');
  });

  $('btn-set-time').addEventListener('click', () => {
    const val = $('time-input').value || '18:00';
    today().time = val;
    save();
    toast(`יש! נזכיר לך בשעה ${val} 💫`);
    render();
  });

  $('btn-done-now').addEventListener('click', markDone);
  $('btn-change-time').addEventListener('click', () => {
    today().time = null;
    save();
    render();
  });

  $('btn-undo').addEventListener('click', () => {
    today().done = false;
    save();
    render();
  });

  $('quote-card')?.addEventListener('click', () => rotateQuote('quote-text'));

  $('btn-notif-test').addEventListener('click', async () => {
    const ok = await requestNotifications();
    if (!ok) { toast('ההתראות חסומות — צריך לאשר בהגדרות הדפדפן'); return; }
    notify(ENCOURAGEMENTS[pick(ENCOURAGEMENTS)], '', 'test');
    toast('שלחנו התראת בדיקה 🔔');
  });

  $('btn-reset').addEventListener('click', () => {
    if (!confirm('לאפס את כל הנתונים ולהתחיל מחדש?')) return;
    state = loadState();
    localStorage.removeItem(KEY);
    state = loadState();
    save();
    render();
    toast('אופסנו — התחלה חדשה 🌱');
  });

  // settings screen: open / close / toggle
  $('btn-settings-top').addEventListener('click', openSettings);
  $('btn-settings-back').addEventListener('click', closeSettings);
  $('streak-plus').addEventListener('click', () => adjustStreak(1));
  $('streak-minus').addEventListener('click', () => adjustStreak(-1));
  $('settings-list').addEventListener('change', async (e) => {
    const cb = e.target.closest('input[type="checkbox"]');
    if (!cb) return;
    state.notify[cb.dataset.key] = cb.checked;
    save();
    if (cb.checked) {
      const ok = await requestNotifications();
      if (!ok) toast('כדי לקבל התראות צריך לאשר הרשאה 🔔');
    }
    await applyNotifySettings();
    toast(cb.checked ? 'ההתראה הופעלה 🔔' : 'ההתראה כובתה 🔕');
  });

  // re-render when the user returns to the app (new day, time passed…)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) render();
  });
}

function markDone() {
  const day = today();
  day.done = true;
  save();
  recomputeStreak();
  clearInterval(countdownTimer);
  clearTimers();
  if (isNative) { try { LN().cancel({ notifications: [{ id: NID.reminder }] }); } catch (e) {} }
  confetti();
  notify(DONE_LINES[pick(DONE_LINES)], '', 'done');
  render();
}

// ---------- boot ----------
function boot() {
  wire();
  render();

  if (isNative) {
    // keep the daily morning prompt alive whenever notifications are allowed
    (async () => {
      try {
        const res = await LN().checkPermissions();
        if (res.display === 'granted') await scheduleMorningDaily();
      } catch (e) {}
    })();
  } else if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
