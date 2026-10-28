import { CalendarCheck, CalendarDays, Check, Clock, MapPin, Pause, Play, RotateCcw, Share2, Sparkles, Trophy, Users } from 'lucide-react';
import { useEffect, useMemo, useReducer, useState, type CSSProperties } from 'react';
import { Link } from 'react-router';
import { monthOf, zonedToInstant } from '@shared/dates.ts';
import { formatDayDate, formatMonthDay, formatTime } from '@shared/format.ts';
import { useToast } from '../components/feedback.tsx';
import { EmptyState } from '../components/ui.tsx';
import {
  FITNESS_EVENT,
  FITNESS_THEMES,
  GET_READY_SECONDS,
  REST_SECONDS,
  WORK_SECONDS,
  type FitnessTheme,
} from '../lib/fitness.ts';
import { useConfig, usePublicActivities } from '../lib/queries.ts';
import { readJson, STORAGE_KEYS, writeJson } from '../lib/storage.ts';
import { DEFAULT_TIME_ZONE } from '../lib/time.ts';

/* ------------------------------------------------------------ countdown */

function useNowMs(interval = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), interval);
    return () => window.clearInterval(timer);
  }, [interval]);
  return now;
}

type EventPhase = 'before' | 'live' | 'done';

function useEventCountdown() {
  const timeZone = useConfig().data?.timeZone ?? DEFAULT_TIME_ZONE;
  const now = useNowMs();
  const start = useMemo(
    () => zonedToInstant(`${FITNESS_EVENT.date}T${FITNESS_EVENT.time}`, timeZone).getTime(),
    [timeZone],
  );
  const end = start + FITNESS_EVENT.liveMinutes * 60_000;
  const phase: EventPhase = now < start ? 'before' : now < end ? 'live' : 'done';
  const left = Math.max(0, start - now);
  const seconds = Math.floor(left / 1000);
  return {
    phase,
    days: Math.floor(seconds / 86_400),
    hours: Math.floor((seconds % 86_400) / 3600),
    minutes: Math.floor((seconds % 3600) / 60),
    seconds: seconds % 60,
  };
}

function CountdownTile({ value, label }: { value: number; label: string }) {
  return (
    <div className="fit-tile">
      <strong>{String(value).padStart(2, '0')}</strong>
      <span>{label}</span>
    </div>
  );
}

/* ------------------------------------------------------------ Move Lab */

type Phase = { kind: 'ready' | 'work' | 'rest'; seconds: number; move: number };

function buildPhases(theme: FitnessTheme): Phase[] {
  const phases: Phase[] = [{ kind: 'ready', seconds: GET_READY_SECONDS, move: 0 }];
  theme.moves.forEach((_, move) => {
    phases.push({ kind: 'work', seconds: WORK_SECONDS, move });
    if (move < theme.moves.length - 1) phases.push({ kind: 'rest', seconds: REST_SECONDS, move: move + 1 });
  });
  return phases;
}

interface LabState {
  status: 'idle' | 'running' | 'paused' | 'done';
  phase: number;
  left: number;
  points: number;
}

type LabAction =
  | { type: 'start'; phases: Phase[] }
  | { type: 'toggle' }
  | { type: 'tick'; phases: Phase[]; intensity: number }
  | { type: 'reset' };

const IDLE: LabState = { status: 'idle', phase: 0, left: 0, points: 0 };

function labReducer(state: LabState, action: LabAction): LabState {
  switch (action.type) {
    case 'start':
      return { status: 'running', phase: 0, left: action.phases[0].seconds, points: 0 };
    case 'toggle':
      return state.status === 'running'
        ? { ...state, status: 'paused' }
        : state.status === 'paused'
          ? { ...state, status: 'running' }
          : state;
    case 'tick': {
      if (state.status !== 'running') return state;
      const earned = action.phases[state.phase].kind === 'work' ? action.intensity : 0;
      const points = state.points + earned;
      if (state.left > 1) return { ...state, left: state.left - 1, points };
      const next = state.phase + 1;
      if (next >= action.phases.length) return { status: 'done', phase: state.phase, left: 0, points };
      return { ...state, phase: next, left: action.phases[next].seconds, points };
    }
    case 'reset':
      return IDLE;
  }
}

