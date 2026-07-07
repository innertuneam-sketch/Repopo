/* מתח יומי — a gentle daily pull-up reminder PWA
   Everything runs locally on the phone; nothing leaves the device. */

'use strict';

// ---------- cute copy ----------
const MORNING_GREETINGS = [
  'בוקר טוב, יפה שלי ☀️',
  'בוקר אור, מותק 🌸',
  'היי יפהפייה, בוקר טוב 💛',
  'בוקר טוב לאהובה שלי 🌷',
  'קמת? בוקר מהמם מחכה לך ✨',
];

const ENCOURAGEMENTS = [
  'את מדהימה, ואת אפילו לא יודעת כמה 💛',
  'גוף חזק, ראש חזק — ואת שתיהן 💪',
  'כל מתח קטן זה ניצחון גדול 🌟',
  'אני גאה בך על כל צעד 🥹',
  'תזכרי כמה את שווה היום ✨',
  'מגיע לך רגע קטן בשבילך 🌸',
  'את יכולה הכול, אחת אחת 🌈',
  'חיוך אחד ממך מאיר לי את היום 😊',
  'תנשמי עמוק, את בדיוק במקום הנכון 🍃',
  'קצת תנועה = הרבה אנרגיה טובה ⚡',
  'את הבחירה הכי טובה שלי 💗',
  'תהיי גאה בעצמך היום, מגיע לך 👑',
];

const DONE_LINES = [
  'עשית את המתח של היום. אני גאה בך! 💛',
  'איזו אלופה! המשכת את הרצף 🔥',
  'הגוף שלך אומר לך תודה 🌟',
  'עוד יום, עוד ניצחון קטן ומתוק 🌸',
  'את פשוט מקור השראה 💪',
];

const DONE_EMOJIS = ['🎉', '💪', '🌟', '🥳', '💛', '🌈'];

// ---------- storage ----------
const KEY = 'mtachDaily.v1';

function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return {
    onboarded: false,
    days: {},          // { 'YYYY-MM-DD': { time: '18:00', done: true } }
    streak: 0,
    longest: 0,
    lastQuoteIdx: -1,
  };
}

let state = loadState();

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
const screens = ['onboarding', 'morning', 'waiting', 'done'];

function show(name) {
  screens.forEach((s) => { $(`screen-${s}`).hidden = s !== name; });
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
    await LN().schedule({ notifications: [{
      id: NID.morning,
      title: 'בוקר טוב, יפה שלי ☀️',
      body: 'מתי נוח לך לעשות מתח היום? 💛',
      schedule: { on: { hour: 8, minute: 0 }, repeats: true, allowWhileIdle: true },
      smallIcon: 'ic_stat_icon',
    }]});
  } catch (e) {}
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
      if (!day.time || day.done) {
        await ln.cancel({ notifications: [{ id: NID.reminder }] });
      } else {
        const [h, m] = day.time.split(':').map(Number);
        const when = new Date();
        when.setHours(h, m, 0, 0);
        const list = [];
        if (when > new Date()) {
          list.push({
            id: NID.reminder,
            title: 'הגיע הזמן למתח! 💪',
            body: 'רגע קטן בשבילך — קדימה, את יכולה! ✨',
            schedule: { at: when, allowWhileIdle: true },
            smallIcon: 'ic_stat_icon',
          });
        }
        // a gentle encouragement every day at 13:00
        list.push({
          id: NID.encourage,
          title: 'מחשבה קטנה 💗',
          body: ENCOURAGEMENTS[pick(ENCOURAGEMENTS)],
          schedule: { on: { hour: 13, minute: 0 }, repeats: true },
          smallIcon: 'ic_stat_icon',
        });
        if (list.length) await ln.schedule({ notifications: list });
      }
    } catch (e) {}
    return;
  }

  clearTimers();
  const day = today();
  if (!day.time || day.done) return;

  const [h, m] = day.time.split(':').map(Number);
  const when = new Date();
  when.setHours(h, m, 0, 0);

  scheduleAt(when, () => {
    notify('הגיע הזמן למתח! 💪', 'רגע קטן בשבילך — קדימה, את יכולה! ✨', 'reminder');
  });

  // one gentle encouragement partway to the reminder
  const now = Date.now();
  const mid = new Date(now + (when.getTime() - now) * 0.5);
  if (mid.getTime() > now + 60_000) {
    scheduleAt(mid, () => {
      const i = pick(ENCOURAGEMENTS, state.lastQuoteIdx);
      state.lastQuoteIdx = i; save();
      notify('מחשבה קטנה 💗', ENCOURAGEMENTS[i], 'encourage');
    });
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
  const day = today();

  if (!state.onboarded) { show('onboarding'); return; }

  if (day.done) {
    show('done');
    $('done-emoji').textContent = DONE_EMOJIS[pick(DONE_EMOJIS)];
    $('done-subtitle').textContent = DONE_LINES[pick(DONE_LINES)];
    $('done-quote').textContent = ENCOURAGEMENTS[pick(ENCOURAGEMENTS)];
    $('streak-num').textContent = state.streak;
    renderWeekDots('week-dots');
    return;
  }

  if (day.time) {
    show('waiting');
    $('scheduled-time').textContent = day.time;
    startCountdown();
    rotateQuote('quote-text');
    scheduleTodayReminder();
    return;
  }

  // needs a time for today → morning screen
  show('morning');
  $('morning-greeting').textContent = MORNING_GREETINGS[pick(MORNING_GREETINGS)];
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
    notify('הי מהאפליקציה 💛', 'ככה תיראה התזכורת שלך. את מהממת!', 'test');
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
  notify('כל הכבוד! 🎉', `רצף של ${state.streak} ימים. גאה בך! 💛`, 'done');
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
