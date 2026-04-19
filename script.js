// ── Theme ──────────────────────────────────────────────────────────────────

const html       = document.documentElement;
const themeBtn   = document.getElementById('themeBtn');
const themeIcon  = document.getElementById('themeIcon');
const themeLabel = document.getElementById('themeLabel');

const savedTheme  = localStorage.getItem('pc-theme');
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
setTheme(savedTheme || (prefersDark ? 'dark' : 'light'));

function setTheme(t) {
  html.setAttribute('data-theme', t);
  themeIcon.textContent  = t === 'dark' ? '☀️' : '🌙';
  themeLabel.textContent = t === 'dark' ? 'Light' : 'Dark';
  localStorage.setItem('pc-theme', t);
}

themeBtn.addEventListener('click', () =>
  setTheme(html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark')
);

// ── DOM References ──────────────────────────────────────────────────────────

const fileInput     = document.getElementById('fileInput');
const dropZone      = document.getElementById('dropZone');
const workArea      = document.getElementById('workArea');
const imgGrid       = document.getElementById('imgGrid');
const addMoreBtn    = document.getElementById('addMoreBtn');
const qualitySlider = document.getElementById('qualitySlider');
const qualityInput  = document.getElementById('qualityInput');
const dlAllBtn      = document.getElementById('dlAllBtn');
const clearBtn      = document.getElementById('clearBtn');
const canvas        = document.getElementById('canvas');
const ctx           = canvas.getContext('2d');
const imgCountEl    = document.getElementById('imgCount');
const totalOrigEl   = document.getElementById('totalOrig');
const totalCompEl   = document.getElementById('totalComp');
const totalSavedEl  = document.getElementById('totalSaved');

// ── State ───────────────────────────────────────────────────────────────────

let images       = [];
let selectedMime = 'image/jpeg';
let selectedExt  = 'jpg';
let idCounter    = 0;

// ── Quality Controls ────────────────────────────────────────────────────────

qualitySlider.addEventListener('input', () => {
  qualityInput.value = qualitySlider.value;
  recompressAll();
});

qualityInput.addEventListener('input', () => {
  let v = parseInt(qualityInput.value);
  if (isNaN(v)) return;
  v = Math.min(100, Math.max(1, v));
  qualitySlider.value = v;
  recompressAll();
});

qualityInput.addEventListener('blur', () => {
  let v = parseInt(qualityInput.value);
  if (isNaN(v) || v < 1) v = 1;
  if (v > 100) v = 100;
  qualityInput.value  = v;
  qualitySlider.value = v;
  recompressAll();
});

// ── Format Buttons ──────────────────────────────────────────────────────────

document.querySelectorAll('.fmt-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.fmt-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedMime = btn.dataset.fmt;
    selectedExt  = btn.dataset.ext;
    recompressAll();
  });
});

// ── File Input & Drag-and-Drop ──────────────────────────────────────────────

fileInput.addEventListener('change', e => {
  addFiles(Array.from(e.target.files));
  fileInput.value = '';
});

dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  dropZone.classList.add('over');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('over');
});

dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('over');
  addFiles(Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/')));
});

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmtSize(bytes) {
  if (bytes < 1024)    return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(2) + ' MB';
}

// ── Add Files ───────────────────────────────────────────────────────────────

function addFiles(files) {
  const valid = files.filter(f => f.type.startsWith('image/'));
  if (!valid.length) return;
  workArea.style.display = 'block';

  valid.forEach(file => {
    const id     = ++idCounter;
    const reader = new FileReader();

    reader.onload = e => {
      const entry = {
        id,
        file,
        origSize:   file.size,
        origDataUrl: e.target.result,
        compDataUrl: null,
        compSize:   0,
        card:       null,
      };
      images.push(entry);

      const card = buildCard(entry);
      entry.card = card;
      imgGrid.insertBefore(card, addMoreBtn);
      compressEntry(entry).then(updateSummary);
    };

    reader.readAsDataURL(file);
  });
}

// ── Build Card ──────────────────────────────────────────────────────────────

