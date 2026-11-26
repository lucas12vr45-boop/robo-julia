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

async function texto(to, msg) {
  await digitando(to);
  return _sock.sendMessage(jid(to), { text: msg, linkPreview: false });
}

async function audio(to, arquivo) {
  const caminho = path.join(__dirname, '..', 'midia', 'audios', arquivo);
  return _sock.sendMessage(jid(to), {
    audio: fs.readFileSync(caminho),
    mimetype: 'audio/ogg; codecs=opus',
    ptt: true,
  });
}

async function imagem(to, arquivo, legenda = '') {
  const caminho = path.join(__dirname, '..', 'midia', 'imagens', arquivo);
  return _sock.sendMessage(jid(to), {
    image: fs.readFileSync(caminho),
    caption: legenda,
    jpegThumbnail: THUMB_1PX,
  });
}

async function documento(to, arquivo, nomeExibido) {
  const caminho = path.join(__dirname, '..', 'midia', 'produto', arquivo);
  return _sock.sendMessage(jid(to), {
    document: fs.readFileSync(caminho),
    mimetype: 'application/pdf',
    fileName: nomeExibido || arquivo,
  });
}

async function alertaDono(msg) {
  const dono = process.env.ALERTA_WHATSAPP_DONO;
  if (!dono) return;
  return texto(dono, `🤖 ALERTA ROBÔ:\n${msg}`);
}

module.exports = { setSock, digitando, texto, audio, imagem, documento, alertaDono };
