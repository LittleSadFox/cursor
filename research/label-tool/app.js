const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ULID_RE = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
const STORAGE_PREFIX = 'climbing-coach-label-tool:';

function encodeCrockford(value, length) {
  let out = '';
  for (let i = 0; i < length; i++) {
    out = CROCKFORD[value % 32] + out;
    value = Math.floor(value / 32);
  }
  return out;
}

/** 48-bit millisecond time + 80 random bits, Crockford base32. */
function ulid(timeMs = Date.now()) {
  const time = encodeCrockford(timeMs, 10);
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let random = '';
  let acc = 0;
  let bits = 0;
  for (const byte of bytes) {
    acc = (acc << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      random += CROCKFORD[(acc >> bits) & 31];
    }
  }
  return time + random;
}

async function sha256Hex(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function usFromVideo(video) {
  return Math.max(0, Math.round(video.currentTime * 1_000_000));
}

const state = {
  labels: [],
  manifest: null,
  fileSha256: '',
};

const player = document.getElementById('player');
const log = document.getElementById('log');
const videoIdInput = document.getElementById('videoId');
const subjectIdInput = document.getElementById('subjectId');

function persistIds() {
  if (!state.fileSha256) return;
  localStorage.setItem(
    STORAGE_PREFIX + state.fileSha256,
    JSON.stringify({
      videoId: videoIdInput.value.trim(),
      subjectId: subjectIdInput.value.trim(),
    }),
  );
}

function applyStableIds(sha256) {
  state.fileSha256 = sha256;
  const saved = JSON.parse(localStorage.getItem(STORAGE_PREFIX + sha256) || 'null');
  const fromManifest = state.manifest?.recordings?.find((row) => row.sha256 === sha256);
  videoIdInput.value = fromManifest?.id || saved?.videoId || ulid();
  subjectIdInput.value = saved?.subjectId || ulid();
  persistIds();
}

function render(message = '') {
  const rows = state.labels.map((row) => JSON.stringify(row)).join('\n');
  log.textContent = message ? `${message}\n${rows}` : rows;
}

function rowProblems(row) {
  const problems = [];
  if (!ULID_RE.test(row.id) || !ULID_RE.test(row.subjectId)) problems.push('id');
  if (row.videoId && !ULID_RE.test(row.videoId)) problems.push('videoId');
  if (!row.sourceVersion) problems.push('sourceVersion');
  if ((row.kind === 'climb_start' || row.kind === 'climb_end' || row.kind === 'exit_direction' || row.kind === 'limb_placement') && !Number.isInteger(row.tUs)) {
    problems.push('tUs');
  }
  if (row.kind === 'outcome' && !row.outcome) problems.push('outcome');
  if (row.kind === 'exit_direction' && !row.exitDirection) problems.push('exitDirection');
  if (row.kind === 'limb_placement' && !row.limb) problems.push('limb');
  return problems;
}

videoIdInput.addEventListener('change', persistIds);
subjectIdInput.addEventListener('change', persistIds);

document.getElementById('manifestFile').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  state.manifest = JSON.parse(await file.text());
  if (state.fileSha256) applyStableIds(state.fileSha256);
  render(`Loaded manifest (${state.manifest.recordings?.length ?? 0} recordings).`);
});

document.getElementById('videoFile').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  player.src = URL.createObjectURL(file);
  const hash = await sha256Hex(await file.arrayBuffer());
  applyStableIds(hash);
  render(`File sha256 ${hash}. IDs are stored for this file.`);
});

function addLabel(partial) {
  const row = {
    id: ulid(),
    subjectId: subjectIdInput.value.trim(),
    videoId: videoIdInput.value.trim(),
    tUs: usFromVideo(player),
    sourceVersion: 'label-tool@0.1.0',
    ...partial,
  };
  const problems = rowProblems(row);
  if (problems.length > 0) {
    render(`Not added (${problems.join(', ')}).`);
    return;
  }
  state.labels.push(row);
  render();
}

document.querySelectorAll('button[data-kind]').forEach((button) => {
  button.addEventListener('click', () => {
    const kind = button.getAttribute('data-kind');
    const partial = { kind };
    if (kind === 'outcome') partial.outcome = button.getAttribute('data-outcome');
    if (kind === 'exit_direction') partial.exitDirection = button.getAttribute('data-exit');
    if (kind === 'limb_placement') partial.limb = button.getAttribute('data-limb');
    addLabel(partial);
  });
});

document.getElementById('undoBtn').addEventListener('click', () => {
  state.labels.pop();
  render();
});

document.getElementById('exportBtn').addEventListener('click', () => {
  const invalid = state.labels.flatMap((row, index) => {
    const problems = rowProblems(row);
    return problems.length ? [`row ${index + 1}: ${problems.join(', ')}`] : [];
  });
  if (invalid.length > 0) {
    render(`Export blocked.\n${invalid.join('\n')}`);
    return;
  }
  const blob = new Blob([`${state.labels.map((row) => JSON.stringify(row)).join('\n')}\n`], {
    type: 'application/x-ndjson',
  });
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(blob);
  anchor.download = 'labels.jsonl';
  anchor.click();
});

render('Load a video. IDs stay stable for that file sha256.');
