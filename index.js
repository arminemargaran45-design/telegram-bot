const { Telegraf, Markup } = require('telegraf');
const { Pool } = require('pg');

const bot = new Telegraf(process.env.BOT_TOKEN);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

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
      done BOOLEAN DEFAULT false,
      notified BOOLEAN DEFAULT false,
      pre_notified BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_date TEXT`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS time TEXT`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'medium'`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS done BOOLEAN DEFAULT false`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS notified BOOLEAN DEFAULT false`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS pre_notified BOOLEAN DEFAULT false`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users_settings (
      user_id BIGINT PRIMARY KEY,
      digest_time TEXT DEFAULT '09:00',
      digest_sent_date TEXT,
      timezone TEXT DEFAULT 'Europe/Moscow'
    )
  `);

  await pool.query(`ALTER TABLE users_settings ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'Europe/Moscow'`);
}

async function ensureUser(userId) {
  await pool.query(
    `INSERT INTO users_settings (user_id, timezone)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId, DEFAULT_TIMEZONE]
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
    timezone: DEFAULT_TIMEZONE
  };
}

// ================= КНОПКИ =================

function menu() {
  return Markup.keyboard([
    ['➕ Новая задача', '📅 Сегодня'],
    ['🗓 Завтра', '📋 Все задачи'],
    ['✅ Выполненные', '📊 Статистика'],
    ['⚙️ Настройки']
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

function formatDate(value) {
  if (!value) return 'Без даты';
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

function addMinutes(time, minutes) {
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

function priorityLabel(priority) {
  if (priority === 'high') return '🔥 Высокий';
  if (priority === 'low') return '🟢 Низкий';
  return '⚪ Средний';
}

function taskCard(task) {
  return (
    `━━━━━━━━━━━━━━\n` +
    `📌 ${task.text}\n\n` +
    `📅 ${formatDate(task.task_date)}\n` +
    `⏰ ${task.time || 'Без времени'}\n` +
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
        Markup.button.callback('⏰ +1ч', `plus1_${task.id}`)
      ],
      [
        Markup.button.callback('🔁 Завтра', `tomorrow_${task.id}`),
        Markup.button.callback('🗑 Удалить', `delete_${task.id}`)
      ],
      [
        Markup.button.callback('🔔 Напомнить', `remind_${task.id}`)
      ]
    ])
  );
}

// ================= СТАРТ =================

bot.start(async (ctx) => {
  await ensureUser(ctx.from.id);
  delete userState[ctx.from.id];

  await ctx.reply(
    '👋 Привет! Я твой умный планировщик задач.\n\nНажми «➕ Новая задача», и я спрошу всё по шагам.',
    menu()
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
  await ensureUser(ctx.from.id);
  userState[ctx.from.id] = { step: 'choose_task' };

  await ctx.reply(
    'Выбери задачу из списка или добавь свою 👇',
    taskTemplatesMenu()
  );
});

bot.hears('⚙️ Настройки', async (ctx) => {
  const settings = await getUserSettings(ctx.from.id);

  await ctx.reply(
    `⚙️ Настройки\n\n` +
    `☀️ Утренний план: ${settings.digest_time || '09:00'}\n` +
    `🌍 Часовой пояс: ${settings.timezone || DEFAULT_TIMEZONE}`,
    settingsMenu()
  );
});

bot.hears('⏰ Время утреннего плана', async (ctx) => {
  userState[ctx.from.id] = { step: 'digest_time' };

  await ctx.reply(
    'Напиши время утреннего плана.\n\nНапример: 09:00',
    Markup.keyboard([['❌ Отмена']]).resize()
  );
});

bot.hears('🌍 Часовой пояс', async (ctx) => {
  userState[ctx.from.id] = { step: 'timezone' };

  await ctx.reply(
    'Выбери свой часовой пояс 👇\n\nЕсли твоего города нет — нажми «✍️ Ввести вручную».',
    timezoneMenu()
  );
});

// ================= СПИСКИ ЗАДАЧ =================

bot.hears('📅 Сегодня', async (ctx) => {
  const state = userState[ctx.from.id];
  const settings = await getUserSettings(ctx.from.id);

  if (state?.step === 'date') {
    state.taskDate = todayDate(settings.timezone);
    state.step = 'time';

    return ctx.reply(
      '⏰ Когда напомнить?\n\nМожно выбрать кнопку или написать время вручную: 08:40',
      timeMenu()
    );
  }

  if (state) return;

  const res = await pool.query(
    `SELECT * FROM tasks 
     WHERE user_id=$1 AND done=false AND task_date=$2 
     ORDER BY time NULLS LAST, id DESC`,
    [ctx.from.id, todayDate(settings.timezone)]
  );

  if (res.rows.length === 0) {
    return ctx.reply('📭 На сегодня задач нет', menu());
  }

  for (const task of res.rows) {
    await sendTask(ctx, task);
  }
});

bot.hears('🗓 Завтра', async (ctx) => {
  const state = userState[ctx.from.id];
  const settings = await getUserSettings(ctx.from.id);

  if (state?.step === 'date') {
    state.taskDate = tomorrowDate(settings.timezone);
    state.step = 'time';

    return ctx.reply(
      '⏰ Когда напомнить?\n\nМожно выбрать кнопку или написать время вручную: 08:40',
      timeMenu()
    );
  }

  if (state) return;

  const res = await pool.query(
    `SELECT * FROM tasks 
     WHERE user_id=$1 AND done=false AND task_date=$2 
     ORDER BY time NULLS LAST, id DESC`,
    [ctx.from.id, tomorrowDate(settings.timezone)]
  );

  if (res.rows.length === 0) {
    return ctx.reply('📭 На завтра задач нет', menu());
  }

  for (const task of res.rows) {
    await sendTask(ctx, task);
  }
});

bot.hears('🗂 Без даты', async (ctx) => {
  const state = userState[ctx.from.id];

  if (state?.step !== 'date') return;

  state.taskDate = null;
  state.step = 'time';

  await ctx.reply(
    '⏰ Когда напомнить?\n\nМожно выбрать кнопку или написать время вручную: 08:40',
    timeMenu()
  );
});

bot.hears('📋 Все задачи', async (ctx) => {
  if (userState[ctx.from.id]) return;

  const res = await pool.query(
    `SELECT * FROM tasks 
     WHERE user_id=$1 AND done=false 
     ORDER BY task_date NULLS LAST, time NULLS LAST, id DESC`,
    [ctx.from.id]
  );

  if (res.rows.length === 0) {
    return ctx.reply('📭 Активных задач пока нет', menu());
  }

  for (const task of res.rows) {
    await sendTask(ctx, task);
  }
});

bot.hears('✅ Выполненные', async (ctx) => {
  if (userState[ctx.from.id]) return;

  const res = await pool.query(
    'SELECT * FROM tasks WHERE user_id=$1 AND done=true ORDER BY id DESC LIMIT 10',
    [ctx.from.id]
  );

  if (res.rows.length === 0) {
    return ctx.reply('Пока нет выполненных задач', menu());
  }

  await ctx.reply(
    res.rows
      .map((t, i) => `${i + 1}. ✅ ${t.text} — ${formatDate(t.task_date)} ${t.time || ''}`)
      .join('\n'),
    menu()
  );
});

bot.hears('📊 Статистика', async (ctx) => {
  const settings = await getUserSettings(ctx.from.id);
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
    `📊 Статистика\n\n` +
    `📋 Активные: ${active.rows[0].count}\n` +
    `📅 Сегодня: ${today.rows[0].count}\n` +
    `✅ Выполненные: ${done.rows[0].count}`,
    menu()
  );
});

// ================= СОЗДАНИЕ ЗАДАЧИ =================

bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.message.text;
  const state = userState[userId];

  await ensureUser(userId);

  if (!state) {
    return ctx.reply('Нажми «➕ Новая задача», чтобы добавить задачу.', menu());
  }

  if (state.step === 'timezone') {
    if (text === '✍️ Ввести вручную') {
      state.step = 'timezone_manual';

      return ctx.reply(
        'Напиши часовой пояс текстом.\n\nНапример:\nEurope/Vienna\nEurope/Moscow\nAsia/Almaty\nAmerica/New_York'
      );
    }

    const timezone = TIMEZONES[text];

    if (!timezone) {
      return ctx.reply('Выбери часовой пояс кнопкой или нажми «✍️ Ввести вручную».', timezoneMenu());
    }

    await pool.query(
      'UPDATE users_settings SET timezone=$1 WHERE user_id=$2',
      [timezone, userId]
    );

    delete userState[userId];

    return ctx.reply(`✅ Часовой пояс сохранён: ${timezone}`, menu());
  }

  if (state.step === 'timezone_manual') {
    const timezone = text.trim();

    if (!isValidTimezone(timezone)) {
      return ctx.reply(
        '❗ Не получилось найти такой часовой пояс.\n\nПример правильного формата:\nEurope/Vienna\nEurope/Moscow\nAsia/Dubai'
      );
    }

    await pool.query(
      'UPDATE users_settings SET timezone=$1 WHERE user_id=$2',
      [timezone, userId]
    );

    delete userState[userId];

    return ctx.reply(`✅ Часовой пояс сохранён: ${timezone}`, menu());
  }

  if (state.step === 'choose_task') {
    if (text === '✍️ Своя задача') {
      state.step = 'text';

      return ctx.reply(
        '✍️ Напиши свою задачу.\n\nНапример: Забрать заказ',
        Markup.keyboard([['❌ Отмена']]).resize()
      );
    }

    const templates = {
      '💧 Выпить воду': 'Выпить воду',
      '🏃 Тренировка': 'Тренировка',
      '🛒 Купить продукты': 'Купить продукты',
      '📞 Позвонить': 'Позвонить',
      '📚 Учёба': 'Учёба'
    };

    if (!templates[text]) {
      return ctx.reply(
        'Выбери задачу кнопкой или нажми «✍️ Своя задача».',
        taskTemplatesMenu()
      );
    }

    state.text = templates[text];
    state.step = 'date';

    return ctx.reply('📅 На когда задача?', dateMenu());
  }

  if (state.step === 'digest_time') {
    if (!isValidTime(text)) {
      return ctx.reply('❗ Напиши время в формате 09:00');
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

    return ctx.reply(`✅ Утренний план будет приходить в ${time}`, menu());
  }

  if (state.step === 'text') {
    state.text = text.trim();

    if (!state.text) {
      return ctx.reply('Напиши текст задачи.');
    }

    state.step = 'date';

    return ctx.reply('📅 На когда задача?', dateMenu());
  }

  if (state.step === 'time') {
    const settings = await getUserSettings(userId);

    if (text === '🕳 Без времени' || text.toLowerCase() === 'нет') {
      state.time = null;
      state.step = 'priority';

      return ctx.reply('⭐ Выбери приоритет:', priorityMenu());
    }

    if (text === '⏰ Через 1 час') {
      const oneHour = timeInOneHour(settings.timezone);
      state.taskDate = oneHour.date;
      state.time = oneHour.time;
      state.step = 'priority';

      return ctx.reply('⭐ Выбери приоритет:', priorityMenu());
    }

    if (text === '🌙 Вечером') {
      state.time = '19:00';
      state.step = 'priority';

      return ctx.reply('⭐ Выбери приоритет:', priorityMenu());
    }

    if (text === '🌅 Завтра утром') {
      state.taskDate = tomorrowDate(settings.timezone);
      state.time = '09:00';
      state.step = 'priority';

      return ctx.reply('⭐ Выбери приоритет:', priorityMenu());
    }

    if (!isValidTime(text)) {
      return ctx.reply('❗ Выбери кнопку или напиши время в формате 08:40');
    }

    state.time = normalizeTime(text);
    state.step = 'priority';

    return ctx.reply('⭐ Выбери приоритет:', priorityMenu());
  }

  if (state.step === 'priority') {
    let priority = null;

    if (text.includes('Низкий')) priority = 'low';
    else if (text.includes('Средний')) priority = 'medium';
    else if (text.includes('Высокий')) priority = 'high';

    if (!priority) {
      return ctx.reply('Выбери приоритет кнопкой:', priorityMenu());
    }

    await pool.query(
      `INSERT INTO tasks (user_id, text, task_date, time, priority)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, state.text, state.taskDate, state.time, priority]
    );

    const message =
      `✅ Задача добавлена!\n\n` +
      `📌 ${state.text}\n` +
      `📅 ${formatDate(state.taskDate)}\n` +
      `⏰ ${state.time || 'Без времени'}\n` +
      `⭐ ${priorityLabel(priority)}`;

    delete userState[userId];

    return ctx.reply(message, menu());
  }
});

// ================= КНОПКИ ПОД ЗАДАЧАМИ =================

bot.action(/done_(\d+)/, async (ctx) => {
  await pool.query(
    'UPDATE tasks SET done=true WHERE id=$1 AND user_id=$2',
    [ctx.match[1], ctx.from.id]
  );

  await ctx.answerCbQuery('Готово ✅');
  await ctx.editMessageText('✅ Задача выполнена');
});

bot.action(/delete_(\d+)/, async (ctx) => {
  await pool.query(
    'DELETE FROM tasks WHERE id=$1 AND user_id=$2',
    [ctx.match[1], ctx.from.id]
  );

  await ctx.answerCbQuery('Удалено 🗑');
  await ctx.editMessageText('🗑 Задача удалена');
});

bot.action(/tomorrow_(\d+)/, async (ctx) => {
  const settings = await getUserSettings(ctx.from.id);

  await pool.query(
    `UPDATE tasks 
     SET task_date=$1, notified=false, pre_notified=false 
     WHERE id=$2 AND user_id=$3`,
    [tomorrowDate(settings.timezone), ctx.match[1], ctx.from.id]
  );

  await ctx.answerCbQuery('Перенесено на завтра 🔁');
  await ctx.editMessageText('🔁 Задача перенесена на завтра');
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

  const newTime = addMinutes(task.time, 60);

  await pool.query(
    `UPDATE tasks 
     SET time=$1, notified=false, pre_notified=false 
     WHERE id=$2 AND user_id=$3`,
    [newTime, ctx.match[1], ctx.from.id]
  );

  await ctx.answerCbQuery(`Перенесено на ${newTime}`);
  await ctx.editMessageText(`⏰ Задача перенесена на ${newTime}`);
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

  await ctx.answerCbQuery('Напоминаю 🔔');

  await ctx.reply(
    `🔔 Напоминание прямо сейчас!\n\n` +
    `📌 ${task.text}\n` +
    `📅 ${formatDate(task.task_date)}\n` +
    `🕒 ${task.time || 'Без времени'}`
  );
});

// ================= НАПОМИНАНИЯ =================

setInterval(async () => {
  try {
    const tasks = await pool.query(`
      SELECT 
        tasks.*,
        users_settings.timezone,
        users_settings.digest_time,
        users_settings.digest_sent_date
      FROM tasks
      LEFT JOIN users_settings ON tasks.user_id = users_settings.user_id
      WHERE tasks.done=false
      AND tasks.time IS NOT NULL
    `);

    for (const task of tasks.rows) {
      const timezone = task.timezone || DEFAULT_TIMEZONE;
      const now = getNowParts(timezone);
      const tenMinutesLater = addMinutes(now.time, 10);

      if (
        task.task_date === now.date &&
        task.time === tenMinutesLater &&
        task.pre_notified === false
      ) {
        await bot.telegram.sendMessage(
          task.user_id,
          `🔔 Скоро задача!\n\nЧерез 10 минут:\n📌 ${task.text}\n🕒 ${task.time}`
        );

        await pool.query(
          'UPDATE tasks SET pre_notified=true WHERE id=$1',
          [task.id]
        );
      }

      if (
        task.task_date === now.date &&
        task.time === now.time &&
        task.notified === false
      ) {
        await bot.telegram.sendMessage(
          task.user_id,
          `⏰ Напоминание!\n\n📌 ${task.text}\n📅 ${formatDate(task.task_date)}\n🕒 ${task.time}`
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
      const now = getNowParts(timezone);

      if (
        user.digest_time === now.time &&
        user.digest_sent_date !== now.date
      ) {
        const todayTasks = await pool.query(
          `SELECT * FROM tasks
           WHERE user_id=$1 AND task_date=$2 AND done=false
           ORDER BY time NULLS LAST, id DESC`,
          [user.user_id, now.date]
        );

        if (todayTasks.rows.length > 0) {
          const list = todayTasks.rows
            .map((t, i) => `${i + 1}. ${t.time || '—'} — ${t.text}`)
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
