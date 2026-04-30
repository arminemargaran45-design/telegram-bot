const { Telegraf, Markup } = require('telegraf');
const { Pool } = require('pg');

const bot = new Telegraf(process.env.BOT_TOKEN);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const PROVIDER_TOKEN = process.env.PROVIDER_TOKEN;
const ADMIN_ID = Number(process.env.ADMIN_ID);
const PRICE_RUB = 50000;

const userState = {};
const DEFAULT_TIMEZONE = 'Europe/Moscow';

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
      repeat_rule TEXT DEFAULT 'none',
      repeat_created BOOLEAN DEFAULT false,
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
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS repeat_rule TEXT DEFAULT 'none'`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS repeat_created BOOLEAN DEFAULT false`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS done BOOLEAN DEFAULT false`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS notified BOOLEAN DEFAULT false`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS pre_notified BOOLEAN DEFAULT false`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users_settings (
      user_id BIGINT PRIMARY KEY,
      digest_time TEXT DEFAULT '09:00',
      digest_sent_date TEXT,
      timezone TEXT DEFAULT 'Europe/Moscow',
      streak INTEGER DEFAULT 0,
      last_done_date TEXT
    )
  `);

  await pool.query(`ALTER TABLE users_settings ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'Europe/Moscow'`);
  await pool.query(`ALTER TABLE users_settings ADD COLUMN IF NOT EXISTS streak INTEGER DEFAULT 0`);
  await pool.query(`ALTER TABLE users_settings ADD COLUMN IF NOT EXISTS last_done_date TEXT`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      user_id BIGINT PRIMARY KEY,
      trial_end TIMESTAMP,
      paid_until TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
}

async function ensureUser(userId) {
  await pool.query(
    `INSERT INTO users_settings (user_id, timezone)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId, DEFAULT_TIMEZONE]
  );

  await pool.query(
    `INSERT INTO subscriptions (user_id, trial_end)
     VALUES ($1, NOW() + INTERVAL '7 days')
     ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );
}

async function getSettings(userId) {
  await ensureUser(userId);

  const res = await pool.query(
    'SELECT * FROM users_settings WHERE user_id=$1',
    [userId]
  );

  return res.rows[0] || {
    digest_time: '09:00',
    timezone: DEFAULT_TIMEZONE,
    streak: 0
  };
}

async function getSubscription(userId) {
  await ensureUser(userId);

  const res = await pool.query(
    'SELECT * FROM subscriptions WHERE user_id=$1',
    [userId]
  );

  return res.rows[0];
}

async function hasAccess(userId) {
  const sub = await getSubscription(userId);
  if (!sub) return false;

  const now = new Date();

  if (sub.paid_until && new Date(sub.paid_until) > now) return true;
  if (sub.trial_end && new Date(sub.trial_end) > now) return true;

  return false;
}

function formatSubDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('ru-RU');
}

async function subscriptionText(userId) {
  const sub = await getSubscription(userId);
  const now = new Date();

  if (sub?.paid_until && new Date(sub.paid_until) > now) {
    return `✅ Подписка активна до: ${formatSubDate(sub.paid_until)}`;
  }

  if (sub?.trial_end && new Date(sub.trial_end) > now) {
    return `🎁 Бесплатный период активен до: ${formatSubDate(sub.trial_end)}`;
  }

  return '💎 Бесплатный период закончился.\n\nЧтобы пользоваться ботом дальше, оформи подписку: 500₽/мес.';
}

function menu() {
  return Markup.keyboard([
    ['➕ Новая задача', '📅 Сегодня'],
    ['🗓 Завтра', '⏳ Просроченные'],
    ['📋 Все задачи', '✅ Выполненные'],
    ['📊 Статистика', '⚙️ Настройки'],
    ['💎 Подписка', '💎 Статус подписки']
  ]).resize();
}

function subscriptionMenu() {
  return Markup.keyboard([
    ['💎 Подписка'],
    ['💎 Статус подписки']
  ]).resize();
}

function taskTemplatesMenu() {
  return Markup.keyboard([
    ['💧 Выпить воду', '🏃 Тренировка'],
    ['🛒 Купить продукты', '📞 Позвонить'],
    ['📚 Учёба', '✍️ Своя задача'],
    ['❌ Отмена']
  ]).resize();
}

function dateMenu() {
  return Markup.keyboard([
    ['📅 Сегодня', '🗓 Завтра'],
    ['🗂 Без даты'],
    ['❌ Отмена']
  ]).resize();
}

function timeMenu() {
  return Markup.keyboard([
    ['⏰ Через 1 час', '🌙 Вечером'],
    ['🌅 Завтра утром', '🕳 Без времени'],
    ['❌ Отмена']
  ]).resize();
}

