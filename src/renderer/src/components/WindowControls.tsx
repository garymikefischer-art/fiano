import { useEffect, useState } from 'react';

/**
 * Custom Window-Controls für Windows/Linux (frameless window).
 * Auf macOS rendern wir nichts — System-Traffic-Lights sind via
 * `titleBarStyle: 'hiddenInset'` schon links eingebettet.
 *
 * Layout: kompakt (28px hoch), moderne minimalistische Icons,
 * Close-Hover = fiano-Rot, andere Hover = subtiles weißes Glow.
 * Buttons sind als no-drag markiert, der umgebende Container wird
 * von Sidebar als drag-region genutzt.
 */
export function WindowControls() {
  const platform = window.api.platform;
  const isMac = platform === 'darwin';
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (isMac) return;
    let mounted = true;
    window.api.windowControls.isMaximized().then((m) => {
      if (mounted) setMaximized(m);
    });
    const off = window.api.windowControls.onMaximizeChange((m) => {
      if (mounted) setMaximized(m);
    });
    return () => {
      mounted = false;
      off();
    };
  }, [isMac]);

  if (isMac) return null;

  const minimize = () => window.api.windowControls.minimize();
  const toggle = () => window.api.windowControls.toggleMaximize();
  const close = () => window.api.windowControls.close();

  return (
    // Pill-Container: subtiler Glass-Look, gruppiert die 3 Buttons als zusammenhängenden
    // Block. Gibt der Top-Bar visuelles Anker-Element statt frei schwebenden Icons.
    <div
      className="flex items-center ml-2 rounded-lg bg-white/[0.035] border border-white/[0.07]
                 backdrop-blur-md shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]
                 [-webkit-app-region:no-drag]"
    >
      <CtrlButton onClick={minimize} title="Minimize" position="left">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <line x1="2" y1="5" x2="8" y2="5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      </CtrlButton>
      <span className="w-px h-3 bg-white/[0.08]" aria-hidden />
      <CtrlButton onClick={toggle} title={maximized ? 'Restore' : 'Maximize'} position="middle">
        {maximized ? (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <rect x="2.5" y="1.2" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
            <rect x="1.2" y="2.5" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.2" fill="#0d0f10" />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <rect x="1.7" y="1.7" width="6.6" height="6.6" rx="1.4" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        )}
      </CtrlButton>
      <span className="w-px h-3 bg-white/[0.08]" aria-hidden />
      <CtrlButton onClick={close} title="Close" position="right" closeBtn>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <line x1="2.5" y1="2.5" x2="7.5" y2="7.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          <line x1="7.5" y1="2.5" x2="2.5" y2="7.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      </CtrlButton>
    </div>
  );
}

function CtrlButton({
  onClick,
  title,
  children,
  closeBtn,
  position,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  closeBtn?: boolean;
  position?: 'left' | 'middle' | 'right';
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={[
        'flex items-center justify-center w-7 h-6 transition-colors',
        'text-white/60',
        position === 'left' ? 'rounded-l-lg' : position === 'right' ? 'rounded-r-lg' : '',
        closeBtn
          ? 'hover:bg-fiano-red hover:text-white'
          : 'hover:bg-white/[0.10] hover:text-white',
        '[-webkit-app-region:no-drag]',
      ].join(' ')}
    >
      {children}
    </button>
  );
}
