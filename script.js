/* ============================================================
   Hearthiddlest — script.js  (ES module)
   Ports of React Bits components to dependency-light vanilla JS:
     • Silk            → raw WebGL fullscreen shader (no three.js)
     • Folder          → CSS/DOM port
     • CircularGallery → uses ogl (loaded from CDN)
     • TiltedCard      → CSS perspective + pointer tilt (no motion)
   ============================================================ */
import { Renderer, Camera, Transform, Plane, Mesh, Program, Texture, Triangle }
  from 'https://cdn.jsdelivr.net/npm/ogl@1.0.11/+esm';

/* ---------- helpers ---------- */
const $  = (s, r = document) => r.querySelector(s);
const el = (t, c) => { const n = document.createElement(t); if (c) n.className = c; return n; };
const goodreads = (title, author) =>
  'https://www.goodreads.com/search?q=' + encodeURIComponent(`${title} ${author}`);
const insta = h => 'https://instagram.com/' + h.replace(/^@/, '');

/* ============================================================
   DATA — loaded from data.json, with hardcoded fallbacks
   ============================================================ */
const GENRE_DIR = 'genres';
const pics = (slug, n) =>
  Array.from({ length: n }, (_, i) => `${GENRE_DIR}/${slug}/${String(i + 1).padStart(2, '0')}.jpg`);

let FAV = [], EXCITED = [], RECS = [], GENRES = [], TEAMS = [],
    STAGRAM = [], HIGHLIGHTS = [], HIGHLIGHT_ROTATE_MS = 9000;

/* Fallbacks — used only if data.json is missing or broken */
const _FALLBACK = {
  fav: [
    { t:'Stolen Touches',a:'Neva Altaj',tag:'Mafia',img:'fav-books/04.jpg' },
    { t:'Beautiful Beast',a:'Neva Altaj',tag:'Mafia',img:'fav-books/01.jpg' },
    { t:'Broken Whispers',a:'Neva Altaj',tag:'Mafia',img:'fav-books/02.jpg' },
    { t:'Precious Hazard',a:'Neva Altaj',tag:'Mafia',img:'fav-books/03.jpg' },
    { t:'Enzo',a:'Eva Winners',tag:'Mafia',img:'fav-books/05.jpg' },
    { t:'The Maddest Obsession',a:'Danielle Lori',tag:'Mafia',img:'fav-books/06.jpg' },
    { t:'The Reaper',a:'RuNyx',tag:'Dark',img:'fav-books/07.jpg' },
    { t:'Tracing Scars',a:'Brandy Hynes',tag:'Dark',img:'fav-books/08.jpg' },
    { t:'Lights Out',a:'Navessa Allen',tag:'Stalker',img:'fav-books/09.jpg' },
    { t:"Satan\'s Affair",a:'H.D. Carlton',tag:'Dark horror',img:'fav-books/10.jpg' },
    { t:'Mindf*ck',a:'S.T. Abby',tag:'Dark',img:'fav-books/11.jpg' },
    { t:'Ignite Me',a:'Tahereh Mafi',tag:'Dystopian',img:'fav-books/12.jpg' },
  ],
  genres: [
    { name:'Mafia',color:'#12224f',slug:'mafia',count:20 },
    { name:'Dark Romance',color:'#14151c',slug:'dark-romance',count:8 },
    { name:'Contemporary',color:'#2e5ce0',slug:'contemporary',count:4 },
    { name:'Sports',color:'#97a6bd',slug:'sports',count:1 },
  ].map(g => ({ ...g, images: pics(g.slug, g.count) })),
};

try {
  const _res = await fetch('data.json', { cache: 'no-store' });
  if (!_res.ok) throw new Error('no data.json');
  const _d = await _res.json();
  window._siteData = _d; // expose for bookOfMonth etc
  FAV        = _d.fav        || _FALLBACK.fav;
  EXCITED    = _d.excited    || [];
  RECS       = _d.recs       || [];
  TEAMS      = _d.teams      || [];
  STAGRAM    = _d.stagram    || [];
  HIGHLIGHTS = _d.highlights || [];
  HIGHLIGHT_ROTATE_MS = _d.highlightRotateMs ?? 9000;
  GENRES     = (_d.genres || []).map(g => ({
    ...g,
    images: g.images || pics(g.slug || g.name.toLowerCase().replace(/\s+/g,'-'), g.count || 0)
  }));
} catch (_e) {
  console.warn('data.json not found — using fallback data');
  FAV    = _FALLBACK.fav;
  GENRES = _FALLBACK.genres;
}


/* ============================================================
   1) SILK — raw WebGL port of the React Bits shader
   ============================================================ */
function initSilk(mount, {
  color = '#2f4bb3', speed = 5, scale = 1, noiseIntensity = 1.5, rotation = 0.35,
  pauseWhenHidden = false,
} = {}) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl', { antialias:true, alpha:false });
  if (!gl) { mount.style.background = 'linear-gradient(160deg,#24408f,#12224f)'; return; }
  mount.appendChild(canvas);

  const hexRGB = h => { h = h.replace('#',''); return [0,2,4].map(i => parseInt(h.slice(i,i+2),16)/255); };

  const vert = `
    attribute vec2 position; attribute vec2 uv;
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = vec4(position,0.0,1.0); }`;
  const frag = `
    precision highp float;
    varying vec2 vUv;
    uniform float uTime; uniform vec3 uColor; uniform float uSpeed;
    uniform float uScale; uniform float uRotation; uniform float uNoiseIntensity;
    const float e = 2.71828182845904523536;
    float noise(vec2 texCoord){ float G=e; vec2 r=(G*sin(G*texCoord)); return fract(r.x*r.y*(1.0+texCoord.x)); }
    vec2 rotateUvs(vec2 uv, float angle){ float c=cos(angle),s=sin(angle); mat2 rot=mat2(c,-s,s,c); return rot*uv; }
    void main(){
      float rnd = noise(gl_FragCoord.xy);
      vec2 uv = rotateUvs(vUv*uScale, uRotation);
      vec2 tex = uv*uScale;
      float tOffset = uSpeed*uTime;
      tex.y += 0.03*sin(8.0*tex.x - tOffset);
      float pattern = 0.6 + 0.4*sin(5.0*(tex.x+tex.y+cos(3.0*tex.x+5.0*tex.y)+0.02*tOffset)
                        + sin(20.0*(tex.x+tex.y-0.1*tOffset)));
      vec4 col = vec4(uColor,1.0)*vec4(pattern) - rnd/15.0*uNoiseIntensity;
      col.a = 1.0; gl_FragColor = col;
    }`;

  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, vert));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, frag));
  gl.linkProgram(prog); gl.useProgram(prog);

  const quad = new Float32Array([-1,-1,0,0, 1,-1,1,0, -1,1,0,1, 1,1,1,1]);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog,'position'), aUv = gl.getAttribLocation(prog,'uv');
  gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos,2,gl.FLOAT,false,16,0);
  gl.enableVertexAttribArray(aUv);  gl.vertexAttribPointer(aUv,2,gl.FLOAT,false,16,8);

  const U = n => gl.getUniformLocation(prog, n);
  gl.uniform3fv(U('uColor'), hexRGB(color));
  gl.uniform1f(U('uSpeed'), speed);
  gl.uniform1f(U('uScale'), scale);
  gl.uniform1f(U('uRotation'), rotation);
  gl.uniform1f(U('uNoiseIntensity'), noiseIntensity);
  const uTime = U('uTime');

  function resize(){
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = mount.clientWidth, h = mount.clientHeight;
    canvas.width = w*dpr; canvas.height = h*dpr;
    canvas.style.width = w+'px'; canvas.style.height = h+'px';
    gl.viewport(0,0,canvas.width,canvas.height);
  }
  resize(); addEventListener('resize', resize);

  let t = 0, raf = null, running = true;
  function frame(){
    raf = null;
    t += 0.1 * (1/60);
    gl.uniform1f(uTime, t);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (running && !reduce) raf = requestAnimationFrame(frame);   // one static frame if reduced motion
  }
  frame();

  /* the footer copy sits off-screen most of the time — don't burn a rAF on it */
  if (pauseWhenHidden && 'IntersectionObserver' in window){
    new IntersectionObserver(es => es.forEach(e => {
      running = e.isIntersecting;
      if (running && !raf && !reduce) raf = requestAnimationFrame(frame);
    }), { threshold: 0 }).observe(mount);
  }
}

/* ============================================================
   2) Book rails (favorites + excited) — cards link to Goodreads.
   Also handles the Book of the Month scene when badgeText is
   "Book of the Month": returns the whole shelf scene element
   (polaroid + book + quote page) instead of a plain rail card.
   ============================================================ */
function bookCard(b, badgeText){
  // Accept either data shape:
  //   rail books: { t, a, img, gr, d }
  //   BOTM:       { title, author, cover, link, photo, quotes, highlightColor }
  const title  = b.title  || b.t  || '';
  const author = b.author || b.a  || '';
  const cover  = b.cover  || b.img || '';
  const grLink = b.link   || b.gr || goodreads(title, author);

  if (badgeText === 'Book of the Month') return buildBotmScene(b, title, author, cover, grLink);

  const a = el('a','bcard');
  a.href = grLink;
  a.target = '_blank'; a.rel = 'noreferrer noopener';
  a.innerHTML = `
    <div class="bcard__cover">
      <span class="bcard__tag">${badgeText}</span>
      <img src="${cover}" alt="${title} by ${author}" loading="lazy" />
      <span class="bcard__gr">Goodreads \u2197</span>
    </div>
    <div class="bcard__meta">
      <div class="bcard__ttl">${title}</div>
      <div class="bcard__au">${author}</div>
    </div>`;
  return a;
}

