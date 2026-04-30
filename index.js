const { Telegraf, Markup } = require('telegraf');
const { Pool } = require('pg');

const bot = new Telegraf(process.env.BOT_TOKEN);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const userState = {};

const DEFAULT_TIMEZONE = 'Europe/Moscow';
const DEFAULT_LANGUAGE = 'ru';

const TIMEZONES = {
  '🇷🇺 Москва': 'Europe/Moscow',
  '🇦🇹 Вена': 'Europe/Vienna',
  '🇩🇪 Берлин': 'Europe/Berlin',
  '🇰🇿 Алматы': 'Asia/Almaty',
  '🇦🇪 Дубай': 'Asia/Dubai',
  '🇺🇸 Нью-Йорк': 'America/New_York',
  '🇺🇸 Лос-Анджелес': 'America/Los_Angeles',
  '🇬🇧 Лондон': 'Europe/London'
};

const TEXT = {
  ru: {
    start: '👋 Привет! Я твой умный планировщик задач.\n\nНажми «➕ Новая задача», и я спрошу всё по шагам.',
    chooseTask: 'Выбери задачу из списка или добавь свою 👇',
    writeTask: '✍️ Напиши свою задачу.\n\nНапример: Забрать заказ',
    chooseDate: '📅 На когда задача?',
    chooseTime: '⏰ Когда задача?\n\nМожно выбрать кнопку или написать время вручную: 08:40',
    chooseReminder: '🔔 Когда напомнить?\n\nЕсли напоминание не нужно — нажми «🔕 Без напоминания».',
    choosePriority: '⭐ Выбери приоритет:',
    cancelled: 'Ок, отменено.',
    mainMenu: 'Главное меню',
    noToday: '📭 На сегодня задач нет',
    noTomorrow: '📭 На завтра задач нет',
    noActive: '📭 Активных задач пока нет',
    noDone: 'Пока нет выполненных задач',
    addTaskHint: 'Нажми «➕ Новая задача», чтобы добавить задачу.',
    taskAdded: '✅ Задача добавлена!',
    settingsTitle: '⚙️ Настройки',
    digestTime: '☀️ Утренний план',
    timezone: '🌍 Часовой пояс',
    language: '🌐 Язык',
    writeDigest: 'Напиши время утреннего плана.\n\nНапример: 09:00',
    digestSaved: '✅ Утренний план будет приходить в',
    chooseTimezone: 'Выбери свой часовой пояс 👇\n\nЕсли твоего города нет — нажми «✍️ Ввести вручную».',
    writeTimezone: 'Напиши часовой пояс текстом.\n\nНапример:\nEurope/Vienna\nEurope/Moscow\nAsia/Almaty\nAmerica/New_York',
    timezoneSaved: '✅ Часовой пояс сохранён:',
    timezoneError: '❗ Не получилось найти такой часовой пояс.\n\nПример правильного формата:\nEurope/Vienna\nEurope/Moscow\nAsia/Dubai',
    chooseLanguage: 'Выбери язык бота:',
    languageSaved: '✅ Язык сохранён.',
    invalidTime: '❗ Выбери кнопку или напиши время в формате 08:40',
    invalidDigest: '❗ Напиши время в формате 09:00',
    reminderNow: '🔔 Напоминание прямо сейчас!',
    soonTask: '🔔 Скоро задача!',
    reminder: '⏰ Напоминание!',
    morning: '☀️ Доброе утро!',
    noTasksMorning: 'На сегодня задач нет. Отличный день, чтобы всё успеть 💪',
    todayTasks: 'Сегодня у тебя задач:',
    stats: '📊 Статистика'
  },
  en: {
    start: '👋 Hi! I am your smart task planner.\n\nTap “➕ New task”, and I will guide you step by step.',
    chooseTask: 'Choose a task from the list or add your own 👇',
    writeTask: '✍️ Write your own task.\n\nExample: Pick up an order',
    chooseDate: '📅 When is the task?',
    chooseTime: '⏰ What time is the task?\n\nChoose a button or type time manually: 08:40',
    chooseReminder: '🔔 When should I remind you?\n\nIf you do not need a reminder, tap “🔕 No reminder”.',
    choosePriority: '⭐ Choose priority:',
    cancelled: 'Okay, cancelled.',
    mainMenu: 'Main menu',
    noToday: '📭 No tasks for today',
    noTomorrow: '📭 No tasks for tomorrow',
    noActive: '📭 No active tasks yet',
    noDone: 'No completed tasks yet',
    addTaskHint: 'Tap “➕ New task” to add a task.',
    taskAdded: '✅ Task added!',
    settingsTitle: '⚙️ Settings',
    digestTime: '☀️ Morning plan',
    timezone: '🌍 Time zone',
    language: '🌐 Language',
    writeDigest: 'Write the morning plan time.\n\nExample: 09:00',
    digestSaved: '✅ Morning plan will arrive at',
    chooseTimezone: 'Choose your time zone 👇\n\nIf your city is not listed, tap “✍️ Enter manually”.',
    writeTimezone: 'Write your time zone.\n\nExamples:\nEurope/Vienna\nEurope/Moscow\nAsia/Almaty\nAmerica/New_York',
    timezoneSaved: '✅ Time zone saved:',
    timezoneError: '❗ I could not find this time zone.\n\nCorrect examples:\nEurope/Vienna\nEurope/Moscow\nAsia/Dubai',
    chooseLanguage: 'Choose bot language:',
    languageSaved: '✅ Language saved.',
    invalidTime: '❗ Choose a button or type time like 08:40',
    invalidDigest: '❗ Write time like 09:00',
    reminderNow: '🔔 Reminder right now!',
    soonTask: '🔔 Task soon!',
    reminder: '⏰ Reminder!',
    morning: '☀️ Good morning!',
    noTasksMorning: 'No tasks for today. Great day to get everything done 💪',
    todayTasks: 'Your tasks for today:',
    stats: '📊 Statistics'
  },
  de: {
    start: '👋 Hallo! Ich bin dein smarter Aufgabenplaner.\n\nTippe auf „➕ Neue Aufgabe“, und ich führe dich Schritt für Schritt.',
    chooseTask: 'Wähle eine Aufgabe aus der Liste oder füge eine eigene hinzu 👇',
    writeTask: '✍️ Schreibe deine eigene Aufgabe.\n\nBeispiel: Bestellung abholen',
    chooseDate: '📅 Für wann ist die Aufgabe?',
    chooseTime: '⏰ Um wie viel Uhr?\n\nWähle eine Taste oder schreibe die Zeit: 08:40',
    chooseReminder: '🔔 Wann soll ich erinnern?\n\nWenn keine Erinnerung nötig ist, tippe „🔕 Keine Erinnerung“.',
    choosePriority: '⭐ Priorität wählen:',
    cancelled: 'Okay, abgebrochen.',
    mainMenu: 'Hauptmenü',
    noToday: '📭 Keine Aufgaben für heute',
    noTomorrow: '📭 Keine Aufgaben für morgen',
    noActive: '📭 Noch keine aktiven Aufgaben',
    noDone: 'Noch keine erledigten Aufgaben',
    addTaskHint: 'Tippe auf „➕ Neue Aufgabe“, um eine Aufgabe hinzuzufügen.',
    taskAdded: '✅ Aufgabe hinzugefügt!',
    settingsTitle: '⚙️ Einstellungen',
    digestTime: '☀️ Morgenplan',
    timezone: '🌍 Zeitzone',
    language: '🌐 Sprache',
    writeDigest: 'Schreibe die Uhrzeit für den Morgenplan.\n\nBeispiel: 09:00',
    digestSaved: '✅ Der Morgenplan kommt um',
    chooseTimezone: 'Wähle deine Zeitzone 👇\n\nWenn deine Stadt nicht dabei ist, tippe „✍️ Manuell eingeben“.',
    writeTimezone: 'Schreibe deine Zeitzone.\n\nBeispiele:\nEurope/Vienna\nEurope/Moscow\nAsia/Almaty\nAmerica/New_York',
    timezoneSaved: '✅ Zeitzone gespeichert:',
    timezoneError: '❗ Diese Zeitzone wurde nicht gefunden.\n\nRichtige Beispiele:\nEurope/Vienna\nEurope/Moscow\nAsia/Dubai',
    chooseLanguage: 'Sprache des Bots wählen:',
    languageSaved: '✅ Sprache gespeichert.',
    invalidTime: '❗ Wähle eine Taste oder schreibe die Zeit so: 08:40',
    invalidDigest: '❗ Schreibe die Zeit so: 09:00',
    reminderNow: '🔔 Erinnerung jetzt!',
    soonTask: '🔔 Aufgabe bald!',
    reminder: '⏰ Erinnerung!',
    morning: '☀️ Guten Morgen!',
    noTasksMorning: 'Keine Aufgaben für heute. Ein guter Tag, um alles zu schaffen 💪',
    todayTasks: 'Deine Aufgaben heute:',
    stats: '📊 Statistik'
  }
};

