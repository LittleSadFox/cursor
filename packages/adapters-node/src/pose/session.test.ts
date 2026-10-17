import { describe, expect, it } from 'vitest';

import {
  openModelSession,
  openPoseSessions,
  type OpenOrtSession,
  type OrtSessionLike,
  type PoseExecutionProvider,
} from './session.js';

const COREML_RANK_ERROR =
  'Non-zero status code returned while running CoreML node. CoreML static output shape ' +
  '({1,1,1,2100,2100}) and inferred shape ({1,2100}) have different ranks.';

type Opened = { path: string; providers: readonly PoseExecutionProvider[]; released: boolean };

function fakeOpener(behavior: {
  failOpenOnCoreml?: boolean;
  failRunOnCoreml?: boolean;
  failRunOnCpu?: boolean;
}): { open: OpenOrtSession; opened: Opened[] } {
  const opened: Opened[] = [];
  const open: OpenOrtSession = async (path, providers) => {
    const onCoreml = providers[0] === 'coreml';
    if (onCoreml && behavior.failOpenOnCoreml) throw new Error('CoreML EP unavailable');
    const record: Opened = { path, providers, released: false };
    opened.push(record);
    const session: OrtSessionLike = {
      inputNames: ['input'],
      outputNames: ['output'],
      async run() {
        if (onCoreml && behavior.failRunOnCoreml) throw new Error(COREML_RANK_ERROR);
        if (!onCoreml && behavior.failRunOnCpu) throw new Error('cpu run failed');
        return {};
      },
      async release() {
        record.released = true;
      },
    };
    return session;
  };
  return { open, opened };
}

describe('openModelSession', () => {
  it('keeps CoreML when runs succeed', async () => {
    const { open, opened } = fakeOpener({});
    const session = await openModelSession('pose.onnx', 'coreml', open);
    await session.run({});
    expect(session.provider()).toBe('coreml');
    expect(opened.map((o) => o.providers)).toEqual([['coreml', 'cpu']]);
  });

  it('falls back to CPU when CoreML rejects the graph at load', async () => {
    const { open, opened } = fakeOpener({ failOpenOnCoreml: true });
    const session = await openModelSession('pose.onnx', 'coreml', open);
    expect(session.provider()).toBe('cpu');
    expect(opened.map((o) => o.providers)).toEqual([['cpu']]);
  });

  it('reopens on CPU, releases the CoreML session, and retries when a run fails', async () => {
    const { open, opened } = fakeOpener({ failRunOnCoreml: true });
    const session = await openModelSession('det.onnx', 'coreml', open);
    await expect(session.run({})).resolves.toEqual({});
    expect(session.provider()).toBe('cpu');
    expect(opened.map((o) => o.providers)).toEqual([['coreml', 'cpu'], ['cpu']]);
    expect(opened[0]!.released).toBe(true);
    await session.run({});
    expect(opened).toHaveLength(2);
  });

  it('shares one CPU reopen between concurrent failing runs', async () => {
    const { open, opened } = fakeOpener({ failRunOnCoreml: true });
    const session = await openModelSession('det.onnx', 'coreml', open);
    await Promise.all([session.run({}), session.run({})]);
    expect(opened.filter((o) => o.providers[0] === 'cpu')).toHaveLength(1);
  });

  it('surfaces CPU run errors instead of retrying', async () => {
    const { open } = fakeOpener({ failRunOnCpu: true });
    const session = await openModelSession('det.onnx', 'cpu', open);
    await expect(session.run({})).rejects.toThrow('cpu run failed');
  });
});

describe('openPoseSessions', () => {
  it('puts the detector on CPU and prefers CoreML for pose on macOS arm64', async () => {
    const { open, opened } = fakeOpener({});
    const sessions = await openPoseSessions('det.onnx', 'pose.onnx', {
      platform: 'darwin',
      arch: 'arm64',
      open,
    });
    expect(sessions.detector.provider()).toBe('cpu');
    expect(sessions.pose.provider()).toBe('coreml');
    expect(sessions.executionProvider()).toBe('coreml');
    expect(opened.map((o) => [o.path, o.providers])).toEqual([
      ['det.onnx', ['cpu']],
      ['pose.onnx', ['coreml', 'cpu']],
    ]);
  });

  it('reports CPU once pose falls back', async () => {
    const { open } = fakeOpener({ failRunOnCoreml: true });
    const sessions = await openPoseSessions('det.onnx', 'pose.onnx', {
      platform: 'darwin',
      arch: 'arm64',
      open,
    });
    await sessions.pose.run({});
    expect(sessions.executionProvider()).toBe('cpu');
  });

  it('uses CPU for both models off macOS arm64', async () => {
    const { open } = fakeOpener({});
    const sessions = await openPoseSessions('det.onnx', 'pose.onnx', {
      platform: 'linux',
      arch: 'x64',
      open,
    });
    expect(sessions.executionProvider()).toBe('cpu');
  });
});
