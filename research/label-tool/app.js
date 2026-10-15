const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function randomUlid() {
  let out = '';
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // Enough entropy for a research tool; not a strict ULID timestamp encoding.
  for (let i = 0; i < 26; i++) {
    out += CROCKFORD[bytes[i % 16] % 32];
  }
  if (out[0] > '7') {
    out = `7${out.slice(1)}`;
  }
  return out;
}

function usFromVideo(video) {
  return Math.max(0, Math.round(video.currentTime * 1_000_000));
}

const state = {
  labels: [],
};

const player = document.getElementById('player');
const log = document.getElementById('log');
const videoIdInput = document.getElementById('videoId');
const subjectIdInput = document.getElementById('subjectId');

videoIdInput.value = randomUlid();
subjectIdInput.value = randomUlid();

function render() {
  log.textContent = state.labels.map((row) => JSON.stringify(row)).join('\n');
}

document.getElementById('videoFile').addEventListener('change', (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  player.src = URL.createObjectURL(file);
});

function addLabel(partial) {
  const row = {
    id: randomUlid(),
    subjectId: subjectIdInput.value.trim(),
    videoId: videoIdInput.value.trim(),
    tUs: usFromVideo(player),
    sourceVersion: 'label-tool@0.1.0',
    ...partial,
  };
  state.labels.push(row);
  render();
}

document.querySelectorAll('button[data-kind]').forEach((button) => {
  button.addEventListener('click', () => {
    const kind = button.getAttribute('data-kind');
    const partial = { kind };
    if (kind === 'outcome') {
      partial.outcome = button.getAttribute('data-outcome');
    }
    if (kind === 'exit_direction') {
      partial.exitDirection = button.getAttribute('data-exit');
    }
    if (kind === 'limb_placement') {
      partial.limb = button.getAttribute('data-limb');
    }
    if (kind === 'climb_start' || kind === 'climb_end') {
      // start/end events use tUs as the boundary instant
    }
    addLabel(partial);
  });
});

document.getElementById('exportBtn').addEventListener('click', () => {
  const blob = new Blob([`${state.labels.map((r) => JSON.stringify(r)).join('\n')}\n`], {
    type: 'application/x-ndjson',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'labels.jsonl';
  a.click();
});

render();
