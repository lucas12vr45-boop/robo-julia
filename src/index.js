'use strict';
try { require('dotenv').config(); } catch {}

const express = require('express');
const fs = require('fs');
const QRCode = require('qrcode');
const { default: makeWASocket, DisconnectReason, fetchLatestBaileysVersion, downloadMediaMessage } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const db = require('./db');
const fluxo = require('./fluxo');
const { iniciarAgenda } = require('./agenda');
const whatsapp = require('./whatsapp');
const { useLocalAuthState } = require('./auth');

const app = express();
app.use(express.json());

let qrAtual = null;
let botConectado = false;

app.get('/health', (_req, res) => res.json({ ok: true, conectado: botConectado }));

app.get('/qr', async (_req, res) => {
  if (botConectado) {
    return res.send('<h2 style="font-family:sans-serif;color:green">✅ Bot já está conectado!</h2>');
  }
  if (!qrAtual) {
    return res.send('<h2 style="font-family:sans-serif">⏳ Aguardando QR code... Recarregue em 5 segundos.</h2><script>setTimeout(()=>location.reload(),5000)</script>');
  }
  try {
    const img = await QRCode.toDataURL(qrAtual, { width: 300 });
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>QR - Robô Júlia</title>
<meta http-equiv="refresh" content="20"></head><body style="font-family:sans-serif;text-align:center;padding:40px">
<h2>📱 Escaneie com o WhatsApp</h2>
<p>WhatsApp → ⋮ → Dispositivos conectados → Conectar dispositivo</p>
<img src="${img}" style="border:4px solid #333;border-radius:8px"><br>
<small>Página atualiza automaticamente a cada 20s</small>
</body></html>`);
  } catch (e) {
    res.send('<h2>Erro ao gerar QR. Recarregue.</h2>');
  }
});

app.get('/reset/:tel', async (req, res) => {
  const tel = req.params.tel.replace(/\D/g, '');
  if (!tel) return res.status(400).json({ erro: 'telefone inválido' });
  await db.upsertCliente(tel, { passo_atual: 0, precisa_humano: false });
  await db.cancelarAgenda(tel);
  res.json({ ok: true, tel, mensagem: 'passo resetado para 0' });
});

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

async function conectar() {
  const { state, saveCreds } = await useLocalAuthState();
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    browser: ['Robô Júlia', 'Chrome', '1.0'],
    getMessage: async () => ({ conversation: '' }),
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false,
  });

  whatsapp.setSock(sock);
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      qrAtual = qr;
      botConectado = false;
      console.log('QR code gerado. Acesse /qr para escanear.');
    }

    if (connection === 'close') {
      botConectado = false;
      const statusCode = (lastDisconnect?.error instanceof Boom)
        ? lastDisconnect.error.output?.statusCode
        : null;
      const devReconectar = statusCode !== DisconnectReason.loggedOut;
      console.log('Conexão fechada. Status:', statusCode, '| Reconectar:', devReconectar);
      if (!devReconectar) {
        const AUTH_DIR = process.env.AUTH_DIR || '/tmp/wa-auth';
        try { fs.rmSync(AUTH_DIR, { recursive: true, force: true }); } catch {}
        console.log('Credenciais limpas. Reconectando...');
      }
      setTimeout(conectar, devReconectar ? 5000 : 2000);
    } else if (connection === 'open') {
      qrAtual = null;
      botConectado = true;
      console.log('✅ Robô Júlia conectado ao WhatsApp!');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      const remoteJid = msg.key.remoteJid || '';
      if (remoteJid.endsWith('@g.us')) continue;

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

const PORT = process.env.PORT || 3000;
(async () => {
  await db.init();
  iniciarAgenda();
  await conectar();
  app.listen(PORT, () => console.log(`Servidor ouvindo na porta ${PORT} ✓`));
})();
