const express = require('express');
const { Telegraf } = require('telegraf');

const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();

app.use(express.json());

function parseTime(text) {
  const match = text.match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;

  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

bot.start((ctx) => {
  ctx.reply('Бот работает 🚀\nНапиши задачу и время, например: Обед 15:00');
});

bot.on('text', (ctx) => {
  const text = ctx.message.text;
  const time = parseTime(text);

  if (!time) {
    return ctx.reply('Напиши время в формате 15:00');
  }

  ctx.reply(`✅ Задача добавлена\n⏰ Время: ${time}`);
});

app.use(bot.webhookCallback('/bot'));

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log('Server started');

  await bot.telegram.deleteWebhook();
  await bot.telegram.setWebhook(`${process.env.DOMAIN}/bot`);
});
