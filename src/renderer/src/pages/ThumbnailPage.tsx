import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { useApp } from '../stores/appStore';
import { mediaUrl } from '../lib/mediaUrl';
import { TopBarActions } from '../components/TopBarActions';
import { useT } from '../lib/i18n';

type Game = 'fortnite' | 'warzone' | 'valorant' | 'cs2' | 'minecraft' | 'gta' | 'lol';

interface FormFields {
  background: string;
  effects: string;
  weaponsSkins: string;
}

/** Game-Kategorien für das UI-Picker. Shooter zuerst (häufigster Use-Case), dann Other. */
const GAME_CATEGORIES: Array<{ label: string; games: Game[] }> = [
  { label: 'Shooter', games: ['warzone', 'valorant', 'cs2', 'fortnite'] },
  { label: 'Other',   games: ['minecraft', 'gta', 'lol'] },
];

const GAME_LABELS: Record<Game, string> = {
  fortnite: 'Fortnite',
  warzone: 'Warzone',
  valorant: 'Valorant',
  cs2: 'CS2',
  minecraft: 'Minecraft',
  gta: 'GTA',
  lol: 'LoL',
};

/** Field-Placeholders pro Spiel — relevante Beispiele für besseres Prompting. */
const FIELD_PLACEHOLDERS: Record<Game, FormFields> = {
  warzone:   { background: 'Verdansk Hospital, smoke grenade, green gas',  effects: 'sunlight + toxic green glow, debris, gunfire', weaponsSkins: 'AK-47 with skin in hand' },
  fortnite:  { background: 'Painted Palms, desert buildings, yellow gas',  effects: 'stink bomb explosion, debris, neon glow',     weaponsSkins: 'Storm Scout Rifle' },
  valorant:  { background: 'Haven map Heaven, ability burst, particles',   effects: 'teal ability glow, sparks, volumetric light', weaponsSkins: 'Glowing Sage ability orb' },
  cs2:       { background: 'Mirage A-site, smoke + muzzle flash',          effects: 'dark contrast, sparks, dust',                 weaponsSkins: 'Deagle / AWP Dragon Lore' },
  minecraft: { background: 'Vibrant biome, lush shaders, giant Ender Dragon', effects: 'blocky particles, exaggerated emotions',   weaponsSkins: 'Diamond sword, enchanted glow' },
  gta:       { background: 'Los Santos at night, police chase, neon lights', effects: 'police lights, money stacks, dramatic',    weaponsSkins: 'Luxury car, gold pistol' },
  lol:       { background: 'Summoner\'s Rift baron pit, ability splashes',  effects: 'cinematic splash art glow, particles',       weaponsSkins: 'Champion ability animation' },
};

/** Common-Suffix für alle prompts — high-CTR-relevante visual elements. */
const VISUAL_DIRECTIVES = `
VISUAL DIRECTIVES (high-CTR):
Face glow, sharp eye highlights with cinematic catchlights, strong rim light, depth of field with weapon/object focus, motion blur on action elements, particles, clean background-subject separation.`;

