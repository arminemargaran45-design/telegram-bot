const { Telegraf, Markup } = require('telegraf');
const { Pool } = require('pg');

const bot = new Telegraf(process.env.BOT_TOKEN);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// 👉 ОБЯЗАТЕЛЬНО добавь в Railway:
const PROVIDER_TOKEN = process.env.PROVIDER_TOKEN; // для оплаты
const ADMIN_ID = Number(process.env.ADMIN_ID); // твой Telegram ID

const PRICE_RUB = 49900; // 499 руб (в копейках)

const userState = {};
const DEFAULT_TIMEZONE = 'Europe/Moscow';
const DEFAULT_LANGUAGE = 'ru';

// ===================== БАЗА =====================

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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users_settings (
      user_id BIGINT PRIMARY KEY,
      digest_time TEXT DEFAULT '09:00',
      digest_sent_date TEXT,
      timezone TEXT DEFAULT 'Europe/Moscow',
      language TEXT DEFAULT 'ru',
      streak INTEGER DEFAULT 0,
      last_done_date TEXT
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      user_id BIGINT PRIMARY KEY,
      trial_end TIMESTAMP,
      paid_until TIMESTAMP
    )
  `);
}

// ===================== ПОДПИСКА =====================

async function ensureUser(userId) {
  await pool.query(
    `INSERT INTO users_settings (user_id)
     VALUES ($1)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );

  await pool.query(
    `INSERT INTO subscriptions (user_id, trial_end)
     VALUES ($1, NOW() + INTERVAL '7 days')
     ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );
}

async function hasAccess(userId) {
  const res = await pool.query(
    'SELECT * FROM subscriptions WHERE user_id=$1',
    [userId]
  );

  const sub = res.rows[0];
  if (!sub) return false;

  const now = new Date();

  if (sub.paid_until && new Date(sub.paid_until) > now) return true;
  if (sub.trial_end && new Date(sub.trial_end) > now) return true;

  return false;
}

// ===================== МЕНЮ =====================

function menu() {
  return Markup.keyboard([
    ['➕ Новая задача', '📅 Сегодня'],
    ['🗓 Завтра', '📋 Все задачи'],
    ['📊 Статистика', '⚙️ Настройки'],
    ['💎 Подписка']
  ]).resize();
}

function settingsMenu() {
  return Markup.keyboard([
    ['⏰ Время утреннего плана'],
    ['🌍 Часовой пояс'],
    ['🌐 Язык'],
    ['⬅️ Назад']
  ]).resize();
}

// ===================== СТАРТ =====================

bot.start(async (ctx) => {
  await ensureUser(ctx.from.id);

  ctx.reply(
    '👋 Привет!\n\n🎁 7 дней бесплатно\n💎 Потом 499₽ / месяц',
    menu()
  );
});

// ===================== ОГРАНИЧЕНИЕ =====================

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
    '💎 Бесплатный период закончился.\n\nОплати 499₽, чтобы продолжить.',
    Markup.keyboard([['💎 Подписка']]).resize()
  );
});
// ===================== ОПЛАТА =====================

bot.hears('💎 Подписка', async (ctx) => {
  if (!PROVIDER_TOKEN) {
    return ctx.reply('❗ Добавь PROVIDER_TOKEN в Railway Variables');
  }

  await ctx.reply('💳 Открываю оплату...');

  await ctx.replyWithInvoice({
    title: 'Подписка PRO',
    description: 'Доступ к боту на 30 дней',
    payload: `sub_${ctx.from.id}_${Date.now()}`,
    provider_token: PROVIDER_TOKEN,
    currency: 'RUB',
    prices: [
      {
        label: 'Подписка',
        amount: PRICE_RUB
      }
    ]
  });
});

bot.on('pre_checkout_query', async (ctx) => {
  await ctx.answerPreCheckoutQuery(true);
});

bot.on('successful_payment', async (ctx) => {
  await pool.query(
    `INSERT INTO subscriptions (user_id, paid_until)
     VALUES ($1, NOW() + INTERVAL '30 days')
     ON CONFLICT (user_id)
     DO UPDATE SET paid_until = NOW() + INTERVAL '30 days'`,
    [ctx.from.id]
  );

  await ctx.reply('✅ Оплата прошла! Доступ открыт на 30 дней 🎉', menu());
});

// ===================== СОЗДАНИЕ ЗАДАЧИ =====================

bot.hears('➕ Новая задача', (ctx) => {
  userState[ctx.from.id] = { step: 'text' };

  ctx.reply('✍️ Напиши задачу\n\nНапример: Купить продукты');
});

bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.message.text;
  const state = userState[userId];

  if (!state) return;

  // ШАГ 1: текст
  if (state.step === 'text') {
    state.text = text;
    state.step = 'time';

    return ctx.reply('⏰ Во сколько?\n\nНапример: 09:00 или "нет"');
  }

  // ШАГ 2: время
  if (state.step === 'time') {
    if (text.toLowerCase() === 'нет') {
      state.time = null;
    } else {
      state.time = text;
    }

    await pool.query(
      'INSERT INTO tasks (user_id, text, time) VALUES ($1, $2, $3)',
      [userId, state.text, state.time]
    );

    delete userState[userId];

    return ctx.reply('✅ Задача добавлена!', menu());
  }
});

// ===================== СПИСОК =====================

bot.hears('📋 Все задачи', async (ctx) => {
  const res = await pool.query(
    'SELECT * FROM tasks WHERE user_id=$1 AND done=false ORDER BY id DESC',
    [ctx.from.id]
  );

  if (res.rows.length === 0) {
    return ctx.reply('Нет задач');
  }

  for (const t of res.rows) {
    await ctx.reply(
      `📌 ${t.text}\n⏰ ${t.time || '—'}`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback('✅', `done_${t.id}`),
          Markup.button.callback('🗑', `del_${t.id}`)
        ]
      ])
    );
  }
});
// ===================== СЕГОДНЯ / ЗАВТРА =====================

bot.hears('📅 Сегодня', async (ctx) => {
  const res = await pool.query(
    `SELECT * FROM tasks
     WHERE user_id=$1 AND done=false
     ORDER BY id DESC`,
    [ctx.from.id]
  );

  if (res.rows.length === 0) {
    return ctx.reply('📭 На сегодня задач нет', menu());
  }

  for (const t of res.rows) {
    await ctx.reply(
      `📌 ${t.text}\n⏰ ${t.time || '—'}`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ Готово', `done_${t.id}`),
          Markup.button.callback('🗑 Удалить', `del_${t.id}`)
        ]
      ])
    );
  }
});

bot.hears('🗓 Завтра', async (ctx) => {
  return ctx.reply('🗓 Раздел “Завтра” добавим следующим шагом', menu());
});

// ===================== СТАТИСТИКА ПОЛЬЗОВАТЕЛЯ =====================

bot.hears('📊 Статистика', async (ctx) => {
  const active = await pool.query(
    'SELECT COUNT(*) FROM tasks WHERE user_id=$1 AND done=false',
    [ctx.from.id]
  );

  const done = await pool.query(
    'SELECT COUNT(*) FROM tasks WHERE user_id=$1 AND done=true',
    [ctx.from.id]
  );

  await ctx.reply(
    `📊 Статистика\n\n` +
    `📋 Активные задачи: ${active.rows[0].count}\n` +
    `✅ Выполненные задачи: ${done.rows[0].count}`,
    menu()
  );
});

// ===================== НАСТРОЙКИ =====================

bot.hears('⚙️ Настройки', async (ctx) => {
  await ctx.reply('⚙️ Настройки', settingsMenu());
});

bot.hears('⏰ Время утреннего плана', async (ctx) => {
  userState[ctx.from.id] = { step: 'digest_time' };
  await ctx.reply('Напиши время утреннего плана.\n\nНапример: 09:00');
});

bot.hears('🌍 Часовой пояс', async (ctx) => {
  await ctx.reply('🌍 Пока стоит часовой пояс по умолчанию: Europe/Moscow');
});

bot.hears('🌐 Язык', async (ctx) => {
  await ctx.reply(
    'Выбери язык:',
    Markup.keyboard([
      ['🇷🇺 Русский'],
      ['🇬🇧 English'],
      ['🇩🇪 Deutsch'],
      ['⬅️ Назад']
    ]).resize()
  );
});

bot.hears('⬅️ Назад', async (ctx) => {
  delete userState[ctx.from.id];
  await ctx.reply('Главное меню', menu());
});

bot.hears('❌ Отмена', async (ctx) => {
  delete userState[ctx.from.id];
  await ctx.reply('Ок, отменено.', menu());
});

// ===================== КНОПКИ ЗАДАЧ =====================

bot.action(/done_(\d+)/, async (ctx) => {
  await pool.query(
    'UPDATE tasks SET done=true WHERE id=$1 AND user_id=$2',
    [ctx.match[1], ctx.from.id]
  );

  await ctx.answerCbQuery('Готово ✅');
  await ctx.editMessageText('✅ Задача выполнена');
});

bot.action(/del_(\d+)/, async (ctx) => {
  await pool.query(
    'DELETE FROM tasks WHERE id=$1 AND user_id=$2',
    [ctx.match[1], ctx.from.id]
  );

  await ctx.answerCbQuery('Удалено 🗑');
  await ctx.editMessageText('🗑 Задача удалена');
});

// ===================== ПРОСТЫЕ НАПОМИНАНИЯ =====================

setInterval(async () => {
  try {
    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 5);

    const res = await pool.query(
      `SELECT * FROM tasks
       WHERE done=false
       AND notified=false
       AND time=$1`,
      [currentTime]
    );

    for (const task of res.rows) {
      await bot.telegram.sendMessage(
        task.user_id,
        `⏰ Напоминание!\n\n📌 ${task.text}`
      );

      await pool.query(
        'UPDATE tasks SET notified=true WHERE id=$1',
        [task.id]
      );
    }
  } catch (e) {
    console.log('TIMER ERROR', e.message);
  }
}, 60000);

// ===================== АДМИНКА =====================

bot.command('myid', async (ctx) => {
  await ctx.reply(`Твой Telegram ID: ${ctx.from.id}`);
});

bot.command('admin', async (ctx) => {
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

  const tasks = await pool.query(`SELECT COUNT(*) FROM tasks`);

  const doneTasks = await pool.query(`
    SELECT COUNT(*) FROM tasks WHERE done=true
  `);

  await ctx.reply(
    `📊 Админ-панель\n\n` +
    `👥 Пользователей всего: ${users.rows[0].count}\n` +
    `🎁 На пробном периоде: ${trial.rows[0].count}\n` +
    `💎 Оплатили: ${paid.rows[0].count}\n\n` +
    `📋 Всего задач: ${tasks.rows[0].count}\n` +
    `✅ Выполненных задач: ${doneTasks.rows[0].count}`
  );
});

// ===================== ЗАПУСК =====================

initDB()
  .then(async () => {
    await bot.telegram.deleteWebhook();
    bot.launch();
    console.log('Bot started');
  })
  .catch((e) => {
    console.log('START ERROR', e.message);
  });
