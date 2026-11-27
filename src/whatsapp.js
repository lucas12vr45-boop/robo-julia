'use strict';
const fs = require('fs');
const path = require('path');

// Thumbnail 1×1 pixel JPEG — evita erro "No image processing library available"
const THUMB_1PX = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDB' +
  'kSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAAR' +
  'CAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAA' +
  'AAAAAAAAAAAAAP/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAA' +
  'AAAAAAAAP/aAAwDAQACEQMRAD8AJQAB/9k=',
  'base64'
);

let _sock = null;

function setSock(sock) { _sock = sock; }

function jid(tel) {
  if (tel.includes('@')) return tel;
  return tel.replace(/\D/g, '') + '@s.whatsapp.net';
}

async function digitando(to) {
  try {
    await _sock.sendPresenceUpdate('composing', jid(to));
    await new Promise(r => setTimeout(r, Number(process.env.META_TYPING || 1) * 1000));
    await _sock.sendPresenceUpdate('paused', jid(to));
  } catch {}
}

async function presenca(to, tipo, segundos) {
  try {
    await _sock.sendPresenceUpdate(tipo, jid(to));
    await new Promise(r => setTimeout(r, segundos * 1000));
    await _sock.sendPresenceUpdate('paused', jid(to));
  } catch {}
}

// Opus no Ogg: duração = (granule da última página - pre-skip) / 48000
function duracaoOgg(buf) {
  const ultima = buf.lastIndexOf('OggS');
  const head = buf.indexOf('OpusHead');
  if (ultima < 0 || head < 0) return 0;
  const granule = Number(buf.readBigInt64LE(ultima + 6));
  const preSkip = buf.readUInt16LE(head + 10);
  return Math.max(0, (granule - preSkip) / 48000);
}

function existeAudio(arquivo) {
  return fs.existsSync(path.join(__dirname, '..', 'midia', 'audios', arquivo));
}

function entre(min, max) {
  return min + Math.random() * (max - min);
}

async function curtir(to, key) {
  try { await _sock.sendMessage(jid(to), { react: { text: '❤️', key } }); } catch {}
}

async function texto(to, msg) {
  await presenca(to, 'composing', entre(4, 6));
  return _sock.sendMessage(jid(to), { text: msg, linkPreview: false });
}

async function audio(to, arquivo, faixa = [8, 10]) {
  const caminho = path.join(__dirname, '..', 'midia', 'audios', arquivo);
  const buf = fs.readFileSync(caminho);
  const duracao = duracaoOgg(buf);
  await presenca(to, 'recording', entre(...faixa));
  const r = await _sock.sendMessage(jid(to), {
    audio: buf,
    mimetype: 'audio/ogg; codecs=opus',
    ptt: true,
    seconds: Math.round(duracao),
  });
  // Próxima mensagem chega faltando ~15s pro áudio acabar (ela já tem ~5s de "digitando")
  await new Promise(res => setTimeout(res, Math.max(0, duracao - 20) * 1000));
  return r;
}

async function imagem(to, arquivo, legenda = '') {
  const caminho = path.join(__dirname, '..', 'midia', 'imagens', arquivo);
  await presenca(to, 'composing', entre(4, 6));
  return _sock.sendMessage(jid(to), {
    image: fs.readFileSync(caminho),
    caption: legenda,
    jpegThumbnail: THUMB_1PX,
  });
}

async function documento(to, arquivo, nomeExibido) {
  const caminho = path.join(__dirname, '..', 'midia', 'produto', arquivo);
  await presenca(to, 'composing', entre(4, 6));
  return _sock.sendMessage(jid(to), {
    document: fs.readFileSync(caminho),
    mimetype: 'application/pdf',
    fileName: nomeExibido || arquivo,
  });
}

function existeVideo(arquivo) {
  return fs.existsSync(path.join(__dirname, '..', 'midia', 'video', arquivo));
}

async function video(to, arquivo, legenda = '') {
  const caminho = path.join(__dirname, '..', 'midia', 'video', arquivo);
  await presenca(to, 'composing', entre(4, 6));
  return _sock.sendMessage(jid(to), {
    video: fs.readFileSync(caminho),
    mimetype: 'video/mp4',
    caption: legenda,
    jpegThumbnail: THUMB_1PX,
  });
}

async function alertaDono(msg) {
  const dono = process.env.ALERTA_WHATSAPP_DONO;
  if (!dono) return;
  return texto(dono, `🤖 ALERTA ROBÔ:\n${msg}`);
}

module.exports = { setSock, digitando, curtir, existeAudio, existeVideo, texto, audio, imagem, documento, video, alertaDono };
