const { Telegraf, Markup } = require('telegraf');
const { Pool } = require('pg');

const bot = new Telegraf(process.env.BOT_TOKEN);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

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
}

function menu() {
  return Markup.keyboard([
    ['➕ Новая задача', '📋 Все задачи'],
    ['✅ Выполненные', '📊 Статистика']
  ]).resize();
}

function parseTask(text) {
  const match = text.match(/(.+?)\s+(\d{1,2}[:.]\d{2})$/);

  if (!match) return null;

  const taskText = match[1].trim();
  const time = match[2].replace('.', ':');

  let priority = 'medium';
  if (/срочно|важно/i.test(taskText)) priority = 'high';
  if (/низк|не срочно/i.test(taskText)) priority = 'low';

  return { taskText, time, priority };
}

bot.start((ctx) => {
  ctx.reply(
    '👋 Привет! Я твой планировщик задач.\n\nНапиши задачу так:\n\nзавтрак 08:40\nобед 15:00\nсрочно встреча 18:30',
    menu()
  );
});

bot.hears('➕ Новая задача', (ctx) => {
  ctx.reply('Напиши задачу так:\n\nзавтрак 08:40');
});

bot.hears('📋 Все задачи', async (ctx) => {
  const res = await pool.query(
    'SELECT * FROM tasks WHERE user_id=$1 AND done=false ORDER BY id DESC',
    [ctx.from.id]
  );

  if (res.rows.length === 0) {
    return ctx.reply('📭 Активных задач пока нет', menu());
  }

  for (const task of res.rows) {
    await ctx.reply(
      `📌 ${task.text}\n⏰ ${task.time}`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ Готово', `done_${task.id}`),
          Markup.button.callback('🗑 Удалить', `delete_${task.id}`)
        ]
      ])
    );
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
    res.rows.map((t, i) => `${i + 1}. ✅ ${t.text} — ${t.time}`).join('\n'),
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

bot.on('text', async (ctx) => {
  const text = ctx.message.text;

  if (['➕ Новая задача', '📋 Все задачи', '✅ Выполненные', '📊 Статистика'].includes(text)) {
    return;
  }

  const task = parseTask(text);

  if (!task) {
    return ctx.reply('❗ Не понял задачу.\n\nНапиши так:\nзавтрак 08:40');
  }

  await pool.query(
    'INSERT INTO tasks (user_id, text, time, priority) VALUES ($1, $2, $3, $4)',
    [ctx.from.id, task.taskText, task.time, task.priority]
  );

  ctx.reply(
    `✅ Задача добавлена!\n\n📌 ${task.taskText}\n⏰ ${task.time}`,
    menu()
  );
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
  const currentTime = now.toTimeString().slice(0, 5);

  const res = await pool.query(
    'SELECT * FROM tasks WHERE time=$1 AND done=false AND notified=false',
    [currentTime]
  );

  for (const task of res.rows) {
    await bot.telegram.sendMessage(
      task.user_id,
      `⏰ Напоминание!\n\n📌 ${task.text}\n🕒 ${task.time}`
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
