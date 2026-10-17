import { InferenceSession, Tensor } from 'onnxruntime-node';

export type PoseExecutionProvider = 'coreml' | 'cpu';

export type OrtSessions = {
  detector: InferenceSession;
  pose: InferenceSession;
  executionProvider: PoseExecutionProvider;
};

function preferredProviders(
  platform: NodeJS.Platform,
  arch: string,
): { name: PoseExecutionProvider; list: string[] } {
  // onnxruntime-node 1.30 uses short provider ids (`cpu`, `coreml`), not
  // `CPUExecutionProvider` / `CoreMLExecutionProvider`.
  if (platform === 'darwin' && arch === 'arm64') {
    return { name: 'coreml', list: ['coreml', 'cpu'] };
  }
  return { name: 'cpu', list: ['cpu'] };
}

/** Lazy ONNX sessions. CoreML EP on macOS arm64; CPU everywhere else (Linux CI). */
export async function openPoseSessions(
  detectorOnnx: string,
  poseOnnx: string,
  options: { platform?: NodeJS.Platform; arch?: string } = {},
): Promise<OrtSessions> {
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  const preferred = preferredProviders(platform, arch);
  try {
    const detector = await InferenceSession.create(detectorOnnx, {
      executionProviders: preferred.list,
    });
    const pose = await InferenceSession.create(poseOnnx, {
      executionProviders: preferred.list,
    });
    return { detector, pose, executionProvider: preferred.name };
  } catch (error) {
    if (preferred.name === 'cpu') throw error;
    // CoreML EP missing or rejected — fall back to CPU and report honestly.
    const detector = await InferenceSession.create(detectorOnnx, {
      executionProviders: ['cpu'],
    });
    const pose = await InferenceSession.create(poseOnnx, {
      executionProviders: ['cpu'],
    });
    return { detector, pose, executionProvider: 'cpu' };
  }
}

export async function runDetector(
  session: InferenceSession,
  tensor: Float32Array,
  size: number,
): Promise<{ dets: Float32Array; count: number }> {
  const inputName = session.inputNames[0]!;
  const feeds: Record<string, Tensor> = {
    [inputName]: new Tensor('float32', tensor, [1, 3, size, size]),
  };
  const out = await session.run(feeds);
  const detsTensor = out[session.outputNames[0]!]!;
  const dets = detsTensor.data as Float32Array;
  const dims = detsTensor.dims;
  const count = Number(dims[1] ?? 0);
  return { dets, count };
}

export async function runPose(
  session: InferenceSession,
  tensor: Float32Array,
  inputW: number,
  inputH: number,
): Promise<{ simccX: Float32Array; simccY: Float32Array; keypointCount: number }> {
  const inputName = session.inputNames[0]!;
  const feeds: Record<string, Tensor> = {
    [inputName]: new Tensor('float32', tensor, [1, 3, inputH, inputW]),
  };
  const out = await session.run(feeds);
  const xName = session.outputNames.find((name) => name.includes('x')) ?? session.outputNames[0]!;
  const yName = session.outputNames.find((name) => name.includes('y')) ?? session.outputNames[1]!;
  const simccX = out[xName]!.data as Float32Array;
  const simccY = out[yName]!.data as Float32Array;
  const keypointCount = Number(out[xName]!.dims[1] ?? 26);
  return { simccX, simccY, keypointCount };
}
