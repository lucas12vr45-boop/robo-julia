'use strict';
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS clientes (
      telefone        TEXT PRIMARY KEY,
      nome            TEXT,
      criado_em       TIMESTAMPTZ DEFAULT NOW(),
      passo_atual     INT DEFAULT 0,
      dor             TEXT,
      audio_a1_usado  TEXT,
      audio_a2_usado  TEXT,
      link_enviado    TEXT,
      preco_oferecido TEXT,
      pagou           BOOLEAN DEFAULT FALSE,
      pago_em         TIMESTAMPTZ,
      email           TEXT,
      veio_do_anuncio BOOLEAN DEFAULT FALSE,
      ctwa_clid       TEXT,
      ultima_msg_em   TIMESTAMPTZ,
      janela_ate      TIMESTAMPTZ,
      precisa_humano  BOOLEAN DEFAULT FALSE,
      autorizou_depo  BOOLEAN DEFAULT FALSE
    );
    CREATE TABLE IF NOT EXISTS agenda (
      id          BIGSERIAL PRIMARY KEY,
      telefone    TEXT NOT NULL,
      acao        TEXT NOT NULL,
      dados       JSONB DEFAULT '{}',
      executar_em TIMESTAMPTZ NOT NULL,
      feito       BOOLEAN DEFAULT FALSE
    );
    CREATE INDEX IF NOT EXISTS idx_agenda_exec ON agenda(executar_em) WHERE feito = FALSE;
    ALTER TABLE clientes ADD COLUMN IF NOT EXISTS fone_chave TEXT;
    ALTER TABLE clientes ADD COLUMN IF NOT EXISTS optout BOOLEAN DEFAULT FALSE;
    ALTER TABLE clientes ADD COLUMN IF NOT EXISTS entregue BOOLEAN DEFAULT FALSE;
    ALTER TABLE clientes ADD COLUMN IF NOT EXISTS pedido_id TEXT;
    ALTER TABLE clientes ADD COLUMN IF NOT EXISTS comprou_app BOOLEAN DEFAULT FALSE;
    ALTER TABLE clientes ADD COLUMN IF NOT EXISTS desconto_enviado BOOLEAN DEFAULT FALSE;
    ALTER TABLE clientes ADD COLUMN IF NOT EXISTS video_enviado BOOLEAN DEFAULT FALSE;
    ALTER TABLE clientes ADD COLUMN IF NOT EXISTS lembretes INT DEFAULT 0;
    ALTER TABLE clientes ADD COLUMN IF NOT EXISTS itens_entregues TEXT DEFAULT '';
    CREATE INDEX IF NOT EXISTS idx_clientes_fone ON clientes(fone_chave);
  `);
}

// DDD + últimos 8 dígitos: casa "5524999418887", "24999418887" e "552499418887" (sem o 9)
function chaveFone(tel) {
  let d = String(tel || '').split('@')[0].replace(/\D/g, '');
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
  if (d.length < 10) return null;
  return d.slice(0, 2) + d.slice(-8);
}

async function buscarPorFone(tel) {
  const chave = chaveFone(tel);
  if (!chave) return null;
  const r = await pool.query(
    'SELECT * FROM clientes WHERE fone_chave = $1 OR telefone = $2 ORDER BY ultima_msg_em DESC NULLS LAST LIMIT 1',
    [chave, String(tel).replace(/\D/g, '')]
  );
  return r.rows[0] || null;
}

async function upsertCliente(tel, campos) {
  const keys = Object.keys(campos);
  if (!keys.length) return;
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  const cols = ['telefone', ...keys].join(', ');
  const ph = keys.map((_, i) => `$${i + 2}`).join(', ');
  const vals = [tel, ...keys.map((k) => campos[k])];
  await pool.query(
    `INSERT INTO clientes (${cols}) VALUES ($1, ${ph})
     ON CONFLICT (telefone) DO UPDATE SET ${sets}`,
    vals
  );
}

async function getCliente(tel) {
  const r = await pool.query('SELECT * FROM clientes WHERE telefone = $1', [tel]);
  return r.rows[0] || null;
}

async function agendarAcao(tel, acao, dados, delayMs) {
  const execEm = new Date(Date.now() + delayMs);
  await pool.query(
    'INSERT INTO agenda (telefone, acao, dados, executar_em) VALUES ($1,$2,$3,$4)',
    [tel, acao, dados, execEm]
  );
}

async function cancelarAgenda(tel) {
  await pool.query(
    "UPDATE agenda SET feito = TRUE WHERE telefone = $1 AND feito = FALSE",
    [tel]
  );
}

async function pegarPendentes() {
  const r = await pool.query(
    `SELECT * FROM agenda WHERE feito = FALSE AND executar_em <= NOW() ORDER BY executar_em LIMIT 50`
  );
  return r.rows;
}

async function marcarFeito(id) {
  await pool.query('UPDATE agenda SET feito = TRUE WHERE id = $1', [id]);
}

module.exports = { pool, init, chaveFone, buscarPorFone, upsertCliente, getCliente, agendarAcao, cancelarAgenda, pegarPendentes, marcarFeito };
