'use strict';
// dotenv só carrega em dev local — no Railway as vars já vêm do ambiente
try { require('dotenv').config(); } catch {}
const express = require('express');
const crypto = require('crypto');
const db = require('./db');
const fluxo = require('./fluxo');
const { iniciarAgenda } = require('./agenda');

const app = express();
app.use(express.json());

// ─── HEALTH ───────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true }));

// ─── WEBHOOK WHATSAPP (Meta) ──────────────────────────────────────────────────
// Verificação do webhook (GET)
app.get('/webhook/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
    console.log('Webhook verificado ✓');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Receber mensagens (POST)
app.post('/webhook/whatsapp', async (req, res) => {
  // Verificar assinatura
  const sig = req.headers['x-hub-signature-256'];
  if (sig && process.env.META_APP_SECRET) {
    const expected = 'sha256=' + crypto
      .createHmac('sha256', process.env.META_APP_SECRET)
      .update(JSON.stringify(req.body))
      .digest('hex');
    if (sig !== expected) return res.sendStatus(401);
  }

  res.sendStatus(200); // Responder 200 rápido para a Meta não reenviar

  try {
    const entry = req.body?.entry?.[0];
    const changes = entry?.changes?.[0]?.value;
    if (!changes?.messages) return;

    for (const msg of changes.messages) {
      const tel = msg.from;
      const nome = changes.contacts?.[0]?.profile?.name || '';
      const ctwaClid = msg.referral?.ctwa_clid || null;

      let texto = '';
      let tipoMidia = null;
      let mediaId = null;

      if (msg.type === 'text') {
        texto = msg.text?.body || '';
      } else if (msg.type === 'audio') {
        tipoMidia = 'audio';
        mediaId = msg.audio?.id;
      } else if (['sticker', 'emoji'].includes(msg.type)) {
        texto = '😊';
      } else {
        texto = '[mídia]';
      }

      await fluxo.receberMensagem(tel, nome, texto, tipoMidia, mediaId, ctwaClid);
    }
  } catch (e) {
    console.error('Erro webhook WhatsApp:', e.message);
  }
});

// ─── WEBHOOK CAKTO ────────────────────────────────────────────────────────────
app.post('/webhook/cakto', async (req, res) => {
  // Verificar segredo da Cakto
  const secret = req.headers['x-cakto-secret'] || req.headers['authorization'];
  if (process.env.CAKTO_WEBHOOK_SECRET && secret !== process.env.CAKTO_WEBHOOK_SECRET) {
    return res.sendStatus(401);
  }

  res.sendStatus(200);

  try {
    const { event, data } = req.body || {};
    if (event !== 'purchase_approved') return;

    // A Cakto manda o telefone que o cliente digitou no checkout
    const tel = (data?.customer?.phone || '').replace(/\D/g, '');
    const email = data?.customer?.email || '';

    if (!tel) {
      console.warn('Cakto: compra sem telefone', data);
      return;
    }

    await fluxo.vendaConfirmada(tel, email);
  } catch (e) {
    console.error('Erro webhook Cakto:', e.message);
  }
});

// ─── INICIAR ──────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

(async () => {
  await db.init();
  iniciarAgenda();
  app.listen(PORT, () => console.log(`Robô Júlia ouvindo na porta ${PORT} ✓`));
})();
