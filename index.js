const { Telegraf, Markup } = require('telegraf');
const { Pool } = require('pg');

const bot = new Telegraf(process.env.BOT_TOKEN);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const userState = {};

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
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_date TEXT`);
}

function menu() {
  return Markup.keyboard([
    ['➕ Новая задача', '📅 Сегодня'],
    ['🗓 Завтра', '📋 Все задачи'],
    ['✅ Выполненные', '📊 Статистика']
  ]).resize();
}

function dateMenu() {
  return Markup.keyboard([
    ['📅 Сегодня', '🗓 Завтра'],
    ['🗂 Без даты'],
    ['❌ Отмена']
  ]).resize();
}

function priorityMenu() {
  return Markup.keyboard([
    ['🟢 Низкий', '⚪ Средний', '🔥 Высокий'],
    ['❌ Отмена']
  ]).resize();
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function tomorrowDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
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
  return text.replace('.', ':').padStart(5, '0');
}

function priorityLabel(priority) {
  if (priority === 'high') return '🔥 Высокий';
  if (priority === 'low') return '🟢 Низкий';
  return '⚪ Средний';
}

bot.start((ctx) => {
  ctx.reply(
    '👋 Привет! Я твой планировщик задач.\n\nНажми «➕ Новая задача», и я спрошу всё по шагам.',
    menu()
  );
});

bot.hears('❌ Отмена', (ctx) => {
  delete userState[ctx.from.id];
  ctx.reply('Ок, отменено.', menu());
});

bot.hears('➕ Новая задача', (ctx) => {
  userState[ctx.from.id] = { step: 'text' };
  ctx.reply('✍️ Что нужно сделать?\n\nНапример: Купить продукты', Markup.keyboard([['❌ Отмена']]).resize());
});

bot.hears('📅 Сегодня', async (ctx) => {
  if (userState[ctx.from.id]?.step === 'date') return;

  const res = await pool.query(
    'SELECT * FROM tasks WHERE user_id=$1 AND done=false AND task_date=$2 ORDER BY time NULLS LAST, id DESC',
    [ctx.from.id, todayDate()]
  );

  if (res.rows.length === 0) {
    return ctx.reply('📭 На сегодня задач нет', menu());
  }

  for (const task of res.rows) {
    await sendTask(ctx, task);
  }
});

bot.hears('🗓 Завтра', async (ctx) => {
  if (userState[ctx.from.id]?.step === 'date') return;

  const res = await pool.query(
    'SELECT * FROM tasks WHERE user_id=$1 AND done=false AND task_date=$2 ORDER BY time NULLS LAST, id DESC',
    [ctx.from.id, tomorrowDate()]
  );

  if (res.rows.length === 0) {
    return ctx.reply('📭 На завтра задач нет', menu());
  }

  for (const task of res.rows) {
    await sendTask(ctx, task);
  }
});

bot.hears('📋 Все задачи', async (ctx) => {
  const res = await pool.query(
    'SELECT * FROM tasks WHERE user_id=$1 AND done=false ORDER BY task_date NULLS LAST, time NULLS LAST, id DESC',
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
  const res = await pool.query(
    'SELECT * FROM tasks WHERE user_id=$1 AND done=true ORDER BY id DESC LIMIT 10',
    [ctx.from.id]
  );

  if (res.rows.length === 0) {
    return ctx.reply('Пока нет выполненных задач', menu());
  }

  ctx.reply(
    res.rows.map((t, i) => `${i + 1}. ✅ ${t.text} — ${formatDate(t.task_date)} ${t.time || ''}`).join('\n'),
    menu()
  );
});

bot.hears('📊 Статистика', async (ctx) => {
  const active = await pool.query(
    'SELECT COUNT(*) FROM tasks WHERE user_id=$1 AND done=false',
    [ctx.from.id]
  );

  const done = await pool.query(
    'SELECT COUNT(*) FROM tasks WHERE user_id=$1 AND done=true',
    [ctx.from.id]
  );

  ctx.reply(
    `📊 Статистика\n\n📋 Активные: ${active.rows[0].count}\n✅ Выполненные: ${done.rows[0].count}`,
    menu()
  );
});

async function sendTask(ctx, task) {
  await ctx.reply(
    `📌 ${task.text}\n📅 ${formatDate(task.task_date)}\n⏰ ${task.time || 'Без времени'}\n⭐ ${priorityLabel(task.priority)}`,
    Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Готово', `done_${task.id}`),
        Markup.button.callback('🗑 Удалить', `delete_${task.id}`)
      ]
    ])
  );
}

bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.message.text;
  const state = userState[userId];

  if (!state) {
    return ctx.reply('Нажми «➕ Новая задача», чтобы добавить задачу.', menu());
  }

  if (state.step === 'text') {
    state.text = text.trim();
    state.step = 'date';
    return ctx.reply('📅 На когда задача?', dateMenu());
  }

  if (state.step === 'date') {
    if (text === '📅 Сегодня') state.taskDate = todayDate();
    else if (text === '🗓 Завтра') state.taskDate = tomorrowDate();
    else if (text === '🗂 Без даты') state.taskDate = null;
    else return ctx.reply('Выбери дату кнопкой:', dateMenu());

    state.step = 'time';
    return ctx.reply('⏰ Во сколько напомнить?\n\nНапример: 08:40\nИли напиши: нет');
  }

  if (state.step === 'time') {
    if (text.toLowerCase() === 'нет') {
      state.time = null;
      state.step = 'priority';
      return ctx.reply('⭐ Выбери приоритет:', priorityMenu());
    }

    if (!isValidTime(text)) {
      return ctx.reply('❗ Напиши время в формате 08:40');
    }

    state.time = normalizeTime(text);
    state.step = 'priority';
    return ctx.reply('⭐ Выбери приоритет:', priorityMenu());
  }

  if (state.step === 'priority') {
    let priority = 'medium';

    if (text === '🟢 Низкий') priority = 'low';
    if (text === '⚪ Средний') priority = 'medium';
    if (text === '🔥 Высокий') priority = 'high';

    await pool.query(
      'INSERT INTO tasks (user_id, text, task_date, time, priority) VALUES ($1, $2, $3, $4, $5)',
      [userId, state.text, state.taskDate, state.time, priority]
    );

    delete userState[userId];

    return ctx.reply(
      `✅ Задача добавлена!\n\n📌 ${state.text}\n📅 ${formatDate(state.taskDate)}\n⏰ ${state.time || 'Без времени'}\n⭐ ${priorityLabel(priority)}`,
      menu()
    );
  }
});

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

setInterval(async () => {
  const now = new Date();
  const currentDate = now.toISOString().slice(0, 10);
  const currentTime = now.toTimeString().slice(0, 5);

  const res = await pool.query(
    'SELECT * FROM tasks WHERE task_date=$1 AND time=$2 AND done=false AND notified=false',
    [currentDate, currentTime]
  );

  for (const task of res.rows) {
    await bot.telegram.sendMessage(
      task.user_id,
      `⏰ Напоминание!\n\n📌 ${task.text}\n📅 ${formatDate(task.task_date)}\n🕒 ${task.time}`
    );

    await pool.query(
      'UPDATE tasks SET notified=true WHERE id=$1',
      [task.id]
    );
  }
}, 60000);

initDB().then(async () => {
  await bot.telegram.deleteWebhook();
  bot.launch();
  console.log('Bot started');
});