/* Builds the fancy BOTM shelf scene as a detached element.
   Returned element is what bookCard() emits when the badge is
   "Book of the Month" — polaroid on the left, .bcard-style cover
   in the center, marked-up quote page on the right. */
function buildBotmScene(b, title, author, cover, grLink){
  const hlColor = b.highlightColor || '';
  const hlStyleAttr = hlColor ? `style="--botm-hl:${hlColor}"` : '';
  const quotes = (b.quotes || []).slice(0, 3);
  const qHTML = quotes.map(q =>
    `<p class="botm-note__line"><span class="botm-note__hl" ${hlStyleAttr}>${escapeHTML(q)}</span></p>`
  ).join('');

  const bookmarksHTML = ['#f9d2e0', '#bcd3f7', '#f3d6b0']
    .map((c,i) => `<span class="botm-note__mark" style="--mk:${c}; --i:${i}"></span>`)
    .join('');

  const sparklesHTML = Array.from({length: 10}, (_,i) =>
    `<span class="botm-spark" style="--i:${i}"></span>`
  ).join('');

  const clipSVG = `
    <svg class="botm-polaroid__clip" viewBox="0 0 44 60" aria-hidden="true">
      <defs>
        <linearGradient id="botm-clipG" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stop-color="#e8ecf3"/>
          <stop offset=".5" stop-color="#b6bfd0"/>
          <stop offset="1" stop-color="#8b98ad"/>
        </linearGradient>
      </defs>
      <path d="M14 4 Q22 4 22 12 L22 44 Q22 52 30 52 Q38 52 38 44 L38 16"
            fill="none" stroke="url(#botm-clipG)" stroke-width="3.2" stroke-linecap="round"/>
      <path d="M14 4 Q6 4 6 12 L6 46 Q6 56 16 56"
            fill="none" stroke="url(#botm-clipG)" stroke-width="3.2" stroke-linecap="round"/>
      <circle cx="14" cy="8" r="2.4" fill="#cdd6e3"/>
    </svg>`;

  const coverHTML = cover
    ? `<img src="${cover}" alt="${escapeHTML(title)} by ${escapeHTML(author)}" loading="lazy" />`
    : `<div class="botm-book__gen" style="background:${b.color||'#12224f'}"><span>${escapeHTML(title)}</span></div>`;

  const photoHTML = b.photo
    ? `<img src="${b.photo}" alt="${escapeHTML(title)} \u2014 photo" />`
    : `<div class="botm-polaroid__placeholder"><span>add a photo<br/>in the admin panel</span></div>`;

  const scene = el('div', 'botm-scene');
  scene.innerHTML = `
    <div class="botm-sparkles" aria-hidden="true">${sparklesHTML}</div>

    <div class="botm-shelf" aria-hidden="true">
      <div class="botm-shelf__top"></div>
      <div class="botm-shelf__front"></div>
    </div>

    <div class="botm-polaroid" style="--tilt:-7deg">
      ${clipSVG}
      <div class="botm-polaroid__inner">
        ${photoHTML}
        <div class="botm-polaroid__caption">${escapeHTML(title)}</div>
      </div>
    </div>

    <a class="botm-book" href="${grLink}" target="_blank" rel="noopener" aria-label="${escapeHTML(title)} on Goodreads">
      <div class="botm-book__cover">
        <span class="botm-book__tag">Book of the Month</span>
        ${coverHTML}
        <span class="botm-book__gr">Goodreads \u2197</span>
      </div>
      <div class="botm-book__meta">
        <div class="botm-book__ttl">${escapeHTML(title)}</div>
        <div class="botm-book__au">${escapeHTML(author)}</div>
        <span class="botm-book__link">my review \u2192</span>
      </div>
    </a>

    <div class="botm-note" style="--tilt:4deg">
      <div class="botm-note__eyebrow">Quotes I keep re-reading</div>
      ${qHTML || '<p class="botm-note__line" style="opacity:.5">Add quotes in the admin panel.</p>'}
      <p class="botm-note__hand">giggling</p>
      <div class="botm-note__page">ii</div>
      <div class="botm-note__marks" aria-hidden="true">${bookmarksHTML}</div>
    </div>`;
  return scene;
}
function renderRails(){
  const rail = $('#rail');
  if(rail) EXCITED.forEach(b => rail.appendChild(bookCard(b, b.d)));
}

/* ============================================================
   2a) The about-me book — turning the sheet between the two spreads
   The four pages are stacked, so nothing in the flow sets the book's
   height. Measure the tallest page and set it, then re-measure when the
   fonts land or the window changes.
   ============================================================ */
function initBookFlip(){
  const book = $('#book'); if(!book) return;
  const pages = [...book.querySelectorAll('.leaf__inner')];
  const tabs  = [...book.querySelectorAll('.tab')];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stacked = () => matchMedia('(max-width:800px)').matches;
  let turned = false;

  function measure(){
    if(stacked()){ book.style.height = ''; return; }
    book.classList.add('is-measuring');
    book.style.height = '';
    const tallest = Math.max(...pages.map(p => p.scrollHeight));
    book.classList.remove('is-measuring');
    book.style.height = tallest + 'px';
  }

  function show(next){
    turned = next;
    book.classList.toggle('is-turned', turned);
    /* the shadow only rides along while the sheet is actually moving */
    if(!reduce && !stacked()){
      book.classList.add('is-moving');
      clearTimeout(show._t);
      show._t = setTimeout(() => book.classList.remove('is-moving'), 1000);
    }
    /* pages that have turned away shouldn't be read out or focusable */
    book.querySelectorAll('.pg1,.pg2').forEach(p => p.setAttribute('aria-hidden', turned));
    book.querySelectorAll('.pg3,.pg4').forEach(p => p.setAttribute('aria-hidden', !turned));
    tabs.forEach(t => t.setAttribute('aria-current', String(+t.dataset.goto === +turned)));
  }

  $('#curlFwd') ?.addEventListener('click', () => show(true));
  $('#curlBack')?.addEventListener('click', () => show(false));
  tabs.forEach(t => t.addEventListener('click', () => show(t.dataset.goto === '1')));

  /* arrow keys once the book has focus, like flipping with a thumb */
  book.addEventListener('keydown', e => {
    if(e.key === 'ArrowRight'){ e.preventDefault(); show(true); }
    if(e.key === 'ArrowLeft') { e.preventDefault(); show(false); }
  });

  show(false);
  measure();
  if(document.fonts) document.fonts.ready.then(measure);
  let t; addEventListener('resize', () => { clearTimeout(t); t = setTimeout(measure, 150); });
}

/* ============================================================
   2a-bis) Reviews journal — reads reviews.txt, renders entries
   Static site, zero-fuss input: reviews.txt holds Goodreads
   "Blog This Review" snippets, each ended by a line of "---".
   You may add one optional line per review:
       @spice 4  @tags mafia, arranged marriage
   Everything before the first "---" is treated as a note and ignored.
   Newest review goes at the top of the file.
   ============================================================ */
const escapeHTML = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

// Called from the inline onerror= on cover <img> tags. Attached to window
// because script.js is a module — plain module-scope functions aren't
// reachable from inline HTML event attributes. Tries the known-good
// original Goodreads URL once before giving up and showing the spine.
window.coverFallback = function(img){
  const fallback = img.dataset.fallback;
  if(fallback && img.src !== fallback){
    img.removeAttribute('data-fallback');   // only ever retry once
    img.src = fallback;
    return;
  }
  const wrap = img.closest('.entry__cover');
  if(wrap) wrap.classList.add('is-empty');
};

function stars(n){
  n = Math.max(0, Math.min(5, +n || 0));
  const full = Math.floor(n);
  const frac = n - full;                    // 0, .25, .5, .75 …
  const label = (Number.isInteger(n) ? n : n.toFixed(2).replace(/0+$/,'').replace(/\.$/,''))
              + ' of 5 stars';
  let html = '<span class="stars" aria-label="'+label+'">';
  html += '\u2605'.repeat(full);
  // a partial star: a filled glyph clipped to `frac` width, over a dim one
  if(frac > 0){
    html += '<span class="stars__half" style="--f:'+Math.round(frac*100)+'%">\u2605</span>';
  }
  const off = 5 - full - (frac > 0 ? 1 : 0);
  if(off > 0) html += '<span class="stars__off">' + '\u2605'.repeat(off) + '</span>';
  return html + '</span>';
}

/* ---- pull the meta line (@spice / @tags) out of a raw block ---- */
function extractExtras(block){
  const extras = { spice: 0, tags: [], date: '', photo: '', excerpt: '' };
  const lines = block.split('\n');
  const kept = [];
  for(const line of lines){
    const t = line.trim();
    if(t.startsWith('@')){
      const sp = t.match(/@spice\s+([\d.]+)/i);
      if(sp) extras.spice = +sp[1];
      const tg = t.match(/@tags\s+([^@]+)/i);
      if(tg) extras.tags = tg[1].split(',').map(s=>s.trim()).filter(Boolean);
      const dt = t.match(/@date\s+([^@]+)/i);
      if(dt) extras.date = dt[1].trim();
      const ph = t.match(/@photo\s+(\S+)/i);
      if(ph) extras.photo = ph[1].trim();
      // @excerpt — your own preview text, shown on the card instead of
      // the auto-extracted pull quote. Write it however you like.
      const ex = t.match(/@excerpt\s+(.+)/i);
      if(ex) extras.excerpt = ex[1].trim().replace(/\s*\/\/\s*/g, '\n');
      continue;
    }
    kept.push(line);
  }
  return { html: kept.join('\n'), extras };
}