const BTN = {
  ru: {
    newTask: '➕ Новая задача',
    today: '📅 Сегодня',
    tomorrow: '🗓 Завтра',
    allTasks: '📋 Все задачи',
    doneTasks: '✅ Выполненные',
    stats: '📊 Статистика',
    settings: '⚙️ Настройки',
    cancel: '❌ Отмена',
    back: '⬅️ Назад',
    noDate: '🗂 Без даты',
    noTime: '🕳 Без времени',
    in1h: '⏰ Через 1 час',
    evening: '🌙 Вечером',
    tomorrowMorning: '🌅 Завтра утром',
    ownTask: '✍️ Своя задача',
    digest: '⏰ Время утреннего плана',
    timezone: '🌍 Часовой пояс',
    language: '🌐 Язык',
    manual: '✍️ Ввести вручную',
    low: '🟢 Низкий',
    medium: '⚪ Средний',
    high: '🔥 Высокий',
    noReminder: '🔕 Без напоминания',
    reminderExact: '⏰ В момент задачи',
    reminder5: '🔔 За 5 минут',
    reminder10: '🔔 За 10 минут',
    reminder30: '🔔 За 30 минут',
    reminder60: '🔔 За 1 час'
  },
  en: {
    newTask: '➕ New task',
    today: '📅 Today',
    tomorrow: '🗓 Tomorrow',
    allTasks: '📋 All tasks',
    doneTasks: '✅ Completed',
    stats: '📊 Statistics',
    settings: '⚙️ Settings',
    cancel: '❌ Cancel',
    back: '⬅️ Back',
    noDate: '🗂 No date',
    noTime: '🕳 No time',
    in1h: '⏰ In 1 hour',
    evening: '🌙 Evening',
    tomorrowMorning: '🌅 Tomorrow morning',
    ownTask: '✍️ Own task',
    digest: '⏰ Morning plan time',
    timezone: '🌍 Time zone',
    language: '🌐 Language',
    manual: '✍️ Enter manually',
    low: '🟢 Low',
    medium: '⚪ Medium',
    high: '🔥 High',
    noReminder: '🔕 No reminder',
    reminderExact: '⏰ At task time',
    reminder5: '🔔 5 minutes before',
    reminder10: '🔔 10 minutes before',
    reminder30: '🔔 30 minutes before',
    reminder60: '🔔 1 hour before'
  },
  de: {
    newTask: '➕ Neue Aufgabe',
    today: '📅 Heute',
    tomorrow: '🗓 Morgen',
    allTasks: '📋 Alle Aufgaben',
    doneTasks: '✅ Erledigt',
    stats: '📊 Statistik',
    settings: '⚙️ Einstellungen',
    cancel: '❌ Abbrechen',
    back: '⬅️ Zurück',
    noDate: '🗂 Kein Datum',
    noTime: '🕳 Keine Uhrzeit',
    in1h: '⏰ In 1 Stunde',
    evening: '🌙 Abend',
    tomorrowMorning: '🌅 Morgen früh',
    ownTask: '✍️ Eigene Aufgabe',
    digest: '⏰ Morgenplan-Zeit',
    timezone: '🌍 Zeitzone',
    language: '🌐 Sprache',
    manual: '✍️ Manuell eingeben',
    low: '🟢 Niedrig',
    medium: '⚪ Mittel',
    high: '🔥 Hoch',
    noReminder: '🔕 Keine Erinnerung',
    reminderExact: '⏰ Zur Aufgabenzeit',
    reminder5: '🔔 5 Minuten vorher',
    reminder10: '🔔 10 Minuten vorher',
    reminder30: '🔔 30 Minuten vorher',
    reminder60: '🔔 1 Stunde vorher'
  }
};

