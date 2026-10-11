(() => {
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const small = () => innerWidth < 900, mobile = () => innerWidth < 760;
const lowPower = () => mobile() || (navigator.hardwareConcurrency || 8) <= 4;
const mouse = { x: 0, y: 0, sx: 0, sy: 0 };
addEventListener('pointermove', e => { mouse.x = e.clientX / innerWidth - .5; mouse.y = e.clientY / innerHeight - .5; }, { passive: true });
function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) k === 'class' ? n.className = v : (k in n || k.startsWith('on')) ? n[k] = v : n.setAttribute(k, v);
  kids.flat().forEach(c => n.append(c));
  return n;
}
$('#yr').textContent = new Date().getFullYear();

/* ---------- intro: camera-lens iris opening ---------- */
(function intro() {
  const lens = $('#lens');
  if (reduce) return lens.classList.add('done');
  const t0 = performance.now(), D = 1500;
  (function step(t) {
    const p = Math.min((t - t0) / D, 1), e = 1 - Math.pow(1 - p, 3);
    lens.style.setProperty('--r', (e * 75).toFixed(2) + '%');
    p < 1 ? requestAnimationFrame(step) : lens.classList.add('done');
  })(t0);
})();

/* ---------- navigation ---------- */
const ids = ['home', 'about', 'gallery', 'categories', 'contact'];
const names = ['Home', 'About Me', 'Gallery', 'Categories', 'Contact'];
const secs = ids.map(i => document.getElementById(i));
let active = 0;
function updateActive() {
  const y = scrollY + innerHeight * .4;
  active = 0; secs.forEach((s, i) => { if (s.offsetTop <= y) active = i; });
  $$('nav a.l, .dots a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + ids[active]));
  $('#top').classList.toggle('solid', scrollY > 40);
}
const burger = $('#burger'), menu = $('#menu');
burger.onclick = () => { const o = menu.classList.toggle('open'); burger.setAttribute('aria-expanded', o); };
menu.onclick = e => { if (e.target.closest('a')) { menu.classList.remove('open'); burger.setAttribute('aria-expanded', false); } };

/* ---------- content ---------- */
let data = { settings: {}, categories: [], photos: [] }, cur = 'all', shown = [];
function renderProfile() {
  const s = data.settings;
  $('#aname').textContent = s.name || 'About Me';
  $('#atxt').textContent = s.about || '';
  const tg = $('#atags'); tg.replaceChildren(...(s.interests || '').split(',').map(t => t.trim()).filter(Boolean).map(t => el('span', { textContent: t })));
  if (s.profile_image) { const f = $('#pframe'); f.replaceChildren(el('img', { src: s.profile_image, alt: s.name ? 'Portrait of ' + s.name : 'Portrait of the photographer', width: 400, height: 400, loading: 'lazy', decoding: 'async' })); }
  const cl = $('#clinks'); cl.replaceChildren();
  if (s.email) cl.append(el('a', { href: 'mailto:' + s.email, textContent: s.email }));
  (s.social || '').split('\n').map(u => u.trim()).filter(u => /^https:\/\//i.test(u)).forEach(u => {
    let label = u; try { label = new URL(u).hostname.replace(/^www\./, ''); } catch (e) {}
    cl.append(el('a', { href: u, target: '_blank', rel: 'noopener noreferrer', textContent: label }));
  });
}
const tiltOn = (n, rx = 7) => {
  if (reduce || matchMedia('(hover:none)').matches) return;
  n.addEventListener('pointermove', e => { const r = n.getBoundingClientRect(); n.style.transition = 'transform .12s'; n.style.transform = `perspective(900px) rotateY(${((e.clientX - r.left) / r.width - .5) * rx}deg) rotateX(${-((e.clientY - r.top) / r.height - .5) * rx}deg) scale(1.012)`; });
  n.addEventListener('pointerleave', () => { n.style.transition = ''; n.style.transform = ''; });
};
tiltOn($('#pframe'), 10);