/* ---- parse one Goodreads Blog-This snippet into a review object ---- */
function parseSnippet(html){
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out = {};

  const bookLink = doc.querySelector('a[href*="/book/show/"]');
  if(bookLink){
    out.bookUrl = bookLink.getAttribute('href');
    const txt = bookLink.textContent.trim();
    if(txt) out.title = txt;
  }
  const img = doc.querySelector('img[alt]');
  if(img){
    // Goodreads snippets ship a tiny ~98px cover (._SX98_ / ._SY75_ etc).
    // We ask for a bigger render so it isn't soft on the card — but that
    // size isn't guaranteed to exist on their CDN, so we keep the exact
    // URL Goodreads gave us (out.coverFallback) as a known-good backup.
    // The card tries the sharp one first and quietly drops back to this
    // if it 404s, instead of showing a blank cover.
    const original = img.getAttribute('src') || '';
    out.coverFallback = original;
    out.cover = original.replace(/\._S[XY]\d+_\./i, '._SX318_.');
    const alt = img.getAttribute('alt') || '';
    const m = alt.match(/\(([^)]+#[^)]+)\)/);
    if(m) out.series = m[1].trim();
    if(!out.title) out.title = alt.replace(/\s*\([^)]*\)\s*$/, '').trim();
  }
  const authorLink = doc.querySelector('a[href*="/author/show/"]');
  if(authorLink){
    out.author = authorLink.textContent.trim();
    out.authorUrl = authorLink.getAttribute('href');
  }
  const reviewLink = doc.querySelector('a[href*="/review/show/"]');
  if(reviewLink){
    out.reviewUrl = reviewLink.getAttribute('href');
    const rm = reviewLink.textContent.match(/(\d)\s*of\s*5/i);
    if(rm) out.rating = +rm[1];
    const idm = out.reviewUrl.match(/\/review\/show\/(\d+)/);
    if(idm) out.reviewId = +idm[1];
  }
  // A precise rating line like "★★★.75" (your own half-star note) wins
  // over Goodreads' rounded "4 of 5". Count filled stars + any .NN.
  const starLine = (doc.body.textContent.match(/(★+)(?:\s*[.．](\d+))?/) || null);
  if(starLine){
    const whole = starLine[1].length;
    const dec = starLine[2] ? parseFloat('0.' + starLine[2]) : 0;
    if(whole >= 1 && whole <= 5) out.rating = whole + dec;
  }
  // pull quote: the first bold/italic highlighted line — kept WHOLE so the
  // highlighter annotates your actual quote, not a fragment. Only a generous
  // cap so a runaway block quote doesn't swallow the card.
  const q = doc.querySelector('i b, i strong, b i, blockquote');
  if(q){
    let t = q.textContent.trim().replace(/^["'\u201c\u2018]+|["'\u201d\u2019]+$/g, '')
                                .replace(/\s+/g, ' ');
    if(t.length > 300) t = t.slice(0, 297).trim() + '\u2026';
    if(t.length >= 8) out.pull = t;
  }
  out.body = extractBody(doc, out);
  return out;
}

function extractBody(doc, meta){
  const body = doc.body;
  body.querySelectorAll('img').forEach(n => n.remove());
  let lines = body.innerHTML
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .split('\n')
    .map(s => s.replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').trim())
    .filter(Boolean);

  const drop = /^(my rating:|view all my reviews|_{3,}|pre[- ]?read$|arc secured$)/i;
  const isStars = /\bof 5 stars\b/i;
  const isStarGlyph = /^★+(?:\s*[.．]\d+)?$/;   // e.g. "★★★.75" — it's the rating, not prose
  const norm = s => s.replace(/[\s"'\u201c\u201d\u2018\u2019]/g,'').toLowerCase();
  const title = norm(meta.title||'');
  const author = norm(meta.author||'');
  const pullN = norm(meta.pull||'').slice(0,25);

  return lines.filter(l => {
    const n = norm(l);
    if(drop.test(l) || isStars.test(l) || isStarGlyph.test(l.trim()) || !n) return false;
    if(title && author && n.startsWith(title) && n.includes(author)) return false;
    if(pullN && n.startsWith(pullN)) return false;
    return true;
  });
}

function reviewEntry(r, i){
  const art = document.createElement('article');
  art.className = 'entry reveal';
  art.style.setProperty('--i', i);

  // Your own photo wins if you've added one with @photo; otherwise this
  // falls back to the cover Goodreads gave us in the snippet, so a review
  // still looks right even before you've gotten a photo of that book.
  const photoSrc = r.photo || r.cover;
  const isMine = !!r.photo;
  // The upsized cover isn't guaranteed to exist on Goodreads' CDN — if it
  // 404s, retry once with the exact URL Goodreads gave us (always valid),
  // and only show the empty-spine placeholder if that fails too.
  const fallbackAttr = (!isMine && r.coverFallback && r.coverFallback !== photoSrc)
    ? ` data-fallback="${escapeHTML(r.coverFallback)}"` : '';
  const cover = photoSrc
    ? `<a class="entry__cover${isMine ? ' entry__cover--mine' : ''}" href="${escapeHTML(r.bookUrl||'#')}" target="_blank" rel="noreferrer">
         <img src="${escapeHTML(photoSrc)}" alt="${escapeHTML(r.title)}${isMine ? ', my photo' : ' cover'}" loading="lazy"${fallbackAttr}
              onerror="coverFallback(this)" />
       </a>`
    : '';
  const spice = r.spice
    ? `<span class="entry__spice" title="${r.spice} of 5 spice">${'\u{1F336}'.repeat(Math.max(1,Math.min(5,Math.round(+r.spice))))}</span>`
    : '';
  const tags = Array.isArray(r.tags) && r.tags.length
    ? `<ul class="entry__tags">${r.tags.map(t=>`<li>${escapeHTML(t)}</li>`).join('')}</ul>`
    : '';
  const series = r.series ? `<span class="entry__series">${escapeHTML(r.series)}</span>` : '';
  const author = r.author
    ? `by <a href="${escapeHTML(r.authorUrl||'#')}" target="_blank" rel="noreferrer">${escapeHTML(r.author)}</a>`
    : '';

  // The preview: your @excerpt if you wrote one, otherwise the first two
  // lines auto-extracted from the Goodreads snippet.
  let preview;
  if(r.excerpt){
    preview = r.excerpt.split('\n').filter(Boolean)
      .map(line => {
        const isQ = line.startsWith('> ');
        const text = isQ ? line.slice(2) : line;
        return `<p class="entry__preview-line${isQ ? ' is-quote' : ''}">${escapeHTML(text)}</p>`;
      }).join('');
  } else {
    const firstTwo = r.pull
      ? [r.pull, r.body && r.body[0]]
      : [r.body && r.body[0], r.body && r.body[1]];
    preview = firstTwo.filter(Boolean)
      .map((line, idx) => `<p class="entry__preview-line${idx===0 && r.pull ? ' is-quote' : ''}">${escapeHTML(line)}</p>`)
      .join('');
  }

  art.innerHTML = `
    ${cover}
    <div class="entry__body">
      <header class="entry__head">
        <div class="entry__meta">
          ${stars(r.rating)}
          ${spice}
          ${r.date ? `<time class="entry__date">${escapeHTML(r.date)}</time>` : ''}
        </div>
        <h3 class="entry__title">
          <a href="${escapeHTML(r.bookUrl||'#')}" target="_blank" rel="noreferrer">${escapeHTML(r.title||'Untitled')}</a>
        </h3>
        <p class="entry__by">${series} ${author}</p>
      </header>
      <div class="entry__preview">${preview}</div>
      ${tags}
      ${r.reviewUrl ? `<a class="entry__more" href="${escapeHTML(r.reviewUrl)}" target="_blank" rel="noreferrer">Read my full review on Goodreads &rarr;</a>` : ''}
    </div>`;
  return art;
}

function updateChallenge(done, goal){
  const elDone = $('#chDone'), elGoal = $('#chGoal'),
        elPct = $('#chPct'), elFill = $('#chFill');
  if(!elDone) return;
  goal = goal || 50;
  const ratio = goal > 0 ? done / goal : 0;
  const truePct = Math.round(ratio * 100);          // real %, can exceed 100
  const barPct  = Math.max(0, Math.min(100, truePct)); // bar can't overfill
  const beaten  = done >= goal && goal > 0;

  elDone.textContent = done;
  elGoal.textContent = goal;
  elPct.textContent = truePct + '%';                 // show the true number
  requestAnimationFrame(() => { elFill.style.width = barPct + '%'; });

  const wrap = $('#challenge');
  if(wrap){
    wrap.classList.toggle('is-complete', beaten);
    // a "goal smashed" note next to the count when you've gone past 100%
    const countEl = $('#chDone')?.closest('.challenge__count') || $('#chDone')?.parentElement;
    let over = $('#chOver');
    if(done > goal && countEl){
      if(!over){
        over = document.createElement('span');
        over.id = 'chOver'; over.className = 'challenge__over';
        countEl.appendChild(over);
      }
      over.textContent = ` — ${done - goal} past goal 🎉`;
    } else if(over){ over.remove(); }
  }
}

async function renderJournal(){
  const mount = $('#journal-list');
  if(!mount) return;
  try{
    // reviews.txt (your pasted snippets) is optional — the CSV import
    // alone can fill the page. Treat a missing file as "no snippets".
    let raw = '';
    try{
      const res = await fetch('reviews.txt', { cache: 'no-store' });
      if(res.ok) raw = await res.text();
    }catch(e){ /* no snippets file — that's fine */ }

    // Optional: a line like "@challenge 12 of 50" anywhere in the note
    // block updates the reading-challenge widget. Falls back to 0/50.
    const chm = raw.match(/@challenge\s+(\d+)\s*(?:of|\/)\s*(\d+)/i);
    if(chm) updateChallenge(+chm[1], +chm[2]);

    // Split on lines that are exactly "---". Drop the leading note block
    // (everything before the first divider) and any empty chunks.
    const chunks = raw.split(/^\s*---\s*$/m)
      .slice(1)                        // ignore the how-to note above the first ---
      .map(c => c.trim())
      .filter(Boolean);

    const reviews = chunks.map((chunk, order) => {
      const { html, extras } = extractExtras(chunk);
      const r = parseSnippet(html);
      if(extras.spice) r.spice = extras.spice;
      if(extras.tags.length) r.tags = extras.tags;
      if(extras.date) r.date = extras.date;
      if(extras.photo) r.photo = extras.photo;   // your own photo, overrides the Goodreads cover
      if(extras.excerpt) r.excerpt = extras.excerpt; // your own preview text
      r._order = order;                       // position in the file
      r._time = Date.parse(r.date || '');     // your @date, as a sortable number
      return r;
    }).filter(r => r.title || (r.body && r.body.length));   // skip anything unparseable

    // Newest first, using the date YOU typed (@date). Reviews with a date
    // come before those without; ties (or no date anywhere) keep file order,
    // so the top of the file wins. This respects your dates over Goodreads'
    // review-id, which doesn't reliably track when you actually read a book.
    reviews.sort((a, b) => {
      const at = a._time, bt = b._time;
      const av = !Number.isNaN(at), bv = !Number.isNaN(bt);
      if(av && bv && at !== bt) return bt - at;   // both dated: newer first
      if(av && !bv) return -1;                    // dated beats undated
      if(!av && bv) return 1;
      return (a._order||0) - (b._order||0);       // fall back to file order
    });

    mount.innerHTML = '';
    if(!reviews.length){
      mount.innerHTML = '<div class="journal__empty">No reviews yet — check back soon.</div>';
      return;
    }
    reviews.forEach((r, i) => mount.appendChild(reviewEntry(r, i)));

    if(window.__revealObserver){
      mount.querySelectorAll('.reveal').forEach(n => window.__revealObserver.observe(n));
    } else {
      mount.querySelectorAll('.reveal').forEach(n => n.classList.add('in'));
    }
  }catch(err){
    mount.innerHTML = `<div class="journal__empty">
      Couldn't load my reviews right now. <br/>
      <a href="https://www.goodreads.com/user/show/135875347-mary" target="_blank" rel="noreferrer">Find them on Goodreads instead &rarr;</a>
    </div>`;
    console.warn('renderJournal:', err);
  }
}

/* ============================================================
   2b) Favorites — covers standing on wooden shelves
   The row length follows the screen so the covers never get tiny:
   6 across on desktop, 4 on tablet, 3 on a phone.
   ============================================================ */
/* slight height differences so the tops aren't a flat line */
const FAV_H = [1, .93, .98, .90, 1, .95, .92, 1, .96, .90, .99, .94];

function coverBook(b, i){
  const a = el('a', 'cbook');
  a.href = goodreads(b.t, b.a);
  a.target = '_blank'; a.rel = 'noreferrer';
  a.setAttribute('aria-label', `${b.t} by ${b.a} — open in Goodreads`);
  a.style.setProperty('--h', FAV_H[i % FAV_H.length]);
  a.style.setProperty('--tilt', (((i * 7) % 5) - 2) * 0.4 + 'deg');
  a.innerHTML = `
    <span class="cbook__cover">
      <img src="${encodeURI(b.img)}" alt="" loading="lazy" />
      <span class="cbook__tag">${b.tag}</span>
      <span class="cbook__info"><b>${b.t}</b><i>${b.a}</i></span>
    </span>`;
  return a;
}

function renderFavShelf(){
  const mount = $('#favShelf'); if(!mount) return;
  const per = () => innerWidth < 560 ? 3 : innerWidth < 900 ? 4 : 6;
  let current = 0;

  const build = () => {
    const n = per();
    if(n === current) return;            // nothing to redo
    current = n;
    mount.innerHTML = '';
    for(let i = 0; i < FAV.length; i += n){
      const shelf = el('div','cshelf');
      const row   = el('div','cshelf__row');
      FAV.slice(i, i + n).forEach((b, k) => row.appendChild(coverBook(b, i + k)));
      shelf.append(row, el('div','cshelf__board'), el('div','cshelf__edge'));
      mount.appendChild(shelf);
    }
  };

  build();
  let t; addEventListener('resize', () => { clearTimeout(t); t = setTimeout(build, 160); });
}

/* ============================================================
   3) Recommendation spines
   ============================================================ */
function renderRecs(){
  const tags = $('#shelfTags'), row = $('#shelfRow'); if(!tags||!row) return;
  RECS.forEach((r,i) => {
    const cap = el('span'); cap.textContent = r.a;
    if (r.familyTree) {
      const ft = el('a'); ft.href = r.familyTree; ft.target = '_blank';
      ft.textContent = 'family tree →';
      ft.style.cssText = 'display:block;font:500 11px Ranade,sans-serif;color:#2e5ce0;text-decoration:none;margin-top:2px;letter-spacing:.3px';
      cap.appendChild(document.createElement('br'));
      cap.appendChild(ft);
    }
    tags.appendChild(cap);
    const s = el('div','spine');
    s.style.background = `linear-gradient(180deg, ${r.c1}, ${r.c2})`;
    s.style.height = (210 + r.h*150) + 'px';
    s.innerHTML = `<span class="spine__label">${r.t}</span><span class="spine__no">${String(i+1).padStart(2,'0')}</span>`;
    if (r.link) {
      s.style.cursor = 'pointer';
      s.addEventListener('click', () => window.open(r.link, '_blank'));
    }
    row.appendChild(s);
  });
}

/* ============================================================
   4) FOLDER port  →  opens the circular gallery modal
   ============================================================ */
function hexRgb(hex){
  let c = hex.replace('#',''); if (c.length===3) c = c.split('').map(x=>x+x).join('');
  const n = parseInt(c,16);
  return `${(n>>16)&255},${(n>>8)&255},${n&255}`;
}
function buildFolder(genre){
  const cell = el('div','folder-cell');
  const art  = el('div','folder-cell__art');

  const scaler = el('div'); scaler.style.transform = 'scale(2)';
  const folder = el('div','folder');
  folder.style.setProperty('--folder-rgb', hexRgb(genre.color));
  folder.tabIndex = 0; folder.setAttribute('role','button');
  folder.setAttribute('aria-label', `Open ${genre.name} gallery`);

  const back = el('div','folder__back');
  for (let i=0;i<3;i++){
    const p = el('div', `paper paper-${i+1}`);
    if (genre.images[i]) { const im = el('img'); im.src = encodeURI(genre.images[i]); im.alt=''; im.loading='lazy'; p.appendChild(im); }
    back.appendChild(p);
  }
  back.appendChild(el('div','folder__front'));
  back.appendChild(el('div','folder__front right'));
  folder.appendChild(back); scaler.appendChild(folder); art.appendChild(scaler);

  const name = el('div','folder-cell__name'); name.textContent = genre.name;
  cell.append(art, name);

  let openTimer;
  const trigger = () => {
    folder.classList.add('open');
    clearTimeout(openTimer);
    openTimer = setTimeout(() => { folder.classList.remove('open'); openGallery(genre); }, 260);
  };
  folder.addEventListener('click', trigger);
  folder.addEventListener('keydown', e => { if (e.key==='Enter'||e.key===' '){ e.preventDefault(); trigger(); }});
  return cell;
}
function renderFolders(){ const wrap = $('#folders'); if(!wrap) return;
  GENRES.forEach(g => wrap.appendChild(buildFolder(g))); }

/* ============================================================
   5) CIRCULAR GALLERY (ogl) — framework-agnostic port
   ============================================================ */
function lerp(a,b,t){ return a+(b-a)*t; }
function debounce(fn,w){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),w); }; }
function autoBind(inst){ const p=Object.getPrototypeOf(inst);
  Object.getOwnPropertyNames(p).forEach(k=>{ if(k!=='constructor'&&typeof inst[k]==='function') inst[k]=inst[k].bind(inst); }); }

function fontSize(f){ const m=f.match(/(\d+)px/); return m?parseInt(m[1],10):30; }
function textTexture(gl, text, font, color){
  const c=document.createElement('canvas'), x=c.getContext('2d');
  x.font=font; const w=Math.ceil(x.measureText(text).width), h=Math.ceil(fontSize(font)*1.2);
  c.width=w+20; c.height=h+20; x.font=font; x.fillStyle=color; x.textBaseline='middle'; x.textAlign='center';
  x.clearRect(0,0,c.width,c.height); x.fillText(text,c.width/2,c.height/2);
  const t=new Texture(gl,{generateMipmaps:false}); t.image=c; return {texture:t,width:c.width,height:c.height};
}
class Title{
  constructor({gl,plane,text,textColor='#fff',font='700 30px Playfair Display'}){ autoBind(this);
    Object.assign(this,{gl,plane,text,textColor,font}); this.create(); }
  create(){
    const {texture,width,height}=textTexture(this.gl,this.text,this.font,this.textColor);
    const geometry=new Plane(this.gl);
    const program=new Program(this.gl,{
      vertex:`attribute vec3 position;attribute vec2 uv;uniform mat4 modelViewMatrix;uniform mat4 projectionMatrix;varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragment:`precision highp float;uniform sampler2D tMap;varying vec2 vUv;void main(){vec4 c=texture2D(tMap,vUv);if(c.a<0.1)discard;gl_FragColor=c;}`,
      uniforms:{tMap:{value:texture}}, transparent:true });
    this.mesh=new Mesh(this.gl,{geometry,program});
    const aspect=width/height, th=this.plane.scale.y*0.15, tw=th*aspect;
    this.mesh.scale.set(tw,th,1);
    this.mesh.position.y=-this.plane.scale.y*0.5-th*0.5-0.05;
    this.mesh.setParent(this.plane);
  }
}
class Media{
  constructor(o){ Object.assign(this,{extra:0},o); this.createShader(); this.createMesh(); this.createTitle(); this.onResize(); }
  createShader(){
    const texture=new Texture(this.gl,{generateMipmaps:true});
    this.program=new Program(this.gl,{ depthTest:false, depthWrite:false,
      vertex:`precision highp float;attribute vec3 position;attribute vec2 uv;uniform mat4 modelViewMatrix;uniform mat4 projectionMatrix;uniform float uTime;uniform float uSpeed;varying vec2 vUv;
        void main(){vUv=uv;vec3 p=position;p.z=(sin(p.x*4.0+uTime)*1.5+cos(p.y*2.0+uTime)*1.5)*(0.1+uSpeed*0.5);gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);}`,
      fragment:`precision highp float;uniform vec2 uImageSizes;uniform vec2 uPlaneSizes;uniform sampler2D tMap;uniform float uBorderRadius;varying vec2 vUv;
        float rb(vec2 p,vec2 b,float r){vec2 d=abs(p)-b;return length(max(d,vec2(0.0)))+min(max(d.x,d.y),0.0)-r;}
        void main(){vec2 ratio=vec2(min((uPlaneSizes.x/uPlaneSizes.y)/(uImageSizes.x/uImageSizes.y),1.0),min((uPlaneSizes.y/uPlaneSizes.x)/(uImageSizes.y/uImageSizes.x),1.0));
        vec2 uv=vec2(vUv.x*ratio.x+(1.0-ratio.x)*0.5,vUv.y*ratio.y+(1.0-ratio.y)*0.5);vec4 color=texture2D(tMap,uv);
        float d=rb(vUv-0.5,vec2(0.5-uBorderRadius),uBorderRadius);float e=0.002;float alpha=1.0-smoothstep(-e,e,d);gl_FragColor=vec4(color.rgb,alpha);}`,
      uniforms:{ tMap:{value:texture}, uPlaneSizes:{value:[0,0]}, uImageSizes:{value:[0,0]},
        uSpeed:{value:0}, uTime:{value:100*Math.random()}, uBorderRadius:{value:this.borderRadius} },
      transparent:true });
    const img=new Image(); img.crossOrigin='anonymous'; img.src=this.image;
    img.onload=()=>{ texture.image=img; this.program.uniforms.uImageSizes.value=[img.naturalWidth,img.naturalHeight]; };
  }
  createMesh(){ this.plane=new Mesh(this.gl,{geometry:this.geometry,program:this.program}); this.plane.setParent(this.scene); }
  createTitle(){ if(!this.text) return;
    this.title=new Title({gl:this.gl,plane:this.plane,text:this.text,textColor:this.textColor,font:this.font}); }
  update(scroll,direction){
    this.plane.position.x=this.x-scroll.current-this.extra;
    const x=this.plane.position.x, H=this.viewport.width/2;
    if(this.bend===0){ this.plane.position.y=0; this.plane.rotation.z=0; }
    else{ const B=Math.abs(this.bend), R=(H*H+B*B)/(2*B), ex=Math.min(Math.abs(x),H), arc=R-Math.sqrt(R*R-ex*ex);
      if(this.bend>0){ this.plane.position.y=-arc; this.plane.rotation.z=-Math.sign(x)*Math.asin(ex/R); }
      else{ this.plane.position.y=arc; this.plane.rotation.z=Math.sign(x)*Math.asin(ex/R); } }
    this.speed=scroll.current-scroll.last;
    this.program.uniforms.uTime.value+=0.04; this.program.uniforms.uSpeed.value=this.speed;
    const po=this.plane.scale.x/2, vo=this.viewport.width/2;
    this.isBefore=this.plane.position.x+po<-vo; this.isAfter=this.plane.position.x-po>vo;
    if(direction==='right'&&this.isBefore){ this.extra-=this.widthTotal; this.isBefore=this.isAfter=false; }
    if(direction==='left'&&this.isAfter){ this.extra+=this.widthTotal; this.isBefore=this.isAfter=false; }
  }
  onResize({screen,viewport}={}){
    if(screen) this.screen=screen; if(viewport) this.viewport=viewport;
    this.scale=this.screen.height/1500;
    this.plane.scale.y=(this.viewport.height*(900*this.scale))/this.screen.height;
    this.plane.scale.x=(this.viewport.width*(700*this.scale))/this.screen.width;
    this.plane.program.uniforms.uPlaneSizes.value=[this.plane.scale.x,this.plane.scale.y];
    this.padding=2; this.width=this.plane.scale.x+this.padding;
    this.widthTotal=this.width*this.length; this.x=this.width*this.index;
  }
}
class Gallery{
  constructor(container,{items,bend=2,textColor='#fff',borderRadius=0.03,font='700 30px Playfair Display',scrollSpeed=1.8,scrollEase=0.03}={}){
    autoBind(this); this.container=container; this.scrollSpeed=scrollSpeed;
    this.scroll={ease:scrollEase,current:0,target:0,last:0,position:0};
    this.onCheckDebounce=debounce(this.onCheck,200);
    this.createRenderer(); this.createCamera(); this.createScene(); this.onResize();
    this.createGeometry(); this.createMedias(items,bend,textColor,borderRadius,font);
    this.update(); this.addEvents();
  }
  createRenderer(){ this.renderer=new Renderer({alpha:true,antialias:true,dpr:Math.min(devicePixelRatio||1,2)});
    this.gl=this.renderer.gl; this.gl.clearColor(0,0,0,0); this.container.appendChild(this.gl.canvas); }
  createCamera(){ this.camera=new Camera(this.gl); this.camera.fov=45; this.camera.position.z=20; }
  createScene(){ this.scene=new Transform(); }
  createGeometry(){ this.planeGeometry=new Plane(this.gl,{heightSegments:50,widthSegments:100}); }
  createMedias(items,bend,textColor,borderRadius,font){
    this.mediasImages=items.concat(items);
    this.medias=this.mediasImages.map((d,index)=>new Media({
      geometry:this.planeGeometry, gl:this.gl, image:d.image, index, length:this.mediasImages.length,
      renderer:this.renderer, scene:this.scene, screen:this.screen, text:d.text, viewport:this.viewport,
      bend, textColor, borderRadius, font }));
  }
  onTouchDown(e){ this.isDown=true; this.scroll.position=this.scroll.current; this.start=e.touches?e.touches[0].clientX:e.clientX; }
  onTouchMove(e){ if(!this.isDown)return; const x=e.touches?e.touches[0].clientX:e.clientX;
    this.scroll.target=this.scroll.position+(this.start-x)*(this.scrollSpeed*0.025); }
  onTouchUp(){ this.isDown=false; this.onCheck(); }
  onWheel(e){ const d=e.deltaY||e.wheelDelta||e.detail; this.scroll.target+=(d>0?this.scrollSpeed:-this.scrollSpeed)*0.2; this.onCheckDebounce(); }
  onCheck(){ if(!this.medias||!this.medias[0])return; const w=this.medias[0].width;
    const i=Math.round(Math.abs(this.scroll.target)/w); const item=w*i; this.scroll.target=this.scroll.target<0?-item:item; }
  onResize(){
    this.screen={width:this.container.clientWidth,height:this.container.clientHeight};
    this.renderer.setSize(this.screen.width,this.screen.height);
    this.camera.perspective({aspect:this.screen.width/this.screen.height});
    const fov=(this.camera.fov*Math.PI)/180, height=2*Math.tan(fov/2)*this.camera.position.z, width=height*this.camera.aspect;
    this.viewport={width,height};
    if(this.medias) this.medias.forEach(m=>m.onResize({screen:this.screen,viewport:this.viewport}));
  }
  update(){
    this.scroll.current=lerp(this.scroll.current,this.scroll.target,this.scroll.ease);
    const direction=this.scroll.current>this.scroll.last?'right':'left';
    if(this.medias) this.medias.forEach(m=>m.update(this.scroll,direction));
    this.renderer.render({scene:this.scene,camera:this.camera});
    this.scroll.last=this.scroll.current; this.raf=requestAnimationFrame(this.update.bind(this));
  }
  addEvents(){
    this._resize=this.onResize.bind(this); this._wheel=this.onWheel.bind(this);
    this._down=this.onTouchDown.bind(this); this._move=this.onTouchMove.bind(this); this._up=this.onTouchUp.bind(this);
    addEventListener('resize',this._resize);
    this.container.addEventListener('wheel',this._wheel,{passive:true});
    this.container.addEventListener('mousedown',this._down); addEventListener('mousemove',this._move); addEventListener('mouseup',this._up);
    this.container.addEventListener('touchstart',this._down,{passive:true}); addEventListener('touchmove',this._move,{passive:true}); addEventListener('touchend',this._up);
  }
  destroy(){
    cancelAnimationFrame(this.raf);
    removeEventListener('resize',this._resize);
    this.container.removeEventListener('wheel',this._wheel);
    this.container.removeEventListener('mousedown',this._down); removeEventListener('mousemove',this._move); removeEventListener('mouseup',this._up);
    this.container.removeEventListener('touchstart',this._down); removeEventListener('touchmove',this._move); removeEventListener('touchend',this._up);
    if(this.renderer?.gl?.canvas?.parentNode) this.renderer.gl.canvas.parentNode.removeChild(this.renderer.gl.canvas);
  }
}

/* ---- modal wiring ---- */
let activeGallery = null;
const modal = $('#genreModal'), stage = $('#gmStage'), gmTtl = $('#gmTtl');
function openGallery(genre){
  gmTtl.innerHTML = `<small>Genre gallery</small>${genre.name}`;
  modal.classList.add('open'); modal.setAttribute('aria-hidden','false'); document.body.style.overflow='hidden';
  stage.innerHTML='';
  if(!genre.images.length){
    const m = el('div','gm__empty');
    m.innerHTML = `No photos in <b>${genre.name}</b> yet.<br/>Add them to <b>genres/${genre.slug}/</b> as 01.jpg, 02.jpg… then set <b>count</b> in script.js.`;
    stage.appendChild(m); return;
  }
  const items = genre.images.map(src=>({ image:encodeURI(src), text:'' }));
  // instantiate after the panel has real dimensions
  requestAnimationFrame(()=>{ activeGallery = new Gallery(stage,{ items,
    bend:0, textColor:'#ffffff', borderRadius:0.03,
    font:'700 30px "Playfair Display"', scrollSpeed:1.8, scrollEase:0.03 }); });
}
function closeGallery(){
  modal.classList.remove('open'); modal.setAttribute('aria-hidden','true'); document.body.style.overflow='';
  if(activeGallery){ activeGallery.destroy(); activeGallery=null; }
  stage.innerHTML='';
}
if(modal){
  modal.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',closeGallery));
}
addEventListener('keydown',e=>{ if(e.key==='Escape'&&modal&&modal.classList.contains('open')) closeGallery(); });

/* ============================================================
   6) TILTED CARD (bookstagrammers) — links to Instagram
   ============================================================ */
function buildTilted(p){
  const amp = 12, scaleHover = 1.08;
  const a = el('a'); a.href = insta(p.name); a.target='_blank'; a.rel='noreferrer noopener';
  const fig = el('div','tc');
  fig.innerHTML = `
    <div class="tc__inner">
      <img class="tc__img" src="${p.img}" alt="${p.name} on Instagram" loading="lazy" />
      <div class="tc__overlay"><div class="tc__handle">${p.name}</div><div class="tc__sub">Bookstagram ↗</div></div>
    </div>
    <div class="tc__cap">${p.name} — open Instagram</div>`;
  const inner = $('.tc__inner', fig), cap = $('.tc__cap', fig);

  /* missing photo → show the handle on a navy tile rather than a broken image */
  const im = $('.tc__img', fig);
  im.addEventListener('error', () => {
    const ph = el('div','tc__img tc__img--ph');
    ph.innerHTML = `<span>${p.name}</span>`;
    im.replaceWith(ph);
  });
  fig.addEventListener('mousemove', e=>{
    const r = fig.getBoundingClientRect();
    const ox = e.clientX - r.left - r.width/2, oy = e.clientY - r.top - r.height/2;
    const rx = (oy/(r.height/2))*-amp, ry = (ox/(r.width/2))*amp;
    inner.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg) scale(${scaleHover})`;
    cap.style.left = (e.clientX - r.left)+'px'; cap.style.top = (e.clientY - r.top)+'px'; cap.style.opacity = 1;
  });
  fig.addEventListener('mouseleave', ()=>{ inner.style.transform='rotateX(0) rotateY(0) scale(1)'; cap.style.opacity=0; });
  a.appendChild(fig); return a;
}
function renderStagram(){ const g = $('#stagramGrid'); if(!g) return;
  STAGRAM.forEach(p=>g.appendChild(buildTilted(p))); }

/* ============================================================
   7) TEAMS
   ============================================================ */
function renderTeams(){
  const row = $('#teamsRow'); if(!row) return;
  TEAMS.forEach(n=>{ const t=el('div','team');
    t.innerHTML=`<span class="team__badge">ARC</span><span class="team__name">${n}</span>`; row.appendChild(t); });
}

/* ============================================================
   7b) KINDLE HIGHLIGHTS — random quote on the e-reader
   ============================================================ */
const escHTML = s => s.replace(/[&<>]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[c]));

/* Every new line starts a new paragraph.
   [[text]]        highlight, in the entry's colour (pink if it has none)
   ((text))        underline, same colour rules
   [[blue|text]]   forces one span to a colour — works on (( )) too
   [[((text))]]    both at once                                            */
const HL_COLORS = ['pink','yellow','blue','orange','green','purple','red','teal'];

/* "blue|some words" → ['blue','some words'] · "some words" → [default,'some words']
   Also supports hex colors: "#ff5500|some words" */
function splitColor(inner, def){
  const bar = inner.indexOf('|');
  if(bar > 0){
    const tag = inner.slice(0, bar).trim().toLowerCase();
    if(HL_COLORS.includes(tag) || tag.startsWith('#')) return [tag, inner.slice(bar + 1).trim()];
  }
  return [def, inner];
}

/* Returns the right HTML attribute for a color — class for named, inline style for hex */
function hlAttr(c){ return c.startsWith('#') ? ` style="background:${c};color:inherit;padding:1px 3px;border-radius:3px"` : ` class="hl--${c}"`; }
function ulAttr(c){ return c.startsWith('#') ? ` style="text-decoration:underline;text-decoration-color:${c};color:inherit"` : ` class="ul--${c}"`; }

function highlightHTML(text, fallback){
  const def = HL_COLORS.includes(fallback) ? fallback : 'pink';
  return text.trim().split(/\n+/)
    .map(p => p.trim()).filter(Boolean)
    .map(p => `<p>${escHTML(p)
        .replace(/\[\[([\s\S]+?)\]\]/g, (_m, i) => {
          const [c, t] = splitColor(i, def); return `<mark${hlAttr(c)}>${t}</mark>`; })
        .replace(/\(\(([\s\S]+?)\)\)/g, (_m, i) => {
          const [c, t] = splitColor(i, def); return `<u${ulAttr(c)}>${t}</u>`; })
      }</p>`)
    .join('');
}

function renderHighlights(){
  const device = $('#kndl'); if(!device) return;
  const page = $('#kndlPage'), name = $('#kndlName'),
        cite = $('#kndlCite'), dots = $('#kndlDots'), btn = $('#kndlShuffle');

  if(!HIGHLIGHTS.length){
    page.innerHTML = '<p>No highlights yet — add some to HIGHLIGHTS in script.js.</p>';
    return;
  }

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const many = HIGHLIGHTS.length > 1;
  let i = Math.floor(Math.random() * HIGHLIGHTS.length);   // different one every visit
  let timer = null;

  /* one dot per highlight — click a dot to jump straight to it */
  HIGHLIGHTS.forEach((_, k) => {
    const d = el('button','kh__dot');
    d.type = 'button';
    d.setAttribute('aria-label', `Highlight ${k+1}`);
    d.addEventListener('click', e => { e.stopPropagation(); show(k); restart(); });
    dots.appendChild(d);
  });

  /* Shrink the type until the highlight fits the screen — long ones would
     otherwise get chopped off at the top and bottom. */
  function fitText(){
    const screen = page.parentElement, cs = getComputedStyle(screen);
    const avail = screen.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    if(avail <= 0) return;
    page.style.fontSize = '';                                  // back to the CSS clamp size
    let size = parseFloat(getComputedStyle(page).fontSize);
    while(page.scrollHeight > avail && size > 8){
      size -= 0.5;
      page.style.fontSize = size + 'px';
    }
  }

  function paint(n){
    const h = HIGHLIGHTS[n];
    page.innerHTML = highlightHTML(h.text, h.color);
    name.textContent = h.book || '';
    cite.textContent = h.author ? `— ${h.author}` : '';
    [...dots.children].forEach((d,k) => d.classList.toggle('is-on', k === n));
    fitText();
    page.classList.remove('is-out');
  }

  function show(n, animate = true){
    i = n;
    if(!animate || reduce){ paint(n); return; }
    page.classList.add('is-out');                 // fade out, swap, fade in
    setTimeout(() => paint(n), 240);
  }

  function next(){
    if(!many) return;
    let n; do { n = Math.floor(Math.random() * HIGHLIGHTS.length); } while(n === i);
    show(n);
  }

  const start   = () => { if(many && !reduce && HIGHLIGHT_ROTATE_MS && !timer)
                            timer = setInterval(next, HIGHLIGHT_ROTATE_MS); };
  const stop    = () => { clearInterval(timer); timer = null; };
  const restart = () => { stop(); start(); };

  show(i, false);
  if(document.fonts) document.fonts.ready.then(fitText);       // metrics change once Georgia/fallback settles
  let fitTimer; addEventListener('resize', () => { clearTimeout(fitTimer); fitTimer = setTimeout(fitText, 150); });

  if(many){
    device.addEventListener('click', () => { next(); restart(); });
    btn.addEventListener('click', e => { e.stopPropagation(); next(); restart(); });
    device.addEventListener('mouseenter', stop);     // don't swap mid-sentence
    device.addEventListener('mouseleave', start);
    new IntersectionObserver(es => es.forEach(e => e.isIntersecting ? start() : stop()),
      { threshold:.25 }).observe(device);
  } else {
    device.style.cursor = 'default';
    $('#kndlCtrls').style.display = 'none';
  }
}

/* ============================================================
   7c) FOOTER SCENE — silk shader + drifting books.
   Injected from JS so the footer markup stays identical on both pages.
   ============================================================ */
function scatterBooks(mount, n = 18){
  /* seeded so the layout is the same every load rather than jittering */
  let s = 20260724;
  const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const inks = ['rgba(188,211,247,.14)','rgba(205,214,227,.13)','rgba(111,148,232,.15)',
                'rgba(255,255,255,.11)','rgba(139,152,173,.14)'];
  for(let i = 0; i < n; i++){
    const b = el('span','bookdot');
    const w = 14 + rnd()*16;
    b.style.cssText =
      `left:${(rnd()*98).toFixed(2)}%; top:${(rnd()*92).toFixed(2)}%;` +
      `width:${w.toFixed(1)}px; height:${(w*(.42 + rnd()*.24)).toFixed(1)}px;` +
      `background:${inks[i % inks.length]};` +
      `--rot:${(rnd()*46 - 23).toFixed(1)}deg;` +
      `--dur:${(6 + rnd()*5).toFixed(1)}s; --del:${(rnd()*-8).toFixed(1)}s;`;
    mount.appendChild(b);
  }
}

function initFooterScene(){
  document.querySelectorAll('.footer').forEach(f => {
    if(f.querySelector('.footer__silk')) return;
    const silk  = el('div','footer__silk');
    const veil  = el('div','footer__veil');
    const books = el('div','footer__books');
    f.prepend(books); f.prepend(veil); f.prepend(silk);
    initSilk(silk, { color:'#2f4bb3', speed:3.0, scale:1.15,
                     noiseIntensity:1.2, rotation:0.22, pauseWhenHidden:true });
    scatterBooks(books);
  });
}

/* ============================================================
   7d) AUTHORS I'D LOVE TO MEET — ChromaGrid port
   (React Bits → vanilla; gsap's quickSetter/tween replaced with a rAF lerp)
   ============================================================ */
const grSearch = q => 'https://www.goodreads.com/search?q=' + encodeURIComponent(q);

const AUTHORS = [
  { name:'Neva Altaj',              img:'images/authors/01.jpg', c1:'#2e5ce0', c2:'#0a1226' },
  { name:'Eva Winners',             img:'images/authors/02.jpg', c1:'#12224f', c2:'#05080f' },
  { name:'Gabrielle Sands',         img:'images/authors/03.jpg', c1:'#6f94e8', c2:'#101a33' },
  { name:'Tahereh Mafi',            img:'images/authors/04.jpg', c1:'#97a6bd', c2:'#14151c' },
];

function initChroma(root, { damping = 0.16 } = {}){
  const fade = root.querySelector('.chroma-fade');
  if(!fade || matchMedia('(hover:none)').matches) return;   // no cursor to follow on touch
  let cx = 0, cy = 0, tx = 0, ty = 0, raf = null;
  const box = () => root.getBoundingClientRect();
  const apply = () => { root.style.setProperty('--x', cx + 'px'); root.style.setProperty('--y', cy + 'px'); };

  const b = box(); cx = tx = b.width/2; cy = ty = b.height/2; apply();

  function loop(){
    raf = null;
    cx += (tx - cx) * damping; cy += (ty - cy) * damping;
    apply();
    if(Math.abs(tx-cx) > .5 || Math.abs(ty-cy) > .5) raf = requestAnimationFrame(loop);
  }
  const kick = () => { if(!raf) raf = requestAnimationFrame(loop); };

  root.addEventListener('pointermove', e => {
    const r = box(); tx = e.clientX - r.left; ty = e.clientY - r.top;
    fade.style.opacity = 0; kick();
  });
  root.addEventListener('pointerleave', () => { fade.style.opacity = 1; });
}

function renderAuthors(){
  const grid = $('#chroma'); if(!grid) return;

  AUTHORS.forEach(a => {
    const card = el('article','chroma-card');
    card.style.setProperty('--card-border', a.c1);
    card.style.setProperty('--card-gradient', `linear-gradient(150deg, ${a.c1}, ${a.c2})`);
    card.innerHTML = `
      <a class="chroma-card__link" href="${grSearch(a.name)}" target="_blank" rel="noreferrer noopener">
        <span class="chroma-img"><img src="${a.img}" alt="${a.name}" loading="lazy" /></span>
        <span class="chroma-info">
          <b class="chroma-name">${a.name}</b>
          <span class="chroma-go">Goodreads ↗</span>
        </span>
      </a>`;

    /* until images/authors/0N.jpg exists, fall back to the author's initials */
    const im = $('img', card);
    im.addEventListener('error', () => {
      const ph = el('span','chroma-initials');
      ph.textContent = a.name.split(/\s+/).map(w => w[0]).join('');
      im.replaceWith(ph);
    });

    card.addEventListener('pointermove', e => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      card.style.setProperty('--my', (e.clientY - r.top ) + 'px');
    });

    grid.appendChild(card);
  });

  grid.appendChild(el('div','chroma-overlay'));
  grid.appendChild(el('div','chroma-fade'));
  initChroma(grid);
}

/* ============================================================
   8) UI: nav shrink, reveal, drag-to-scroll
   ============================================================ */
function initUI(){
  const nav = $('#nav'); if(!nav) return;
  addEventListener('scroll', ()=>{ nav.style.transform = `translateX(-50%) scale(${scrollY>40?0.96:1})`; }, {passive:true});

  const io = new IntersectionObserver((es)=>es.forEach(e=>{ if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); }}),{threshold:0.12});
  document.querySelectorAll('.reveal').forEach(n=>io.observe(n));
  window.__revealObserver = io;   // let async-loaded content (reviews) reveal too

  document.querySelectorAll('.rail').forEach(rail=>{
    let down=false,sx=0,sl=0;
    rail.addEventListener('mousedown',e=>{ if(e.target.closest('a')) return; down=true; rail.classList.add('dragging'); sx=e.pageX; sl=rail.scrollLeft; });
    addEventListener('mouseup',()=>{ down=false; rail.classList.remove('dragging'); });
    rail.addEventListener('mouseleave',()=>{ down=false; rail.classList.remove('dragging'); });
    rail.addEventListener('mousemove',e=>{ if(!down)return; e.preventDefault(); rail.scrollLeft = sl-(e.pageX-sx)*1.4; });
  });
}