function t(lang, key) {
  return TEXT[lang]?.[key] || TEXT.ru[key];
}

function b(lang, key) {
  return BTN[lang]?.[key] || BTN.ru[key];
}

function allButtons(key) {
  return Object.values(BTN).map((x) => x[key]);
}

function isButton(text, key) {
  return allButtons(key).includes(text);
}

// ================= БАЗА =================

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL,
      text TEXT NOT NULL,
      task_date TEXT,
      time TEXT,
      priority TEXT DEFAULT 'medium',
      reminder_minutes INTEGER DEFAULT 10,
      done BOOLEAN DEFAULT false,
      notified BOOLEAN DEFAULT false,
      pre_notified BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_date TEXT`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS time TEXT`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'medium'`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reminder_minutes INTEGER DEFAULT 10`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS done BOOLEAN DEFAULT false`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS notified BOOLEAN DEFAULT false`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS pre_notified BOOLEAN DEFAULT false`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users_settings (
      user_id BIGINT PRIMARY KEY,
      digest_time TEXT DEFAULT '09:00',
      digest_sent_date TEXT,
      timezone TEXT DEFAULT 'Europe/Moscow',
      language TEXT DEFAULT 'ru'
    )
  `);

  await pool.query(`ALTER TABLE users_settings ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'Europe/Moscow'`);
  await pool.query(`ALTER TABLE users_settings ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'ru'`);
}