function reminderMenu() {
  return Markup.keyboard([
    ['🔔 За 5 минут', '🔔 За 10 минут'],
    ['🔔 За 30 минут', '🔔 За 1 час'],
    ['⏰ В момент задачи', '🔕 Без напоминания'],
    ['❌ Отмена']
  ]).resize();
}

function repeatMenu() {
  return Markup.keyboard([
    ['🚫 Не повторять'],
    ['🔁 Каждый день'],
    ['📆 Каждую неделю'],
    ['❌ Отмена']
  ]).resize();
}

function priorityMenu() {
  return Markup.keyboard([
    ['🟢 Низкий', '⚪ Средний', '🔥 Высокий'],
    ['❌ Отмена']
  ]).resize();
}

function settingsMenu() {
  return Markup.keyboard([
    ['⏰ Время утреннего плана'],
    ['🌍 Часовой пояс'],
    ['⬅️ Назад']
  ]).resize();
}

function timezoneMenu() {
  return Markup.keyboard([
    ['🇷🇺 Москва', '🇦🇹 Вена'],
    ['🇩🇪 Берлин', '🇰🇿 Алматы'],
    ['🇦🇪 Дубай', '🇺🇸 Нью-Йорк'],
    ['🇺🇸 Лос-Анджелес', '🇬🇧 Лондон'],
    ['✍️ Ввести вручную'],
    ['⬅️ Назад']
  ]).resize();
}

function editMenu(taskId) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('📌 Текст', `edittext_${taskId}`),
      Markup.button.callback('📅 Дата', `editdate_${taskId}`)
    ],
    [
      Markup.button.callback('⏰ Время', `edittime_${taskId}`),
      Markup.button.callback('🔔 Напоминание', `editrem_${taskId}`)
    ],
    [
      Markup.button.callback('🔁 Повтор', `editrep_${taskId}`),
      Markup.button.callback('⭐ Приоритет', `editpri_${taskId}`)
    ]
  ]);
}

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

function addDaysToDate(dateText, days) {
  const date = new Date(`${dateText}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
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

function priorityLabel(priority) {
  if (priority === 'high') return '🔥 Высокий';
  if (priority === 'low') return '🟢 Низкий';
  return '⚪ Средний';
}

function reminderLabel(minutes) {
  if (minutes === null || minutes === undefined) return '🔕 Без напоминания';
  if (minutes === 0) return '⏰ В момент задачи';
  if (minutes === 5) return '🔔 За 5 минут';
  if (minutes === 10) return '🔔 За 10 минут';
  if (minutes === 30) return '🔔 За 30 минут';
  if (minutes === 60) return '🔔 За 1 час';
  return `🔔 За ${minutes} минут`;
}

function repeatLabel(rule) {
  if (rule === 'daily') return '🔁 Каждый день';
  if (rule === 'weekly') return '📆 Каждую неделю';
  return '🚫 Не повторять';
}

function taskCard(task) {
  return (
    `━━━━━━━━━━━━━━\n` +
    `📌 ${task.text}\n\n` +
    `📅 ${formatDate(task.task_date)}\n` +
    `⏰ ${task.time || '—'}\n` +
    `🔔 ${reminderLabel(task.reminder_minutes)}\n` +
    `🔁 ${repeatLabel(task.repeat_rule)}\n` +
    `⭐ ${priorityLabel(task.priority)}\n` +
    `━━━━━━━━━━━━━━`
  );
}

async function sendTask(ctx, task) {
  await ctx.reply(
    taskCard(task),
    Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Готово', `done_${task.id}`),
        Markup.button.callback('✏️ Редактировать', `edit_${task.id}`)
      ],
      [
        Markup.button.callback('⏰ +1 час', `plus1_${task.id}`),
        Markup.button.callback('🔁 На завтра', `tomorrow_${task.id}`)
      ],
      [
        Markup.button.callback('🔔 Напомнить', `remind_${task.id}`),
        Markup.button.callback('🗑 Удалить', `delete_${task.id}`)
      ]
    ])
  );
}

async function createNextRepeatTask(task) {
  if (!task || task.repeat_created === true) return;
  if (!task.repeat_rule || task.repeat_rule === 'none') return;
  if (!task.task_date) return;

  let nextDate = null;

  if (task.repeat_rule === 'daily') nextDate = addDaysToDate(task.task_date, 1);
  if (task.repeat_rule === 'weekly') nextDate = addDaysToDate(task.task_date, 7);

  if (!nextDate) return;

  await pool.query(
    `INSERT INTO tasks 
     (user_id, text, task_date, time, priority, reminder_minutes, repeat_rule)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      task.user_id,
      task.text,
      nextDate,
      task.time,
      task.priority,
      task.reminder_minutes,
      task.repeat_rule
    ]
  );

  await pool.query(
    'UPDATE tasks SET repeat_created=true WHERE id=$1',
    [task.id]
  );
}