const PROMPTS: Record<Game, (f: FormFields) => string> = {
  fortnite: (f) => `Create a highly realistic YouTube thumbnail inspired by Fortnite.
Elite operator styled as Siren skin (esport sweat), Fortnite outfit, no helmet. Ultra close-up (Dutch tilt).
Replace face with provided photo.

BACKGROUND: ${f.background || FIELD_PLACEHOLDERS.fortnite.background}
EFFECTS: ${f.effects || FIELD_PLACEHOLDERS.fortnite.effects}
WEAPONS/SKINS: ${f.weaponsSkins || FIELD_PLACEHOLDERS.fortnite.weaponsSkins}

FACE & HAIR (STRICT):
Perfect alignment, head slightly larger (10–15%), hairstyle EXACTLY the same.
FACE DETAILS:
Identity 100%, pores, sweat, strong glow.
EYES: Sharp, cinematic catchlights.
HANDS: Visible, correct anatomy.
${VISUAL_DIRECTIVES}

STYLE:
Ultra-realistic, NO TEXT, thumbnail optimized.`,

  warzone: (f) => `Create a highly realistic YouTube thumbnail inspired by Call of Duty: Warzone (Verdansk).

Elite special forces operator, dark tactical gear, no helmet. Ultra close-up (side angle profile shot), face dominant, slightly off-center, aggressive forward-leaning pose.

Replace face with provided photo.

FACE & HAIR (STRICT):
Perfect alignment, head slightly larger (10–15%), hairstyle EXACTLY the same, no changes, realistic relighting only.

FACE DETAILS:
Identity 100%, natural skin texture, pores, slight dirt + sweat, intense expression, slightly open mouth or clenched teeth.

EYES: Sharp, strong contrast, cinematic catchlights, focused squint.

HANDS: Visible, correct anatomy, natural, slight motion blur.

BACKGROUND: ${f.background || FIELD_PLACEHOLDERS.warzone.background}
EFFECTS: ${f.effects || FIELD_PLACEHOLDERS.warzone.effects}
WEAPONS/SKINS: ${f.weaponsSkins || FIELD_PLACEHOLDERS.warzone.weaponsSkins}
${VISUAL_DIRECTIVES}

STYLE:
Ultra-realistic, high contrast, cinematic, NO TEXT, thumbnail optimized.`,

  valorant: (f) => `Create a highly realistic YouTube thumbnail inspired by Valorant.

Operator styled as Sage agent, Valorant esports tryhard skin, no helmet. Ultra close-up, face dominant, slightly off-center, aggressive forward-leaning pose.

Replace face with provided photo.

FACE & HAIR (STRICT):
Perfect alignment, head slightly larger (10–15%), hairstyle EXACTLY the same, ultra-realistic relighting only.

FACE DETAILS:
Identity 100%, very realistic skin texture, pores, sweat, stronger facial glow, intense expression.

EYES: Sharp, cinematic catchlights, focused squint.

HANDS: Visible, holding glowing ability orb.

BACKGROUND: ${f.background || FIELD_PLACEHOLDERS.valorant.background}
EFFECTS: ${f.effects || FIELD_PLACEHOLDERS.valorant.effects}
WEAPONS/SKINS: ${f.weaponsSkins || FIELD_PLACEHOLDERS.valorant.weaponsSkins}
${VISUAL_DIRECTIVES}

STYLE:
Ultra-realistic, strong glow on face, NO TEXT, thumbnail optimized.`,

  cs2: (f) => `Create a highly realistic YouTube thumbnail inspired by Counter-Strike 2.

Pro player operator, T-side or CT-side outfit, focused tactical pose. Ultra close-up, face dominant, intense aiming expression.

Replace face with provided photo.

FACE & HAIR (STRICT):
Perfect alignment, head slightly larger (10–15%), hairstyle EXACTLY the same.

FACE DETAILS:
Identity 100%, realistic skin, sweat, focused stare, slight tension in jaw.

EYES: Sharp, intense, narrow focus.

HANDS: Visible, gripping weapon with correct anatomy.

BACKGROUND: ${f.background || FIELD_PLACEHOLDERS.cs2.background}
EFFECTS: ${f.effects || FIELD_PLACEHOLDERS.cs2.effects}
WEAPONS/SKINS: ${f.weaponsSkins || FIELD_PLACEHOLDERS.cs2.weaponsSkins}
${VISUAL_DIRECTIVES}

STYLE:
Ultra-realistic, dark contrast, smoke + muzzle flash, cinematic pro-player look, NO TEXT, thumbnail optimized.`,

  minecraft: (f) => `Create a vibrant cinematic YouTube thumbnail inspired by Minecraft.

Player character with exaggerated emotional expression (shock / triumph / fear). Ultra close-up portrait blending realistic facial features with stylized Minecraft world.

Replace face with provided photo.

FACE & HAIR (STRICT):
Perfect alignment, head slightly larger (10–15%), hairstyle EXACTLY the same.

FACE DETAILS:
Identity 100%, vibrant lighting, exaggerated emotion, mouth open in shock or wide grin.

EYES: Bright, large, dramatic.

HANDS: Visible, holding diamond pickaxe / sword / enchanted item.

BACKGROUND: ${f.background || FIELD_PLACEHOLDERS.minecraft.background}
EFFECTS: ${f.effects || FIELD_PLACEHOLDERS.minecraft.effects}
WEAPONS/SKINS: ${f.weaponsSkins || FIELD_PLACEHOLDERS.minecraft.weaponsSkins}
${VISUAL_DIRECTIVES}

STYLE:
Vibrant colors, exaggerated emotions, shaders, giant mobs, cinematic survival scene, NO TEXT, thumbnail optimized.`,

  gta: (f) => `Create a cinematic YouTube thumbnail inspired by Grand Theft Auto V (GTA RP style).

Stylish character with dramatic expression (shock, anger, smug). Los Santos atmosphere — neon city, dramatic lighting. Ultra close-up.

Replace face with provided photo.

FACE & HAIR (STRICT):
Perfect alignment, head slightly larger (10–15%), hairstyle EXACTLY the same.

FACE DETAILS:
Identity 100%, realistic skin, dramatic expression, sweat or tension.

EYES: Sharp, intense, cinematic catchlights.

HANDS: Visible, holding gold pistol / cash / steering wheel.

BACKGROUND: ${f.background || FIELD_PLACEHOLDERS.gta.background}
EFFECTS: ${f.effects || FIELD_PLACEHOLDERS.gta.effects}
WEAPONS/SKINS: ${f.weaponsSkins || FIELD_PLACEHOLDERS.gta.weaponsSkins}
${VISUAL_DIRECTIVES}

STYLE:
Cinematic realism, police lights, money stacks, dramatic expressions, luxury cars, NO TEXT, thumbnail optimized.`,

  lol: (f) => `Create a cinematic YouTube thumbnail inspired by League of Legends (splash-art style).

Champion-styled portrait blending splash-art aesthetic with realistic features. Dramatic expression of focus or victory. Ultra close-up.

Replace face with provided photo.

FACE & HAIR (STRICT):
Perfect alignment, head slightly larger (10–15%), hairstyle EXACTLY the same.

FACE DETAILS:
Identity 100%, splash-art-style highlights, magical glow on face.

EYES: Glowing, intense, magical catchlights.

HANDS: Visible, channeling ability / holding weapon.

BACKGROUND: ${f.background || FIELD_PLACEHOLDERS.lol.background}
EFFECTS: ${f.effects || FIELD_PLACEHOLDERS.lol.effects}
WEAPONS/SKINS: ${f.weaponsSkins || FIELD_PLACEHOLDERS.lol.weaponsSkins}
${VISUAL_DIRECTIVES}

STYLE:
Cinematic splash-art realism, magical glow, ability particles, dramatic lighting, NO TEXT, thumbnail optimized.`,
};