async function ensureUser(userId) {
  await pool.query(
    `INSERT INTO users_settings (user_id, timezone, language)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId, DEFAULT_TIMEZONE, DEFAULT_LANGUAGE]
  );
}

async function getUserSettings(userId) {
  await ensureUser(userId);

  const res = await pool.query(
    'SELECT * FROM users_settings WHERE user_id=$1',
    [userId]
  );

  return res.rows[0] || {
    digest_time: '09:00',
    timezone: DEFAULT_TIMEZONE,
    language: DEFAULT_LANGUAGE
  };
}

// ================= КНОПКИ =================

function menu(lang) {
  return Markup.keyboard([
    [b(lang, 'newTask'), b(lang, 'today')],
    [b(lang, 'tomorrow'), b(lang, 'allTasks')],
    [b(lang, 'doneTasks'), b(lang, 'stats')],
    [b(lang, 'settings')]
  ]).resize();
}

function taskTemplatesMenu(lang) {
  return Markup.keyboard([
    ['💧 Water', '🏃 Workout'],
    ['🛒 Groceries', '📞 Call'],
    ['📚 Study', b(lang, 'ownTask')],
    [b(lang, 'cancel')]
  ]).resize();
}

function dateMenu(lang) {
  return Markup.keyboard([
    [b(lang, 'today'), b(lang, 'tomorrow')],
    [b(lang, 'noDate')],
    [b(lang, 'cancel')]
  ]).resize();
}

function timeMenu(lang) {
  return Markup.keyboard([
    [b(lang, 'in1h'), b(lang, 'evening')],
    [b(lang, 'tomorrowMorning'), b(lang, 'noTime')],
    [b(lang, 'cancel')]
  ]).resize();
}

function reminderMenu(lang) {
  return Markup.keyboard([
    [b(lang, 'reminder5'), b(lang, 'reminder10')],
    [b(lang, 'reminder30'), b(lang, 'reminder60')],
    [b(lang, 'reminderExact'), b(lang, 'noReminder')],
    [b(lang, 'cancel')]
  ]).resize();
}

function priorityMenu(lang) {
  return Markup.keyboard([
    [b(lang, 'low'), b(lang, 'medium'), b(lang, 'high')],
    [b(lang, 'cancel')]
  ]).resize();
}

function settingsMenu(lang) {
  return Markup.keyboard([
    [b(lang, 'digest')],
    [b(lang, 'timezone')],
    [b(lang, 'language')],
    [b(lang, 'back')]
  ]).resize();
}

function timezoneMenu(lang) {
  return Markup.keyboard([
    ['🇷🇺 Москва', '🇦🇹 Вена'],
    ['🇩🇪 Берлин', '🇰🇿 Алматы'],
    ['🇦🇪 Дубай', '🇺🇸 Нью-Йорк'],
    ['🇺🇸 Лос-Анджелес', '🇬🇧 Лондон'],
    [b(lang, 'manual')],
    [b(lang, 'back')]
  ]).resize();
}

function languageMenu() {
  return Markup.keyboard([
    ['🇷🇺 Русский', '🇬🇧 English'],
    ['🇩🇪 Deutsch'],
    ['⬅️ Назад']
  ]).resize();
}

// ================= ДАТА И ВРЕМЯ =================

function getNowParts(timezone) {
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type).value;

  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`
  };
}

