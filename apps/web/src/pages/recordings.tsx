import { useRef, useState } from 'react';
import { useLingui } from '@lingui/react';

import type { CutMode, Recording } from '@climbing-coach/api';

import { uploadRecording } from '../api.js';
import { errorText, translate } from '../format.js';
import { useCutRecording, useHealth, useImportPath, useRecordings } from '../hooks/queries.js';
import { RecordingProposals } from './recording-proposals.js';
import { RecordingSkeletonOverlay } from './recording-skeleton.js';
import { recordingsGate } from './recordings-gate.js';
import {
  formatDuration,
  formatFps,
  formatResolution,
  hashSettled,
  secondsToUs,
} from './recordings-format.js';

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function RecordingDetail({ recording, canCut }: { recording: Recording; canCut: boolean }) {
  const { i18n } = useLingui();
  const cut = useCutRecording();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [start, setStart] = useState('0');
  const [end, setEnd] = useState(
    recording.durationUs ? String(recording.durationUs / 1_000_000) : '1',
  );
  const [mode, setMode] = useState<CutMode>('auto');
  const yes = i18n._('recordings.yes');
  const no = i18n._('recordings.no');
  const pending = i18n._('recordings.pending');

  return (
    <section className="panel">
      <h2>
        {i18n._(`recordings.kind.${recording.kind}`)} — {recording.fileName}
      </h2>
      {recording.jobStatus === 'queued' || recording.jobStatus === 'running' ? (
        <p className="status">{i18n._('recordings.proxyWait')}</p>
      ) : null}
      {recording.error ? (
        <p className="error" role="alert">
          {translate(i18n, 'recordings.failed', { error: recording.error })}
        </p>
      ) : null}
      <h3>{i18n._('recordings.meta')}</h3>
      <dl className="meta">
        <Meta
          label={i18n._('recordings.resolution')}
          value={formatResolution(recording.displayWidth, recording.displayHeight)}
        />
        <Meta label={i18n._('recordings.fps')} value={formatFps(recording.fps)} />
        <Meta label={i18n._('recordings.duration')} value={formatDuration(recording.durationUs)} />
        <Meta label={i18n._('recordings.codec')} value={recording.codec ?? '—'} />
        <Meta
          label={i18n._('recordings.hdr')}
          value={recording.codec ? (recording.isHdr ? yes : no) : pending}
        />
        <Meta
          label={i18n._('recordings.rotation')}
          value={
            recording.codec
              ? translate(i18n, 'recordings.degree', { degrees: recording.rotation })
              : pending
          }
        />
        <Meta
          label={i18n._('recordings.vfr')}
          value={recording.codec ? (recording.isVfr ? yes : no) : pending}
        />
        <Meta label={i18n._('recordings.transfer')} value={recording.colorTransfer ?? '—'} />
        <Meta label={i18n._('recordings.dolby')} value={recording.dolbyVision ?? '—'} />
        <Meta
          label={i18n._('recordings.quickHash')}
          value={recording.quickHash ?? (hashSettled(recording.jobStatus) ? '—' : pending)}
        />
        <Meta
          label={i18n._('recordings.sha256')}
          value={recording.sha256 ?? (hashSettled(recording.jobStatus) ? '—' : pending)}
        />
      </dl>
      <h3>{i18n._('recordings.play')}</h3>
      {recording.proxyUrl ? (
        <div className="player-stage">
          <video ref={videoRef} className="player" src={recording.proxyUrl} controls />
          <RecordingSkeletonOverlay
            videoId={recording.id}
            hasPose={recording.hasPose}
            videoRef={videoRef}
          />
        </div>
      ) : (
        <p>{i18n._('recordings.proxyWait')}</p>
      )}
      <RecordingProposals recording={recording} canCut={canCut} />
      {canCut ? (
        <form
          className="cut-form"
          onSubmit={(event) => {
            event.preventDefault();
            const startUs = secondsToUs(Number(start));
            const endUs = secondsToUs(Number(end));
            if (startUs === null || endUs === null || endUs <= startUs) return;
            cut.mutate({ id: recording.id, startUs, endUs, mode });
          }}
        >
          <h3>{i18n._('recordings.cut')}</h3>
          <label>
            {i18n._('recordings.cutStart')}
            <input
              value={start}
              onChange={(event) => setStart(event.target.value)}
              inputMode="decimal"
            />
          </label>
          <label>
            {i18n._('recordings.cutEnd')}
            <input
              value={end}
              onChange={(event) => setEnd(event.target.value)}
              inputMode="decimal"
            />
          </label>
          <label>
            {i18n._('recordings.cutMode')}
            <select value={mode} onChange={(event) => setMode(event.target.value as CutMode)}>
              <option value="auto">auto</option>
              <option value="lossless">lossless</option>
              <option value="reencode">reencode</option>
            </select>
          </label>
          <button type="submit" disabled={cut.isPending || recording.durationUs === null}>
            {cut.isPending ? i18n._('recordings.cutting') : i18n._('recordings.cutSubmit')}
          </button>
          {cut.error ? (
            <p className="error" role="alert">
              {errorText(cut.error, i18n._('error.generic'))}
            </p>
          ) : null}
        </form>
      ) : null}
    </section>
  );
}

