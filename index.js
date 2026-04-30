const { Telegraf, Markup } = require('telegraf');
const { Pool } = require('pg');

const bot = new Telegraf(process.env.BOT_TOKEN);

// подключение к базе
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// создаем таблицу
(async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      user_id BIGINT,
      text TEXT,
      time TEXT,
      done BOOLEAN DEFAULT false
    )
  `);
})();

// меню
const menu = Markup.keyboard([
  ['➕ Новая задача'],
  ['📋 Все задачи']
]).resize();

// старт
bot.start((ctx) => {
  ctx.reply('👋 Привет! Я твой умный планировщик 🚀', menu);
});

// новая задача
bot.hears('➕ Новая задача', (ctx) => {
  ctx.reply('Напиши задачу с временем\n\nПример: Встреча 15:00');
});

// добавление задачи
bot.on('text', async (ctx) => {
  const text = ctx.message.text;

  if (text === '➕ Новая задача' || text === '📋 Все задачи') return;

  const match = text.match(/(.+)\s(\d{1,2}:\d{2})/);

  if (!match) {
    return ctx.reply('❗ Формат: текст + время\nПример: Обед 15:00');
  }

  const taskText = match[1];
  const time = match[2];

  await pool.query(
    'INSERT INTO tasks (user_id, text, time) VALUES ($1, $2, $3)',
    [ctx.from.id, taskText, time]
  );

  ctx.reply(`✅ Добавлено:\n📌 ${taskText}\n⏰ ${time}`);
});

// список задач
bot.hears('📋 Все задачи', async (ctx) => {
  const res = await pool.query(
    'SELECT * FROM tasks WHERE user_id = $1 AND done = false ORDER BY id DESC',
    [ctx.from.id]
  );

  if (res.rows.length === 0) {
    return ctx.reply('📭 Задач пока нет');
  }

  let text = '📋 Твои задачи:\n\n';

  res.rows.forEach((t, i) => {
    text += `${i + 1}. ${t.text} — ⏰ ${t.time}\n`;
  });

  ctx.reply(text);
});

// запуск
bot.launch();

console.log('🚀 Bot started');
