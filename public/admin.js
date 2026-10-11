(() => {
const $ = s => document.querySelector(s);
let csrf = '', view = 'home';
function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) k === 'class' ? n.className = v : (k in n || k.startsWith('on')) ? n[k] = v : n.setAttribute(k, v);
  kids.flat().forEach(c => n.append(c));
  return n;
}
function toast(msg, bad) { const t = $('#toast'); t.textContent = msg; t.className = bad ? 'bad' : ''; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 4000); }
async function api(method, url, body, retried) {
  const o = { method, headers: { 'X-CSRF-Token': csrf }, credentials: 'same-origin' };
  if (body instanceof FormData) o.body = body; else if (body) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(body); }
  const r = await fetch(url, o), j = await r.json().catch(() => ({}));
  if (r.status === 403 && !retried) { const m = await fetch('/api/admin/me', { credentials: 'same-origin' }); if (m.ok) { csrf = (await m.json()).csrf; return api(method, url, body, true); } }
  if (r.status === 401) { showLogin(); throw new Error('Session ended. Sign in again.'); }
  if (!r.ok) throw new Error(j.error || 'Request failed.');
  return j;
}
const run = async (fn, ok) => { try { await fn(); if (ok) toast(ok); } catch (e) { toast(e.message, true); } };
const mount = (...n) => { const m = $('#main'); m.replaceChildren(...n); m.focus({ preventScroll: true }); };
const fld = (label, name, val = '', type = 'text', max = 200) => el('label', {}, label, type === 'textarea' ? el('textarea', { name, value: val, maxLength: max }) : el('input', { name, type, value: val, maxLength: max }));
const chk = (label, name, on) => el('label', { class: 'chk' }, el('input', { name, type: 'checkbox', checked: !!on }), label);
const catSel = (cats, val, name = 'category_id') => el('label', {}, 'Category', el('select', { name }, el('option', { value: '', textContent: 'No category' }), cats.map(c => el('option', { value: c.id, textContent: c.name, selected: c.id === val }))));
const pill = (ok, a, b) => el('span', { class: 'pill ' + (ok ? 'ok' : 'wait'), textContent: ok ? a : b });
const th = h => el('th', { textContent: h });

/* login */
function showLogin() { $('#app').hidden = true; $('#login').hidden = false; csrf = ''; }
function showApp() { $('#login').hidden = true; $('#app').hidden = false; go(view); }
$('#showpw').onclick = e => { const p = $('#pw'), s = p.type === 'password'; p.type = s ? 'text' : 'password'; e.target.textContent = s ? 'Hide' : 'Show'; e.target.setAttribute('aria-pressed', s); };
$('#lf').onsubmit = async e => {
  e.preventDefault(); const f = new FormData(e.target), err = $('#lerr'), b = $('#lbtn'); err.textContent = '';
  if (!f.get('email') || !f.get('password')) return err.textContent = 'Enter your email and password.';
  b.disabled = true; b.replaceChildren(el('span', { class: 'spin' }), 'SIGNING IN');
  try {
    const r = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: f.get('email'), password: f.get('password') }) });
    const j = await r.json(); if (!r.ok) throw new Error(j.error);
    csrf = j.csrf; e.target.reset(); showApp();
  } catch (x) { err.textContent = x.message || 'Sign in failed.'; }
  b.disabled = false; b.textContent = 'SIGN IN';
};
$('#logout').onclick = () => run(async () => { await api('POST', '/api/admin/logout'); showLogin(); });
document.querySelectorAll('aside .t[data-v]').forEach(b => b.onclick = () => go(b.dataset.v));
function go(v) { view = v; document.querySelectorAll('aside .t[data-v]').forEach(b => b.setAttribute('aria-current', b.dataset.v === v)); ({ home, up: upload, ph: photos, cat: categories, pro: profile, msg: messages })[v](); }
const load = (...u) => Promise.all(u.map(x => api('GET', x))).catch(e => { toast(e.message, true); return u.map(() => []); });

/* overview */
async function home() {
  const [ph, cats, msgs] = await load('/api/admin/photos', '/api/admin/categories', '/api/admin/messages');
  const pub = ph.filter(p => p.published).length;
  mount(el('h2', { textContent: 'Overview' }),
    el('div', { class: 'cards' }, [['Published photographs', pub], ['Drafts', ph.length - pub], ['Categories', cats.length], ['Unread messages', msgs.filter(m => !m.is_read).length]].map(([l, n]) => el('div', { class: 'stat' }, el('b', { textContent: n }), el('span', { textContent: l })))),
    el('div', { class: 'panel' }, el('h3', { textContent: 'Recent uploads', style: 'margin-bottom:12px' }),
      ph.length ? el('div', { class: 'recent' }, [...ph].sort((a, b) => b.created - a.created).slice(0, 8).map(p => el('img', { src: '/media/' + p.thumb, alt: p.title || '' }))) : el('p', { textContent: 'No photographs yet.', style: 'color:var(--tx2)' })),
    el('div', { class: 'row' }, el('button', { class: 'btn pri', textContent: 'UPLOAD PHOTOGRAPHS', onclick: () => go('up') }), el('button', { class: 'btn', textContent: 'MANAGE PHOTOGRAPHS', onclick: () => go('ph') })));
}

