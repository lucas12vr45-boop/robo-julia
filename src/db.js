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
  `);
}

async function upsertCliente(tel, campos) {
  const keys = Object.keys(campos);
  if (!keys.length) return;
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  const vals = [tel, ...keys.map((k) => campos[k])];
  await pool.query(
    `INSERT INTO clientes (telefone) VALUES ($1)
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

module.exports = { init, upsertCliente, getCliente, agendarAcao, cancelarAgenda, pegarPendentes, marcarFeito };