export function ThumbnailPage() {
  const {
    hasGeminiKey, refreshGeminiKey, generateThumbnail, exportThumbnail,
    pickImageFile, listThumbnails, deleteThumbnail,
  } = useApp();

  const [game, setGame] = useState<Game>('fortnite');
  const [fields, setFields] = useState<FormFields>({ background: '', effects: '', weaponsSkins: '' });
  const [referencePath, setReferencePath] = useState<string | null>(null);
  const [resultPath, setResultPath] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<Array<{ path: string; mtime: number; size: number }>>([]);
  const t = useT();

  const refreshHistory = async () => {
    setHistory(await listThumbnails());
  };

  useEffect(() => {
    refreshGeminiKey();
    refreshHistory();
  }, [refreshGeminiKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const onPickReference = async () => {
    const p = await pickImageFile();
    if (p) setReferencePath(p);
  };

  const fileToBase64 = async (path: string): Promise<{ base64: string; mime: string }> => {
    // Direkter IPC-Read — keine fetch(media://) mehr, robuster bei Sonderzeichen im Pfad
    const r = await window.api.invoke<{ base64: string; mime: string; size: number }>(
      'file.readAsBase64',
      { path },
    );
    if (!r.ok || !r.data) {
      throw new Error(`Could not read reference image: ${r.error ?? 'unknown error'}`);
    }
    return { base64: r.data.base64, mime: r.data.mime };
  };

  const onGenerate = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setResultPath(null);
    try {
      let refB64: string | undefined;
      let refMime: string | undefined;
      if (referencePath) {
        const r = await fileToBase64(referencePath);
        refB64 = r.base64;
        refMime = r.mime;
      }
      const prompt = PROMPTS[game](fields);
      const path = await generateThumbnail(prompt, refB64, refMime);
      if (path) {
        setResultPath(path);
        await refreshHistory();
      } else {
        setError(t('thumbnail.generationFailed'));
      }
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const onDeleteFromHistory = async (path: string) => {
    await deleteThumbnail(path);
    if (resultPath === path) setResultPath(null);
    await refreshHistory();
  };

  const onDownload = async () => {
    if (!resultPath) return;
    await exportThumbnail(resultPath, `thumbnail-${game}-${Date.now()}.png`);
  };

  if (!hasGeminiKey) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="p-8 max-w-2xl mx-auto">
          <h1 className="text-2xl font-semibold mb-2">{t('thumbnail.title')}</h1>
          <p className="text-sm text-zinc-500 mb-5">{t('thumbnail.intro')}</p>
          <div className="bg-amber-950/30 border border-amber-900/50 rounded-lg p-5">
            <div className="text-sm font-medium text-amber-200 mb-2">{t('thumbnail.keyRequiredTitle')}</div>
            <p className="text-xs text-amber-100/80">
              {t('thumbnail.keyRequiredHintPre')} <span className="text-amber-50 font-medium">{t('thumbnail.keyRequiredHintSettings')}</span> {t('thumbnail.keyRequiredHintMid')} <span className="font-mono text-zinc-300">aistudio.google.com/app/apikey</span>.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-fiano-black">
      {/* Top Bar */}
      <header className="relative shrink-0">
        <div className="flex items-center justify-between gap-6 px-8 py-4">
          <div>
            <h1 className="text-[20px] font-semibold tracking-tight">{t('thumbnail.title')}</h1>
            <p className="text-[11px] text-zinc-500 mt-0.5">{t('thumbnail.subtitle')}</p>
          </div>
          <TopBarActions searchPlaceholder={t('thumbnail.searchPlaceholder')} />
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="p-8 max-w-5xl mx-auto pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* LEFT: Form — sticky damit's beim Scroll der History rechts sichtbar bleibt */}
          <div className="space-y-5 lg:sticky lg:top-0 lg:self-start">
            <section className="glass p-5 space-y-2">
              <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-zinc-500">{t('thumbnail.gameLabel')}</div>
              {/* Eine Zeile, horizontal scrollbar — alle Spiele aller Kategorien gemerged.
                  Scroll-Snap für nice UX, fade-mask an den Rändern. */}
              <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 snap-x snap-mandatory scrollbar-thin">
                {GAME_CATEGORIES.flatMap((cat) => cat.games).map((g) => (
                  <button
                    key={g}
                    onClick={() => setGame(g)}
                    className={clsx(
                      'shrink-0 snap-start text-[11px] px-3 py-1.5 rounded-md font-medium transition-all border',
                      game === g
                        ? 'bg-fiano-red/15 border-fiano-red/45 text-white shadow-[0_0_12px_rgba(255,16,57,0.18)]'
                        : 'bg-white/[0.04] border-white/[0.06] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]',
                    )}
                  >
                    {GAME_LABELS[g]}
                  </button>
                ))}
              </div>
            </section>

            <section className="glass p-5 space-y-3">
              <FormField
                label={t('thumbnail.fieldBackground')}
                placeholder={FIELD_PLACEHOLDERS[game].background}
                value={fields.background}
                onChange={(v) => setFields((s) => ({ ...s, background: v }))}
              />
              <FormField
                label={t('thumbnail.fieldEffects')}
                placeholder={FIELD_PLACEHOLDERS[game].effects}
                value={fields.effects}
                onChange={(v) => setFields((s) => ({ ...s, effects: v }))}
              />
              <FormField
                label={t('thumbnail.fieldWeapons')}
                placeholder={FIELD_PLACEHOLDERS[game].weaponsSkins}
                value={fields.weaponsSkins}
                onChange={(v) => setFields((s) => ({ ...s, weaponsSkins: v }))}
              />
            </section>

            <section className="glass p-5">
              <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-zinc-500 mb-2">{t('thumbnail.refPhotoLabel')}</div>
              {referencePath ? (
                <div className="flex items-center gap-3 bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
                  <img src={mediaUrl(referencePath)} className="w-14 h-14 object-cover rounded-lg ring-1 ring-white/[0.08]" alt="" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] text-zinc-200 truncate font-medium">{referencePath.split('/').pop()}</div>
                    <div className="text-[10px] text-zinc-500">{t('thumbnail.refReplaceHint')}</div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <button onClick={onPickReference} className="text-[10px] text-zinc-400 hover:text-white px-2 py-1 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] rounded transition">{t('thumbnail.refReplace')}</button>
                    <button onClick={() => setReferencePath(null)} className="text-[10px] text-red-400 hover:text-red-300 px-2 py-1 bg-white/[0.04] hover:bg-red-500/10 border border-white/[0.06] hover:border-red-500/30 rounded transition">{t('thumbnail.refRemove')}</button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={onPickReference}
                  className="w-full border border-dashed border-white/[0.1] hover:border-fiano-red/50 hover:bg-fiano-red/[0.03] rounded-xl p-6 text-center transition-all group"
                >
                  <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center group-hover:bg-fiano-red/10 group-hover:border-fiano-red/40 transition-colors">
                    <svg viewBox="0 0 24 24" className="w-4 h-4 text-zinc-500 group-hover:text-fiano-red transition-colors" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="6" width="18" height="14" rx="2" />
                      <circle cx="12" cy="13" r="3.5" />
                      <path d="M9 6l1.5-2h3L15 6" />
                    </svg>
                  </div>
                  <div className="text-[12px] font-semibold text-zinc-200">{t('thumbnail.refChoose')}</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">{t('thumbnail.refChooseHint')}</div>
                </button>
              )}
            </section>

            <button
              onClick={onGenerate}
              disabled={busy}
              className="w-full bg-fiano-red text-white py-3 rounded-xl font-semibold text-[13px]
                         hover:brightness-110 hover:shadow-[0_0_28px_rgba(255,16,57,0.45)]
                         active:scale-[0.99] disabled:opacity-50 transition-all
                         flex items-center justify-center gap-2"
            >
              {busy ? (
                <>
                  <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M8 1.5a6.5 6.5 0 1 1-6.5 6.5" />
                  </svg>
                  {t('thumbnail.generating')}
                </>
              ) : (
                <>
                  <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor">
                    <path d="M8 2l1.2 3 3 1.2-3 1.2L8 10l-1.2-3L4 6 6.8 4.8z" />
                  </svg>
                  {t('thumbnail.generate')}
                </>
              )}
            </button>
            {error && (
              <div className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                {error}
              </div>
            )}
          </div>

          {/* RIGHT: Result + History */}
          <div className="space-y-4">
            <div className="glass p-4">
              <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-zinc-500 mb-3">{t('thumbnail.resultLabel')}</div>
              <div className="aspect-video bg-black/40 rounded-lg flex items-center justify-center overflow-hidden ring-1 ring-white/[0.06]">
                {resultPath ? (
                  <img src={mediaUrl(resultPath)} className="w-full h-full object-contain" alt="thumbnail" />
                ) : busy ? (
                  <div className="text-zinc-500 text-[11px] animate-pulse">{t('thumbnail.generating')}</div>
                ) : (
                  <div className="text-zinc-700 text-[11px]">{t('thumbnail.resultPlaceholder')}</div>
                )}
              </div>
              {resultPath && (
                <div className="flex gap-2 mt-3">
                  <button onClick={onDownload} className="flex-1 text-[11px] font-semibold bg-fiano-red text-white py-2 rounded-lg hover:brightness-110 hover:shadow-[0_0_16px_rgba(255,16,57,0.4)] active:scale-[0.98] transition-all">
                    ⤓ {t('thumbnail.download')}
                  </button>
                  <button onClick={onGenerate} disabled={busy} className="flex-1 text-[11px] font-medium bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] hover:border-white/[0.12] py-2 rounded-lg transition disabled:opacity-40">
                    🔄 {t('thumbnail.regenerate')}
                  </button>
                </div>
              )}
            </div>

            {/* HISTORY */}
            <div className="glass p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-zinc-500">{t('thumbnail.historyLabel')} · {history.length}</div>
                <button
                  onClick={refreshHistory}
                  className="text-[10px] text-zinc-500 hover:text-white transition"
                  title={t('thumbnail.refresh')}
                >
                  ↻ {t('thumbnail.refresh')}
                </button>
              </div>
              {history.length === 0 ? (
                <div className="text-[11px] text-zinc-600 italic">
                  {t('thumbnail.historyEmpty')}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 max-h-[480px] overflow-y-auto">
                  {history.map((item) => (
                    <div key={item.path} className="relative group">
                      <button
                        onClick={() => setResultPath(item.path)}
                        className={clsx(
                          'w-full aspect-video bg-black/40 rounded-lg overflow-hidden ring-1 transition-all',
                          resultPath === item.path
                            ? 'ring-fiano-red shadow-[0_0_18px_rgba(255,16,57,0.3)]'
                            : 'ring-white/[0.06] hover:ring-white/[0.16]',
                        )}
                        title={`${new Date(item.mtime).toLocaleString()} · ${(item.size / 1024).toFixed(0)} KB`}
                      >
                        <img src={mediaUrl(item.path)} className="w-full h-full object-cover" alt="" />
                      </button>
                      <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                        <button
                          onClick={(e) => { e.stopPropagation(); exportThumbnail(item.path, `thumbnail-${item.mtime}.png`); }}
                          className="bg-black/80 hover:bg-black text-white text-[10px] px-1.5 py-0.5 rounded backdrop-blur-sm"
                          title={t('thumbnail.download')}
                        >⤓</button>
                        <button
                          onClick={(e) => { e.stopPropagation(); onDeleteFromHistory(item.path); }}
                          className="bg-fiano-red/90 hover:bg-fiano-red text-white text-[10px] px-1.5 py-0.5 rounded backdrop-blur-sm"
                          title={t('thumbnail.delete')}
                        >×</button>
                      </div>
                      <div className="text-[9px] text-zinc-600 mt-1 truncate font-mono">
                        {new Date(item.mtime).toLocaleDateString()} {new Date(item.mtime).toLocaleTimeString().slice(0, 5)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}

function FormField({
  label, placeholder, value, onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-[9px] font-semibold uppercase tracking-[0.16em] text-zinc-500 mb-1.5 block">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-[12px] text-zinc-200 placeholder:text-zinc-600
                   focus:outline-none focus:bg-white/[0.06] focus:border-fiano-red/40 transition-colors"
      />
    </div>
  );
}
