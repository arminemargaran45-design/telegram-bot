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
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log('DB ready');
}

function mainMenu() {
  return Markup.keyboard([
    ['➕ Новая задача', '📋 Активные'],
    ['✅ Выполненные', '📊 Статистика']
  ]).resize();
}

function parseTask(input) {
  const timeMatch = input.match(/(\d{1,2}:\d{2})/);
  const time = timeMatch ? timeMatch[1] : null;

  let priority = 'medium';
  if (/важно|срочно|высок/i.test(input)) priority = 'high';
  if (/низк|не срочно/i.test(input)) priority = 'low';

  const text = input
    .replace(/(\d{1,2}:\d{2})/, '')
    .replace(/важно|срочно|высок|низк|не срочно/gi, '')
    .trim();

  return { text, time, priority };
}

function priorityLabel(priority) {
  if (priority === 'high') return '🔥 Высокий';
  if (priority === 'low') return '🟢 Низкий';
  return '⚪ Средний';
}

bot.start((ctx) => {
  ctx.reply(
    '👋 Привет! Я твой умный планировщик задач.\n\nСоздавай задачи, ставь время и приоритет.',
    mainMenu()
  );
});

bot.hears('➕ Новая задача', (ctx) => {
  ctx.reply(
    '✍️ Напиши задачу.\n\nПримеры:\n• Обед 15:00\n• Срочно встреча 18:30\n• Низкий приоритет купить молоко 20:00',
    mainMenu()
  );
});

bot.hears('📋 Активные', async (ctx) => {
  const res = await pool.query(
    'SELECT * FROM tasks WHERE user_id=$1 AND done=false ORDER BY id DESC',
    [ctx.from.id]
  );

  if (res.rows.length === 0) {
    return ctx.reply('📭 Активных задач пока нет', mainMenu());
  }

  for (const task of res.rows) {
    await ctx.reply(
      `📌 ${task.text}\n⏰ ${task.time || 'Без времени'}\n${priorityLabel(task.priority)}`,
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
    return ctx.reply('Пока нет выполненных задач', mainMenu());
  }

  const text = res.rows
    .map((t, i) => `${i + 1}. ✅ ${t.text}`)
    .join('\n');

  ctx.reply(text, mainMenu());
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
    `📊 Твоя статистика\n\n📋 Активные: ${active.rows[0].count}\n✅ Выполненные: ${done.rows[0].count}`,
    mainMenu()
  );
});

bot.on('text', async (ctx) => {
  const input = ctx.message.text;

  if (['➕ Новая задача', '📋 Активные', '✅ Выполненные', '📊 Статистика'].includes(input)) {
    return;
  }

  const task = parseTask(input);

  if (!task.text) {
    return ctx.reply('Не поняла задачу. Напиши, например: Встреча 15:00', mainMenu());
  }

  await pool.query(
    'INSERT INTO tasks (user_id, text, time, priority) VALUES ($1, $2, $3, $4)',
    [ctx.from.id, task.text, task.time, task.priority]
  );

  ctx.reply(
    `🎉 Задача добавлена!\n\n📌 ${task.text}\n⏰ ${task.time || 'Без времени'}\n${priorityLabel(task.priority)}`,
    mainMenu()
  );
});

bot.action(/done_(\d+)/, async (ctx) => {
  const id = ctx.match[1];

  await pool.query(
    'UPDATE tasks SET done=true WHERE id=$1 AND user_id=$2',
    [id, ctx.from.id]
  );

  await ctx.answerCbQuery('Готово ✅');
  await ctx.editMessageText('✅ Задача выполнена');
});

bot.action(/delete_(\d+)/, async (ctx) => {
  const id = ctx.match[1];

  await pool.query(
    'DELETE FROM tasks WHERE id=$1 AND user_id=$2',
    [id, ctx.from.id]
  );

  await ctx.answerCbQuery('Удалено 🗑');
  await ctx.editMessageText('🗑 Задача удалена');
});

initDB().then(() => {
  bot.telegram.deleteWebhook().then(() => {
    bot.launch();
    console.log('Bot started');
  });
});