async function updateStreak(userId, timezone) {
  const today = todayDate(timezone);
  const yesterday = addDaysToDate(today, -1);

  const res = await pool.query(
    'SELECT streak, last_done_date FROM users_settings WHERE user_id=$1',
    [userId]
  );

  const user = res.rows[0];
  if (!user) return;

  let streak = user.streak || 0;

  if (user.last_done_date === today) return;

  if (user.last_done_date === yesterday) streak += 1;
  else streak = 1;

  await pool.query(
    'UPDATE users_settings SET streak=$1, last_done_date=$2 WHERE user_id=$3',
    [streak, today, userId]
  );
}

// ================= АДМИН-ПАНЕЛЬ =================

bot.command('myid', async (ctx) => {
  await ctx.reply(`Твой Telegram ID: ${ctx.from.id}`);
});

bot.command('admin', async (ctx) => {
  try {
    if (!ADMIN_ID || ctx.from.id !== ADMIN_ID) {
      return ctx.reply(
        `⛔ Нет доступа\n\n` +
        `Твой ID: ${ctx.from.id}\n` +
        `ADMIN_ID в Railway: ${ADMIN_ID || 'не указан'}`
      );
    }

    const users = await pool.query(`SELECT COUNT(*) FROM users_settings`);

    const trial = await pool.query(`
      SELECT COUNT(*) FROM subscriptions
      WHERE trial_end > NOW()
      AND (paid_until IS NULL OR paid_until < NOW())
    `);

    const paid = await pool.query(`
      SELECT COUNT(*) FROM subscriptions
      WHERE paid_until > NOW()
    `);

    const expired = await pool.query(`
      SELECT COUNT(*) FROM subscriptions
      WHERE (trial_end IS NULL OR trial_end < NOW())
      AND (paid_until IS NULL OR paid_until < NOW())
    `);

    const tasks = await pool.query(`SELECT COUNT(*) FROM tasks`);
    const activeTasks = await pool.query(`SELECT COUNT(*) FROM tasks WHERE done=false`);
    const doneTasks = await pool.query(`SELECT COUNT(*) FROM tasks WHERE done=true`);

    const todayUsers = await pool.query(`
      SELECT COUNT(DISTINCT user_id) FROM tasks
      WHERE created_at::date = NOW()::date
    `);

    const todayTasks = await pool.query(`
      SELECT COUNT(*) FROM tasks
      WHERE created_at::date = NOW()::date
    `);

    await ctx.reply(
      `📊 Админ-панель\n\n` +
      `👥 Пользователей всего: ${users.rows[0].count}\n` +
      `🎁 На пробном периоде: ${trial.rows[0].count}\n` +
      `💎 Оплатили: ${paid.rows[0].count}\n` +
      `🚫 Без доступа: ${expired.rows[0].count}\n\n` +
      `📋 Всего задач: ${tasks.rows[0].count}\n` +
      `🟡 Активных задач: ${activeTasks.rows[0].count}\n` +
      `✅ Выполненных задач: ${doneTasks.rows[0].count}\n\n` +
      `🔥 Создавали задачи сегодня: ${todayUsers.rows[0].count}\n` +
      `🆕 Задач создано сегодня: ${todayTasks.rows[0].count}`
    );
  } catch (e) {
    await ctx.reply(`❌ Ошибка админки:\n${e.message}`);
  }
});

// ================= СТАРТ И ОПЛАТА =================

bot.start(async (ctx) => {
  await ensureUser(ctx.from.id);
  delete userState[ctx.from.id];

  const subText = await subscriptionText(ctx.from.id);

  await ctx.reply(
    `👋 Привет! Я твой умный планировщик задач.\n\n` +
    `🎁 Первые 7 дней бесплатно.\n` +
    `Потом подписка: 500₽/мес.\n\n` +
    `${subText}`,
    menu()
  );
});

async function sendSubscriptionInvoice(ctx) {
  if (!PROVIDER_TOKEN) {
    return ctx.reply('❗ Не найден PROVIDER_TOKEN. Добавь его в Railway Variables.', menu());
  }

  await ctx.reply(
    '💎 Подписка\n\n' +
    '🎁 Первые 7 дней бесплатно\n' +
    '💳 Далее: 500₽/мес\n\n' +
    'Telegram не делает автосписание — пользователь оплачивает каждый месяц сам.'
  );

  await ctx.replyWithInvoice({
    title: 'Подписка PRO',
    description: 'Доступ к боту на 30 дней',
    payload: `subscription_${ctx.from.id}_${Date.now()}`,
    provider_token: PROVIDER_TOKEN,
    currency: 'RUB',
    prices: [
      {
        label: 'Подписка PRO',
        amount: PRICE_RUB
      }
    ]
  });
}

bot.hears('💎 Подписка', async (ctx) => {
  await ensureUser(ctx.from.id);
  await sendSubscriptionInvoice(ctx);
});

