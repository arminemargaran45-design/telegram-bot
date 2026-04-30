const { Telegraf } = require('telegraf');

const bot = new Telegraf(process.env.BOT_TOKEN);

// функция получения московского времени
function getMoscowTime() {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "Europe/Moscow" })
  );
}

// парсинг времени типа "15:00"
function parseTime(text) {
  const match = text.match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;

  const now = getMoscowTime();

  const date = new Date(now);
  date.setHours(parseInt(match[1]));
  date.setMinutes(parseInt(match[2]));
  date.setSeconds(0);

  return date;
}

bot.start((ctx) => {
  ctx.reply('Бот работает 🚀\nНапиши задачу и время (например: Обед 15:00)');
});

bot.on('text', (ctx) => {
  const text = ctx.message.text;

  const time = parseTime(text);

  if (!time) {
    return ctx.reply('Напиши время в формате 15:00');
  }

  const formatted = time.toLocaleTimeString("ru-RU", {
    hour: '2-digit',
    minute: '2-digit'
  });

  ctx.reply(`✅ Задача добавлена\n⏰ Время: ${formatted}`);
});

bot.launch();

console.log("Бот запущен 🚀");
