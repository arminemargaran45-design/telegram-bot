const express = require('express');
const { Telegraf, Markup } = require('telegraf');

const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();

app.use(express.json());

const tasks = {};
const userState = {};

const MSK_OFFSET = 3 * 60 * 60 * 1000;

function getMoscowNow() {
  return new Date(Date.now() + MSK_OFFSET);
}

function createMoscowDate(year, month, day, hour, minute) {
  return new Date(Date.UTC(year, month, day, hour - 3, minute, 0));
}

function formatMoscow(date) {
  const msk = new Date(date.getTime() + MSK_OFFSET);
  return msk.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function parseDeadline(text) {
  const now = getMoscowNow();
  const lower = text.toLowerCase();

  const timeMatch = lower.match(/(\d{1,2})[:.](\d{2})/);
  if (!timeMatch) return null;

  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);

  let year = now.getUTCFullYear();
  let month = now.getUTCMonth();
  let day = now.getUTCDate();

  if (lower.includes('завтра')) {
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    year = tomorrow.getUTCFullYear();
    month = tomorrow.getUTCMonth();
    day = tomorrow.getUTCDate();
  }

  return createMoscowDate(year, month, day, hour, minute);
}

function mainMenu() {
  return Markup.keyboard([
    ['➕ Новая задача', '📋 Все активные'],
    ['✅ Выполненные', '📊 Статистика']
  ]).resize();
}

bot.start((ctx) => {
  ctx.reply(
    '👋 Привет! Я твой личный планировщик задач.\n\nВыберите действие:',
    mainMenu()
  );
});

bot.hears('➕ Новая задача', (ctx) => {
  userState[ctx.from.id] = { step: 'task_text' };
  ctx.reply('✍️ Напиши задачу:');
});

bot.hears('📋 Все активные', (ctx) => {
  const userId = ctx.from.id;
  const active = (tasks[userId] || []).filter(t => !t.done);

  if (!active.length) {
    return ctx.reply('Активных задач нет ✅', mainMenu());
  }

  const text = active.map((task, index) => {
    return `${index + 1}. ${task.text}\n⏰ ${formatMoscow(task.deadline)}`;
  }).join('\n\n');

  ctx.reply(text, mainMenu());
});

bot.hears('✅ Выполненные', (ctx) => {
  const userId = ctx.from.id;
  const done = (tasks[userId] || []).filter(t => t.done);

  if (!done.length) {
    return ctx.reply('Выполненных задач пока нет.', mainMenu());
  }

  const text = done.map((task, index) => {
    return `${index + 1}. ${task.text}`;
  }).join('\n');

  ctx.reply(text, mainMenu());
});

bot.hears('📊 Статистика', (ctx) => {
  const userId = ctx.from.id;
  const all = tasks[userId] || [];
  const active = all.filter(t => !t.done).length;
  const done = all.filter(t => t.done).length;

  ctx.reply(
    `📊 Статистика\n\nАктивных задач: ${active}\nВыполненных задач: ${done}`,
    mainMenu()
  );
});

bot.on('text', (ctx) => {
  const userId = ctx.from.id;
  const state = userState[userId];

  if (!state) return;

  if (state.step === 'task_text') {
    state.text = ctx.message.text;
    state.step = 'deadline';

    return ctx.reply(
      '🗓 Когда нужно сделать?\n\nНапример:\nСегодня в 14:00\nЗавтра в 15:30'
    );
  }

  if (state.step === 'deadline') {
    const deadline = parseDeadline(ctx.message.text);

    if (!deadline) {
      return ctx.reply('Не понял время. Напиши так: Сегодня в 14:00');
    }

    if (!tasks[userId]) tasks[userId] = [];

    tasks[userId].push({
      text: state.text,
      deadline,
      done: false
    });

    delete userState[userId];

    return ctx.reply(
      `✅ Задача создана!\n\n📌 ${state.text}\n⏰ ${formatMoscow(deadline)}`,
      mainMenu()
    );
  }
});

app.use(bot.webhookCallback('/bot'));

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log('Server started');
  await bot.telegram.setWebhook(`${process.env.DOMAIN}/bot`);
});
