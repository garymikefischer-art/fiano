import { useEffect, useRef } from 'react';
import { createLutGl, loadCubeFile, type LutGl } from '../lib/lutWebgl';

/**
 * Canvas-Overlay über einem `<video>`-Element das jedes Frame durch eine 3D-LUT shaded.
 *
 * Workflow:
 *  - Mount → lädt .cube-Datei via IPC, init WebGL2-Context, startet RAF-Loop.
 *  - RAF-Tick → liest aktuelles video-frame, uploaded zu Texture, render mit LUT.
 *  - Wenn lutPath wechselt → lädt neue LUT, setzt sie im gl-Context (kein re-init).
 *  - Unmount → cleanup.
 *
 * Caller sollte das `<video>` selbst auf `opacity: 0` oder `visibility: hidden` setzen
 * wenn LutOverlay aktiv ist, sodass nur die LUT-Version sichtbar ist. Audio läuft am video-element.
 */
export function LutVideoOverlay({
  videoRef, lutPath, style,
}: {
  videoRef: React.RefObject<HTMLVideoElement>;
  lutPath: string;
  style?: React.CSSProperties;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<LutGl | null>(null);
  const rafRef = useRef<number>(0);

  // (Re)init when path changes — alte LUT entladen, neue laden.
  useEffect(() => {
    let cancelled = false;
    let rafId = 0;

    (async () => {
      const lut = await loadCubeFile(lutPath);
      if (cancelled || !lut || !canvasRef.current) return;

      // Wenn schon ein GL-Context existiert, nur LUT-Texture neu laden (cheaper)
      if (glRef.current) {
        glRef.current.setLut(lut);
        return;
      }

      const gl = createLutGl(canvasRef.current, lut);
      if (cancelled || !gl) return;
      glRef.current = gl;

      const tick = () => {
        const video = videoRef.current;
        if (video && !video.paused && video.readyState >= 2) {
          gl.drawFrame(video);
        } else if (video && video.readyState >= 2) {
          // Auch bei pause einmalig zeichnen damit current frame aktuell bleibt
          gl.drawFrame(video);
        }
        rafId = requestAnimationFrame(tick);
        rafRef.current = rafId;
      };
      tick();
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      glRef.current?.dispose();
      glRef.current = null;
    };
  }, [lutPath, videoRef]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full object-contain pointer-events-none"
      style={style}
    />
  );
}
