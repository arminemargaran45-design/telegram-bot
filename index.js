const { Telegraf, Markup } = require('telegraf');
const { Pool } = require('pg');

const bot = new Telegraf(process.env.BOT_TOKEN);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// создаём таблицу
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL,
      text TEXT NOT NULL,
      time TEXT,
      priority TEXT DEFAULT 'medium',
      done BOOLEAN DEFAULT false,
      notified BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log('DB ready');
}

// меню
function mainMenu() {
  return Markup.keyboard([
    ['➕ Новая задача', '📋 Активные'],
    ['✅ Выполненные', '📊 Статистика']
  ]).resize();
}

// парсинг задачи
function parseTask(input) {
  const timeMatch = input.match(/(\d{1,2}:\d{2})/);
  const time = timeMatch ? timeMatch[1] : null;

  let priority = 'medium';
  if (/важно|срочно/i.test(input)) priority = 'high';
  if (/низк/i.test(input)) priority = 'low';

  const text = input
    .replace(/(\d{1,2}:\d{2})/, '')
    .replace(/важно|срочно|низк/gi, '')
    .trim();

  return { text, time, priority };
}

// старт
bot.start((ctx) => {
  ctx.reply('👋 Привет! Я твой планировщик задач', mainMenu());
});

// новая задача
bot.hears('➕ Новая задача', (ctx) => {
  ctx.reply('Напиши: Текст 15:00');
});

// добавление
bot.on('text', async (ctx) => {
  const input = ctx.message.text;

  if (['➕ Новая задача','📋 Активные','✅ Выполненные','📊 Статистика'].includes(input)) return;

  const task = parseTask(input);

  if (!task.text) {
    return ctx.reply('Пример: Обед 15:00');
  }

  await pool.query(
    'INSERT INTO tasks (user_id, text, time, priority) VALUES ($1,$2,$3,$4)',
    [ctx.from.id, task.text, task.time, task.priority]
  );

  ctx.reply(`✅ Добавлено\n📌 ${task.text}\n⏰ ${task.time || 'без времени'}`, mainMenu());
});

// список активных
bot.hears('📋 Активные', async (ctx) => {
  const res = await pool.query(
    'SELECT * FROM tasks WHERE user_id=$1 AND done=false ORDER BY id DESC',
    [ctx.from.id]
  );

  if (res.rows.length === 0) {
    return ctx.reply('Нет задач', mainMenu());
  }

  for (const t of res.rows) {
    await ctx.reply(
      `📌 ${t.text}\n⏰ ${t.time}`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback('✅', `done_${t.id}`),
          Markup.button.callback('🗑', `del_${t.id}`)
        ]
      ])
    );
  }
});

// выполненные
bot.hears('✅ Выполненные', async (ctx) => {
  const res = await pool.query(
    'SELECT * FROM tasks WHERE user_id=$1 AND done=true',
    [ctx.from.id]
  );

  if (res.rows.length === 0) {
    return ctx.reply('Нет выполненных', mainMenu());
  }

  let text = '';

  res.rows.forEach((t,i) => {
    text += `${i+1}. ${t.text}\n`;
  });

  ctx.reply(text, mainMenu());
});

// статистика
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
    `📊\nАктивные: ${active.rows[0].count}\nГотово: ${done.rows[0].count}`,
    mainMenu()
  );
});

// кнопки
bot.action(/done_(\d+)/, async (ctx) => {
  const id = ctx.match[1];

  await pool.query(
    'UPDATE tasks SET done=true WHERE id=$1',
    [id]
  );

  ctx.answerCbQuery('Готово');
  ctx.editMessageText('✅ выполнено');
});

bot.action(/del_(\d+)/, async (ctx) => {
  const id = ctx.match[1];

  await pool.query(
    'DELETE FROM tasks WHERE id=$1',
    [id]
  );

  ctx.answerCbQuery('Удалено');
  ctx.editMessageText('🗑 удалено');
});

// 🔔 НАПОМИНАНИЯ
setInterval(async () => {
  try {
    const now = new Date();
    const currentTime = now.toTimeString().slice(0,5);

    const res = await pool.query(
      'SELECT * FROM tasks WHERE time=$1 AND done=false AND notified=false',
      [currentTime]
    );

    for (const task of res.rows) {
      await bot.telegram.sendMessage(
        task.user_id,
        `⏰ Напоминание\n📌 ${task.text}`
      );

      await pool.query(
        'UPDATE tasks SET notified=true WHERE id=$1',
        [task.id]
      );
    }

  } catch (e) {
    console.log(e);
  }
}, 60000);

// запуск
initDB().then(() => {
  bot.telegram.deleteWebhook().then(() => {
    bot.launch();
    console.log('Bot started');
  });
});
