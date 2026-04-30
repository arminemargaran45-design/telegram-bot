const { Telegraf } = require('telegraf');

const bot = new Telegraf(process.env.BOT_TOKEN);

// --- ПРОСТОЙ И СТАБИЛЬНЫЙ БОТ БЕЗ ВЕБХУКОВ ---

function parseTime(text) {
  const match = text.match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;

  const hours = match[1].padStart(2, '0');
  const minutes = match[2];

  return `${hours}:${minutes}`;
}

bot.start((ctx) => {
  ctx.reply('Бот работает 🚀\nНапиши задачу: Обед 15:00');
});

bot.on('text', (ctx) => {
  const text = ctx.message.text;

  const time = parseTime(text);

  if (!time) {
    return ctx.reply('Напиши время в формате 15:00');
  }

  ctx.reply(`✅ Задача добавлена\n⏰ Время: ${time}`);
});

// ВАЖНО: удаляем вебхук и запускаем нормально
bot.telegram.deleteWebhook().then(() => {
  bot.launch();
});

console.log('Бот запущен 🚀');
