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
    <div className="flex items-center gap-1 px-2 [-webkit-app-region:no-drag]">
      <CtrlButton onClick={minimize} title="Minimize">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <line x1="3" y1="7" x2="11" y2="7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </CtrlButton>
      <CtrlButton onClick={toggle} title={maximized ? 'Restore' : 'Maximize'}>
        {maximized ? (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="4" y="2.5" width="7.5" height="7.5" rx="1.4" stroke="currentColor" strokeWidth="1.3" />
            <rect x="2.5" y="4" width="7.5" height="7.5" rx="1.4" stroke="currentColor" strokeWidth="1.3" fill="#0d0f10" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="3" y="3" width="8" height="8" rx="1.6" stroke="currentColor" strokeWidth="1.3" />
          </svg>
        )}
      </CtrlButton>
      <CtrlButton onClick={close} title="Close" closeBtn>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <line x1="3.5" y1="3.5" x2="10.5" y2="10.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <line x1="10.5" y1="3.5" x2="3.5" y2="10.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
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
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  closeBtn?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={[
        'flex items-center justify-center w-7 h-7 rounded-md transition-colors',
        'text-white/55',
        closeBtn
          ? 'hover:bg-fiano-red hover:text-white'
          : 'hover:bg-white/10 hover:text-white',
        '[-webkit-app-region:no-drag]',
      ].join(' ')}
    >
      {children}
    </button>
  );
}
