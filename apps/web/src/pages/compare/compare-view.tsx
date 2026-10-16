import { useLingui } from '@lingui/react';
import { useMemo, useState } from 'react';

import type { Comparison } from '@climbing-coach/api';

import { errorText, formatMessage } from '../../format.js';
import { highlightedJoints, scoreSeries } from '../../hooks/compare/divergence.js';
import { moveAt, moveSpans, moveViews } from '../../hooks/compare/moves.js';
import {
  durationOf,
  positionForA,
  positionsAt,
  stepPositions,
  type SyncMode,
} from '../../hooks/compare/timeline.js';
import {
  useComparison,
  useComparisonData,
  usePlaybackClock,
  useSidePose,
  type ComparisonData,
} from '../../hooks/compare/use-compare.js';

import { DivergenceTimeline } from './divergence-timeline.js';
import { MoveDifferencePanel } from './move-panel.js';
import { PoseCanvas } from './pose-canvas.js';
import {
  canvasSize,
  ghostCommands,
  poseStyles,
  sideCommands,
  type CompareLayout,
  type ScenePose,
} from './scene.js';
import { LayoutToggle, SyncModeToggle, Transport } from './transport.js';

function climbsOf(comparison: Comparison) {
  return {
    a: { startUs: comparison.a.climbStartUs, endUs: comparison.a.climbEndUs },
    b: { startUs: comparison.b.climbStartUs, endUs: comparison.b.climbEndUs },
  };
}

type PlayerProps = {
  comparison: Comparison;
  data: ComparisonData;
  poses: { a: ScenePose | null | undefined; b: ScenePose | null | undefined };
};

/** Skeleton-only dual player, ghost overlay, divergence timeline, and move panel (P3.4). */
function ComparisonPlayer({ comparison, data, poses }: PlayerProps) {
  const { i18n } = useLingui();
  const [mode, setMode] = useState<SyncMode>('synced');
  const [layout, setLayout] = useState<CompareLayout>('side_by_side');
  const [opacity, setOpacity] = useState(0.45);
  const climbs = useMemo(() => climbsOf(comparison), [comparison]);
  const durationUs = durationOf(data.timeline, mode, climbs);
  const { clock, play, pause, seek } = usePlaybackClock(durationUs);

  const positions = positionsAt(data.timeline, mode, climbs, clock.position);
  const highlights = highlightedJoints(data.table, positions.step);
  const styles = poseStyles(highlights, opacity);
  const scores = useMemo(() => scoreSeries(data.table), [data.table]);
  const moves = useMemo(
    () => moveViews(comparison.perMove, comparison.moveMatches),
    [comparison.perMove, comparison.moveMatches],
  );
  const spans = useMemo(
    () => moveSpans(moves, data.timeline, mode, climbs.a),
    [moves, data.timeline, mode, climbs.a],
  );
  const xs = useMemo(
    () => stepPositions(data.timeline, mode, climbs.a),
    [data.timeline, mode, climbs.a],
  );

  const switchMode = (next: SyncMode) => {
    const resumeAt =
      next === 'synced'
        ? positionForA(data.timeline, positions.tA)
        : Math.max(0, positions.tA - climbs.a.startUs);
    setMode(next);
    seek(resumeAt);
  };

  return (
    <>
      <div className="compare-controls">
        <SyncModeToggle mode={mode} onChange={switchMode} />
        <LayoutToggle
          layout={layout}
          opacity={opacity}
          onLayout={setLayout}
          onOpacity={setOpacity}
        />
      </div>
      <div className="players">
        {layout === 'side_by_side' ? (
          <>
            <PoseCanvas
              commands={sideCommands(poses.a, positions.tA, styles.a)}
              size={canvasSize(poses.a)}
              label={i18n._('compare.sideA')}
            />
            <PoseCanvas
              commands={sideCommands(poses.b, positions.tB, styles.b)}
              size={canvasSize(poses.b)}
              label={i18n._('compare.sideB')}
            />
          </>
        ) : (
          <PoseCanvas
            commands={ghostCommands(poses, positions, styles)}
            size={canvasSize(poses.a)}
            label={i18n._('compare.ghostLabel')}
          />
        )}
      </div>
      <p className="legend">
        <span className="swatch a" /> {i18n._('compare.sideA')} <span className="swatch b" />{' '}
        {i18n._('compare.sideB')} <span className="swatch highlight" />{' '}
        {i18n._('compare.highlightLegend')}
      </p>
      <Transport
        playing={clock.playing}
        position={clock.position}
        durationUs={durationUs}
        onPlay={play}
        onPause={pause}
        onSeek={seek}
      />
      <DivergenceTimeline
        scores={scores}
        stepPositions={xs}
        moveSpans={spans}
        durationUs={durationUs}
        position={clock.position}
        onSeek={seek}
      />
      <section className="panel">
        <h2>{i18n._('compare.moves')}</h2>
        <MoveDifferencePanel
          comparisonId={comparison.id}
          spans={spans}
          currentMove={moveAt(moves, positions.tA)?.moveIndexA ?? null}
          onSeek={seek}
        />
      </section>
    </>
  );
}

function Summary({ comparison }: { comparison: Comparison }) {
  const { i18n } = useLingui();
  const mean = comparison.summary.meanDivergence;
  return (
    <section className="panel">
      <h2>{i18n._('compare.top')}</h2>
      <p>
        {formatMessage(i18n._('compare.meanDivergence'), {
          value: mean === null ? null : mean.toFixed(2),
        })}
      </p>
      {comparison.summary.topDifferences.length === 0 ? (
        <p>{i18n._('compare.noDifferences')}</p>
      ) : (
        <ol>
          {comparison.summary.topDifferences.map((difference) => (
            <li key={`${difference.moveIndexA}:${difference.joint}`}>{difference.text}</li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function CompareView(props: { attemptAId: string; attemptBId: string }) {
  const { i18n } = useLingui();
  const { comparison, error } = useComparison(props.attemptAId, props.attemptBId);
  const { data, error: dataError } = useComparisonData(comparison);
  const poseA = useSidePose(comparison?.status === 'ready' ? comparison.a : undefined);
  const poseB = useSidePose(comparison?.status === 'ready' ? comparison.b : undefined);
  const failure = error ?? dataError ?? poseA.error ?? poseB.error;

  if (failure) {
    return (
      <p className="error" role="alert">
        {errorText(failure, i18n._('error.generic'))}
      </p>
    );
  }
  if (!comparison || comparison.status === 'pending') {
    return <p className="status">{i18n._('compare.pending')}</p>;
  }
  if (comparison.status === 'failed') {
    return (
      <p className="error" role="alert">
        {formatMessage(i18n._('compare.failed'), { error: comparison.error })}
      </p>
    );
  }
  return (
    <div className="compare">
      <p className="lede">{i18n._('compare.skeletonOnly')}</p>
      <Summary comparison={comparison} />
      {data ? (
        <ComparisonPlayer
          comparison={comparison}
          data={data}
          poses={{ a: poseA.data, b: poseB.data }}
        />
      ) : (
        <p className="status">{i18n._('compare.loading')}</p>
      )}
    </div>
  );
}