/* ============================================================
   INIT
   ============================================================ */
/* ============================================================
   CARD SWAP (ported from React Bits — CSS transitions, no gsap)
   ============================================================ */
function initCardSwap(container, { delay = 4200, dur = 800 } = {}){
  if(!container) return;
  const cards = [...container.querySelectorAll('.card')];
  const n = cards.length;
  if(n < 2) return;

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const EASE = 'cubic-bezier(.45,0,.55,1)';
  let order = cards.map((_, i) => i);
  let timer = null, busy = false;

  /* Fan spacing scales with the screen. On phones it also gets centred —
     otherwise the stack fans down-right, off the edge and over the heading. */
  let CD, VD, SKEW, offX, offY;
  function metrics(){
    const w = innerWidth;
    if(w <= 400){ CD = 14; VD = 18; SKEW = 3; }
    else if(w <= 480){ CD = 18; VD = 22; SKEW = 4; }
    else if(w <= 900){ CD = 28; VD = 34; SKEW = 5; }
    else { CD = 48; VD = 56; SKEW = 6; }
    const centre = w <= 900;
    offX = centre ? -(n-1)*CD/2 : 0;
    offY = centre ?  (n-1)*VD/2 : 0;
  }

  const slot = i => ({ x:offX + i*CD, y:offY - i*VD, z:-i*CD*1.5, zi:n-i });
  const put = (el, s, animate, dy=0) => {
    el.style.transition = animate ? `transform ${dur}ms ${EASE}` : 'none';
    el.style.transform =
      `translate(-50%,-50%) translate3d(${s.x}px,${s.y+dy}px,${s.z}px) skewY(${SKEW}deg)`;
  };

  function layout(){
    order.forEach((idx, i) => { const s = slot(i); cards[idx].style.zIndex = s.zi; put(cards[idx], s, false); });
  }
  metrics(); layout();

  let rt;
  addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { metrics(); layout(); }, 150); });

  function swap(){
    if(busy || order.length < 2) return;
    busy = true;
    const [front, ...rest] = order;
    const el = cards[front];

    put(el, slot(0), true, 520);                       // 1. front card drops away

    setTimeout(() => {                                  // 2. the rest step forward
      rest.forEach((idx, i) => setTimeout(() => {
        const s = slot(i);
        cards[idx].style.zIndex = s.zi;
        put(cards[idx], s, true);
      }, i * 110));
    }, dur * 0.42);

    setTimeout(() => {                                  // 3. dropped card returns to the back
      const b = slot(n - 1);
      el.style.zIndex = b.zi;
      put(el, b, true);
      busy = false;
    }, dur * 0.62);

    order = [...rest, front];
  }

  const start = () => { if(!reduce && !timer) timer = setInterval(swap, delay); };
  const stop  = () => { clearInterval(timer); timer = null; };

  container.addEventListener('mouseenter', stop);
  container.addEventListener('mouseleave', start);
  container.addEventListener('click', () => { swap(); stop(); start(); });

  // only animate while the stack is actually on screen
  const io = new IntersectionObserver(es => es.forEach(e => e.isIntersecting ? start() : stop()), { threshold:.2 });
  io.observe(container);
}

