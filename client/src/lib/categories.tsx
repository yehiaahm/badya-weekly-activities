import {
  CircleDot,
  Crown,
  Dumbbell,
  Footprints,
  Gamepad2,
  Goal,
  Leaf,
  Target,
  Trophy,
  Volleyball,
  WavesLadder,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { CSSProperties } from 'react';

interface CategoryStyle {
  color: string;
  icon: LucideIcon;
}

const KNOWN: Record<string, CategoryStyle> = {
  tennis: { color: '#4d9a12', icon: CircleDot },
  football: { color: '#138a4b', icon: Goal },
  soccer: { color: '#138a4b', icon: Goal },
  basketball: { color: '#e0640f', icon: Trophy },
  volleyball: { color: '#0a88a8', icon: Volleyball },
  padel: { color: '#6d3fd8', icon: Target },
  'table tennis': { color: '#d02f79', icon: CircleDot },
  swimming: { color: '#0b75c9', icon: WavesLadder },
  fitness: { color: '#d33a2c', icon: Dumbbell },
  aerobics: { color: '#d33a2c', icon: Dumbbell },
  hiit: { color: '#e0640f', icon: Zap },
  'dance fitness': { color: '#d02f79', icon: Zap },
  yoga: { color: '#8a3fc7', icon: Leaf },
  running: { color: '#d98200', icon: Footprints },
  chess: { color: '#475569', icon: Crown },
  'e-sports': { color: '#4f46e5', icon: Gamepad2 },
  esports: { color: '#4f46e5', icon: Gamepad2 },
};

const FALLBACK_COLORS = ['#2456e6', '#0f8a7e', '#b4468d', '#9a6b00', '#5b51d8', '#c2410c', '#0e7490'];

export function categoryStyle(category: string): CategoryStyle {
  const key = category.trim().toLowerCase();
  const known = KNOWN[key];
  if (known) return known;
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return { color: FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length], icon: Zap };
}

export function categoryVars(category: string): CSSProperties {
  return { '--cat': categoryStyle(category).color } as CSSProperties;
}

export function CategoryPill({ category }: { category: string }) {
  const { icon: Icon } = categoryStyle(category);
  return (
    <span className="category-pill" style={categoryVars(category)}>
      <span className="cat-icon" aria-hidden>
        <Icon size={12} strokeWidth={2.5} />
      </span>
      {category}
    </span>
  );
}

export function CategoryAvatar({ category, size = 40 }: { category: string; size?: number }) {
  const { icon: Icon } = categoryStyle(category);
  return (
    <span className="cat-avatar" style={{ ...categoryVars(category), width: size, height: size }} aria-hidden>
      <Icon size={Math.round(size * 0.5)} strokeWidth={2.2} />
    </span>
  );
}
