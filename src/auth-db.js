'use strict';
const { initAuthCreds, BufferJSON, proto } = require('@whiskeysockets/baileys');
const { pool } = require('./db');

async function useDbAuthState() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wa_auth (
      key TEXT PRIMARY KEY,
      data TEXT NOT NULL
    )
  `);

  async function writeData(key, data) {
    const val = JSON.stringify(data, BufferJSON.replacer);
    await pool.query(
      'INSERT INTO wa_auth (key, data) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET data = $2',
      [key, val]
    );
  }

  async function readData(key) {
    const r = await pool.query('SELECT data FROM wa_auth WHERE key = $1', [key]);
    if (!r.rows[0]) return null;
    return JSON.parse(r.rows[0].data, BufferJSON.reviver);
  }

  async function removeData(key) {
    await pool.query('DELETE FROM wa_auth WHERE key = $1', [key]);
  }

  const savedCreds = await readData('creds');
  const creds = savedCreds || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          await Promise.all(ids.map(async (id) => {
            let val = await readData(`${type}-${id}`);
            if (type === 'app-state-sync-key' && val) {
              val = proto.Message.AppStateSyncKeyData.fromObject(val);
            }
            data[id] = val;
          }));
          return data;
        },
        set: async (data) => {
          const tasks = [];
          for (const category in data) {
            for (const id in data[category]) {
              const val = data[category][id];
              tasks.push(val ? writeData(`${category}-${id}`, val) : removeData(`${category}-${id}`));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: () => writeData('creds', creds),
  };
}

module.exports = { useDbAuthState };