const mas = $('#mas');
const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -4% 0px' });
const eye = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
function renderGallery() {
  shown = data.photos.filter(p => cur === 'all' || p.category === cur);
  mas.replaceChildren();
  if (!shown.length) return mas.append(el('p', { class: 'empty', textContent: data.photos.length ? 'No photographs in this category yet.' : 'Photographs will appear here once they are published.' }));
  shown.forEach((p, i) => {
    const im = el('img', { src: p.thumb, alt: p.title || p.categoryName || 'Photograph', width: p.w, height: p.h, loading: 'lazy', decoding: 'async' });
    const box = el('div', { class: 'box', style: `aspect-ratio:${p.w}/${p.h}` }, im);
    const ov = el('div', { class: 'ov' }, el('small', { textContent: p.categoryName }), el('b', { textContent: p.title }));
    ov.insertAdjacentHTML('beforeend', eye);
    const b = el('button', { class: 'ph-item', type: 'button', 'aria-label': 'View ' + (p.title || 'photograph') }, box, ov);
    b.style.transitionDelay = (i % 6) * 70 + 'ms';
    const done = () => { b.classList.add('ld'); };
    im.complete ? done() : (im.onload = done, im.onerror = done);
    b.onclick = () => openLb(i); tiltOn(b, 5);
    mas.append(b); io.observe(b);
  });
}
function setCat(slug, scroll) {
  cur = slug;
  $$('.chip', $('#chips')).forEach(c => c.setAttribute('aria-pressed', c.dataset.c === slug));
  if (reduce) renderGallery(); else { mas.classList.add('out'); setTimeout(() => { renderGallery(); mas.classList.remove('out'); }, 260); }
  if (scroll) $('#gallery').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
}
function renderCats() {
  const ch = $('#chips'); ch.replaceChildren(el('button', { class: 'chip', type: 'button', textContent: 'All Works', onclick: () => setCat('all') }));
  ch.firstChild.dataset.c = 'all';
  data.categories.forEach(c => { const b = el('button', { class: 'chip', type: 'button', textContent: c.name, onclick: () => setCat(c.slug) }); b.dataset.c = c.slug; ch.append(b); });
  const g = $('#cats'); g.replaceChildren();
  data.categories.forEach(c => { const b = el('button', { class: 'cat', type: 'button', onclick: () => setCat(c.slug, true) }, el('span', { class: 'n', textContent: c.n + (c.n === 1 ? ' PHOTOGRAPH' : ' PHOTOGRAPHS') }), el('h3', { textContent: c.name }), el('p', { textContent: c.description || '' })); tiltOn(b, 8); g.append(b); });
  if (!data.categories.length) g.append(el('p', { class: 'empty', textContent: 'Categories will appear here.' }));
}
fetch('/api/public').then(r => r.json()).then(d => { data = d; renderProfile(); renderCats(); setCat('all'); layoutDirty = true; })
  .catch(() => { mas.replaceChildren(el('p', { class: 'empty', textContent: 'The gallery could not be loaded. Please refresh the page.' })); });

/* ---------- full-screen viewer ---------- */
const lb = $('#lb'), lbi = $('#lbi'); let li = 0;
function showLb() {
  const p = shown[li]; if (!p) return;
  lbi.style.opacity = 0; lbi.alt = p.title || p.categoryName || 'Photograph'; lbi.src = p.img; lbi.onload = () => lbi.style.opacity = 1;
  $('#lbt').textContent = p.title; $('#lbc').textContent = (p.categoryName || '').toUpperCase(); $('#lbd').textContent = p.description || '';
  const dl = $('#lbdl'); dl.hidden = !p.download; if (p.download) dl.href = '/api/photos/' + p.id + '/download';
  [shown[li + 1], shown[li - 1]].forEach(n => { if (n) new Image().src = n.img; });
}
function openLb(i) { li = i; showLb(); if (!lb.open) lb.showModal(); }
const step = d => { if (!shown.length) return; li = (li + d + shown.length) % shown.length; showLb(); };
$('#lbx').onclick = () => lb.close(); $('#lbp').onclick = () => step(-1); $('#lbn').onclick = () => step(1);
lb.addEventListener('keydown', e => { if (e.key === 'ArrowRight') step(1); if (e.key === 'ArrowLeft') step(-1); });
lb.addEventListener('click', e => { if (e.target === lb || e.target.classList.contains('stage')) lb.close(); });
let tx = 0; lb.addEventListener('touchstart', e => tx = e.touches[0].clientX, { passive: true });
lb.addEventListener('touchend', e => { const d = e.changedTouches[0].clientX - tx; if (Math.abs(d) > 50) step(d < 0 ? 1 : -1); }, { passive: true });