function buildCard(entry) {
  const card = document.createElement('div');
  card.className = 'img-card processing';

  const img = document.createElement('img');
  img.src = entry.origDataUrl;
  img.alt = entry.file.name;

  const spinner = document.createElement('div');
  spinner.className = 'spinner';

  const removeBtn = document.createElement('button');
  removeBtn.className = 'remove-btn';
  removeBtn.setAttribute('aria-label', 'Remove image');
  removeBtn.textContent = '✕';
  removeBtn.addEventListener('click', e => {
    e.stopPropagation();
    removeEntry(entry.id);
  });

  const info = document.createElement('div');
  info.className = 'card-info';

  const name = document.createElement('div');
  name.className = 'card-name';
  name.title     = entry.file.name;
  name.textContent = entry.file.name;

  const sizes = document.createElement('div');
  sizes.className = 'card-sizes';
  sizes.innerHTML = `<span>${fmtSize(entry.origSize)}</span><span class="comp-size muted">—</span>`;

  info.appendChild(name);
  info.appendChild(sizes);

  const dlSingle = document.createElement('button');
  dlSingle.className   = 'dl-single';
  dlSingle.textContent = '↙ Download this';
  dlSingle.disabled    = true;
  dlSingle.addEventListener('click', () => {
    if (!entry.compDataUrl) return;
    triggerDownload(entry);
  });

  card.appendChild(img);
  card.appendChild(spinner);
  card.appendChild(removeBtn);
  card.appendChild(info);
  card.appendChild(dlSingle);

  return card;
}

// ── Compress Entry ──────────────────────────────────────────────────────────

function compressEntry(entry) {
  return new Promise(resolve => {
    const img = new Image();

    img.onload = () => {
      const q = parseInt(qualitySlider.value) / 100;
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);

      const dataUrl   = canvas.toDataURL(selectedMime, q);
      const compBytes = Math.round((dataUrl.split(',')[1].length * 3) / 4);

      entry.compDataUrl = dataUrl;
      entry.compSize    = compBytes;

      if (entry.card) {
        entry.card.classList.remove('processing');
        entry.card.querySelector('img').src = dataUrl;

        const pct  = Math.round((1 - compBytes / entry.origSize) * 100);
        const cls  = pct >= 0 ? 'saved' : 'increased';
        const sign = pct >= 0 ? '-' : '+';

        entry.card.querySelector('.card-sizes').innerHTML =
          `<span>${fmtSize(entry.origSize)}</span>` +
          `<span class="${cls}">${sign}${Math.abs(pct)}% · ${fmtSize(compBytes)}</span>`;

        entry.card.querySelector('.dl-single').disabled = false;
      }

      dlAllBtn.disabled = false;
      resolve();
    };

    img.src = entry.origDataUrl;
  });
}

// ── Recompress All ──────────────────────────────────────────────────────────

function recompressAll() {
  if (!images.length) return;
  images.forEach(e => { if (e.card) e.card.classList.add('processing'); });
  Promise.all(images.map(compressEntry)).then(updateSummary);
}

// ── Remove Entry ────────────────────────────────────────────────────────────

function removeEntry(id) {
  const idx = images.findIndex(e => e.id === id);
  if (idx === -1) return;

  images[idx].card?.remove();
  images.splice(idx, 1);
  updateSummary();

  if (!images.length) {
    workArea.style.display = 'none';
    dlAllBtn.disabled      = true;
  }
}

// ── Update Summary Bar ──────────────────────────────────────────────────────

function updateSummary() {
  const count = images.length;
  imgCountEl.textContent = count;
  if (!count) return;

  const totalOrig = images.reduce((s, e) => s + e.origSize, 0);
  const totalComp = images.reduce((s, e) => s + e.compSize, 0);
  const pct       = Math.round((1 - totalComp / totalOrig) * 100);

  totalOrigEl.textContent  = fmtSize(totalOrig);
  totalCompEl.textContent  = fmtSize(totalComp);
  totalSavedEl.textContent = (pct >= 0 ? '-' : '+') + Math.abs(pct) + '%';
  totalSavedEl.style.color = pct >= 0 ? 'var(--accent)' : 'var(--danger)';
}

// ── Trigger Single Download ─────────────────────────────────────────────────

function triggerDownload(entry) {
  const baseName = entry.file.name.replace(/\.[^.]+$/, '');
  const a        = document.createElement('a');
  a.href         = entry.compDataUrl;
  a.download     = `${baseName}_q${qualitySlider.value}.${selectedExt}`;
  a.click();
}

// ── Download All ────────────────────────────────────────────────────────────

dlAllBtn.addEventListener('click', async () => {
  const ready = images.filter(e => e.compDataUrl);
  if (!ready.length) return;

  dlAllBtn.disabled    = true;
  dlAllBtn.textContent = '⏳ Downloading…';

  for (let i = 0; i < ready.length; i++) {
    triggerDownload(ready[i]);
    await new Promise(r => setTimeout(r, 250));
  }

  dlAllBtn.textContent = '↙ Download All';
  dlAllBtn.disabled    = false;
});

// ── Clear All ───────────────────────────────────────────────────────────────

clearBtn.addEventListener('click', () => {
  images.forEach(e => e.card?.remove());
  images = [];
  workArea.style.display = 'none';
  dlAllBtn.disabled      = true;
  dlAllBtn.textContent   = '↙ Download All';
});
