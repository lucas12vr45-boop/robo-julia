'use strict';
const fetch = require('node-fetch');

// Usa Claude Haiku (barato e rápido) via Anthropic API
// Troque por OpenAI se preferir: ajuste a função req() e o modelo
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

const SYSTEM = `Você ajuda no atendimento de WhatsApp do "Destrave Seu Dinheiro em 2027", um guia
em PDF de 21 dias sobre crenças e hábitos com dinheiro (manifestação e lei da atração),
com teste inicial, exercícios de 10 minutos por dia e Ritual da Virada.
Entrega em PDF pelo WhatsApp e por e-mail, 7 dias de garantia pela Cakto.
Escreva como uma pessoa no WhatsApp: frases curtas, letra minúscula, tom carinhoso,
no máximo 1 emoji. Nunca prometa dinheiro, carro, casa, emprego ou resultado financeiro.
Nunca invente depoimentos, números ou casos. Nunca diga que é uma pessoa se perguntarem
diretamente se é robô ou automático. Se não souber, responda apenas: PRECISA_HUMANO.
Responda SOMENTE no formato JSON pedido.`;

async function chamarIA(mensagens, schema) {
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 256,
      system: SYSTEM,
      messages: [{ role: 'user', content: mensagens }],
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json));
  const raw = json.content[0].text.trim();
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Tarefa A: classifica dor + intenção
async function classificar(historico) {
  const prompt = `Histórico das últimas mensagens do cliente (mais recente por último):\n${historico}\n\nRetorne SOMENTE este JSON (sem explicação):\n{"dor":"DIVIDA|NAOSOBRA|IMPREVISTO|FAMILIA|VONTADE|ANONOVO|GERAL","intencao":"conta_dor|pergunta_preco|quer_link|ja_pagou|caro|desconfia|pensar|tempo|robo|humano|outra","confianca":0.0}`;
  const r = await chamarIA(prompt, null);
  if (!r || r.confianca < 0.6) return { dor: 'GERAL', intencao: 'outra', confianca: 0 };
  return r;
}

// Tarefa B: frase de acolhimento (1 frase, até 20 palavras, minúscula, 1 emoji)
async function acolhimento(historico) {
  const prompt = `Histórico:\n${historico}\n\nEscreva UMA frase de acolhimento (até 20 palavras, minúscula, máximo 1 emoji) citando com outras palavras o que o cliente contou. Retorne SOMENTE: {"frase":"..."}`;
  const r = await chamarIA(prompt, null);
  return r?.frase || 'entendo você, isso pesa mesmo…';
}

// Tarefa C: escolhe e reescreve levemente uma resposta do banco
async function reescreverBanco(intencao, textoBase) {
  const prompt = `Reescreva levemente a frase abaixo mantendo o sentido, em tom de WhatsApp (minúscula, 1 emoji no máximo). Retorne SOMENTE: {"texto":"..."}\nFrase original: ${textoBase}`;
  const r = await chamarIA(prompt, null);
  return r?.texto || textoBase;
}

// Transcrição de áudio via OpenAI Whisper
async function transcrever(bufferOgg) {
  const FormData = require('form-data');
  const fetch2 = require('node-fetch');
  const form = new FormData();
  form.append('file', bufferOgg, { filename: 'audio.ogg', contentType: 'audio/ogg' });
  form.append('model', 'whisper-1');
  form.append('language', 'pt');
  const res = await fetch2('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
  });
  const json = await res.json();
  return json.text || '';
}

module.exports = { classificar, acolhimento, reescreverBanco, transcrever };