/* upload (one or many, previewed, then sent one by one) */
async function upload() {
  const [cats] = await load('/api/admin/categories');
  const input = el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', multiple: true, 'aria-label': 'Choose photographs' });
  const queue = el('div', { class: 'queue' }), items = [];
  const go1 = el('button', { class: 'btn pri', textContent: 'UPLOAD ALL', disabled: true });
  input.onchange = () => {
    [...input.files].forEach(f => {
      if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return toast(f.name + ': only JPG, PNG or WebP.', true);
      if (f.size > 30 * 1024 * 1024) return toast(f.name + ' is larger than 30 MB.', true);
      const it = { f, st: el('span', { class: 'st', textContent: 'Ready' }) };
      it.row = el('div', { class: 'qi' }, el('img', { src: URL.createObjectURL(f), alt: 'Preview of ' + f.name }),
        el('div', {}, el('div', { class: 'f' }, fld('Title', 'title', f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '), 'text', 150), catSel(cats, 0), fld('Description', 'description', '', 'text', 1000)),
          el('div', { class: 'row', style: 'margin-top:10px' }, chk('Publish now (otherwise saved as draft)', 'published', true), chk('Allow public download', 'allow_download', false), it.st,
            el('button', { class: 'btn sm dng', type: 'button', textContent: 'REMOVE', onclick: () => { items.splice(items.indexOf(it), 1); it.row.remove(); go1.disabled = !items.length; } }))));
      items.push(it); queue.append(it.row);
    });
    input.value = ''; go1.disabled = !items.length;
  };
  go1.onclick = async () => {
    go1.disabled = true; let ok = 0;
    for (const it of [...items]) {
      const r = it.row, d = new FormData(); d.set('image', it.f);
      d.set('title', r.querySelector('[name=title]').value); d.set('description', r.querySelector('[name=description]').value); d.set('category_id', r.querySelector('[name=category_id]').value);
      d.set('published', r.querySelector('[name=published]').checked ? '1' : '0'); d.set('allow_download', r.querySelector('[name=allow_download]').checked ? '1' : '0');
      it.st.className = 'st'; it.st.textContent = 'Uploading…';
      try { await api('POST', '/api/admin/photos', d); it.st.className = 'st ok'; it.st.textContent = 'Uploaded'; ok++; items.splice(items.indexOf(it), 1); setTimeout(() => it.row.remove(), 1200); }
      catch (e) { it.st.className = 'st bad'; it.st.textContent = e.message; } // failed items stay so you can retry
    }
    go1.disabled = !items.length; toast(ok + ' photograph' + (ok === 1 ? '' : 's') + ' uploaded.' + (items.length ? ' Some failed; see the list.' : ''), !!items.length);
  };
  mount(el('h2', { textContent: 'Upload photographs' }), el('div', { class: 'panel' }, el('div', { class: 'drop' }, el('p', { textContent: 'JPG, PNG or WebP, up to 30 MB each. Your original file is kept privately; the website uses optimized copies.' }), input), queue, el('div', { class: 'row', style: 'margin-top:14px' }, go1)));
}

/* manage */
let editId = null;
async function photos() {
  const [rows, cats] = await load('/api/admin/photos', '/api/admin/categories');
  const q = el('input', { type: 'search', placeholder: 'Search by title', 'aria-label': 'Search photographs' });
  const st = el('select', { 'aria-label': 'Filter by status' }, [['', 'All'], ['1', 'Published'], ['0', 'Drafts']].map(([v, t]) => el('option', { value: v, textContent: t })));
  const body = el('tbody');
  const save = ids => run(async () => { await api('POST', '/api/admin/photos/reorder', { ids }); photos(); });
  const draw = () => {
    body.replaceChildren(); const s = q.value.toLowerCase();
    const list = rows.filter(r => (!st.value || String(r.published) === st.value) && (r.title || '').toLowerCase().includes(s));
    if (!list.length) body.append(el('tr', {}, el('td', { colSpan: 6, textContent: rows.length ? 'No photographs match.' : 'No photographs yet. Use "Upload photographs".' })));
    list.forEach(p => {
      const i = rows.indexOf(p), mv = d => { const ids = rows.map(r => r.id), j = i + d; if (j < 0 || j >= ids.length) return; [ids[i], ids[j]] = [ids[j], ids[i]]; save(ids); };
      body.append(el('tr', {}, el('td', {}, el('img', { class: 'th', src: '/media/' + p.thumb, alt: p.title || '' })), el('td', { textContent: p.title || '—' }), el('td', { textContent: p.cname || '—' }),
        el('td', {}, el('div', { class: 'row' }, pill(p.published, 'published', 'draft'), p.allow_download ? el('span', { class: 'pill', textContent: 'download' }) : '')),
        el('td', {}, el('div', { class: 'row' }, el('button', { class: 'btn sm', textContent: '↑', 'aria-label': 'Move up', onclick: () => mv(-1) }), el('button', { class: 'btn sm', textContent: '↓', 'aria-label': 'Move down', onclick: () => mv(1) }))),
        el('td', {}, el('div', { class: 'row' }, el('button', { class: 'btn sm', textContent: 'EDIT', onclick: () => { editId = p.id; photos(); scrollTo(0, 0); } }),
          el('button', { class: 'btn sm dng', textContent: 'DELETE', onclick: () => confirm('Delete "' + (p.title || 'this photograph') + '" permanently, including its original file?') && run(async () => { await api('DELETE', '/api/admin/photos/' + p.id); if (editId === p.id) editId = null; photos(); }, 'Photograph deleted.') })))));
    });
  };
  q.oninput = st.onchange = draw; draw();
  let panel = '';
  const e = rows.find(r => r.id === editId);
  if (e) {
    const f = el('form', { class: 'form' }, fld('Title', 'title', e.title, 'text', 150), catSel(cats, e.category_id), fld('Description', 'description', e.description, 'textarea', 1000),
      el('label', {}, 'Replace image file (optional)', el('input', { name: 'image', type: 'file', accept: 'image/jpeg,image/png,image/webp' })), el('img', { id: 'pv', class: 'th', src: '/media/' + e.thumb, alt: 'Current image', style: 'width:120px;height:90px;object-fit:cover;border-radius:8px' }),
      chk('Published on website', 'published', e.published), chk('Allow public download of the original', 'allow_download', e.allow_download),
      el('div', { class: 'row wide' }, el('button', { class: 'btn pri', type: 'submit', textContent: 'SAVE CHANGES' }), el('button', { class: 'btn', type: 'button', textContent: 'CANCEL', onclick: () => { editId = null; photos(); } })));
    f.image.onchange = () => { if (f.image.files[0]) $('#pv').src = URL.createObjectURL(f.image.files[0]); };
    f.onsubmit = ev => { ev.preventDefault(); const d = new FormData(f); d.set('published', f.published.checked ? '1' : '0'); d.set('allow_download', f.allow_download.checked ? '1' : '0'); if (!f.image.files[0]) d.delete('image');
      run(async () => { await api('PUT', '/api/admin/photos/' + e.id, d); editId = null; photos(); }, 'Saved.'); };
    panel = el('div', { class: 'panel' }, el('h3', { textContent: 'Edit photograph', style: 'margin-bottom:12px' }), f);
  }
  mount(el('h2', { textContent: 'Manage photographs' }), panel, el('div', { class: 'panel' }, el('div', { class: 'filt' }, q, st), el('div', { class: 'tw' }, el('table', {}, el('thead', {}, el('tr', {}, ['Photo', 'Title', 'Category', 'Status', 'Order', 'Actions'].map(th))), body))),
    el('p', { textContent: 'Order here is the order on the website (top = first). Changes appear after saving.', style: 'color:var(--tx2);font-size:.85rem' }));
}

/* categories */
async function categories() {
  const [rows] = await load('/api/admin/categories');
  const add = el('form', { class: 'form' }, fld('New category name', 'name', '', 'text', 60), fld('Description', 'description', '', 'text', 300), el('button', { class: 'btn pri', type: 'submit', textContent: 'ADD CATEGORY' }));
  add.onsubmit = e => { e.preventDefault(); run(async () => { await api('POST', '/api/admin/categories', Object.fromEntries(new FormData(add))); categories(); }, 'Category added.'); };
  const body = el('tbody', {}, rows.map(c => {
    const n = el('input', { value: c.name, maxLength: 60, 'aria-label': 'Name' }), d = el('input', { value: c.description || '', maxLength: 300, 'aria-label': 'Description' });
    return el('tr', {}, el('td', {}, n), el('td', {}, d), el('td', { textContent: c.n }),
      el('td', {}, el('div', { class: 'row' }, el('button', { class: 'btn sm', textContent: 'SAVE', onclick: () => run(async () => { await api('PUT', '/api/admin/categories/' + c.id, { name: n.value, description: d.value }); categories(); }, 'Saved.') }),
        el('button', { class: 'btn sm dng', textContent: 'DELETE', onclick: () => confirm('Delete "' + c.name + '"? ' + c.n + ' photograph(s) will be kept and become uncategorised.') && run(async () => { await api('DELETE', '/api/admin/categories/' + c.id); categories(); }, 'Category deleted.') }))));
  }));
  mount(el('h2', { textContent: 'Categories' }), el('div', { class: 'panel' }, add),
    el('div', { class: 'panel tw' }, el('table', {}, el('thead', {}, el('tr', {}, ['Name', 'Description', 'Photos', 'Actions'].map(th))), body)),
    el('p', { textContent: '"All Works" is built in and always shows every published photograph.', style: 'color:var(--tx2);font-size:.85rem' }));
}

/* profile */
async function profile() {
  const [s] = await load('/api/admin/settings');
  const pub = await fetch('/api/public').then(r => r.json()).catch(() => ({ settings: {} }));
  const img = pub.settings.profile_image;
  const pf = el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', 'aria-label': 'Profile photograph' });
  pf.onchange = () => { const d = new FormData(); d.set('image', pf.files[0]); run(async () => { await api('POST', '/api/admin/profile-image', d); profile(); }, 'Profile photograph updated.'); };
  const about = fld('About Me text', 'about', s.about, 'textarea', 2000); about.classList.add('wide');
  const ints = fld('Photography interests (comma separated)', 'interests', s.interests, 'text', 400); ints.classList.add('wide');
  const soc = fld('Social links (full https:// addresses, one per line)', 'social', s.social, 'textarea', 600); soc.classList.add('wide');
  const form = el('form', { class: 'form' }, fld('Display name', 'name', s.name, 'text', 80), fld('Public contact email', 'email', s.email, 'email', 120), about, ints, soc, el('div', { class: 'row wide' }, el('button', { class: 'btn pri', type: 'submit', textContent: 'SAVE PROFILE' })));
  form.onsubmit = e => { e.preventDefault(); run(() => api('PUT', '/api/admin/settings', Object.fromEntries(new FormData(form))), 'Saved.'); };
  mount(el('h2', { textContent: 'Profile & About' }),
    el('div', { class: 'panel' }, el('h3', { textContent: 'Profile photograph', style: 'margin-bottom:12px' }), el('div', { class: 'row' }, img ? el('img', { class: 'pimg', src: img, alt: 'Current profile photograph' }) : el('p', { textContent: 'No profile photograph yet.', style: 'color:var(--tx2)' }), pf)),
    el('div', { class: 'panel' }, form),
    el('p', { textContent: 'Only details you enter here are shown publicly. Empty fields are hidden.', style: 'color:var(--tx2);font-size:.85rem' }));
}

/* messages */
async function messages() {
  const [rows] = await load('/api/admin/messages');
  mount(el('h2', { textContent: 'Messages' }), el('div', { class: 'panel' }, rows.length ? rows.map(m => el('div', { style: 'border-bottom:1px solid var(--bd);padding:14px 0' },
    el('div', { class: 'row', style: 'justify-content:space-between' }, el('div', {}, el('b', { textContent: m.name + ' ' }), el('a', { href: 'mailto:' + m.email, textContent: m.email, style: 'color:var(--cyan)' }), el('small', { textContent: '  ' + new Date(m.created).toLocaleString(), style: 'color:var(--tx2)' })), pill(m.is_read, 'read', 'new')),
    m.subject ? el('p', { textContent: m.subject, style: 'font-weight:600;margin-top:6px' }) : '', el('p', { textContent: m.message, style: 'color:var(--tx2);white-space:pre-wrap;margin:6px 0 10px' }),
    el('div', { class: 'row' }, el('button', { class: 'btn sm', textContent: m.is_read ? 'MARK UNREAD' : 'MARK READ', onclick: () => run(async () => { await api('PATCH', '/api/admin/messages/' + m.id, { is_read: !m.is_read }); messages(); }) }),
      el('button', { class: 'btn sm dng', textContent: 'DELETE', onclick: () => confirm('Delete this message?') && run(async () => { await api('DELETE', '/api/admin/messages/' + m.id); messages(); }, 'Message deleted.') })))) : el('p', { textContent: 'No messages yet.', style: 'color:var(--tx2)' })));
}

fetch('/api/admin/me', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : Promise.reject()).then(j => { csrf = j.csrf; showApp(); }).catch(showLogin);
})();
