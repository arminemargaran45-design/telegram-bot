const { Telegraf, Markup } = require('telegraf');

const bot = new Telegraf(process.env.BOT_TOKEN);

// память (временно)
let tasks = [];

// --- парсинг времени ---
function parseTime(text) {
  const match = text.match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;

  const hours = match[1].padStart(2, '0');
  const minutes = match[2];

  return `${hours}:${minutes}`;
}

// --- меню ---
function mainMenu() {
  return Markup.keyboard([
    ['➕ Новая задача'],
    ['📋 Все задачи']
  ]).resize();
}

// --- старт ---
bot.start((ctx) => {
  ctx.reply('Привет! Я твой планировщик задач 🧠', mainMenu());
});

// --- новая задача ---
bot.hears('➕ Новая задача', (ctx) => {
  ctx.reply('Напиши задачу с временем\nПример: Обед 15:00');
});

// --- список ---
bot.hears('📋 Все задачи', (ctx) => {
  if (tasks.length === 0) {
    return ctx.reply('Нет задач');
  }

  tasks.forEach((task, index) => {
    ctx.reply(
      `📌 ${task.text}\n⏰ ${task.time}`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ Готово', `done_${index}`),
          Markup.button.callback('🗑 Удалить', `del_${index}`)
        ]
      ])
    );
  });
});

// --- обработка текста ---
bot.on('text', (ctx) => {
  const text = ctx.message.text;

  const time = parseTime(text);

  if (!time) return;

  const taskText = text.replace(/\d{1,2}:\d{2}/, '').trim();

  tasks.push({
    text: taskText,
    time: time
  });

  ctx.reply(
    `✅ Задача добавлена\n📌 ${taskText}\n⏰ ${time}`,
    mainMenu()
  );
});

// --- кнопки ---
bot.action(/done_(.+)/, (ctx) => {
  const id = ctx.match[1];

  tasks.splice(id, 1);

  ctx.answerCbQuery('Готово');
  ctx.editMessageText('✅ Выполнено');
});

bot.action(/del_(.+)/, (ctx) => {
  const id = ctx.match[1];

  tasks.splice(id, 1);

  ctx.answerCbQuery('Удалено');
  ctx.editMessageText('🗑 Удалено');
});

// --- запуск ---
bot.telegram.deleteWebhook().then(() => {
  bot.launch();
});

console.log('Бот запущен 🚀');
