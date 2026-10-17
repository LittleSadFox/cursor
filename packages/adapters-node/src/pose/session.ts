import { InferenceSession, Tensor } from 'onnxruntime-node';

export type PoseExecutionProvider = 'coreml' | 'cpu';

/** The slice of `InferenceSession` the extractor uses; lets tests fake CoreML failures. */
export type OrtSessionLike = {
  readonly inputNames: readonly string[];
  readonly outputNames: readonly string[];
  run(feeds: InferenceSession.FeedsType): Promise<InferenceSession.ReturnType>;
  release(): Promise<void>;
};

export type OpenOrtSession = (
  modelPath: string,
  providers: readonly PoseExecutionProvider[],
) => Promise<OrtSessionLike>;

/** One model's session; moves itself to CPU when CoreML rejects a run. */
export type PoseModelSession = {
  readonly inputNames: readonly string[];
  readonly outputNames: readonly string[];
  provider(): PoseExecutionProvider;
  run(feeds: InferenceSession.FeedsType): Promise<InferenceSession.ReturnType>;
};

export type OrtSessions = {
  detector: PoseModelSession;
  pose: PoseModelSession;
  /** Provider of the pose model, the bulk of the compute. */
  executionProvider(): PoseExecutionProvider;
};

type OpenedSession = { session: OrtSessionLike; provider: PoseExecutionProvider };

// onnxruntime-node 1.30 uses short provider ids (`cpu`, `coreml`), not
// `CPUExecutionProvider` / `CoreMLExecutionProvider`.
const openOrtSession: OpenOrtSession = (modelPath, providers) =>
  InferenceSession.create(modelPath, { executionProviders: [...providers] });

export function preferredProvider(platform: NodeJS.Platform, arch: string): PoseExecutionProvider {
  return platform === 'darwin' && arch === 'arm64' ? 'coreml' : 'cpu';
}

async function openOnCpu(modelPath: string, open: OpenOrtSession): Promise<OpenedSession> {
  return { session: await open(modelPath, ['cpu']), provider: 'cpu' };
}

async function openPreferred(
  modelPath: string,
  preferred: PoseExecutionProvider,
  open: OpenOrtSession,
): Promise<OpenedSession> {
  if (preferred === 'cpu') return openOnCpu(modelPath, open);
  try {
    return { session: await open(modelPath, ['coreml', 'cpu']), provider: 'coreml' };
  } catch {
    return openOnCpu(modelPath, open);
  }
}

/**
 * CoreML can accept a graph at load time and still fail at run time (static vs inferred
 * output ranks). The first such failure reopens the model on CPU and retries the run.
 */
export async function openModelSession(
  modelPath: string,
  preferred: PoseExecutionProvider,
  open: OpenOrtSession = openOrtSession,
): Promise<PoseModelSession> {
  let current = await openPreferred(modelPath, preferred, open);
  let cpuFallback: Promise<OpenedSession> | null = null;

  async function fallBackToCpu(failed: OpenedSession): Promise<OpenedSession> {
    if (current !== failed) return current;
    cpuFallback ??= openOnCpu(modelPath, open).then(async (opened) => {
      current = opened;
      await failed.session.release().catch(() => undefined);
      return opened;
    });
    return cpuFallback;
  }

  return {
    inputNames: current.session.inputNames,
    outputNames: current.session.outputNames,
    provider: () => current.provider,
    async run(feeds) {
      const attempt = current;
      try {
        return await attempt.session.run(feeds);
      } catch (error) {
        if (attempt.provider === 'cpu') throw error;
        const cpu = await fallBackToCpu(attempt);
        return cpu.session.run(feeds);
      }
    },
  };
}

/**
 * Lazy ONNX sessions. RTMDet's NMS output has a data-dependent shape that the CoreML EP
 * cannot run, so the detector stays on CPU (it runs every few frames at 320²). RTMPose
 * prefers CoreML on macOS arm64 and falls back to CPU on load or run failure.
 */
export async function openPoseSessions(
  detectorOnnx: string,
  poseOnnx: string,
  options: { platform?: NodeJS.Platform; arch?: string; open?: OpenOrtSession } = {},
): Promise<OrtSessions> {
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  const open = options.open ?? openOrtSession;
  const detector = await openModelSession(detectorOnnx, 'cpu', open);
  const pose = await openModelSession(poseOnnx, preferredProvider(platform, arch), open);
  return { detector, pose, executionProvider: () => pose.provider() };
}

export async function runDetector(
  session: PoseModelSession,
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
  session: PoseModelSession,
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