function getPartsFromDate(date, timezone) {
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type).value;

  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`
  };
}

function todayDate(timezone) {
  return getNowParts(timezone).date;
}

function tomorrowDate(timezone) {
  const today = todayDate(timezone);
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function timeInOneHour(timezone) {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  return getPartsFromDate(date, timezone);
}

function futureParts(timezone, minutes) {
  return getPartsFromDate(new Date(Date.now() + minutes * 60 * 1000), timezone);
}

function formatDate(value) {
  if (!value) return '—';
  const [year, month, day] = value.split('-');
  return `${day}.${month}.${year}`;
}

function isValidTime(text) {
  return /^([01]?\d|2[0-3])[:.][0-5]\d$/.test(text);
}

function normalizeTime(text) {
  const parts = text.replace('.', ':').split(':');
  return `${parts[0].padStart(2, '0')}:${parts[1]}`;
}

function addMinutesToTime(time, minutes) {
  const [h, m] = time.split(':').map(Number);
  const date = new Date();
  date.setHours(h);
  date.setMinutes(m + minutes);
  return date.toTimeString().slice(0, 5);
}

function isValidTimezone(timezone) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

// ================= ОФОРМЛЕНИЕ =================

function priorityLabel(priority, lang) {
  if (priority === 'high') return b(lang, 'high');
  if (priority === 'low') return b(lang, 'low');
  return b(lang, 'medium');
}

function reminderLabel(minutes, lang) {
  if (minutes === null || minutes === undefined) return b(lang, 'noReminder');
  if (minutes === 0) return b(lang, 'reminderExact');
  if (minutes === 5) return b(lang, 'reminder5');
  if (minutes === 10) return b(lang, 'reminder10');
  if (minutes === 30) return b(lang, 'reminder30');
  if (minutes === 60) return b(lang, 'reminder60');
  return `🔔 ${minutes} min`;
}

function taskCard(task, lang) {
  return (
    `━━━━━━━━━━━━━━\n` +
    `📌 ${task.text}\n\n` +
    `📅 ${formatDate(task.task_date)}\n` +
    `⏰ ${task.time || '—'}\n` +
    `🔔 ${reminderLabel(task.reminder_minutes, lang)}\n` +
    `⭐ ${priorityLabel(task.priority, lang)}\n` +
    `━━━━━━━━━━━━━━`
  );
}

async function sendTask(ctx, task) {
  const settings = await getUserSettings(ctx.from.id);
  const lang = settings.language || DEFAULT_LANGUAGE;

  await ctx.reply(
    taskCard(task, lang),
    Markup.inlineKeyboard([
      [
        Markup.button.callback('✅', `done_${task.id}`),
        Markup.button.callback('⏰ +1h', `plus1_${task.id}`)
      ],
      [
        Markup.button.callback('🔁', `tomorrow_${task.id}`),
        Markup.button.callback('🗑', `delete_${task.id}`)
      ],
      [
        Markup.button.callback('🔔', `remind_${task.id}`)
      ]
    ])
  );
}

// ================= СТАРТ =================

bot.start(async (ctx) => {
  await ensureUser(ctx.from.id);
  const settings = await getUserSettings(ctx.from.id);
  const lang = settings.language || DEFAULT_LANGUAGE;

  delete userState[ctx.from.id];

  await ctx.reply(t(lang, 'start'), menu(lang));
});

// ================= МЕНЮ =================

bot.hears(allButtons('cancel'), async (ctx) => {
  const settings = await getUserSettings(ctx.from.id);
  const lang = settings.language || DEFAULT_LANGUAGE;

  delete userState[ctx.from.id];
  await ctx.reply(t(lang, 'cancelled'), menu(lang));
});

bot.hears(allButtons('back').concat(['⬅️ Назад']), async (ctx) => {
  const settings = await getUserSettings(ctx.from.id);
  const lang = settings.language || DEFAULT_LANGUAGE;

  delete userState[ctx.from.id];
  await ctx.reply(t(lang, 'mainMenu'), menu(lang));
});

bot.hears(allButtons('newTask'), async (ctx) => {
  const settings = await getUserSettings(ctx.from.id);
  const lang = settings.language || DEFAULT_LANGUAGE;

  userState[ctx.from.id] = { step: 'choose_task' };

  await ctx.reply(t(lang, 'chooseTask'), taskTemplatesMenu(lang));
});

bot.hears(allButtons('settings'), async (ctx) => {
  const settings = await getUserSettings(ctx.from.id);
  const lang = settings.language || DEFAULT_LANGUAGE;

  await ctx.reply(
    `${t(lang, 'settingsTitle')}\n\n` +
    `${t(lang, 'digestTime')}: ${settings.digest_time || '09:00'}\n` +
    `${t(lang, 'timezone')}: ${settings.timezone || DEFAULT_TIMEZONE}\n` +
    `${t(lang, 'language')}: ${settings.language || DEFAULT_LANGUAGE}`,
    settingsMenu(lang)
  );
});

bot.hears(allButtons('digest'), async (ctx) => {
  const settings = await getUserSettings(ctx.from.id);
  const lang = settings.language || DEFAULT_LANGUAGE;

  userState[ctx.from.id] = { step: 'digest_time' };

  await ctx.reply(
    t(lang, 'writeDigest'),
    Markup.keyboard([[b(lang, 'cancel')]]).resize()
  );
});

bot.hears(allButtons('timezone'), async (ctx) => {
  const settings = await getUserSettings(ctx.from.id);
  const lang = settings.language || DEFAULT_LANGUAGE;

  userState[ctx.from.id] = { step: 'timezone' };

  await ctx.reply(t(lang, 'chooseTimezone'), timezoneMenu(lang));
});

bot.hears(allButtons('language'), async (ctx) => {
  const settings = await getUserSettings(ctx.from.id);
  const lang = settings.language || DEFAULT_LANGUAGE;

  userState[ctx.from.id] = { step: 'language' };

  await ctx.reply(t(lang, 'chooseLanguage'), languageMenu());
});

// ================= СПИСКИ ЗАДАЧ =================

bot.hears(allButtons('today'), async (ctx) => {
  const state = userState[ctx.from.id];
  const settings = await getUserSettings(ctx.from.id);
  const lang = settings.language || DEFAULT_LANGUAGE;

  if (state?.step === 'date') {
    state.taskDate = todayDate(settings.timezone);
    state.step = 'time';

    return ctx.reply(t(lang, 'chooseTime'), timeMenu(lang));
  }

  if (state) return;

  const res = await pool.query(
    `SELECT * FROM tasks 
     WHERE user_id=$1 AND done=false AND task_date=$2 
     ORDER BY time NULLS LAST, id DESC`,
    [ctx.from.id, todayDate(settings.timezone)]
  );

  if (res.rows.length === 0) {
    return ctx.reply(t(lang, 'noToday'), menu(lang));
  }

  for (const task of res.rows) {
    await sendTask(ctx, task);
  }
});

bot.hears(allButtons('tomorrow'), async (ctx) => {
  const state = userState[ctx.from.id];
  const settings = await getUserSettings(ctx.from.id);
  const lang = settings.language || DEFAULT_LANGUAGE;

  if (state?.step === 'date') {
    state.taskDate = tomorrowDate(settings.timezone);
    state.step = 'time';

    return ctx.reply(t(lang, 'chooseTime'), timeMenu(lang));
  }

  if (state) return;

  const res = await pool.query(
    `SELECT * FROM tasks 
     WHERE user_id=$1 AND done=false AND task_date=$2 
     ORDER BY time NULLS LAST, id DESC`,
    [ctx.from.id, tomorrowDate(settings.timezone)]
  );

  if (res.rows.length === 0) {
    return ctx.reply(t(lang, 'noTomorrow'), menu(lang));
  }

  for (const task of res.rows) {
    await sendTask(ctx, task);
  }
});

bot.hears(allButtons('noDate'), async (ctx) => {
  const state = userState[ctx.from.id];
  const settings = await getUserSettings(ctx.from.id);
  const lang = settings.language || DEFAULT_LANGUAGE;

  if (state?.step !== 'date') return;

  state.taskDate = null;
  state.step = 'time';

  await ctx.reply(t(lang, 'chooseTime'), timeMenu(lang));
});

bot.hears(allButtons('allTasks'), async (ctx) => {
  const settings = await getUserSettings(ctx.from.id);
  const lang = settings.language || DEFAULT_LANGUAGE;

  if (userState[ctx.from.id]) return;

  const res = await pool.query(
    `SELECT * FROM tasks 
     WHERE user_id=$1 AND done=false 
     ORDER BY task_date NULLS LAST, time NULLS LAST, id DESC`,
    [ctx.from.id]
  );

  if (res.rows.length === 0) {
    return ctx.reply(t(lang, 'noActive'), menu(lang));
  }

  for (const task of res.rows) {
    await sendTask(ctx, task);
  }
});

bot.hears(allButtons('doneTasks'), async (ctx) => {
  const settings = await getUserSettings(ctx.from.id);
  const lang = settings.language || DEFAULT_LANGUAGE;

  if (userState[ctx.from.id]) return;

  const res = await pool.query(
    'SELECT * FROM tasks WHERE user_id=$1 AND done=true ORDER BY id DESC LIMIT 10',
    [ctx.from.id]
  );

  if (res.rows.length === 0) {
    return ctx.reply(t(lang, 'noDone'), menu(lang));
  }

  await ctx.reply(
    res.rows
      .map((x, i) => `${i + 1}. ✅ ${x.text} — ${formatDate(x.task_date)} ${x.time || ''}`)
      .join('\n'),
    menu(lang)
  );
});

bot.hears(allButtons('stats'), async (ctx) => {
  const settings = await getUserSettings(ctx.from.id);
  const lang = settings.language || DEFAULT_LANGUAGE;

  if (userState[ctx.from.id]) return;

  const active = await pool.query(
    'SELECT COUNT(*) FROM tasks WHERE user_id=$1 AND done=false',
    [ctx.from.id]
  );

  const done = await pool.query(
    'SELECT COUNT(*) FROM tasks WHERE user_id=$1 AND done=true',
    [ctx.from.id]
  );

  const today = await pool.query(
    'SELECT COUNT(*) FROM tasks WHERE user_id=$1 AND done=false AND task_date=$2',
    [ctx.from.id, todayDate(settings.timezone)]
  );

  await ctx.reply(
    `${t(lang, 'stats')}\n\n` +
    `📋 Active: ${active.rows[0].count}\n` +
    `📅 Today: ${today.rows[0].count}\n` +
    `✅ Done: ${done.rows[0].count}`,
    menu(lang)
  );
});

// ================= ТЕКСТОВАЯ ЛОГИКА =================

bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.message.text;
  const settings = await getUserSettings(userId);
  const lang = settings.language || DEFAULT_LANGUAGE;
  const state = userState[userId];

  if (!state) {
    return ctx.reply(t(lang, 'addTaskHint'), menu(lang));
  }

  if (state.step === 'language') {
    let newLang = null;

    if (text.includes('Русский')) newLang = 'ru';
    if (text.includes('English')) newLang = 'en';
    if (text.includes('Deutsch')) newLang = 'de';

    if (!newLang) {
      return ctx.reply(t(lang, 'chooseLanguage'), languageMenu());
    }

    await pool.query(
      'UPDATE users_settings SET language=$1 WHERE user_id=$2',
      [newLang, userId]
    );

    delete userState[userId];

    return ctx.reply(t(newLang, 'languageSaved'), menu(newLang));
  }

  if (state.step === 'timezone') {
    if (isButton(text, 'manual')) {
      state.step = 'timezone_manual';
      return ctx.reply(t(lang, 'writeTimezone'));
    }

    const timezone = TIMEZONES[text];

    if (!timezone) {
      return ctx.reply(t(lang, 'chooseTimezone'), timezoneMenu(lang));
    }

    await pool.query(
      'UPDATE users_settings SET timezone=$1 WHERE user_id=$2',
      [timezone, userId]
    );

    delete userState[userId];

    return ctx.reply(`${t(lang, 'timezoneSaved')} ${timezone}`, menu(lang));
  }

  if (state.step === 'timezone_manual') {
    const timezone = text.trim();

    if (!isValidTimezone(timezone)) {
      return ctx.reply(t(lang, 'timezoneError'));
    }

    await pool.query(
      'UPDATE users_settings SET timezone=$1 WHERE user_id=$2',
      [timezone, userId]
    );

    delete userState[userId];

    return ctx.reply(`${t(lang, 'timezoneSaved')} ${timezone}`, menu(lang));
  }

  if (state.step === 'choose_task') {
    if (isButton(text, 'ownTask')) {
      state.step = 'text';
      return ctx.reply(t(lang, 'writeTask'), Markup.keyboard([[b(lang, 'cancel')]]).resize());
    }

    const templates = {
      '💧 Water': lang === 'ru' ? 'Выпить воду' : lang === 'de' ? 'Wasser trinken' : 'Drink water',
      '🏃 Workout': lang === 'ru' ? 'Тренировка' : lang === 'de' ? 'Training' : 'Workout',
      '🛒 Groceries': lang === 'ru' ? 'Купить продукты' : lang === 'de' ? 'Einkaufen' : 'Buy groceries',
      '📞 Call': lang === 'ru' ? 'Позвонить' : lang === 'de' ? 'Anrufen' : 'Call',
      '📚 Study': lang === 'ru' ? 'Учёба' : lang === 'de' ? 'Lernen' : 'Study'
    };

    if (!templates[text]) {
      return ctx.reply(t(lang, 'chooseTask'), taskTemplatesMenu(lang));
    }

    state.text = templates[text];
    state.step = 'date';

    return ctx.reply(t(lang, 'chooseDate'), dateMenu(lang));
  }

  if (state.step === 'digest_time') {
    if (!isValidTime(text)) {
      return ctx.reply(t(lang, 'invalidDigest'));
    }

    const time = normalizeTime(text);

    await pool.query(
      `INSERT INTO users_settings (user_id, digest_time)
       VALUES ($1, $2)
       ON CONFLICT (user_id)
       DO UPDATE SET digest_time=$2`,
      [userId, time]
    );

    delete userState[userId];

    return ctx.reply(`${t(lang, 'digestSaved')} ${time}`, menu(lang));
  }

  if (state.step === 'text') {
    state.text = text.trim();

    if (!state.text) {
      return ctx.reply(t(lang, 'writeTask'));
    }

    state.step = 'date';

    return ctx.reply(t(lang, 'chooseDate'), dateMenu(lang));
  }

  if (state.step === 'time') {
    if (isButton(text, 'noTime') || text.toLowerCase() === 'нет' || text.toLowerCase() === 'no') {
      state.time = null;
      state.reminderMinutes = null;
      state.step = 'priority';

      return ctx.reply(t(lang, 'choosePriority'), priorityMenu(lang));
    }

    if (isButton(text, 'in1h')) {
      const oneHour = timeInOneHour(settings.timezone);
      state.taskDate = oneHour.date;
      state.time = oneHour.time;
      state.step = 'reminder';

      return ctx.reply(t(lang, 'chooseReminder'), reminderMenu(lang));
    }

    if (isButton(text, 'evening')) {
      state.time = '19:00';
      state.step = 'reminder';

      return ctx.reply(t(lang, 'chooseReminder'), reminderMenu(lang));
    }

    if (isButton(text, 'tomorrowMorning')) {
      state.taskDate = tomorrowDate(settings.timezone);
      state.time = '09:00';
      state.step = 'reminder';

      return ctx.reply(t(lang, 'chooseReminder'), reminderMenu(lang));
    }

    if (!isValidTime(text)) {
      return ctx.reply(t(lang, 'invalidTime'));
    }

    state.time = normalizeTime(text);
    state.step = 'reminder';

    return ctx.reply(t(lang, 'chooseReminder'), reminderMenu(lang));
  }

  if (state.step === 'reminder') {
    if (isButton(text, 'noReminder')) state.reminderMinutes = null;
    else if (isButton(text, 'reminderExact')) state.reminderMinutes = 0;
    else if (isButton(text, 'reminder5')) state.reminderMinutes = 5;
    else if (isButton(text, 'reminder10')) state.reminderMinutes = 10;
    else if (isButton(text, 'reminder30')) state.reminderMinutes = 30;
    else if (isButton(text, 'reminder60')) state.reminderMinutes = 60;
    else return ctx.reply(t(lang, 'chooseReminder'), reminderMenu(lang));

    state.step = 'priority';

    return ctx.reply(t(lang, 'choosePriority'), priorityMenu(lang));
  }

  if (state.step === 'priority') {
    let priority = null;

    if (text.includes('Низкий') || text.includes('Low') || text.includes('Niedrig')) priority = 'low';
    else if (text.includes('Средний') || text.includes('Medium') || text.includes('Mittel')) priority = 'medium';
    else if (text.includes('Высокий') || text.includes('High') || text.includes('Hoch')) priority = 'high';

    if (!priority) {
      return ctx.reply(t(lang, 'choosePriority'), priorityMenu(lang));
    }

    await pool.query(
      `INSERT INTO tasks (user_id, text, task_date, time, priority, reminder_minutes)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        userId,
        state.text,
        state.taskDate,
        state.time,
        priority,
        state.reminderMinutes
      ]
    );

    const message =
      `${t(lang, 'taskAdded')}\n\n` +
      `📌 ${state.text}\n` +
      `📅 ${formatDate(state.taskDate)}\n` +
      `⏰ ${state.time || '—'}\n` +
      `🔔 ${reminderLabel(state.reminderMinutes, lang)}\n` +
      `⭐ ${priorityLabel(priority, lang)}`;

    delete userState[userId];

    return ctx.reply(message, menu(lang));
  }
});

