require('dotenv').config();
const express = require('express'), helmet = require('helmet'), session = require('express-session');
const rateLimit = require('express-rate-limit'), bcrypt = require('bcryptjs'), multer = require('multer'), sharp = require('sharp');
const crypto = require('crypto'), path = require('path'), fs = require('fs'), Database = require('better-sqlite3');

const PROD = process.env.NODE_ENV === 'production';
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) { console.error('Set SESSION_SECRET (32+ random chars) in .env'); process.exit(1); }
const DATA = process.env.DATA_DIR || path.join(__dirname, 'storage');
const ORIG = path.join(DATA, 'originals'), MEDIA = path.join(DATA, 'media'); // ORIG is private: never served statically
[ORIG, MEDIA].forEach(d => fs.mkdirSync(d, { recursive: true }));

const db = new Database(process.env.DB_FILE || path.join(DATA, 'pixcel.db'));
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS admins(id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS categories(id INTEGER PRIMARY KEY, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, description TEXT DEFAULT '', sort INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS photos(id INTEGER PRIMARY KEY, title TEXT DEFAULT '', description TEXT DEFAULT '', category_id INTEGER, orig TEXT, display TEXT, thumb TEXT, w INTEGER, h INTEGER, allow_download INTEGER DEFAULT 0, published INTEGER DEFAULT 0, sort INTEGER DEFAULT 0, created INTEGER);
CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY, name TEXT, email TEXT, subject TEXT, message TEXT, is_read INTEGER DEFAULT 0, created INTEGER);
CREATE TABLE IF NOT EXISTS settings(k TEXT PRIMARY KEY, v TEXT);`);
const DEFAULTS = {
  name: '', about: 'Through my lens, I explore the beauty of nature, the details of tiny subjects, and the stories hidden in everyday moments.',
  interests: 'Nature, Macro, Wildlife, Birds, Landscapes, Artistic Photography', email: '', social: '', profile_image: ''
};
for (const [k, v] of Object.entries(DEFAULTS)) db.prepare('INSERT OR IGNORE INTO settings VALUES(?,?)').run(k, v);
const slugify = s => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
if (!db.prepare('SELECT COUNT(*) n FROM categories').get().n) {
  ['Nature', 'Macro', 'Wildlife', 'Birds', 'Landscapes', 'Artistic Photography'].forEach((n, i) => db.prepare('INSERT INTO categories(name,slug,sort) VALUES(?,?,?)').run(n, slugify(n), i));
}
const uniqueSlug = (name, ignoreId) => {
  const base = slugify(name) || 'category'; let s = base, i = 2;
  while (db.prepare('SELECT id FROM categories WHERE slug=? AND id<>?').get(s, ignoreId || 0)) s = base + '-' + i++;
  return s;
};

const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, n);
const bool = v => (v === '1' || v === 'true' || v === 'on' || v === true) ? 1 : 0;
const rm = (dir, f) => { if (f && /^[a-z0-9-]+\.(jpg|png|webp)$/.test(f)) fs.unlink(path.join(dir, f), () => {}); };
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024, files: 1 } });
const up = (req, res, next) => upload.single('image')(req, res, e => e ? res.status(400).json({ error: e.code === 'LIMIT_FILE_SIZE' ? 'Image is larger than 30 MB.' : 'Upload failed.' }) : next());

// Validates by decoding the real file (not the declared type), then writes the private original and two public derivatives (EXIF/GPS stripped).
async function processImage(buf) {
  const meta = await sharp(buf, { limitInputPixels: 200e6 }).metadata();
  if (!['jpeg', 'png', 'webp'].includes(meta.format)) throw new Error('Only JPG, PNG or WebP photographs are allowed.');
  const id = crypto.randomBytes(12).toString('hex'), ext = meta.format === 'jpeg' ? 'jpg' : meta.format;
  const swap = meta.orientation >= 5;
  const out = { orig: `${id}.${ext}`, display: `${id}-d.webp`, thumb: `${id}-t.webp`, w: swap ? meta.height : meta.width, h: swap ? meta.width : meta.height };
  await sharp(buf).rotate().resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toFile(path.join(MEDIA, out.display));
  await sharp(buf).rotate().resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true }).webp({ quality: 76 }).toFile(path.join(MEDIA, out.thumb));
  fs.writeFileSync(path.join(ORIG, out.orig), buf);
  return out;
}
const dropFiles = p => { rm(ORIG, p.orig); rm(MEDIA, p.display); rm(MEDIA, p.thumb); };

const app = express();
if (PROD) app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: { directives: {
  defaultSrc: ["'self'"], scriptSrc: ["'self'", 'https://cdnjs.cloudflare.com'],
  styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'], fontSrc: ['https://fonts.gstatic.com'],
  imgSrc: ["'self'", 'data:', 'blob:'], connectSrc: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'none'"] } } }));
app.use((req, res, next) => PROD && req.headers['x-forwarded-proto'] === 'http' ? res.redirect(301, 'https://' + req.headers.host + req.url) : next());
app.use(express.json({ limit: '50kb' }));
app.use(session({ name: 'pixcel.sid', secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'strict', secure: PROD, maxAge: 2 * 3600 * 1000 } }));
app.use('/media', express.static(MEDIA, { maxAge: '30d', immutable: true, setHeaders: r => r.setHeader('X-Content-Type-Options', 'nosniff') }));
app.use(express.static(path.join(__dirname, 'public')));

/* ---------- public ---------- */
app.get('/api/public', (req, res) => {
  const settings = Object.fromEntries(db.prepare('SELECT k,v FROM settings').all().map(r => [r.k, r.v]));
  if (settings.profile_image) settings.profile_image = '/media/' + settings.profile_image;
  const photos = db.prepare(`SELECT p.*, c.slug, c.name cname FROM photos p LEFT JOIN categories c ON c.id=p.category_id WHERE p.published=1 ORDER BY p.sort, p.id DESC`).all()
    .map(r => ({ id: r.id, title: r.title, description: r.description, category: r.slug || '', categoryName: r.cname || '', w: r.w, h: r.h, thumb: '/media/' + r.thumb, img: '/media/' + r.display, download: !!r.allow_download }));
  const categories = db.prepare('SELECT c.name,c.slug,c.description,(SELECT COUNT(*) FROM photos p WHERE p.category_id=c.id AND p.published=1) n FROM categories c ORDER BY c.sort,c.id').all();
  res.json({ settings, categories, photos });
});
const dlLimit = rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true });
app.get('/api/photos/:id/download', dlLimit, (req, res) => { // enforced here, not just in the UI
  const p = db.prepare('SELECT * FROM photos WHERE id=? AND published=1 AND allow_download=1').get(+req.params.id);
  if (!p) return res.status(404).json({ error: 'Download not available.' });
  res.download(path.join(ORIG, p.orig), (slugify(p.title) || 'pixcel-photo-' + p.id) + path.extname(p.orig));
});
const contactLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, standardHeaders: true, message: { error: 'Too many messages. Try again later.' } });
app.post('/api/contact', contactLimit, (req, res) => {
  const b = req.body || {};
  if (b.website) return res.json({ ok: true }); // honeypot
  const m = { name: clean(b.name, 100), email: clean(b.email, 120), subject: clean(b.subject, 150), message: clean(b.message, 3000) };
  if (m.name.length < 2) return res.status(400).json({ error: 'Enter your name.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(m.email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (m.message.length < 5) return res.status(400).json({ error: 'Write a short message.' });
  if (db.prepare('SELECT id FROM messages WHERE email=? AND message=? AND created>?').get(m.email, m.message, Date.now() - 600000)) return res.status(409).json({ error: 'This message was already received.' });
  db.prepare('INSERT INTO messages(name,email,subject,message,created) VALUES(?,?,?,?,?)').run(m.name, m.email, m.subject, m.message, Date.now());
  res.json({ ok: true });
});

/* ---------- admin auth ---------- */
const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 8, standardHeaders: true, message: { error: 'Too many login attempts. Wait 15 minutes.' } });
const DUMMY = bcrypt.hashSync('dummy-password', 12);
app.post('/api/admin/login', loginLimit, async (req, res) => {
  const email = clean(req.body?.email, 120).toLowerCase(), pw = String(req.body?.password ?? '').slice(0, 200);
  const a = db.prepare('SELECT * FROM admins WHERE email=?').get(email);
  const ok = await bcrypt.compare(pw, a ? a.hash : DUMMY);
  if (!a || !ok) return res.status(401).json({ error: 'Incorrect email or password.' });
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: 'Login failed.' });
    req.session.admin = a.id; req.session.email = a.email; req.session.csrf = crypto.randomBytes(24).toString('hex');
    res.json({ email: a.email, csrf: req.session.csrf });
  });
});
const auth = (req, res, next) => {
  if (!req.session.admin) return res.status(401).json({ error: 'Sign in required.' });
  if (req.method !== 'GET' && req.get('x-csrf-token') !== req.session.csrf) return res.status(403).json({ error: 'Invalid request token.' });
  next();
};
app.get('/api/admin/me', (req, res) => req.session.admin ? res.json({ email: req.session.email, csrf: req.session.csrf }) : res.status(401).json({ error: 'Sign in required.' }));
app.post('/api/admin/logout', auth, (req, res) => req.session.destroy(() => { res.clearCookie('pixcel.sid'); res.json({ ok: true }); }));

/* ---------- admin: photos ---------- */
const catId = v => { const n = +v; return n && db.prepare('SELECT id FROM categories WHERE id=?').get(n) ? n : null; };
app.get('/api/admin/photos', auth, (q, r) => r.json(db.prepare(`SELECT p.id,p.title,p.description,p.category_id,p.thumb,p.w,p.h,p.allow_download,p.published,p.sort,p.created,c.name cname FROM photos p LEFT JOIN categories c ON c.id=p.category_id ORDER BY p.sort, p.id DESC`).all()));
app.post('/api/admin/photos', auth, up, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose a photograph.' });
  try {
    const f = await processImage(req.file.buffer), b = req.body, first = db.prepare('SELECT COALESCE(MIN(sort),0)-1 s FROM photos').get().s;
    const r = db.prepare('INSERT INTO photos(title,description,category_id,orig,display,thumb,w,h,allow_download,published,sort,created) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(clean(b.title, 150), clean(b.description, 1000), catId(b.category_id), f.orig, f.display, f.thumb, f.w, f.h, bool(b.allow_download), bool(b.published), first, Date.now());
    res.json({ id: r.lastInsertRowid });
  } catch (e) { res.status(400).json({ error: e.message.startsWith('Only') ? e.message : 'That file could not be read as an image.' }); }
});
app.post('/api/admin/photos/reorder', auth, (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isInteger) : [];
  const st = db.prepare('UPDATE photos SET sort=? WHERE id=?');
  db.transaction(() => ids.forEach((id, i) => st.run(i, id)))(); res.json({ ok: true });
});
app.put('/api/admin/photos/:id', auth, up, async (req, res) => {
  const old = db.prepare('SELECT * FROM photos WHERE id=?').get(+req.params.id);
  if (!old) return res.status(404).json({ error: 'Not found.' });
  try {
    const b = req.body; let f = null; if (req.file) f = await processImage(req.file.buffer);
    db.prepare('UPDATE photos SET title=?,description=?,category_id=?,allow_download=?,published=?,orig=?,display=?,thumb=?,w=?,h=? WHERE id=?')
      .run(clean(b.title, 150), clean(b.description, 1000), catId(b.category_id), bool(b.allow_download), bool(b.published), f?.orig || old.orig, f?.display || old.display, f?.thumb || old.thumb, f?.w || old.w, f?.h || old.h, old.id);
    if (f) dropFiles(old);
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message.startsWith('Only') ? e.message : 'That file could not be read as an image.' }); }
});
app.delete('/api/admin/photos/:id', auth, (req, res) => {
  const p = db.prepare('SELECT * FROM photos WHERE id=?').get(+req.params.id);
  if (p) { db.prepare('DELETE FROM photos WHERE id=?').run(p.id); dropFiles(p); }
  res.json({ ok: true });
});

/* ---------- admin: categories ---------- */
app.get('/api/admin/categories', auth, (q, r) => r.json(db.prepare('SELECT c.*,(SELECT COUNT(*) FROM photos p WHERE p.category_id=c.id) n FROM categories c ORDER BY c.sort,c.id').all()));
app.post('/api/admin/categories', auth, (req, res) => {
  const name = clean(req.body?.name, 60); if (!name) return res.status(400).json({ error: 'Category name is required.' });
  const sort = db.prepare('SELECT COALESCE(MAX(sort),0)+1 s FROM categories').get().s;
  const r = db.prepare('INSERT INTO categories(name,slug,description,sort) VALUES(?,?,?,?)').run(name, uniqueSlug(name), clean(req.body?.description, 300), sort);
  res.json({ id: r.lastInsertRowid });
});
app.put('/api/admin/categories/:id', auth, (req, res) => {
  const name = clean(req.body?.name, 60); if (!name) return res.status(400).json({ error: 'Category name is required.' });
  db.prepare('UPDATE categories SET name=?,description=? WHERE id=?').run(name, clean(req.body?.description, 300), +req.params.id); res.json({ ok: true });
});
app.delete('/api/admin/categories/:id', auth, (req, res) => { // photos are kept, just uncategorised
  db.transaction(() => { db.prepare('UPDATE photos SET category_id=NULL WHERE category_id=?').run(+req.params.id); db.prepare('DELETE FROM categories WHERE id=?').run(+req.params.id); })();
  res.json({ ok: true });
});

/* ---------- admin: profile + messages ---------- */
app.get('/api/admin/settings', auth, (q, r) => r.json(Object.fromEntries(db.prepare('SELECT k,v FROM settings').all().map(x => [x.k, x.v]))));
app.put('/api/admin/settings', auth, (req, res) => {
  const b = req.body || {}, lim = { name: 80, about: 2000, interests: 400, email: 120, social: 600 }, st = db.prepare('UPDATE settings SET v=? WHERE k=?');
  if (b.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean(b.email, 120))) return res.status(400).json({ error: 'Enter a valid contact email or leave it empty.' });
  const urls = clean(b.social, 600).split('\n').map(s => s.trim()).filter(Boolean);
  if (urls.some(u => !/^https:\/\/[^\s]+$/i.test(u))) return res.status(400).json({ error: 'Social links must be full https:// addresses, one per line.' });
  db.transaction(() => { for (const k of Object.keys(lim)) if (k in b) st.run(clean(b[k], lim[k]).replace(k === 'social' ? /\r/g : /$^/, ''), k); })();
  res.json({ ok: true });
});
app.post('/api/admin/profile-image', auth, up, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose a photograph.' });
  try {
    const name = 'profile-' + crypto.randomBytes(8).toString('hex') + '.webp';
    await sharp(req.file.buffer, { limitInputPixels: 200e6 }).rotate().resize(800, 800, { fit: 'cover' }).webp({ quality: 85 }).toFile(path.join(MEDIA, name));
    const old = db.prepare("SELECT v FROM settings WHERE k='profile_image'").get()?.v;
    db.prepare("UPDATE settings SET v=? WHERE k='profile_image'").run(name); rm(MEDIA, old);
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: 'That file could not be read as an image.' }); }
});
app.get('/api/admin/messages', auth, (q, r) => r.json(db.prepare('SELECT * FROM messages ORDER BY id DESC').all()));
app.patch('/api/admin/messages/:id', auth, (req, res) => { db.prepare('UPDATE messages SET is_read=? WHERE id=?').run(bool(req.body?.is_read), +req.params.id); res.json({ ok: true }); });
app.delete('/api/admin/messages/:id', auth, (req, res) => { db.prepare('DELETE FROM messages WHERE id=?').run(+req.params.id); res.json({ ok: true }); });

app.use('/api', (q, r) => r.status(404).json({ error: 'Not found.' }));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Server error.' }); });
app.listen(process.env.PORT || 3000, () => console.log('PIXCEL running on http://localhost:' + (process.env.PORT || 3000)));
