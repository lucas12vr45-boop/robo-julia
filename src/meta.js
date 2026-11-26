'use strict';
const fetch = require('node-fetch');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const BASE = () => `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || 'v19.0'}`;
const TOKEN = () => process.env.META_TOKEN;
const PHONE_ID = () => process.env.META_PHONE_NUMBER_ID;

// Cache de media_ids para não subir o mesmo arquivo toda vez
const mediaCache = new Map();

async function req(method, endpoint, body) {
  const res = await fetch(`${BASE()}/${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN()}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json));
  return json;
}

// Simula digitando com um delay (WhatsApp Cloud API não tem "typing" nativo)
async function digitando(_to) {
  await new Promise(r => setTimeout(r, Number(process.env.META_TYPING || 1) * 1000));
}

async function texto(to, msg) {
  return req('POST', `${PHONE_ID()}/messages`, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { body: msg, preview_url: false },
  });
}

async function subirMidia(arquivo, tipo) {
  if (mediaCache.has(arquivo)) return mediaCache.get(arquivo);
  const caminho = path.join(__dirname, '..', 'midia', arquivo);
  const form = new FormData();
  form.append('file', fs.createReadStream(caminho));
  form.append('type', tipo);
  form.append('messaging_product', 'whatsapp');
  const res = await fetch(`${BASE()}/${PHONE_ID()}/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN()}` },
    body: form,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json));
  mediaCache.set(arquivo, json.id);
  return json.id;
}

async function audio(to, arquivo) {
  const id = await subirMidia(`audios/${arquivo}`, 'audio/ogg; codecs=opus');
  return req('POST', `${PHONE_ID()}/messages`, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'audio',
    audio: { id },
  });
}

async function imagem(to, arquivo, legenda = '') {
  const id = await subirMidia(`imagens/${arquivo}`, 'image/jpeg');
  return req('POST', `${PHONE_ID()}/messages`, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'image',
    image: { id, caption: legenda },
  });
}

async function documento(to, arquivo, nomeExibido) {
  const id = await subirMidia(`produto/${arquivo}`, 'application/pdf');
  return req('POST', `${PHONE_ID()}/messages`, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'document',
    document: { id, filename: nomeExibido || arquivo },
  });
}

async function alertaDono(msg) {
  const dono = process.env.ALERTA_WHATSAPP_DONO;
  if (!dono) return;
  return texto(dono, `🤖 ALERTA ROBÔ:\n${msg}`);
}

module.exports = { digitando, texto, audio, imagem, documento, alertaDono };