// ================= КНОПКИ ПОД ЗАДАЧАМИ =================

bot.action(/done_(\d+)/, async (ctx) => {
  await pool.query(
    'UPDATE tasks SET done=true WHERE id=$1 AND user_id=$2',
    [ctx.match[1], ctx.from.id]
  );

  await ctx.answerCbQuery('✅');
  await ctx.editMessageText('✅');
});

bot.action(/delete_(\d+)/, async (ctx) => {
  await pool.query(
    'DELETE FROM tasks WHERE id=$1 AND user_id=$2',
    [ctx.match[1], ctx.from.id]
  );

  await ctx.answerCbQuery('🗑');
  await ctx.editMessageText('🗑');
});

bot.action(/tomorrow_(\d+)/, async (ctx) => {
  const settings = await getUserSettings(ctx.from.id);

  await pool.query(
    `UPDATE tasks 
     SET task_date=$1, notified=false, pre_notified=false 
     WHERE id=$2 AND user_id=$3`,
    [tomorrowDate(settings.timezone), ctx.match[1], ctx.from.id]
  );

  await ctx.answerCbQuery('🔁');
  await ctx.editMessageText('🔁');
});

bot.action(/plus1_(\d+)/, async (ctx) => {
  const res = await pool.query(
    'SELECT * FROM tasks WHERE id=$1 AND user_id=$2',
    [ctx.match[1], ctx.from.id]
  );

  const task = res.rows[0];

  if (!task || !task.time) {
    await ctx.answerCbQuery('No time');
    return;
  }

  const newTime = addMinutesToTime(task.time, 60);

  await pool.query(
    `UPDATE tasks 
     SET time=$1, notified=false, pre_notified=false 
     WHERE id=$2 AND user_id=$3`,
    [newTime, ctx.match[1], ctx.from.id]
  );

  await ctx.answerCbQuery(`⏰ ${newTime}`);
  await ctx.editMessageText(`⏰ ${newTime}`);
});