if($('#silk')) initSilk($('#silk'), { color:'#2f4bb3', speed:5, scale:1, noiseIntensity:1.5, rotation:0.35 });
initCardSwap($('#charStack'));
renderRails();
initBookFlip();
renderFavShelf();
renderRecs();

// ============================================================
// SideRays — vanilla port of the React Bits component (ogl-based)
// Spotlights the shelf with animated god-rays from a chosen corner.
// ============================================================
function initSideRays(mount, {
  speed = 2.4, rayColor1 = '#ffdca8', rayColor2 = '#bcd3f7',
  intensity = 1.6, spread = 1.9, origin = 'top-right',
  tilt = 0, saturation = 1.35, blend = 0.7, falloff = 1.7, opacity = 0.9,
} = {}) {
  if (!mount) return () => {};
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hexRgb = h => { h = h.replace('#',''); return [
    parseInt(h.slice(0,2),16)/255, parseInt(h.slice(2,4),16)/255, parseInt(h.slice(4,6),16)/255 ]; };
  const flipOf = o => o==='top-left'?[1,0] : o==='bottom-right'?[0,1] : o==='bottom-left'?[1,1] : [0,0];

  const renderer = new Renderer({ dpr: Math.min(devicePixelRatio||1, 2), alpha: true });
  const gl = renderer.gl;
  gl.canvas.style.width = '100%';
  gl.canvas.style.height = '100%';
  gl.canvas.style.display = 'block';
  mount.appendChild(gl.canvas);

  const vert = `attribute vec2 position; void main(){ gl_Position = vec4(position,0.0,1.0); }`;
  const frag = `
    precision highp float;
    uniform float iTime; uniform vec2 iResolution;
    uniform float iSpeed; uniform vec3 iRayColor1, iRayColor2;
    uniform float iIntensity, iSpread, iFlipX, iFlipY, iTilt, iSaturation, iBlend, iFalloff, iOpacity;
    float rayStrength(vec2 raySource, vec2 rayRefDir, vec2 coord, float sA, float sB, float sp){
      vec2 s2c = coord - raySource;
      float cosA = dot(normalize(s2c), rayRefDir);
      return clamp(
        (0.45 + 0.15*sin(cosA*sA + iTime*sp)) +
        (0.30 + 0.20*cos(-cosA*sB + iTime*sp)), 0.0, 1.0) *
        clamp((iResolution.x - length(s2c)) / iResolution.x, 0.5, 1.0);
    }
    void main(){
      vec2 fc = gl_FragCoord.xy;
      if (iFlipX > 0.5) fc.x = iResolution.x - fc.x;
      if (iFlipY > 0.5) fc.y = iResolution.y - fc.y;
      vec2 coord = vec2(fc.x, iResolution.y - fc.y);
      vec2 rayPos = vec2(iResolution.x*1.1, -0.5*iResolution.y);
      float tr = iTilt * 3.14159265/180.0;
      float cs = cos(tr), sn = sin(tr);
      vec2 rel = coord - rayPos;
      vec2 tc = vec2(rel.x*cs - rel.y*sn, rel.x*sn + rel.y*cs) + rayPos;
      float hs = iSpread * 0.275;
      vec2 d1 = normalize(vec2(cos(0.785398+hs), sin(0.785398+hs)));
      vec2 d2 = normalize(vec2(cos(0.785398-hs), sin(0.785398-hs)));
      vec4 r1 = vec4(iRayColor1,1.0) * rayStrength(rayPos, d1, tc, 36.2214, 21.11349, iSpeed);
      vec4 r2 = vec4(iRayColor2,1.0) * rayStrength(rayPos, d2, tc, 22.3991, 18.0234, iSpeed*0.2);
      vec4 col = r1*(1.0-iBlend)*0.9 + r2*iBlend*0.9;
      float d = length(fc.xy - vec2(rayPos.x, iResolution.y - rayPos.y)) / iResolution.y;
      float b = iIntensity * 0.4 / pow(max(d, 0.001), iFalloff);
      col.rgb *= b;
      float g = dot(col.rgb, vec3(0.299,0.587,0.114));
      col.rgb = mix(vec3(g), col.rgb, iSaturation);
      col.a = max(col.r, max(col.g, col.b)) * iOpacity;
      gl_FragColor = col;
    }`;

  const [fx, fy] = flipOf(origin);
  const uniforms = {
    iTime:{value:0}, iResolution:{value:[1,1]},
    iSpeed:{value:speed},
    iRayColor1:{value:hexRgb(rayColor1)}, iRayColor2:{value:hexRgb(rayColor2)},
    iIntensity:{value:intensity}, iSpread:{value:spread},
    iFlipX:{value:fx}, iFlipY:{value:fy}, iTilt:{value:tilt},
    iSaturation:{value:saturation}, iBlend:{value:blend},
    iFalloff:{value:falloff}, iOpacity:{value:opacity},
  };
  const geometry = new Triangle(gl);
  const program = new Program(gl, { vertex: vert, fragment: frag, uniforms });
  const mesh = new Mesh(gl, { geometry, program });

  function resize(){
    const w = mount.clientWidth, h = mount.clientHeight;
    renderer.setSize(w, h);
    uniforms.iResolution.value = [w * renderer.dpr, h * renderer.dpr];
  }
  resize(); addEventListener('resize', resize);

  let raf = null, running = true;
  function loop(t){
    raf = null;
    uniforms.iTime.value = t * 0.001;
    renderer.render({ scene: mesh });
    if (running && !reduce) raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);

  if ('IntersectionObserver' in window){
    new IntersectionObserver(es => es.forEach(e => {
      running = e.isIntersecting;
      if (running && !raf && !reduce) raf = requestAnimationFrame(loop);
    }), { threshold: 0 }).observe(mount);
  }

  return () => {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    removeEventListener('resize', resize);
    try { gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch(_){}
    if (gl.canvas.parentNode) gl.canvas.parentNode.removeChild(gl.canvas);
  };
}


// ============================================================
// Book of the Month — mounts the fancy scene into #bookOfMonth.
// The scene itself is built inside bookCard() when badgeText is
// "Book of the Month", so this is the whole call site.
// ============================================================
const botmEl = $('#bookOfMonth');
const _botm  = window._siteData?.bookOfMonth;

if (botmEl && _botm?.title) {
  const section = $('#bookOfMonth-section');
  if (section) section.style.display = '';

  // Reveal the section and mount a single fancy card into the rail.
  botmEl.innerHTML = '';
  botmEl.appendChild(bookCard(_botm, 'Book of the Month'));

  // Inject the rays overlay at the section level.
  if (section && !section.querySelector('.botm-rays')) {
    const rays = el('div', 'botm-rays'); rays.id = 'botmRays';
    rays.setAttribute('aria-hidden', 'true');
    section.appendChild(rays);
  }

  // Kick off rays + the highlight sweep once the section is on screen.
  const raysMount   = $('#botmRays');
  const scene       = botmEl.querySelector('.botm-scene');
  let disposeRays = null;

  const io = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return;
    if (raysMount && !disposeRays) {
      disposeRays = initSideRays(raysMount, {
        origin: 'top-right', speed: 1.8,
        rayColor1: '#fff0d1', rayColor2: '#bcd3f7',
        intensity: 1.2, spread: 1.6, tilt: -8,
        saturation: 1.2, blend: 0.55, falloff: 1.8, opacity: 0.6,
      });
    }
    if (scene) scene.classList.add('in');
    io.disconnect();
  }, { threshold: 0.15 });
  io.observe(section || botmEl);
}
renderFolders();
renderStagram();
renderTeams();
renderHighlights();
renderAuthors();
initFooterScene();
initUI();
renderJournal();   // reviews page — no-op elsewhere (guards on #journal-list)
