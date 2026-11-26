'use strict';
const { initAuthCreds, proto } = require('@whiskeysockets/baileys');
const db = require('./db');

function replacer(_k, v) {
  if (Buffer.isBuffer(v)) return { __buf: true, data: v.toString('base64') };
  return v;
}

function reviver(_k, v) {
  if (v && v.__buf) return Buffer.from(v.data, 'base64');
  return v;
}

async function usePostgresAuthState() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS sessao_baileys (
      chave TEXT PRIMARY KEY,
      valor TEXT NOT NULL
    )
  `);

  const ler = async (chave) => {
    const r = await db.query('SELECT valor FROM sessao_baileys WHERE chave=$1', [chave]);
    if (!r.rows[0]) return null;
    return JSON.parse(r.rows[0].valor, reviver);
  };

  const gravar = async (chave, dado) => {
    const json = JSON.stringify(dado, replacer);
    await db.query(`
      INSERT INTO sessao_baileys(chave,valor) VALUES($1,$2)
      ON CONFLICT(chave) DO UPDATE SET valor=$2
    `, [chave, json]);
  };

  const remover = async (chave) => {
    await db.query('DELETE FROM sessao_baileys WHERE chave=$1', [chave]);
  };

  let creds = await ler('creds') || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (tipo, ids) => {
          const result = {};
          await Promise.all(ids.map(async (id) => {
            let val = await ler(`${tipo}-${id}`);
            if (tipo === 'app-state-sync-key' && val) {
              val = proto.Message.AppStateSyncKeyData.fromObject(val);
            }
            result[id] = val;
          }));
          return result;
        },
        set: async (data) => {
          const tasks = [];
          for (const categoria in data) {
            for (const id in data[categoria]) {
              const val = data[categoria][id];
              tasks.push(val ? gravar(`${categoria}-${id}`, val) : remover(`${categoria}-${id}`));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: () => gravar('creds', creds),
  };
}

module.exports = { usePostgresAuthState };