bot.action(/remind_(\d+)/, async (ctx) => {
  const settings = await getUserSettings(ctx.from.id);
  const lang = settings.language || DEFAULT_LANGUAGE;

  const res = await pool.query(
    'SELECT * FROM tasks WHERE id=$1 AND user_id=$2',
    [ctx.match[1], ctx.from.id]
  );

  const task = res.rows[0];

  if (!task) {
    await ctx.answerCbQuery('Not found');
    return;
  }

  await ctx.answerCbQuery('🔔');

  await ctx.reply(
    `${t(lang, 'reminderNow')}\n\n` +
    `📌 ${task.text}\n` +
    `📅 ${formatDate(task.task_date)}\n` +
    `🕒 ${task.time || '—'}`
  );
});

// ================= НАПОМИНАНИЯ =================

setInterval(async () => {
  try {
    const tasks = await pool.query(`
      SELECT 
        tasks.*,
        users_settings.timezone,
        users_settings.language
      FROM tasks
      LEFT JOIN users_settings ON tasks.user_id = users_settings.user_id
      WHERE tasks.done=false
      AND tasks.time IS NOT NULL
      AND tasks.reminder_minutes IS NOT NULL
    `);

    for (const task of tasks.rows) {
      const timezone = task.timezone || DEFAULT_TIMEZONE;
      const lang = task.language || DEFAULT_LANGUAGE;
      const now = getNowParts(timezone);

      if (task.reminder_minutes > 0 && task.pre_notified === false) {
        const target = futureParts(timezone, task.reminder_minutes);

        if (task.task_date === target.date && task.time === target.time) {
          await bot.telegram.sendMessage(
            task.user_id,
            `${t(lang, 'soonTask')}\n\n` +
            `${task.reminder_minutes} min\n` +
            `📌 ${task.text}\n` +
            `🕒 ${task.time}`
          );

          await pool.query(
            'UPDATE tasks SET pre_notified=true WHERE id=$1',
            [task.id]
          );
        }
      }

      if (
        task.task_date === now.date &&
        task.time === now.time &&
        task.notified === false
      ) {
        await bot.telegram.sendMessage(
          task.user_id,
          `${t(lang, 'reminder')}\n\n` +
          `📌 ${task.text}\n` +
          `📅 ${formatDate(task.task_date)}\n` +
          `🕒 ${task.time}`
        );

        await pool.query(
          'UPDATE tasks SET notified=true WHERE id=$1',
          [task.id]
        );
      }
    }

    const users = await pool.query('SELECT * FROM users_settings');

    for (const user of users.rows) {
      const timezone = user.timezone || DEFAULT_TIMEZONE;
      const lang = user.language || DEFAULT_LANGUAGE;
      const now = getNowParts(timezone);

      if (user.digest_time === now.time && user.digest_sent_date !== now.date) {
        const todayTasks = await pool.query(
          `SELECT * FROM tasks
           WHERE user_id=$1 AND task_date=$2 AND done=false
           ORDER BY time NULLS LAST, id DESC`,
          [user.user_id, now.date]
        );

        if (todayTasks.rows.length > 0) {
          const list = todayTasks.rows
            .map((x, i) => `${i + 1}. ${x.time || '—'} — ${x.text}`)
            .join('\n');

          await bot.telegram.sendMessage(
            user.user_id,
            `${t(lang, 'morning')}\n\n${t(lang, 'todayTasks')} ${todayTasks.rows.length}\n\n${list}`
          );
        } else {
          await bot.telegram.sendMessage(
            user.user_id,
            `${t(lang, 'morning')}\n\n${t(lang, 'noTasksMorning')}`
          );
        }

        await pool.query(
          'UPDATE users_settings SET digest_sent_date=$1 WHERE user_id=$2',
          [now.date, user.user_id]
        );
      }
    }
  } catch (e) {
    console.log('TIMER ERROR', e.message);
  }
}, 60000);

// ================= ЗАПУСК =================

initDB()
  .then(async () => {
    await bot.telegram.deleteWebhook();
    bot.launch();
    console.log('Bot started');
  })
  .catch((e) => {
    console.log('START ERROR', e.message);
  });
