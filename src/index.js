'use strict';
// Polyfill necessário para Baileys no Node 18
const { webcrypto } = require('crypto');
if (!globalThis.crypto) globalThis.crypto = webcrypto;
try { require('dotenv').config(); } catch {}

const express = require('express');
const { default: makeWASocket, DisconnectReason, fetchLatestBaileysVersion, downloadMediaMessage } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const db = require('./db');
const fluxo = require('./fluxo');
const { iniciarAgenda } = require('./agenda');
const whatsapp = require('./whatsapp');
const { usePostgresAuthState } = require('./auth');

const app = express();
app.use(express.json());

// ─── HEALTH ───────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true }));

// ─── WEBHOOK CAKTO ────────────────────────────────────────────────────────────
app.post('/webhook/cakto', async (req, res) => {
  const secret = req.headers['x-cakto-secret'] || req.headers['authorization'];
  if (process.env.CAKTO_WEBHOOK_SECRET && secret !== process.env.CAKTO_WEBHOOK_SECRET) {
    return res.sendStatus(401);
  }
  res.sendStatus(200);
  try {
    const { event, data } = req.body || {};
    if (event !== 'purchase_approved') return;
    const tel = (data?.customer?.phone || '').replace(/\D/g, '');
    const email = data?.customer?.email || '';
    if (!tel) return;
    await fluxo.vendaConfirmada(tel, email);
  } catch (e) {
    console.error('Erro webhook Cakto:', e.message);
  }
});

// ─── BAILEYS ─────────────────────────────────────────────────────────────────
async function conectar() {
  const { state, saveCreds } = await usePostgresAuthState();
  const { version } = await fetchLatestBaileysVersion();

  const NUMERO_BOT = process.env.NUMERO_BOT || '5524992488636';

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    browser: ['Robô Júlia', 'Chrome', '1.0'],
    getMessage: async () => ({ conversation: '' }),
  });

  whatsapp.setSock(sock);
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      // Gera pairing code em vez de QR (mais fácil de usar em servidor)
      try {
        const code = await sock.requestPairingCode(NUMERO_BOT);
        console.log('\n╔══════════════════════════════╗');
        console.log(`║  CÓDIGO DE EMPARELHAMENTO    ║`);
        console.log(`║                              ║`);
        console.log(`║       ${code}       ║`);
        console.log('║                              ║');
        console.log('║  WhatsApp > Dispositivos     ║');
        console.log('║  Conectados > Conectar com   ║');
        console.log('║  número de telefone          ║');
        console.log('╚══════════════════════════════╝\n');
      } catch (e) {
        console.log('Erro ao gerar pairing code:', e.message);
      }
    }
    if (connection === 'close') {
      const devReconectar = (lastDisconnect?.error instanceof Boom)
        ? lastDisconnect.error.output?.statusCode !== DisconnectReason.loggedOut
        : true;
      console.log('Conexão fechada. Reconectar:', devReconectar);
      if (devReconectar) setTimeout(conectar, 5000);
      else console.log('⚠️  Sessão encerrada. Escaneie o QR novamente.');
    } else if (connection === 'open') {
      console.log('✅ Robô Júlia conectado ao WhatsApp!');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      const remoteJid = msg.key.remoteJid || '';
      if (remoteJid.endsWith('@g.us')) continue; // ignora grupos

      const tel = remoteJid.replace('@s.whatsapp.net', '');
      const nome = msg.pushName || '';
      let texto = '';
      let tipoMidia = null;
      let bufferMidia = null;

      const m = msg.message || {};

      if (m.conversation) {
        texto = m.conversation;
      } else if (m.extendedTextMessage?.text) {
        texto = m.extendedTextMessage.text;
      } else if (m.audioMessage || m.pttMessage) {
        tipoMidia = 'audio';
        try {
          bufferMidia = await downloadMediaMessage(msg, 'buffer', {});
        } catch (e) {
          console.error('Erro ao baixar áudio:', e.message);
        }
      } else if (m.stickerMessage) {
        texto = '😊';
      } else {
        texto = '[mídia]';
      }

      try {
        await fluxo.receberMensagem(tel, nome, texto, tipoMidia, bufferMidia, null);
      } catch (e) {
        console.error('Erro ao processar mensagem:', e.message);
      }
    }
  });
}

// ─── INICIAR ─────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

(async () => {
  await db.init();
  iniciarAgenda();
  await conectar();
  app.listen(PORT, () => console.log(`Servidor ouvindo na porta ${PORT} ✓`));
})();