interface BestScore {
  points: number;
  theme: string;
}

/** Keeps the screen awake while a workout runs. Not supported everywhere, so it fails quietly. */
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    navigator.wakeLock
      .request('screen')
      .then((sentinel) => {
        if (cancelled) void sentinel.release();
        else lock = sentinel;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      void lock?.release().catch(() => undefined);
    };
  }, [active]);
}

const RING_RADIUS = 92;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

function MoveLab({ theme, onTheme }: { theme: FitnessTheme; onTheme: (id: string) => void }) {
  const toast = useToast();
  const phases = useMemo(() => buildPhases(theme), [theme]);
  const [state, dispatch] = useReducer(labReducer, IDLE);
  const [best, setBest] = useState<BestScore | null>(() => readJson<BestScore>(STORAGE_KEYS.fitnessBest));

  useEffect(() => {
    if (state.status !== 'running') return;
    const timer = window.setInterval(() => dispatch({ type: 'tick', phases, intensity: theme.intensity }), 1000);
    return () => window.clearInterval(timer);
  }, [state.status, phases, theme.intensity]);

  useWakeLock(state.status === 'running');

  const isNewBest = state.status === 'done' && state.points > (best?.points ?? 0);
  useEffect(() => {
    if (state.status === 'done' && isNewBest) {
      const record = { points: state.points, theme: theme.name };
      writeJson(STORAGE_KEYS.fitnessBest, record);
      setBest(record);
    }
    // Only when a workout finishes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status]);

  const active = state.status === 'running' || state.status === 'paused';
  const phase = phases[state.phase];
  const total = phase.seconds;
  const progress = active ? 1 - (state.left - 1) / total : 0;
  const move = theme.moves[Math.min(phase.move, theme.moves.length - 1)];
  const upcoming = phase.kind === 'work' ? theme.moves[phase.move + 1] : phase.kind === 'rest' ? theme.moves[phase.move] : theme.moves[0];
  const totalMinutes = Math.ceil(
    (GET_READY_SECONDS + theme.moves.length * WORK_SECONDS + (theme.moves.length - 1) * REST_SECONDS) / 60,
  );

  const share = async () => {
    const text = `I just scored ${state.points} burn points in the SAC Move Lab (${theme.name}). Join Aerobics & Fitness on ${formatDayDate(FITNESS_EVENT.date)}, ${formatTime(FITNESS_EVENT.time)} at Badya!`;
    const url = `${window.location.origin}/fitness`;
    try {
      if (navigator.share) await navigator.share({ title: 'BURN · MOVE · ENJOY', text, url });
      else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        toast.success('Copied. Paste it in your group chat.');
      }
    } catch {
      // The share sheet was dismissed.
    }
  };

  const phaseLabel = phase.kind === 'ready' ? 'Get ready' : phase.kind === 'rest' ? 'Rest' : 'Go!';

  return (
    <section className="fit-lab" style={{ '--theme': theme.color, '--beat': `${60 / theme.bpm}s` } as CSSProperties}>
      <div className="fit-lab-head">
        <div>
          <span className="fit-kicker">Move Lab</span>
          <h2>Try a mini workout right now</h2>
          <p>
            Pick a vibe, hit start and follow {theme.moves.length} moves for about {totalMinutes} minutes. Every second you
            work earns burn points. No equipment needed.
          </p>
        </div>
        {best && (
          <div className="fit-best" title="Saved on this device">
            <Trophy size={16} aria-hidden /> Your best <strong>{best.points}</strong>
            <small>{best.theme}</small>
          </div>
        )}
      </div>

      <div className="fit-picker" role="group" aria-label="Choose a workout vibe">
        {FITNESS_THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            className="fit-pick"
            aria-pressed={t.id === theme.id}
            disabled={active}
            style={{ '--theme': t.color } as CSSProperties}
            onClick={() => {
              dispatch({ type: 'reset' });
              onTheme(t.id);
            }}
          >
            <t.icon size={16} aria-hidden /> {t.name}
          </button>
        ))}
      </div>

      <div className="fit-stage">
        <div className={`fit-ring ${active && state.status === 'running' ? 'is-live' : ''} fit-${phase.kind}`}>
          <span className="fit-beat" aria-hidden />
          <svg viewBox="0 0 200 200" aria-hidden>
            <circle className="fit-ring-track" cx="100" cy="100" r={RING_RADIUS} />
            <circle
              key={state.phase}
              className="fit-ring-bar"
              cx="100"
              cy="100"
              r={RING_RADIUS}
              strokeDasharray={RING_LENGTH}
              strokeDashoffset={RING_LENGTH * (1 - progress)}
            />
          </svg>
          <div className="fit-ring-center" aria-live="off">
            {state.status === 'idle' && (
              <>
                <theme.icon size={40} aria-hidden />
                <b>{theme.name}</b>
                <small>{theme.bpm} BPM</small>
              </>
            )}
            {active && (
              <>
                <small>{phaseLabel}</small>
                <strong>{state.left}</strong>
                <b>{phase.kind === 'ready' ? theme.moves[0].name : move.name}</b>
              </>
            )}
            {state.status === 'done' && (
              <>
                <Check size={40} aria-hidden />
                <strong>{state.points}</strong>
                <small>burn points</small>
              </>
            )}
          </div>
        </div>

        <div className="fit-side">
          {state.status === 'idle' && (
            <>
              <p className="fit-vibe">{theme.vibe}</p>
              <div className="fit-meter" aria-label={`Intensity ${theme.intensity} out of 5`}>
                <span>Intensity</span>
                {Array.from({ length: 5 }, (_, i) => (
                  <i key={i} className={i < theme.intensity ? 'on' : ''} />
                ))}
              </div>
              <ol className="fit-moves">
                {theme.moves.map((m) => (
                  <li key={m.name}>
                    <strong>{m.name}</strong>
                    <span>{m.cue}</span>
                  </li>
                ))}
              </ol>
              <button type="button" className="btn btn-accent btn-lg" onClick={() => dispatch({ type: 'start', phases })}>
                <Play size={18} aria-hidden /> Start workout
              </button>
            </>
          )}

          {active && (
            <>
              <p className="fit-cue">{phase.kind === 'work' ? move.cue : phase.kind === 'rest' ? 'Shake it out and breathe' : 'Find some space and stand tall'}</p>
              <div className="fit-up-next">
                <span>{phase.kind === 'rest' ? 'Next move' : 'Up next'}</span>
                <strong>{upcoming ? upcoming.name : 'Finish strong'}</strong>
              </div>
              <div className="fit-points">
                <Sparkles size={16} aria-hidden /> <strong>{state.points}</strong> burn points
              </div>
              <div className="fit-actions">
                <button type="button" className="btn btn-primary btn-lg" onClick={() => dispatch({ type: 'toggle' })}>
                  {state.status === 'paused' ? <Play size={18} aria-hidden /> : <Pause size={18} aria-hidden />}
                  {state.status === 'paused' ? 'Resume' : 'Pause'}
                </button>
                <button type="button" className="btn btn-lg" onClick={() => dispatch({ type: 'reset' })}>
                  <RotateCcw size={18} aria-hidden /> Stop
                </button>
              </div>
            </>
          )}

          {state.status === 'done' && (
            <>
              <h3 className="fit-done-title">{isNewBest ? 'New personal best!' : 'Workout complete!'}</h3>
              <p className="fit-vibe">
                That was the {theme.name} warm-up. The real thing is better with friends and music. See you on{' '}
                {formatMonthDay(FITNESS_EVENT.date)}.
              </p>
              <div className="fit-actions">
                <button type="button" className="btn btn-accent btn-lg" onClick={() => void share()}>
                  <Share2 size={18} aria-hidden /> Challenge a friend
                </button>
                <button type="button" className="btn btn-lg" onClick={() => dispatch({ type: 'start', phases })}>
                  <RotateCcw size={18} aria-hidden /> Go again
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- page */

export function FitnessPage() {
  const countdown = useEventCountdown();
  const [themeId, setThemeId] = useState(FITNESS_THEMES[0].id);
  const theme = FITNESS_THEMES.find((t) => t.id === themeId) ?? FITNESS_THEMES[0];

  const month = monthOf(FITNESS_EVENT.date);
  const activities = usePublicActivities(month).data?.activities;
  const linked = activities?.find(
    (a) => a.date === FITNESS_EVENT.date && /aerobic|fitness|hiit|dance/i.test(`${a.category} ${a.name}`),
  );

  if (countdown.phase === 'done') {
    return (
      <div className="container page">
        <EmptyState
          icon={CalendarCheck}
          title={`${FITNESS_EVENT.title} has ended`}
          action={
            <Link to="/" className="btn btn-primary">
              Browse activities
            </Link>
          }
        >
          The Move Lab was part of the {FITNESS_EVENT.title} kick-off on {formatDayDate(FITNESS_EVENT.date)} and is now closed.
          Thanks to everyone who joined!
        </EmptyState>
      </div>
    );
  }

  return (
    <>
      <section className="fit-hero">
        <div className="container fit-hero-inner">
          <div className="fit-hero-copy">
            <span className="hero-eyebrow">SAC · Community Activity #1</span>
            <h1>
              Burn <i>·</i> Move <i>·</i> Enjoy
            </h1>
            <p>
              A weekly fitness experience for the whole Badya sports community. New theme every week, everyone is welcome.
            </p>
            <ul className="fit-facts">
              <li>
                <CalendarDays size={16} aria-hidden /> {formatDayDate(FITNESS_EVENT.date)}
              </li>
              <li>
                <Clock size={16} aria-hidden /> From {formatTime(FITNESS_EVENT.time)}
              </li>
              <li>
                <MapPin size={16} aria-hidden /> {FITNESS_EVENT.location}
              </li>
              <li>
                <Users size={16} aria-hidden /> Open for all students
              </li>
            </ul>
          </div>

          <div className="fit-count" aria-live="polite">
            {countdown.phase === 'before' && (
              <>
                <span className="fit-count-label">Starts in</span>
                <div className="fit-tiles">
                  <CountdownTile value={countdown.days} label="days" />
                  <CountdownTile value={countdown.hours} label="hours" />
                  <CountdownTile value={countdown.minutes} label="min" />
                  <CountdownTile value={countdown.seconds} label="sec" />
                </div>
              </>
            )}
            {countdown.phase === 'live' && (
              <div className="fit-live">
                <span className="fit-live-dot" aria-hidden /> Happening now
                <small>Head to the {FITNESS_EVENT.location}</small>
              </div>
            )}
            {linked ? (
              <Link to={`/activities/${linked.id}`} className="btn btn-accent btn-lg">
                {linked.canReserve ? 'Reserve your spot' : 'View activity'}
              </Link>
            ) : (
              <Link to={`/?month=${month}`} className="btn btn-accent btn-lg">
                See it in Weekly Activities
              </Link>
            )}
          </div>
        </div>
      </section>

      <div className="container fit-body">
        <MoveLab theme={theme} onTheme={setThemeId} />

        <section className="fit-rotation" aria-labelledby="fit-rotation-title">
          <span className="fit-kicker">Every Wednesday</span>
          <h2 id="fit-rotation-title">A new theme every week</h2>
          <div className="fit-rotation-grid">
            {FITNESS_THEMES.map((t, index) => {
              const first = t.date === FITNESS_EVENT.date;
              return (
                <button
                  key={t.id}
                  type="button"
                  className="fit-card"
                  style={{ '--theme': t.color } as CSSProperties}
                  aria-pressed={t.id === theme.id}
                  onClick={() => setThemeId(t.id)}
                >
                  <span className="fit-card-top">
                    <span className="fit-card-icon" aria-hidden>
                      <t.icon size={22} />
                    </span>
                    <span className={`fit-card-badge ${first ? 'is-first' : ''}`}>{first ? 'Kick-off' : `Week ${index + 1}`}</span>
                  </span>
                  <strong>{t.name}</strong>
                  <span className="fit-card-vibe">{t.vibe}</span>
                  <span className="fit-card-date">{formatMonthDay(t.date)}</span>
                </button>
              );
            })}
          </div>
          <p className="fit-note">Themes after week 1 are the plan so far and may change. Tap one to try it in the Move Lab.</p>
        </section>
      </div>
    </>
  );
}
