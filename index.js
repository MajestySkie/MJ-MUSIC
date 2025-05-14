require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const ytdl = require('ytdl-core');
const { getPreview } = require('spotify-url-info');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (!message.content.startsWith('!play') || message.author.bot) return;

  const args = message.content.slice(6).trim();

  if (!args) return message.reply('Masukkan nama lagu atau link Spotify.');

  let query = args;

  // Jika link Spotify, ambil judul lagu
  if (args.includes('spotify.com/track')) {
    try {
      const data = await getPreview(args);
      query = `${data.title} ${data.artist}`;
    } catch (err) {
      return message.reply('Gagal membaca data dari link Spotify.');
    }
  }

  // Cari lagu di YouTube
  const yts = await import('yt-search');
  const search = await yts.default(query);
  const video = search.videos[0];
  if (!video) return message.reply('Lagu tidak ditemukan di YouTube.');

  const voiceChannel = message.member.voice.channel;
  if (!voiceChannel) return message.reply('Kamu harus join voice channel dulu.');

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: message.guild.id,
    adapterCreator: message.guild.voiceAdapterCreator
  });

  const stream = ytdl(video.url, { filter: 'audioonly' });
  const resource = createAudioResource(stream);
  const player = createAudioPlayer();

  player.play(resource);
  connection.subscribe(player);

  message.reply(`Memutar: **${video.title}**`);

  player.on(AudioPlayerStatus.Idle, () => {
    connection.destroy();
  });
});

client.login(process.env.DISCORD_TOKEN);

require('./server');
