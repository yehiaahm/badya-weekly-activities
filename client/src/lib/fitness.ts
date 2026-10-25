import { Disc3, Dumbbell, Flame, Music, Wind, Zap, type LucideIcon } from 'lucide-react';

/** The first SAC community activity. Wall-clock time at Badya (Africa/Cairo). */
export const FITNESS_EVENT = {
  title: 'Aerobics & Fitness',
  tagline: 'Burn · Move · Enjoy',
  date: '2026-10-28',
  time: '11:30',
  /** How long the "Happening now" state lasts after the start. */
  liveMinutes: 90,
  location: 'Fitness / Activity Area',
} as const;

export interface FitnessMove {
  name: string;
  cue: string;
}

export interface FitnessTheme {
  id: string;
  name: string;
  icon: LucideIcon;
  /** CSS colour for the card accent. */
  color: string;
  vibe: string;
  bpm: number;
  /** 1 (easy) to 5 (all out). */
  intensity: number;
  /** Date of the weekly session this theme is planned for. */
  date: string;
  moves: FitnessMove[];
}

/**
 * The weekly rotation. The first week is confirmed; the order after that is a
 * proposal, so reorder or change dates here and the page follows.
 */
export const FITNESS_THEMES: FitnessTheme[] = [
  {
    id: 'aerobics',
    name: 'Aerobics',
    icon: Music,
    color: '#d33a2c',
    vibe: 'Classic step-and-groove cardio to upbeat music.',
    bpm: 128,
    intensity: 3,
    date: '2026-10-28',
    moves: [
      { name: 'Jumping jacks', cue: 'Arms up, feet wide, land soft' },
      { name: 'Grapevine step', cue: 'Side, cross, side, tap' },
      { name: 'High knees', cue: 'Drive the knees to hip height' },
      { name: 'Step-touch', cue: 'Big arms, find the beat' },
      { name: 'Box step', cue: 'Forward, side, back, together' },
    ],
  },
  {
    id: 'hiit',
    name: 'HIIT',
    icon: Flame,
    color: '#e0640f',
    vibe: 'Short, sharp bursts. Go hard, rest, repeat.',
    bpm: 150,
    intensity: 5,
    date: '2026-11-04',
    moves: [
      { name: 'Squat jumps', cue: 'Sit back, explode up' },
      { name: 'Mountain climbers', cue: 'Hips low, knees fast' },
      { name: 'Burpees', cue: 'Chest down, jump tall' },
      { name: 'Skater hops', cue: 'Leap side to side, balance' },
      { name: 'Plank jacks', cue: 'Core tight, feet out and in' },
    ],
  },
  {
    id: 'functional',
    name: 'Functional Fitness',
    icon: Dumbbell,
    color: '#0b75c9',
    vibe: 'Everyday strength: squat, push, pull and carry.',
    bpm: 110,
    intensity: 4,
    date: '2026-11-11',
    moves: [
      { name: 'Bodyweight squats', cue: 'Chest proud, heels down' },
      { name: 'Push-ups', cue: 'Straight line, shoulders to wrists' },
      { name: 'Reverse lunges', cue: 'Step back, front knee over ankle' },
      { name: 'Glute bridges', cue: 'Squeeze at the top' },
      { name: 'Bear plank', cue: 'Knees one inch off the floor' },
    ],
  },
  {
    id: 'mobility',
    name: 'Mobility & Stretching',
    icon: Wind,
    color: '#138a4b',
    vibe: 'Slow down, loosen up and breathe.',
    bpm: 60,
    intensity: 1,
    date: '2026-11-18',
    moves: [
      { name: 'Cat-cow', cue: 'Breathe with the spine' },
      { name: "World's greatest stretch", cue: 'Lunge, rotate, reach' },
      { name: 'Hip circles', cue: 'Slow and wide' },
      { name: 'Shoulder rolls', cue: 'Back, down, melt' },
      { name: 'Forward fold', cue: 'Soft knees, heavy head' },
    ],
  },
  {
    id: 'cardio',
    name: 'Cardio Challenge',
    icon: Zap,
    color: '#d98200',
    vibe: 'Beat your own score on a stamina circuit.',
    bpm: 140,
    intensity: 4,
    date: '2026-11-25',
    moves: [
      { name: 'Fast feet', cue: 'Tiny quick steps on the spot' },
      { name: 'Shadow boxing', cue: 'Jab, cross, hook, repeat' },
      { name: 'Star jumps', cue: 'Reach for the ceiling' },
      { name: 'Butt kicks', cue: 'Heels to glutes, stay light' },
      { name: 'Lateral shuffles', cue: 'Low stance, touch the line' },
    ],
  },
  {
    id: 'dance',
    name: 'Dance Fitness',
    icon: Disc3,
    color: '#d02f79',
    vibe: 'No experience needed. Just follow the groove.',
    bpm: 120,
    intensity: 3,
    date: '2026-12-02',
    moves: [
      { name: 'Body roll', cue: 'Chest, belly, hips, flow' },
      { name: 'Hip sway', cue: 'Shift weight, loose knees' },
      { name: 'Clap and stomp', cue: 'Own the rhythm' },
      { name: 'Spin and point', cue: 'Turn, then strike the pose' },
      { name: 'Freestyle', cue: 'Do your thing, no judgement' },
    ],
  },
];

export const WORK_SECONDS = 30;
export const REST_SECONDS = 8;
export const GET_READY_SECONDS = 5;
