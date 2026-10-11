// Usage: npm run create-admin  (password is hashed with bcrypt; never stored in plain text)
require('dotenv').config();
const readline = require('readline'), bcrypt = require('bcryptjs'), path = require('path'), fs = require('fs'), Database = require('better-sqlite3');
const DATA = process.env.DATA_DIR || path.join(__dirname, '..', 'storage'); fs.mkdirSync(DATA, { recursive: true });
const db = new Database(process.env.DB_FILE || path.join(DATA, 'pixcel.db'));
db.exec('CREATE TABLE IF NOT EXISTS admins(id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, hash TEXT NOT NULL)');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = q => new Promise(r => rl.question(q, r));
(async () => {
  const email = (await ask('Admin email: ')).trim().toLowerCase();
  const pw = await ask('Password (min 12 chars): ');
  rl.close();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Invalid email');
  if (pw.length < 12) throw new Error('Password must be at least 12 characters');
  db.prepare('INSERT INTO admins(email,hash) VALUES(?,?) ON CONFLICT(email) DO UPDATE SET hash=excluded.hash').run(email, bcrypt.hashSync(pw, 12));
  console.log('Admin saved:', email);
})().catch(e => { console.error(e.message); process.exit(1); });
