require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  getVoiceConnection,
  NoSubscriberBehavior
} = require('@discordjs/voice');
const ytdl = require('ytdl-core');
const SpotifyWebApi = require('spotify-web-api-node');
const { getPreview } = require('spotify-url-info');
const yts = require('yt-search');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});

const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET
});

spotifyApi.clientCredentialsGrant().then(data => {
  spotifyApi.setAccessToken(data.body['access_token']);
}).catch(err => {
  console.error('Spotify Auth Error:', err);
});

const queue = new Map();
const players = new Map();

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  const args = message.content.trim().split(' ');
  const command = args.shift().toLowerCase();

  if (command === '!play') {
    if (!message.member.voice.channel) return message.reply('Kamu harus join voice channel dulu.');

    const query = args.join(' ');
    if (!query) return message.reply('Masukkan nama lagu atau link Spotify.');

    let songs = [];

    if (query.includes('spotify.com/playlist')) {
      const playlistId = query.split('playlist/')[1].split('?')[0];
      try {
        const playlistData = await spotifyApi.getPlaylist(playlistId);
        const data = await spotifyApi.getPlaylistTracks(playlistId, { limit: 30 });
        songs = data.body.items.map(item => `${item.track.name} ${item.track.artists[0].name}`);

        const embed = new EmbedBuilder()
          .setTitle('Added Playlist')
          .addFields(
            { name: 'Playlist', value: `[${playlistData.body.name}](${playlistData.body.external_urls.spotify})`, inline: false },
            { name: 'Tracks', value: `${songs.length}`, inline: true }
          )
          .setThumbnail(playlistData.body.images[0]?.url || '')
          .setColor('Green');

        message.channel.send({ embeds: [embed] });
      } catch (error) {
        return message.reply('Gagal membaca playlist Spotify.');
      }
    } else if (query.includes('spotify.com/track')) {
      try {
        const data = await getPreview(query);
        songs = [`${data.title} ${data.artist}`];
      } catch (err) {
        return message.reply('Gagal membaca data dari link Spotify.');
      }
    } else {
      songs = [query];
    }

    const serverQueue = queue.get(message.guild.id) || [];
    queue.set(message.guild.id, serverQueue);

    for (const title of songs) {
      const search = await yts(title);
      const video = search.videos[0];
      if (!video) continue;
      serverQueue.push(video);
    }

    if (!players.get(message.guild.id)) {
      playNext(message.guild.id, message.member.voice.channel, message.channel);
    }
  }

  if (command === '!skip') {
    const player = players.get(message.guild.id);
    if (player) player.stop();
  }

  if (command === '!pause') {
    const player = players.get(message.guild.id);
    if (player) player.pause();
  }

  if (command === '!resume') {
    const player = players.get(message.guild.id);
    if (player) player.unpause();
  }

  if (command === '!leave') {
    const connection = getVoiceConnection(message.guild.id);
    if (!connection) return message.reply('Bot tidak ada di voice channel.');
    connection.destroy();
    queue.delete(message.guild.id);
    players.delete(message.guild.id);
    return message.reply('Bot telah keluar dari voice channel.');
  }

  if (command === '!queue') {
    const serverQueue = queue.get(message.guild.id);
    if (!serverQueue || serverQueue.length === 0) return message.reply('Tidak ada lagu dalam antrian.');
    const list = serverQueue.map((v, i) => `${i + 1}. ${v.title}`).join('\n');
    return message.reply(`🎶 **Antrian Lagu:**\n${list}`);
  }
});

async function playNext(guildId, voiceChannel, textChannel) {
  const serverQueue = queue.get(guildId);
  if (!serverQueue || serverQueue.length === 0) {
    players.delete(guildId);
    return;
  }

  const video = serverQueue.shift();
  const stream = ytdl(video.url, { filter: 'audioonly' });
  const resource = createAudioResource(stream);
  const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: voiceChannel.guild.id,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator
  });

  players.set(guildId, player);

  player.play(resource);
  connection.subscribe(player);
  textChannel.send(`🎶 Sekarang memutar: **${video.title}**`);

  player.on(AudioPlayerStatus.Idle, () => {
    playNext(guildId, voiceChannel, textChannel);
  });

  player.on('error', error => {
    console.error('Audio player error:', error);
    playNext(guildId, voiceChannel, textChannel);
  });
}

client.login(process.env.DISCORD_TOKEN);
require('./server');