/* ---------- contact form ---------- */
const cf = $('#cf'), fm = $('#fmsg'), cb = $('#cbtn');
const say = (t, ok) => { fm.textContent = t; fm.className = ok ? 'ok' : 'err'; };
cf.onsubmit = async e => {
  e.preventDefault(); const d = Object.fromEntries(new FormData(cf));
  if (d.name.trim().length < 2) return say('Enter your name.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email.trim())) return say('Enter a valid email address.');
  if (d.message.trim().length < 5) return say('Write a short message.');
  cb.disabled = true; say('Sending…', true);
  try {
    const r = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) }), j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Could not send.');
    cf.reset(); say('Message sent. Thank you!', true);
  } catch (err) { say(err.message); }
  cb.disabled = false;
};

/* ---------- 3D: camera + particle background ---------- */
let S = null;
function initScene() {
  const cv = $('#bg');
  if (!window.THREE) return document.body.classList.add('no3d');
  let rd; try { rd = new THREE.WebGLRenderer({ canvas: cv, antialias: !lowPower(), alpha: true, powerPreference: 'high-performance' }); } catch (e) { return document.body.classList.add('no3d'); }
  rd.setPixelRatio(Math.min(devicePixelRatio || 1, lowPower() ? 1.25 : 2));
  const sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(38, 1, .1, 80); cam.position.set(0, 0, 12);
  /* camera: technical pencil drawing. Lines only, no solid surfaces. */
  const ink = (c, o) => new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: o, toneMapped: false });
  const mInk = ink(0xe6eeff, .95), mCy = ink(0x00d9ff, .6), mVi = ink(0x8b5cf6, .8);
  const mDash = new THREE.LineDashedMaterial({ color: 0x00d9ff, transparent: true, opacity: .45, dashSize: .12, gapSize: .09, toneMapped: false });
  const occ = new THREE.MeshBasicMaterial({ colorWrite: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }); // invisible: only hides lines behind it
  const C = new THREE.Group(), jit = []; let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const R = Math.PI / 2, V = (x, y, z) => new THREE.Vector3(x, y, z), TAU = Math.PI * 2;
  function edges(geo, x, y, z, rx = 0, thr = 5) { // clean ink pass + slightly off-register "pencil" pass that re-wobbles
    const e = new THREE.EdgesGeometry(geo, thr), a = new THREE.LineSegments(e, mInk); a.position.set(x, y, z); a.rotation.x = rx; C.add(a);
    const b = new THREE.LineSegments(e, mCy); b.position.set(x + .01, y - .008, z); b.rotation.x = rx; b.rotation.z = (rnd() - .5) * .012; b.scale.setScalar(1.004); C.add(b); jit.push({ o: b, b: b.position.clone() });
  }
  function solid(geo, x, y, z, rx = 0) { const m = new THREE.Mesh(geo, occ); m.position.set(x, y, z); m.rotation.x = rx; m.renderOrder = -1; C.add(m); }
  function box(w, h, d, x, y, z) { const g = new THREE.BoxGeometry(w, h, d); edges(g, x, y, z); solid(g, x, y, z); }
  const poly = (pts, mat = mInk, close = true, dash = false) => { const o = new (close ? THREE.LineLoop : THREE.Line)(new THREE.BufferGeometry().setFromPoints(pts), mat); if (dash) o.computeLineDistances(); C.add(o); return o; };
  const circ = (r, z, mat = mInk, dash = false, seg = 64) => poly(Array.from({ length: seg }, (_, i) => { const a = i / seg * TAU; return V(Math.cos(a) * r, Math.sin(a) * r, z); }), mat, true, dash);
  const segs = (arr, mat) => { const o = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(arr), mat); C.add(o); return o; };
  function hatch(x0, y0, x1, y1, z, n) { const a = []; for (let i = 0; i < n; i++) { const x = x0 + rnd() * (x1 - x0), y = y0 + rnd() * (y1 - y0), dx = Math.min(x + .22, x1), dy = y + (dx - x); if (dy <= y1) a.push(V(x, y, z), V(dx, dy, z)); } segs(a, mVi); }
  function label(t, x, y, z) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d');
    g.font = '500 26px "JetBrains Mono",monospace'; g.fillStyle = '#00d9ff'; g.textBaseline = 'middle'; g.fillText(t, 6, 34);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, opacity: .85, toneMapped: false, depthTest: false }));
    s.scale.set(1.7, .425, 1); s.position.set(x + .85, y, z); C.add(s);
  }
  // body, prism, viewfinder, grip
  box(4.2, 2.5, 1.5, 0, 0, 0); box(1.7, .75, 1.1, -.2, 1.6, -.1); box(.35, .2, .3, -.2, 2.05, -.45); box(1.05, 2.5, 1.15, 1.75, 0, .22);
  poly([V(-2, 1.15, .752), V(1.15, 1.15, .752), V(1.15, -1.15, .752), V(-2, -1.15, .752)], mCy);
  const gr = []; for (let i = 0; i < 6; i++) gr.push(V(1.4, -.75 + i * .3, .797), V(2.15, -.75 + i * .3, .797)); segs(gr, mInk);
  segs([V(-1.7, -.95, .76), V(-.9, -.95, .76)], mInk);
  edges(new THREE.CylinderGeometry(.34, .34, .2, 24), -1.5, 1.42, 0); edges(new THREE.CylinderGeometry(.2, .2, .22, 16), 1.3, 1.42, .1);
  const led = new THREE.Mesh(new THREE.BoxGeometry(.14, .14, .06), new THREE.MeshBasicMaterial({ color: 0x00d9ff })); led.position.set(-1.75, .85, .76); C.add(led);
  // hatching (shading strokes)
  hatch(-2.05, -1.2, -1.4, 1.0, .756, 70); hatch(-1.0, 1.25, .6, 1.95, .452, 40);
  // lens: mount, barrel rings + guide lines, knurled focus ring, front rings
  circ(1.32, .9); circ(1.2, .9); circ(1.32, .75, mCy);
  [.95, 1.2, 1.45, 1.7, 1.85].forEach(z => circ(1.12, z));
  const bl = []; for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; bl.push(V(Math.cos(a) * 1.12, Math.sin(a) * 1.12, .95), V(Math.cos(a) * 1.12, Math.sin(a) * 1.12, 1.85)); } segs(bl, mCy);
  [1.95, 2.25].forEach(z => circ(1.24, z));
  const kn = []; for (let i = 0; i < 48; i++) { const a = i / 48 * TAU; kn.push(V(Math.cos(a) * 1.24, Math.sin(a) * 1.24, 1.97), V(Math.cos(a) * 1.24, Math.sin(a) * 1.24, 2.23)); } segs(kn, mInk);
  circ(1.12, 2.3); circ(1.04, 2.3); circ(.98, 2.26, mCy);
  solid(new THREE.CylinderGeometry(1.24, 1.24, 1.55, 40, 1, true), 0, 0, 1.6, R);
  // glass dome drawn as meridians + latitude rings
  const gz = 2.22, GR = .98, gk = .3;
  for (let m = 0; m < 6; m++) { const ph = m * Math.PI / 6, pts = []; for (let k = -14; k <= 14; k++) { const th = k / 14 * R; pts.push(V(GR * Math.sin(th) * Math.cos(ph), GR * Math.sin(th) * Math.sin(ph), gz + gk * GR * Math.cos(th))); } poly(pts, mCy, false); }
  [Math.PI / 6, Math.PI / 3].forEach(th => circ(GR * Math.sin(th), gz + gk * GR * Math.cos(th), mCy, false, 48));
  // aperture blades (outlines) that slowly rotate
  const iris = new THREE.Group(); iris.position.z = 2.08; C.add(iris);
  for (let i = 0; i < 9; i++) { const b = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([V(.18, -.04, 0), V(.92, 0, 0), V(.6, .55, 0)]), mCy); b.rotation.z = i * TAU / 9; iris.add(b); }
  // construction lines: dashed guide circle, optical axis, crosshair, dimension line
  circ(1.75, 2.4, mDash, true); poly([V(0, 0, -1.2), V(0, 0, 3.4)], mDash, false, true);
  poly([V(-2.2, 0, 2.45), V(2.2, 0, 2.45)], mDash, false, true); poly([V(0, -2.2, 2.45), V(0, 2.2, 2.45)], mDash, false, true);
  segs([V(-2.1, -1.75, .75), V(2.1, -1.75, .75), V(-2.1, -1.65, .75), V(-2.1, -1.85, .75), V(2.1, -1.65, .75), V(2.1, -1.85, .75), V(-2.1, -1.75, .75), V(-1.95, -1.7, .75), V(-2.1, -1.75, .75), V(-1.95, -1.8, .75), V(2.1, -1.75, .75), V(1.95, -1.7, .75), V(2.1, -1.75, .75), V(1.95, -1.8, .75)], mCy);
  // annotation leaders + labels
  segs([V(1.3, 1.55, .1), V(2.4, 2.4, .1), V(1.2, -.5, 2.1), V(2.55, -1.5, 2.1), V(.6, .4, 2.08), V(2.55, 1.15, 2.4)], mCy);
  label('SHUTTER', 2.45, 2.4, .1); label('FOCUS RING', 2.6, -1.5, 2.1); label('APERTURE', 2.6, 1.15, 2.4);
  const rt = { offset: { x: 0 } };
  const cam3 = new THREE.Group(); cam3.add(C); sc.add(cam3);

  /* background: pixels, frames, wireframes, trails */
  const bgG = new THREE.Group(); sc.add(bgG);
  const N = reduce ? 90 : lowPower() ? 200 : 520, P = new Float32Array(N * 3), Ph = new Float32Array(N), Sz = new Float32Array(N), Sp = new Float32Array(N), Co = new Float32Array(N * 3);
  const pal = [[0, .85, 1], [.9, .93, 1], [.55, .36, .96], [.7, .75, .82]];
  for (let i = 0; i < N; i++) {
    P.set([(Math.random() - .5) * 30, (Math.random() - .5) * 18, -13 + Math.random() * 16], i * 3);
    Ph[i] = .4 + Math.random() * 1.6; Sz[i] = .6 + Math.random() * 1.6; Sp[i] = .03 + Math.random() * .12; Co.set(pal[Math.random() * 4 | 0], i * 3);
  }
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(P, 3)); pg.setAttribute('aPh', new THREE.BufferAttribute(Ph, 1)); pg.setAttribute('aSz', new THREE.BufferAttribute(Sz, 1)); pg.setAttribute('aSp', new THREE.BufferAttribute(Sp, 1)); pg.setAttribute('aCo', new THREE.BufferAttribute(Co, 3));
  const pu = { uT: { value: 0 }, uPx: { value: rd.getPixelRatio() } };
  bgG.add(new THREE.Points(pg, new THREE.ShaderMaterial({ uniforms: pu, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'attribute float aPh,aSz,aSp;attribute vec3 aCo;uniform float uT,uPx;varying float vA;varying vec3 vC;void main(){vec3 p=position;p.y=mod(p.y+uT*aSp*6.+9.,18.)-9.;vec4 mv=modelViewMatrix*vec4(p,1.);vA=.12+.55*pow(.5+.5*sin(uT*aPh+aPh*9.),2.);vC=aCo;gl_PointSize=aSz*2.6*uPx*(12./-mv.z);gl_Position=projectionMatrix*mv;}',
    fragmentShader: 'varying float vA;varying vec3 vC;void main(){gl_FragColor=vec4(vC,vA);}' })));
  const fr = [], lm = c => new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: .3 });
  for (let i = 0; i < (lowPower() ? 5 : 9); i++) {
    const por = Math.random() < .4, g = new THREE.BoxGeometry(por ? 1 : 1.5, por ? 1.5 : 1, .02), o = new THREE.LineSegments(new THREE.EdgesGeometry(g), lm([0x00d9ff, 0xaab4c8, 0x8b5cf6][i % 3]));
    o.position.set((Math.random() - .5) * 22, (Math.random() - .5) * 13, -3 - Math.random() * 9); o.scale.setScalar(.7 + Math.random() * 1.2);
    fr.push({ o, r: (Math.random() - .5) * .004, f: Math.random() * 6 }); bgG.add(o);
  }
  [new THREE.TorusGeometry(1, .02, 6, 40), new THREE.IcosahedronGeometry(.9, 0), new THREE.TorusGeometry(1.6, .015, 6, 48)].forEach((g, i) => {
    const o = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: i === 1 ? 0x8b5cf6 : 0xaab4c8, wireframe: true, transparent: true, opacity: .22 })); o.position.set(-9 + i * 9, -3 + i * 3, -7 - i * 2); fr.push({ o, r: .003, f: i }); bgG.add(o);
  });
  const grid = new THREE.GridHelper(40, 40, 0x00d9ff, 0x2a3350); grid.position.y = -7; grid.material.transparent = true; grid.material.opacity = .14; bgG.add(grid);
  const trails = [];
  for (let i = 0; i < (lowPower() ? 2 : 4); i++) {
    const pts = [], cols = []; for (let k = 0; k < 24; k++) { pts.push(k * .35, 0, 0); const a = Math.sin(k / 23 * Math.PI); cols.push(0 * a, .85 * a, 1 * a); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: .5, blending: THREE.AdditiveBlending })); l.position.set(-16, -5 + i * 3.2, -6 - i); l.rotation.z = .06; bgG.add(l); trails.push({ l, s: .6 + Math.random() * .8 });
  }
  S = { rd, sc, cam, cam3, C, iris, rt, bgG, pu, fr, trails, led, jit, lastBoil: 0 }; resize3();
}
function resize3() {
  if (!S) return; const w = innerWidth, h = innerHeight;
  S.rd.setSize(w, h, false); S.cam.aspect = w / h; S.cam.updateProjectionMatrix();
  S.wide = w > 900; S.base = S.wide ? { x: 2.9, y: .15, s: .92 } : { x: 0, y: 2.3, s: w < 520 ? .5 : .66 };
}
const ease = t => t * t * (3 - 2 * t);
function draw3(t) {
  if (!S) return; const { rd, sc, cam, cam3, C, iris, rt, bgG, pu, fr, trails, led } = S;
  const T = t * .001, sp = Math.min(scrollY / innerHeight, 1.4), k = ease(Math.min(sp, 1));
  mouse.sx += (mouse.x - mouse.sx) * .06; mouse.sy += (mouse.y - mouse.sy) * .06;
  pu.uT.value = reduce ? 0 : T;
  if (!reduce) {
    iris.rotation.z = Math.sin(T * .4) * .35; if (T - S.lastBoil > .24) { S.lastBoil = T; S.jit.forEach(j => j.o.position.set(j.b.x + (Math.random() - .5) * .018, j.b.y + (Math.random() - .5) * .018, j.b.z + (Math.random() - .5) * .018)); }
    led.visible = Math.sin(T * 2) > -.4;
    fr.forEach(f => { f.o.rotation.y += f.r; f.o.rotation.x += f.r * .5; f.o.position.y += Math.sin(T * .5 + f.f) * .0015; });
    trails.forEach(tr => { tr.l.position.x += tr.s * .012; if (tr.l.position.x > 16) tr.l.position.x = -20; });
  }
  bgG.position.y = scrollY * .0016; bgG.rotation.y = -mouse.sx * .12 + sp * .08; bgG.rotation.x = mouse.sy * .06;
  const b = S.base, gone = Math.max(0, sp - .35) / .65;
  cam3.visible = sp < 1.35;
  cam3.position.set(b.x + gone * (S.wide ? 9 : 0), b.y + (S.wide ? 0 : gone * 4), k * 3.2);
  cam3.scale.setScalar(b.s * (1 - gone * .25));
  cam3.rotation.y = Math.sin(T * .22) * .7 + (reduce ? 0 : mouse.sx * .5) - .35 + k * .9;
  cam3.rotation.x = mouse.sy * .28 + Math.sin(T * .3) * .03;
  C.position.y = Math.sin(T * .8) * .06;
  rd.render(sc, cam);
}