bot.hears('💎 Статус подписки', async (ctx) => {
  await ensureUser(ctx.from.id);
  const text = await subscriptionText(ctx.from.id);
  await ctx.reply(text, menu());
});

bot.on('pre_checkout_query', async (ctx) => {
  await ctx.answerPreCheckoutQuery(true);
});

bot.on('successful_payment', async (ctx) => {
  await pool.query(
    `INSERT INTO subscriptions (user_id, paid_until)
     VALUES ($1, NOW() + INTERVAL '30 days')
     ON CONFLICT (user_id)
     DO UPDATE SET paid_until = GREATEST(COALESCE(subscriptions.paid_until, NOW()), NOW()) + INTERVAL '30 days'`,
    [ctx.from.id]
  );

  await ctx.reply('✅ Оплата прошла! Доступ открыт на 30 дней 🎉', menu());
});

// ================= ПРОВЕРКА ДОСТУПА =================

bot.use(async (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId) return next();

  await ensureUser(userId);

  const access = await hasAccess(userId);

  if (access) return next();

  if (ctx.callbackQuery) {
    await ctx.answerCbQuery('Нужна подписка');
  }

  return ctx.reply(
    '💎 Бесплатный период закончился.\n\nЧтобы пользоваться ботом дальше, оформи подписку: 500₽/мес.',
    subscriptionMenu()
  );
});

// ================= МЕНЮ =================

bot.hears('❌ Отмена', async (ctx) => {
  delete userState[ctx.from.id];
  await ctx.reply('Ок, отменено.', menu());
});

bot.hears('⬅️ Назад', async (ctx) => {
  delete userState[ctx.from.id];
  await ctx.reply('Главное меню', menu());
});

bot.hears('➕ Новая задача', async (ctx) => {
  userState[ctx.from.id] = { step: 'choose_task' };
  await ctx.reply('Выбери задачу из списка или добавь свою 👇', taskTemplatesMenu());
});

bot.hears('⚙️ Настройки', async (ctx) => {
  const settings = await getSettings(ctx.from.id);

  await ctx.reply(
    `⚙️ Настройки\n\n` +
    `☀️ Утренний план: ${settings.digest_time || '09:00'}\n` +
    `🌍 Часовой пояс: ${settings.timezone || DEFAULT_TIMEZONE}`,
    settingsMenu()
  );
});

bot.hears('⏰ Время утреннего плана', async (ctx) => {
  userState[ctx.from.id] = { step: 'digest_time' };
  await ctx.reply('Напиши время утреннего плана.\n\nНапример: 09:00');
});

bot.hears('🌍 Часовой пояс', async (ctx) => {
  userState[ctx.from.id] = { step: 'timezone' };
  await ctx.reply('Выбери свой часовой пояс 👇', timezoneMenu());
});

bot.hears('📅 Сегодня', async (ctx) => {
  const state = userState[ctx.from.id];
  const settings = await getSettings(ctx.from.id);

  if (state?.step === 'date') {
    state.taskDate = todayDate(settings.timezone);
    state.step = 'time';
    return ctx.reply('⏰ Когда задача?', timeMenu());
  }

  if (state?.step === 'edit_date') {
    await pool.query(
      'UPDATE tasks SET task_date=$1, notified=false, pre_notified=false WHERE id=$2 AND user_id=$3',
      [todayDate(settings.timezone), state.taskId, ctx.from.id]
    );
    delete userState[ctx.from.id];
    return ctx.reply('✅ Задача обновлена!', menu());
  }

  if (state) return;

  const res = await pool.query(
    `SELECT * FROM tasks 
     WHERE user_id=$1 AND done=false AND task_date=$2 
     ORDER BY time NULLS LAST, id DESC`,
    [ctx.from.id, todayDate(settings.timezone)]
  );

  if (res.rows.length === 0) return ctx.reply('📭 На сегодня задач нет', menu());

  for (const task of res.rows) await sendTask(ctx, task);
});

bot.hears('🗓 Завтра', async (ctx) => {
  const state = userState[ctx.from.id];
  const settings = await getSettings(ctx.from.id);

  if (state?.step === 'date') {
    state.taskDate = tomorrowDate(settings.timezone);
    state.step = 'time';
    return ctx.reply('⏰ Когда задача?', timeMenu());
  }

  if (state?.step === 'edit_date') {
    await pool.query(
      'UPDATE tasks SET task_date=$1, notified=false, pre_notified=false WHERE id=$2 AND user_id=$3',
      [tomorrowDate(settings.timezone), state.taskId, ctx.from.id]
    );
    delete userState[ctx.from.id];
    return ctx.reply('✅ Задача обновлена!', menu());
  }

  if (state) return;

  const res = await pool.query(
    `SELECT * FROM tasks 
     WHERE user_id=$1 AND done=false AND task_date=$2 
     ORDER BY time NULLS LAST, id DESC`,
    [ctx.from.id, tomorrowDate(settings.timezone)]
  );

  if (res.rows.length === 0) return ctx.reply('📭 На завтра задач нет', menu());

  for (const task of res.rows) await sendTask(ctx, task);
});

