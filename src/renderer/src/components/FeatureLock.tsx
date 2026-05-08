/**
 * FeatureLock — Wrapper-Component der UI-Elemente sperrt wenn der User
 * den passenden Plan nicht hat. Zwei Varianten:
 *
 *   <FeatureLock featureId="ai_subject_mask">
 *     <BigButton>...</BigButton>
 *   </FeatureLock>
 *
 *   <FeatureLockInline featureId="podcast_highlights">
 *     <PickerOption>...</PickerOption>
 *   </FeatureLockInline>
 *
 * - "Default" rendert greyed-out + Schloss-Overlay zentriert.
 * - "Inline" rendert greyed-out + kleines Schloss in der Ecke.
 *
 * Beide blockieren onClick-Events der Children und öffnen stattdessen das
 * globale UpgradeModal via Store.
 */

import type { ReactNode } from 'react';
import clsx from 'clsx';
import { useFeature, type FeatureId } from '../lib/features';
import { useUpgradeModal } from '../stores/upgradeModalStore';

interface BaseProps {
  featureId: FeatureId;
  children: ReactNode;
  /** Optional: Lock erzwingen (für Tests/Debug). */
  forceLocked?: boolean;
}

interface FeatureLockProps extends BaseProps {
  /** Tailwind-Klassen für den Wrapper. */
  className?: string;
}

/** Default-Variante mit zentriertem Schloss-Overlay. */
export function FeatureLock({ featureId, children, forceLocked, className }: FeatureLockProps) {
  const { unlocked } = useFeature(featureId);
  const open = useUpgradeModal((s) => s.open);

  const isLocked = forceLocked || !unlocked;

  if (!isLocked) return <>{children}</>;

  return (
    <div className={clsx('relative group', className)}>
      {/* Children grey-out + non-interaktiv */}
      <div
        className="opacity-40 pointer-events-none select-none filter grayscale-[0.4]"
        aria-hidden="true"
      >
        {children}
      </div>

      {/* Click-Catcher + Overlay */}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          open(featureId);
        }}
        className="absolute inset-0 flex items-center justify-center cursor-pointer rounded-[inherit] bg-black/30 hover:bg-black/40 transition-colors"
        aria-label="Locked feature — upgrade required"
      >
        <span className="flex items-center justify-center w-10 h-10 rounded-full bg-fiano-red/20 border border-fiano-red/40 shadow-[0_0_18px_rgba(255,16,57,0.35)] group-hover:scale-110 transition-transform">
          <LockIcon className="w-4 h-4 text-fiano-red" />
        </span>
      </button>
    </div>
  );
}

/** Inline-Variante mit kleinem Schloss-Badge oben rechts (für Picker-Options, Toggle-Rows). */
export function FeatureLockInline({ featureId, children, forceLocked, className }: FeatureLockProps) {
  const { unlocked } = useFeature(featureId);
  const open = useUpgradeModal((s) => s.open);

  const isLocked = forceLocked || !unlocked;

  if (!isLocked) return <>{children}</>;

  return (
    <div
      className={clsx('relative', className)}
      onClickCapture={(e) => {
        e.preventDefault();
        e.stopPropagation();
        open(featureId);
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open(featureId);
        }
      }}
      aria-label="Locked feature — upgrade required"
    >
      <div
        className="opacity-50 pointer-events-none select-none"
        aria-hidden="true"
      >
        {children}
      </div>
      <span className="absolute top-1.5 right-1.5 flex items-center justify-center w-5 h-5 rounded-full bg-fiano-red/85 shadow-[0_0_10px_rgba(255,16,57,0.5)] pointer-events-none">
        <LockIcon className="w-2.5 h-2.5 text-white" />
      </span>
    </div>
  );
}

/** Inline-SVG Schloss — keine Icon-Lib im Projekt, daher hier definiert. */
function LockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

/**
 * Standalone Schloss-Badge für Inline-Hints in Toggle-Rows, Sidebar-Items,
 * Settings-Felder etc. Zeigt nur den visuellen Indikator — Click-Logik
 * liegt beim Caller.
 */
export function LockBadge() {
  return (
    <span
      className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-fiano-red/15 border border-fiano-red/40 text-fiano-red"
      aria-label="Locked feature"
    >
      <LockIcon className="w-2.5 h-2.5" />
    </span>
  );
}