export function RecordingsPage() {
  const { i18n } = useLingui();
  const health = useHealth();
  const recordings = useRecordings();
  const importPath = useImportPath();
  const [path, setPath] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const items = recordings.data ?? [];
  const current = items.find((item) => item.id === selected) ?? items[0] ?? null;
  const gate = recordingsGate(health);
  const importReady = gate === 'ready';

  return (
    <div className="recordings">
      <section className="panel">
        <h1>{i18n._('recordings.title')}</h1>
        <p className="lede">{i18n._('recordings.lede')}</p>
        {gate === 'loading' ? <p>{i18n._('recordings.checkingFfmpeg')}</p> : null}
        {gate === 'api-down' ? (
          <p className="api-down" role="alert">
            {i18n._('api.down')}
          </p>
        ) : null}
        {gate === 'ffmpeg-missing' ? (
          <p className="status" role="status">
            {i18n._('recordings.ffmpegMissing')}
          </p>
        ) : null}
        {importReady ? (
          <>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                const input = event.currentTarget.elements.namedItem('file');
                const file = input instanceof HTMLInputElement ? input.files?.[0] : undefined;
                if (!file) return;
                setUploading(true);
                setUploadError(null);
                try {
                  const created = await uploadRecording(file);
                  setSelected(created.recording.id);
                  await recordings.refetch();
                } catch (error) {
                  setUploadError(errorText(error, i18n._('error.generic')));
                } finally {
                  setUploading(false);
                }
              }}
            >
              <label>
                {i18n._('recordings.upload')}
                <input name="file" type="file" accept="video/*,.mov,.mp4,.m4v" />
              </label>
              <button type="submit" disabled={uploading}>
                {uploading ? i18n._('recordings.uploading') : i18n._('recordings.upload')}
              </button>
            </form>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!path.startsWith('/')) return;
                importPath.mutate(
                  { sourcePath: path, importMode: 'copy' },
                  { onSuccess: (created) => setSelected(created.recording.id) },
                );
              }}
            >
              <label>
                {i18n._('recordings.path')}
                <input
                  value={path}
                  onChange={(event) => setPath(event.target.value)}
                  placeholder="/Users/…"
                />
              </label>
              <button type="submit" disabled={importPath.isPending}>
                {i18n._('recordings.import')}
              </button>
            </form>
          </>
        ) : null}
        {uploadError || importPath.error ? (
          <p className="error" role="alert">
            {uploadError ?? errorText(importPath.error, i18n._('error.generic'))}
          </p>
        ) : null}
        {recordings.isLoading ? <p>{i18n._('recordings.loading')}</p> : null}
        {items.length === 0 && !recordings.isLoading ? <p>{i18n._('recordings.empty')}</p> : null}
        <ul className="recording-list">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setSelected(item.id)}
                aria-current={current?.id === item.id}
              >
                {i18n._(`recordings.kind.${item.kind}`)} — {item.fileName}
              </button>
            </li>
          ))}
        </ul>
      </section>
      {current ? (
        <RecordingDetail key={current.id} recording={current} canCut={importReady} />
      ) : null}
    </div>
  );
}