bot.hears('🗂 Без даты', async (ctx) => {
  const state = userState[ctx.from.id];

  if (state?.step === 'date') {
    state.taskDate = null;
    state.step = 'time';
    return ctx.reply('⏰ Когда задача?', timeMenu());
  }

  if (state?.step === 'edit_date') {
    await pool.query(
      'UPDATE tasks SET task_date=NULL, notified=false, pre_notified=false WHERE id=$1 AND user_id=$2',
      [state.taskId, ctx.from.id]
    );
    delete userState[ctx.from.id];
    return ctx.reply('✅ Задача обновлена!', menu());
  }
});

bot.hears('⏳ Просроченные', async (ctx) => {
  const settings = await getSettings(ctx.from.id);
  const today = todayDate(settings.timezone);

  const res = await pool.query(
    `SELECT * FROM tasks
     WHERE user_id=$1 AND done=false AND task_date IS NOT NULL AND task_date < $2
     ORDER BY task_date ASC, time NULLS LAST`,
    [ctx.from.id, today]
  );

  if (res.rows.length === 0) return ctx.reply('🎉 Просроченных задач нет', menu());

  await ctx.reply('⏳ Просроченные задачи');

  for (const task of res.rows) await sendTask(ctx, task);
});

bot.hears('📋 Все задачи', async (ctx) => {
  const res = await pool.query(
    `SELECT * FROM tasks 
     WHERE user_id=$1 AND done=false 
     ORDER BY task_date NULLS LAST, time NULLS LAST, id DESC`,
    [ctx.from.id]
  );

  if (res.rows.length === 0) return ctx.reply('📭 Активных задач пока нет', menu());

  for (const task of res.rows) await sendTask(ctx, task);
});

bot.hears('✅ Выполненные', async (ctx) => {
  const res = await pool.query(
    'SELECT * FROM tasks WHERE user_id=$1 AND done=true ORDER BY id DESC LIMIT 10',
    [ctx.from.id]
  );

  if (res.rows.length === 0) return ctx.reply('Пока нет выполненных задач', menu());

  await ctx.reply(
    res.rows.map((x, i) => `${i + 1}. ✅ ${x.text} — ${formatDate(x.task_date)} ${x.time || ''}`).join('\n'),
    menu()
  );
});

bot.hears('📊 Статистика', async (ctx) => {
  const settings = await getSettings(ctx.from.id);
  const today = todayDate(settings.timezone);

  const active = await pool.query('SELECT COUNT(*) FROM tasks WHERE user_id=$1 AND done=false', [ctx.from.id]);
  const done = await pool.query('SELECT COUNT(*) FROM tasks WHERE user_id=$1 AND done=true', [ctx.from.id]);
  const todayCount = await pool.query(
    'SELECT COUNT(*) FROM tasks WHERE user_id=$1 AND done=false AND task_date=$2',
    [ctx.from.id, today]
  );
  const overdue = await pool.query(
    'SELECT COUNT(*) FROM tasks WHERE user_id=$1 AND done=false AND task_date IS NOT NULL AND task_date < $2',
    [ctx.from.id, today]
  );

  await ctx.reply(
    `📊 Статистика\n\n` +
    `📋 Активные: ${active.rows[0].count}\n` +
    `📅 Сегодня: ${todayCount.rows[0].count}\n` +
    `⏳ Просроченные: ${overdue.rows[0].count}\n` +
    `✅ Выполненные: ${done.rows[0].count}\n` +
    `🔥 Стрик: ${settings.streak || 0}`,
    menu()
  );
});

// ================= ТЕКСТОВАЯ ЛОГИКА =================

bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.message.text;
  const settings = await getSettings(userId);
  const state = userState[userId];

  if (!state) return ctx.reply('Нажми «➕ Новая задача», чтобы добавить задачу.', menu());

  if (state.step === 'timezone') {
    if (text === '✍️ Ввести вручную') {
      state.step = 'timezone_manual';
      return ctx.reply('Напиши часовой пояс текстом.\n\nНапример:\nEurope/Vienna\nEurope/Moscow');
    }

    const timezone = TIMEZONES[text];

    if (!timezone) return ctx.reply('Выбери часовой пояс кнопкой:', timezoneMenu());

    await pool.query('UPDATE users_settings SET timezone=$1 WHERE user_id=$2', [timezone, userId]);

    delete userState[userId];
    return ctx.reply(`✅ Часовой пояс сохранён: ${timezone}`, menu());
  }

  if (state.step === 'timezone_manual') {
    const timezone = text.trim();

    if (!isValidTimezone(timezone)) {
      return ctx.reply('❗ Не получилось найти такой часовой пояс.\n\nПример: Europe/Vienna');
    }

    await pool.query('UPDATE users_settings SET timezone=$1 WHERE user_id=$2', [timezone, userId]);

    delete userState[userId];
    return ctx.reply(`✅ Часовой пояс сохранён: ${timezone}`, menu());
  }

  if (state.step === 'choose_task') {
    if (text === '✍️ Своя задача') {
      state.step = 'text';
      return ctx.reply('✍️ Напиши свою задачу.');
    }

    const templates = {
      '💧 Выпить воду': 'Выпить воду',
      '🏃 Тренировка': 'Тренировка',
      '🛒 Купить продукты': 'Купить продукты',
      '📞 Позвонить': 'Позвонить',
      '📚 Учёба': 'Учёба'
    };

    if (!templates[text]) return ctx.reply('Выбери задачу кнопкой или нажми «✍️ Своя задача».', taskTemplatesMenu());

    state.text = templates[text];
    state.step = 'date';

    return ctx.reply('📅 На когда задача?', dateMenu());
  }

  if (state.step === 'text') {
    state.text = text.trim();

    if (!state.text) return ctx.reply('Напиши текст задачи.');

    state.step = 'date';

    return ctx.reply('📅 На когда задача?', dateMenu());
  }

  if (state.step === 'digest_time') {
    if (!isValidTime(text)) return ctx.reply('❗ Напиши время в формате 09:00');

    const time = normalizeTime(text);

    await pool.query(
      `INSERT INTO users_settings (user_id, digest_time)
       VALUES ($1, $2)
       ON CONFLICT (user_id)
       DO UPDATE SET digest_time=$2`,
      [userId, time]
    );

    delete userState[userId];
    return ctx.reply(`✅ Утренний план будет приходить в ${time}`, menu());
  }

  if (state.step === 'edit_text') {
    const newText = text.trim();

    if (!newText) return ctx.reply('Напиши новый текст задачи.');

    await pool.query(
      'UPDATE tasks SET text=$1 WHERE id=$2 AND user_id=$3',
      [newText, state.taskId, userId]
    );

    delete userState[userId];
    return ctx.reply('✅ Задача обновлена!', menu());
  }

  if (state.step === 'time' || state.step === 'edit_time') {
    const isEdit = state.step === 'edit_time';

    async function saveTime(newDate, newTime) {
      if (isEdit) {
        await pool.query(
          'UPDATE tasks SET task_date=COALESCE($1, task_date), time=$2, notified=false, pre_notified=false WHERE id=$3 AND user_id=$4',
          [newDate, newTime, state.taskId, userId]
        );

        delete userState[userId];
        return ctx.reply('✅ Задача обновлена!', menu());
      }

      state.time = newTime;
      if (newDate) state.taskDate = newDate;
      state.step = 'reminder';

      return ctx.reply('🔔 Когда напомнить?', reminderMenu());
    }

    if (text === '🕳 Без времени' || text.toLowerCase() === 'нет') {
      if (isEdit) {
        await pool.query(
          'UPDATE tasks SET time=NULL, reminder_minutes=NULL, notified=false, pre_notified=false WHERE id=$1 AND user_id=$2',
          [state.taskId, userId]
        );

        delete userState[userId];
        return ctx.reply('✅ Задача обновлена!', menu());
      }

      state.time = null;
      state.reminderMinutes = null;
      state.repeatRule = 'none';
      state.step = 'priority';

      return ctx.reply('⭐ Выбери приоритет:', priorityMenu());
    }

    if (text === '⏰ Через 1 час') {
      const oneHour = timeInOneHour(settings.timezone);
      return saveTime(oneHour.date, oneHour.time);
    }

    if (text === '🌙 Вечером') return saveTime(null, '19:00');

    if (text === '🌅 Завтра утром') return saveTime(tomorrowDate(settings.timezone), '09:00');

    if (!isValidTime(text)) return ctx.reply('❗ Выбери кнопку или напиши время в формате 08:40');

    return saveTime(null, normalizeTime(text));
  }

  if (state.step === 'reminder' || state.step === 'edit_reminder') {
    let reminderMinutes;

    if (text === '🔕 Без напоминания') reminderMinutes = null;
    else if (text === '⏰ В момент задачи') reminderMinutes = 0;
    else if (text === '🔔 За 5 минут') reminderMinutes = 5;
    else if (text === '🔔 За 10 минут') reminderMinutes = 10;
    else if (text === '🔔 За 30 минут') reminderMinutes = 30;
    else if (text === '🔔 За 1 час') reminderMinutes = 60;
    else return ctx.reply('🔔 Когда напомнить?', reminderMenu());

    if (state.step === 'edit_reminder') {
      await pool.query(
        'UPDATE tasks SET reminder_minutes=$1, notified=false, pre_notified=false WHERE id=$2 AND user_id=$3',
        [reminderMinutes, state.taskId, userId]
      );

      delete userState[userId];
      return ctx.reply('✅ Задача обновлена!', menu());
    }

    state.reminderMinutes = reminderMinutes;
    state.step = 'repeat';

    return ctx.reply('🔁 Повторять задачу?', repeatMenu());
  }

  if (state.step === 'repeat' || state.step === 'edit_repeat') {
    let repeatRule;

    if (text === '🚫 Не повторять') repeatRule = 'none';
    else if (text === '🔁 Каждый день') repeatRule = 'daily';
    else if (text === '📆 Каждую неделю') repeatRule = 'weekly';
    else return ctx.reply('🔁 Повторять задачу?', repeatMenu());

    if (state.step === 'edit_repeat') {
      await pool.query(
        'UPDATE tasks SET repeat_rule=$1, repeat_created=false WHERE id=$2 AND user_id=$3',
        [repeatRule, state.taskId, userId]
      );

      delete userState[userId];
      return ctx.reply('✅ Задача обновлена!', menu());
    }

    state.repeatRule = repeatRule;
    state.step = 'priority';

    return ctx.reply('⭐ Выбери приоритет:', priorityMenu());
  }

  if (state.step === 'priority' || state.step === 'edit_priority') {
    let priority = null;

    if (text === '🟢 Низкий') priority = 'low';
    else if (text === '⚪ Средний') priority = 'medium';
    else if (text === '🔥 Высокий') priority = 'high';

    if (!priority) return ctx.reply('Выбери приоритет кнопкой:', priorityMenu());

    if (state.step === 'edit_priority') {
      await pool.query(
        'UPDATE tasks SET priority=$1 WHERE id=$2 AND user_id=$3',
        [priority, state.taskId, userId]
      );

      delete userState[userId];
      return ctx.reply('✅ Задача обновлена!', menu());
    }

    await pool.query(
      `INSERT INTO tasks (user_id, text, task_date, time, priority, reminder_minutes, repeat_rule)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        userId,
        state.text,
        state.taskDate,
        state.time,
        priority,
        state.reminderMinutes,
        state.repeatRule || 'none'
      ]
    );

    const message =
      `✅ Задача добавлена!\n\n` +
      `📌 ${state.text}\n` +
      `📅 ${formatDate(state.taskDate)}\n` +
      `⏰ ${state.time || '—'}\n` +
      `🔔 ${reminderLabel(state.reminderMinutes)}\n` +
      `🔁 ${repeatLabel(state.repeatRule || 'none')}\n` +
      `⭐ ${priorityLabel(priority)}`;

    delete userState[userId];
    return ctx.reply(message, menu());
  }
});

// ================= INLINE-КНОПКИ =================

bot.action(/edit_(\d+)/, async (ctx) => {
  const taskId = ctx.match[1];

  await ctx.answerCbQuery('✏️');
  await ctx.reply('✏️ Что изменить?', editMenu(taskId));
});

bot.action(/edittext_(\d+)/, async (ctx) => {
  userState[ctx.from.id] = { step: 'edit_text', taskId: ctx.match[1] };

  await ctx.answerCbQuery('✏️');
  await ctx.reply('✍️ Напиши новый текст задачи:', Markup.keyboard([['❌ Отмена']]).resize());
});

bot.action(/editdate_(\d+)/, async (ctx) => {
  userState[ctx.from.id] = { step: 'edit_date', taskId: ctx.match[1] };

  await ctx.answerCbQuery('📅');
  await ctx.reply('📅 На когда задача?', dateMenu());
});

bot.action(/edittime_(\d+)/, async (ctx) => {
  userState[ctx.from.id] = { step: 'edit_time', taskId: ctx.match[1] };

  await ctx.answerCbQuery('⏰');
  await ctx.reply('⏰ Когда задача?', timeMenu());
});

bot.action(/editrem_(\d+)/, async (ctx) => {
  userState[ctx.from.id] = { step: 'edit_reminder', taskId: ctx.match[1] };

  await ctx.answerCbQuery('🔔');
  await ctx.reply('🔔 Когда напомнить?', reminderMenu());
});

bot.action(/editrep_(\d+)/, async (ctx) => {
  userState[ctx.from.id] = { step: 'edit_repeat', taskId: ctx.match[1] };

  await ctx.answerCbQuery('🔁');
  await ctx.reply('🔁 Повторять задачу?', repeatMenu());
});

bot.action(/editpri_(\d+)/, async (ctx) => {
  userState[ctx.from.id] = { step: 'edit_priority', taskId: ctx.match[1] };

  await ctx.answerCbQuery('⭐');
  await ctx.reply('⭐ Выбери приоритет:', priorityMenu());
});

bot.action(/done_(\d+)/, async (ctx) => {
  const settings = await getSettings(ctx.from.id);

  const res = await pool.query(
    'SELECT * FROM tasks WHERE id=$1 AND user_id=$2',
    [ctx.match[1], ctx.from.id]
  );

  const task = res.rows[0];

  await pool.query(
    'UPDATE tasks SET done=true WHERE id=$1 AND user_id=$2',
    [ctx.match[1], ctx.from.id]
  );

  await updateStreak(ctx.from.id, settings.timezone);

  if (task) await createNextRepeatTask(task);

  await ctx.answerCbQuery('🔥 Стрик обновлён');
  await ctx.editMessageText('✅ Задача выполнена');
});

bot.action(/delete_(\d+)/, async (ctx) => {
  await pool.query(
    'DELETE FROM tasks WHERE id=$1 AND user_id=$2',
    [ctx.match[1], ctx.from.id]
  );

  await ctx.answerCbQuery('🗑');
  await ctx.editMessageText('🗑 Задача удалена');
});

bot.action(/tomorrow_(\d+)/, async (ctx) => {
  const settings = await getSettings(ctx.from.id);

  await pool.query(
    `UPDATE tasks 
     SET task_date=$1, notified=false, pre_notified=false 
     WHERE id=$2 AND user_id=$3`,
    [tomorrowDate(settings.timezone), ctx.match[1], ctx.from.id]
  );

  await ctx.answerCbQuery('🔁');
  await ctx.editMessageText('🔁 Перенесено на завтра');
});

bot.action(/plus1_(\d+)/, async (ctx) => {
  const res = await pool.query(
    'SELECT * FROM tasks WHERE id=$1 AND user_id=$2',
    [ctx.match[1], ctx.from.id]
  );

  const task = res.rows[0];

  if (!task || !task.time) {
    await ctx.answerCbQuery('У задачи нет времени');
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
  await ctx.editMessageText(`⏰ Перенесено на ${newTime}`);
});

bot.action(/remind_(\d+)/, async (ctx) => {
  const res = await pool.query(
    'SELECT * FROM tasks WHERE id=$1 AND user_id=$2',
    [ctx.match[1], ctx.from.id]
  );

  const task = res.rows[0];

  if (!task) {
    await ctx.answerCbQuery('Задача не найдена');
    return;
  }

  await ctx.answerCbQuery('🔔');

  await ctx.reply(
    `🔔 Напоминание прямо сейчас!\n\n` +
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
        users_settings.timezone
      FROM tasks
      LEFT JOIN users_settings ON tasks.user_id = users_settings.user_id
      LEFT JOIN subscriptions ON tasks.user_id = subscriptions.user_id
      WHERE tasks.done=false
      AND tasks.time IS NOT NULL
      AND tasks.reminder_minutes IS NOT NULL
      AND (
        subscriptions.paid_until > NOW()
        OR subscriptions.trial_end > NOW()
      )
    `);

    for (const task of tasks.rows) {
      const timezone = task.timezone || DEFAULT_TIMEZONE;
      const now = getNowParts(timezone);

      if (task.reminder_minutes > 0 && task.pre_notified === false) {
        const target = futureParts(timezone, task.reminder_minutes);

        if (task.task_date === target.date && task.time === target.time) {
          await bot.telegram.sendMessage(
            task.user_id,
            `🔔 Скоро задача!\n\n` +
            `${task.reminder_minutes} мин\n` +
            `📌 ${task.text}\n` +
            `🕒 ${task.time}`
          );

          await pool.query('UPDATE tasks SET pre_notified=true WHERE id=$1', [task.id]);
        }
      }

      if (task.task_date === now.date && task.time === now.time && task.notified === false) {
        await bot.telegram.sendMessage(
          task.user_id,
          `⏰ Напоминание!\n\n` +
          `📌 ${task.text}\n` +
          `📅 ${formatDate(task.task_date)}\n` +
          `🕒 ${task.time}`
        );

        await pool.query('UPDATE tasks SET notified=true WHERE id=$1', [task.id]);

        await createNextRepeatTask(task);
      }
    }

    const users = await pool.query(`
      SELECT users_settings.*
      FROM users_settings
      LEFT JOIN subscriptions ON users_settings.user_id = subscriptions.user_id
      WHERE subscriptions.paid_until > NOW()
      OR subscriptions.trial_end > NOW()
    `);

    for (const user of users.rows) {
      const timezone = user.timezone || DEFAULT_TIMEZONE;
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
            `☀️ Доброе утро!\n\nСегодня у тебя задач: ${todayTasks.rows.length}\n\n${list}`
          );
        } else {
          await bot.telegram.sendMessage(
            user.user_id,
            '☀️ Доброе утро!\n\nНа сегодня задач нет. Отличный день, чтобы всё успеть 💪'
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

initDB()
  .then(async () => {
    await bot.telegram.deleteWebhook();
    bot.launch();
    console.log('Bot started');
  })
  .catch((e) => {
    console.log('START ERROR', e.message);
  });
