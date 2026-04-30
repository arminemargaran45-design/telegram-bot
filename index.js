const { Telegraf, Markup } = require('telegraf');
const { Pool } = require('pg');

const bot = new Telegraf(process.env.BOT_TOKEN);

// безопасное подключение к базе
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// создаем таблицу (с защитой от падения)
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        user_id BIGINT,
        text TEXT,
        time TEXT,
        done BOOLEAN DEFAULT false
      )
    `);
    console.log('✅ DB OK');
  } catch (e) {
    console.log('❌ DB ERROR', e.message);
  }
}

initDB();

// меню
const menu = Markup.keyboard([
  ['➕ Новая задача'],
  ['📋 Все задачи']
]).resize();

// старт
bot.start((ctx) => {
  ctx.reply('👋 Я твой планировщик 🚀', menu);
});

// кнопка
bot.hears('➕ Новая задача', (ctx) => {
  ctx.reply('Напиши: Текст 15:00');
});

// добавление задачи
bot.on('text', async (ctx) => {
  try {
    const text = ctx.message.text;

    if (text === '➕ Новая задача' || text === '📋 Все задачи') return;

    const match = text.match(/(.+)\s(\d{1,2}:\d{2})/);

    if (!match) {
      return ctx.reply('❗ Пример: Обед 15:00');
    }

    const taskText = match[1];
    const time = match[2];

    await pool.query(
      'INSERT INTO tasks (user_id, text, time) VALUES ($1, $2, $3)',
      [ctx.from.id, taskText, time]
    );

    ctx.reply(`✅ ${taskText} — ${time}`);
  } catch (e) {
    console.log('ERROR ADD', e.message);
  }
});

// список
bot.hears('📋 Все задачи', async (ctx) => {
  try {
    const res = await pool.query(
      'SELECT * FROM tasks WHERE user_id=$1 AND done=false',
      [ctx.from.id]
    );

    if (res.rows.length === 0) {
      return ctx.reply('📭 Нет задач');
    }

    let text = '📋 Список:\n\n';

    res.rows.forEach((t, i) => {
      text += `${i + 1}. ${t.text} — ${t.time}\n`;
    });

    ctx.reply(text);
  } catch (e) {
    console.log('ERROR LIST', e.message);
  }
});

// ЗАПУСК (важно!)
bot.launch().then(() => {
  console.log('🚀 BOT STARTED');
}).catch(e => {
  console.log('❌ BOT CRASH', e.message);
});

// чтобы Railway не убивал процесс
process.on('unhandledRejection', (err) => console.log(err));
process.on('uncaughtException', (err) => console.log(err));