/* ---------- magnifying ruler ---------- */
const rc = $('#ruler'), rcx = rc.getContext('2d');
let RH = 0, rdpr = 1, P = 0, layoutDirty = true, secPct = [], labelY = [];
const RW = 118, GAP = 17, X = RW - 8;
function sizeRuler() { rdpr = Math.min(devicePixelRatio || 1, 2); RH = innerHeight; rc.width = RW * rdpr; rc.height = RH * rdpr; rc.style.height = RH + 'px'; layoutDirty = true; }
const lensY = (d, k) => RH / 2 + RH * .44 * Math.tanh(d / k);
function drawRuler() {
  if (getComputedStyle(rc).display === 'none') return;
  const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
  if (layoutDirty) { secPct = secs.map(s => Math.min(100, s.offsetTop / max * 100)); layoutDirty = false; }
  const target = scrollY / max * 100; P += (target - P) * (reduce ? 1 : .14); if (Math.abs(target - P) < .005) P = target;
  const k = RH * .34, x = rcx;
  x.setTransform(rdpr, 0, 0, rdpr, 0, 0); x.clearRect(0, 0, RW, RH);
  // glass strip
  const gs = x.createLinearGradient(0, 0, 0, RH); gs.addColorStop(0, 'rgba(255,255,255,0)'); gs.addColorStop(.5, 'rgba(255,255,255,.07)'); gs.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gs; x.fillRect(RW - 90, 0, 90, RH);
  const g = x.createLinearGradient(0, 0, 0, RH); g.addColorStop(0, 'rgba(0,217,255,0)'); g.addColorStop(.5, 'rgba(0,217,255,.75)'); g.addColorStop(1, 'rgba(0,217,255,0)');
  x.strokeStyle = g; x.lineWidth = 1.4; x.beginPath(); x.moveTo(X, 0); x.lineTo(X, RH); x.stroke();
  const fall = d => Math.exp(-Math.pow(d / (RH * .24), 2));
  for (let i = 0; i <= 100; i++) {
    const d = (i - P) * GAP; if (Math.abs(d) > RH * 1.3) continue;
    const y = lensY(d, k), near = fall(y - RH / 2), major = i % 10 === 0;
    x.strokeStyle = `rgba(165,173,186,${.1 + .6 * near})`; x.lineWidth = .7 + 1.5 * near;
    x.beginPath(); x.moveTo(X, y); x.lineTo(X - (3 + 20 * near) * (major ? 1.5 : 1), y); x.stroke();
  }
  labelY = [];
  secPct.forEach((p, i) => {
    const y = lensY((p - P) * GAP, k), near = fall(y - RH / 2), on = i === active, len = 12 + 28 * near + (on ? 8 : 0);
    labelY.push(y); x.save();
    if (on) { x.shadowColor = '#00d9ff'; x.shadowBlur = 14; }
    x.strokeStyle = on ? '#00d9ff' : `rgba(139,92,246,${.45 + .5 * near})`; x.lineWidth = (on ? 3 : 1.5) + 1.4 * near;
    x.beginPath(); x.moveTo(X, y); x.lineTo(X - len, y); x.stroke();
    x.textAlign = 'right'; x.textBaseline = 'middle';
    x.fillStyle = on ? '#F5F7FA' : `rgba(165,173,186,${.4 + .55 * near})`; x.font = `${on ? 500 : 400} ${9 + 5 * near}px "JetBrains Mono",monospace`;
    x.fillText(names[i], X - len - 6, y);
    x.fillStyle = `rgba(0,217,255,${.35 + .6 * near})`; x.font = `${8 + 3 * near}px "JetBrains Mono",monospace`; x.fillText('0' + (i + 1), X - len - 6, y - 11 - 5 * near);
    x.restore();
  });
  x.fillStyle = '#00d9ff'; x.shadowColor = '#00d9ff'; x.shadowBlur = 10; x.beginPath(); x.moveTo(X + 3, RH / 2); x.lineTo(X + 9, RH / 2 - 5); x.lineTo(X + 9, RH / 2 + 5); x.closePath(); x.fill(); x.shadowBlur = 0;
}
rc.addEventListener('click', e => { let best = -1, bd = 28; labelY.forEach((ly, i) => { if (Math.abs(ly - e.clientY) < bd) { bd = Math.abs(ly - e.clientY); best = i; } }); if (best >= 0) secs[best].scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' }); });
rc.addEventListener('pointermove', e => { rc.style.cursor = labelY.some(ly => Math.abs(ly - e.clientY) < 28) ? 'pointer' : 'default'; });

/* ---------- loop ---------- */
let last = 0, dirty = true;
addEventListener('scroll', () => dirty = true, { passive: true });
function frame(t) {
  requestAnimationFrame(frame);
  if (document.hidden) return;
  updateActive(); drawRuler();
  if (!reduce && t - last > (lowPower() ? 33 : 16)) { last = t; draw3(t); } else if (reduce && dirty) { draw3(0); dirty = false; }
}
let rt2; addEventListener('resize', () => { clearTimeout(rt2); rt2 = setTimeout(() => { sizeRuler(); resize3(); dirty = true; layoutDirty = true; }, 150); });
addEventListener('load', () => { sizeRuler(); initScene(); updateActive(); requestAnimationFrame(frame); });
})();
