import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { useApp } from '../stores/appStore';
import { mediaUrl } from '../lib/mediaUrl';
import { TopBarActions } from '../components/TopBarActions';
import { useT } from '../lib/i18n';

/**
 * Genre-IDs sind generisch und referenzieren KEINE eingetragenen Marken.
 * Phase 6.4: Spielnamen wurden durch Genre-Beschreibungen ersetzt — User kann
 * über das Custom-Genre-Feld einen eigenen Spielnamen tippen, dann übernimmt er
 * selbst die markenrechtliche Verantwortung für die Eingabe.
 */
type Genre =
  | 'custom'
  | 'battle_royale'
  | 'modern_combat'
  | 'tactical_shooter'
  | 'competitive_fps'
  | 'blocky_sandbox'
  | 'open_world_crime'
  | 'moba';

/**
 * Style-Variante innerhalb des Custom-Modes:
 *  - 'default'   = User tippt eigenen Spielnamen + freie Felder (Standard)
 *  - 'comic'     = Hartkodierter Comic-Stil-Prompt (Fortnite-Reference, mit Markennamen)
 *  - 'realistic' = Hartkodierter Realistic-Stil-Prompt (Warzone-Reference, mit Markennamen)
 * User trägt mit der Auswahl die markenrechtliche Verantwortung — Disclaimer
 * im UI + Lizenzen-Page.
 */
type CustomStyle = 'default' | 'comic' | 'realistic';

interface FormFields {
  background: string;
  effects: string;
  weaponsSkins: string;
  /** Frei eingegebener Spielname/Genre für 'custom' + 'default' style. */
  customGameName: string;
  /** Style-Preset für Custom-Mode. */
  customStyle: CustomStyle;
}

const GENRE_CATEGORIES: Array<{ labelKey: string; genres: Genre[] }> = [
  // Custom-Game zuerst — User-Input-Modus mit Style-Dropdown.
  { labelKey: 'thumbnail.genreCatShooter', genres: ['custom', 'battle_royale', 'modern_combat', 'tactical_shooter', 'competitive_fps'] },
  { labelKey: 'thumbnail.genreCatOther',   genres: ['blocky_sandbox', 'open_world_crime', 'moba'] },
];

/** Genre-Label kommt aus i18n — siehe i18n-Files: thumbnail.genre.<id> */
const GENRE_LABEL_KEY: Record<Genre, string> = {
  custom:           'thumbnail.genre.custom',
  battle_royale:    'thumbnail.genre.battle_royale',
  modern_combat:    'thumbnail.genre.modern_combat',
  tactical_shooter: 'thumbnail.genre.tactical_shooter',
  competitive_fps:  'thumbnail.genre.competitive_fps',
  blocky_sandbox:   'thumbnail.genre.blocky_sandbox',
  open_world_crime: 'thumbnail.genre.open_world_crime',
  moba:             'thumbnail.genre.moba',
};

/** Field-Placeholders pro Genre — orientiert am Fortnite-Reference des Users. */
const FIELD_PLACEHOLDERS: Record<Genre, Omit<FormFields, 'customGameName' | 'customStyle'>> = {
  custom:           { background: 'daylight, describe the scene, depth of field',                                                          effects: 'Strong rim light, [color] glow, volumetric gas, cinematic',        weaponsSkins: 'objects in hand / weapons' },
  battle_royale:    { background: 'daylight, desert buildings, stink bomb explosion, yellow gas clouds spreading, debris, depth of field', effects: 'Strong rim light, toxic yellow glow, volumetric gas, cinematic', weaponsSkins: 'futuristic rifle with skin' },
  modern_combat:    { background: 'daylight, war-torn urban hospital, smoke grenade, green gas clouds spreading, debris, depth of field', effects: 'Strong rim light, toxic green glow, volumetric smoke, cinematic', weaponsSkins: 'tactical assault rifle in hand' },
  tactical_shooter: { background: 'daylight, sci-fi map control point, ability burst, particles, depth of field',                          effects: 'Strong rim light, teal ability glow, volumetric light, cinematic', weaponsSkins: 'glowing ability orb' },
  competitive_fps:  { background: 'daylight, desert site, smoke + muzzle flash, debris, depth of field',                                   effects: 'Strong rim light, dark contrast, sparks, dust, cinematic',         weaponsSkins: 'iconic sniper rifle / pistol' },
  blocky_sandbox:   { background: 'daylight, vibrant biome, lush shaders, giant pixel-style boss, depth of field',                         effects: 'Strong rim light, blocky particles, vibrant colors, cinematic',    weaponsSkins: 'enchanted sword, glowing pickaxe' },
  open_world_crime: { background: 'neon city at night, police chase, dramatic lighting, depth of field',                                   effects: 'Strong rim light, police lights, money particles, cinematic',      weaponsSkins: 'luxury car, gold pistol' },
  moba:             { background: 'splash-art arena baron pit, ability splashes, depth of field',                                          effects: 'Strong rim light, splash-art glow, particles, cinematic',          weaponsSkins: 'champion ability animation' },
};

/** Hardkodierte Style-Defaults für Custom-Mode (mit Markennamen — User-
 *  bewusste Wahl, Disclaimer wird im UI angezeigt). */
const COMIC_STYLE_DEFAULTS = {
  background:   'Painted Palms, daylight, stink bomb explosion, yellow gas clouds spreading through desert buildings, debris, depth of field.',
  effects:      'Strong rim light, toxic yellow glow, volumetric gas, cinematic.',
  weaponsSkins: 'futuristic rifle with skin',
};
const REALISTIC_STYLE_DEFAULTS = {
  background:   'Verdansk Dam area, daylight, massive water-side explosion, shockwave, spray mist, debris, smoke pillars, bullet tracers, depth of field.',
  effects:      'Strong rim light, sunlight + water reflections, cool shadows, volumetric smoke, particles, high contrast, cinematic.',
  weaponsSkins: 'tactical assault rifle in hand',
};

/**
 * Generische Prompts ohne Markennamen. Format = User-Reference-Prompt
 * (kompakt, kurze Sektionen, "strong glow"/"Sharp"/"Visible"-Wording).
 * User-Eingabefelder (background, effects, weaponsSkins) werden an den
 * passenden Stellen eingesetzt — Custom-Mode lässt zusätzlich den Spielnamen
 * vom User eingeben (Markenrechts-Verantwortung beim User, siehe Legal-Page).
 */
/**
 * Comic-Stil-Prompt: User-Reference EXAKT übernommen (mit Markennamen
 * "Fortnite", "Painted Palms", "Siren skin"). User kann optional einen
 * eigenen Spielnamen eingeben — der ersetzt dann "Fortnite" im "inspired
 * by" + "outfit". Restlicher Prompt funktioniert für ähnliche Battle-Royale-
 * Style-Spiele genauso (Reference-Prompt-Logik des Users).
 */
const COMIC_STYLE_PROMPT = (f: FormFields) => {
  const game = f.customGameName.trim() || 'Fortnite';
  return `Create a highly realistic YouTube thumbnail inspired by ${game}.
Elite operator styled as Siren skin (esport sweat), ${game} outfit, no helmet. Ultra close-up (Dutch tilt).
Replace face with provided photo.
FACE & HAIR (STRICT):
Perfect alignment, head slightly larger (10–15%).
FACE DETAILS:
Identity 100%, pores, sweat, strong glow.
EYES:
Sharp.
HANDS:
Visible.
BACKGROUND:
${f.background || COMIC_STYLE_DEFAULTS.background}
EFFECTS:
${f.effects || COMIC_STYLE_DEFAULTS.effects}
WEAPONS/SKINS:
${f.weaponsSkins || COMIC_STYLE_DEFAULTS.weaponsSkins}
STYLE:
Ultra-realistic, NO TEXT.`;
};

/**
 * Realistic-Stil-Prompt: User-Reference EXAKT übernommen (Default-Spiel
 * "Call of Duty: Warzone (Verdansk)"). User kann optional einen eigenen
 * Spielnamen eingeben (z.B. "PUBG", "Battlefield") — derselbe Prompt
 * funktioniert für ähnliche Military-Shooter genauso. WEAPONS/SKINS wird
 * nur angehängt wenn User das Feld füllt.
 */
const REALISTIC_STYLE_PROMPT = (f: FormFields) => {
  const game = f.customGameName.trim() || 'Call of Duty: Warzone (Verdansk)';
  const weaponsBlock = f.weaponsSkins.trim()
    ? `\nWEAPONS/SKINS:\n${f.weaponsSkins}\n`
    : '';
  return `Create a highly realistic YouTube thumbnail inspired by ${game}.
Elite special forces operator, dark tactical gear, no helmet. Ultra close-up (cinematic action tilt, slight zoom-in), face dominant, slightly off-center, aggressive forward-leaning pose.
Replace face with provided photo.
FACE & HAIR (STRICT):
Perfect alignment, head slightly larger (10–15%), hairstyle EXACTLY the same, no changes, realistic relighting only.
FACE DETAILS:
Identity 100%, natural skin texture, pores, slight dirt + sweat, intense expression, slightly open mouth or clenched teeth.
EYES:
Sharp, strong contrast, cinematic catchlights, focused squint.
HANDS:
Visible, correct anatomy, natural, slight motion blur.
BACKGROUND:
${f.background || REALISTIC_STYLE_DEFAULTS.background}
EFFECTS:
${f.effects || REALISTIC_STYLE_DEFAULTS.effects}
${weaponsBlock}STYLE:
Ultra-realistic, no text`;
};

const PROMPTS: Record<Genre, (f: FormFields) => string> = {
  battle_royale: (f) => `Create a highly realistic YouTube thumbnail in a Battle Royale game style.
Elite operator (esport sweat), Battle Royale outfit, no helmet. Ultra close-up (Dutch tilt).
Replace face with provided photo.
FACE & HAIR (STRICT):
Perfect alignment, head slightly larger (10–15%).
FACE DETAILS:
Identity 100%, pores, sweat, strong glow.
EYES:
Sharp.
HANDS:
Visible.
BACKGROUND:
${f.background || FIELD_PLACEHOLDERS.battle_royale.background}
EFFECTS:
${f.effects || FIELD_PLACEHOLDERS.battle_royale.effects}
WEAPONS/SKINS:
${f.weaponsSkins || FIELD_PLACEHOLDERS.battle_royale.weaponsSkins}
STYLE:
Ultra-realistic, NO TEXT.`,

  modern_combat: (f) => `Create a highly realistic YouTube thumbnail in a Modern Combat / military shooter game style.
Elite special forces operator, tactical gear, no helmet. Ultra close-up.
Replace face with provided photo.
FACE & HAIR (STRICT):
Perfect alignment, head slightly larger (10–15%).
FACE DETAILS:
Identity 100%, pores, sweat, strong glow.
EYES:
Sharp.
HANDS:
Visible.
BACKGROUND:
${f.background || FIELD_PLACEHOLDERS.modern_combat.background}
EFFECTS:
${f.effects || FIELD_PLACEHOLDERS.modern_combat.effects}
WEAPONS/SKINS:
${f.weaponsSkins || FIELD_PLACEHOLDERS.modern_combat.weaponsSkins}
STYLE:
Ultra-realistic, NO TEXT.`,

  tactical_shooter: (f) => `Create a highly realistic YouTube thumbnail in a Tactical Hero Shooter game style.
Hero-shooter agent, sci-fi outfit, no helmet. Ultra close-up.
Replace face with provided photo.
FACE & HAIR (STRICT):
Perfect alignment, head slightly larger (10–15%).
FACE DETAILS:
Identity 100%, pores, sweat, strong glow.
EYES:
Sharp.
HANDS:
Visible.
BACKGROUND:
${f.background || FIELD_PLACEHOLDERS.tactical_shooter.background}
EFFECTS:
${f.effects || FIELD_PLACEHOLDERS.tactical_shooter.effects}
WEAPONS/SKINS:
${f.weaponsSkins || FIELD_PLACEHOLDERS.tactical_shooter.weaponsSkins}
STYLE:
Ultra-realistic, NO TEXT.`,

  competitive_fps: (f) => `Create a highly realistic YouTube thumbnail in a Competitive Tactical FPS game style.
Pro player operator, focused tactical pose. Ultra close-up.
Replace face with provided photo.
FACE & HAIR (STRICT):
Perfect alignment, head slightly larger (10–15%).
FACE DETAILS:
Identity 100%, pores, sweat, strong glow.
EYES:
Sharp.
HANDS:
Visible.
BACKGROUND:
${f.background || FIELD_PLACEHOLDERS.competitive_fps.background}
EFFECTS:
${f.effects || FIELD_PLACEHOLDERS.competitive_fps.effects}
WEAPONS/SKINS:
${f.weaponsSkins || FIELD_PLACEHOLDERS.competitive_fps.weaponsSkins}
STYLE:
Ultra-realistic, NO TEXT.`,

  blocky_sandbox: (f) => `Create a vibrant cinematic YouTube thumbnail in a Blocky Sandbox / pixel-style game.
Player character, exaggerated emotional expression. Ultra close-up.
Replace face with provided photo.
FACE & HAIR (STRICT):
Perfect alignment, head slightly larger (10–15%).
FACE DETAILS:
Identity 100%, vibrant lighting, exaggerated emotion.
EYES:
Bright, large.
HANDS:
Visible.
BACKGROUND:
${f.background || FIELD_PLACEHOLDERS.blocky_sandbox.background}
EFFECTS:
${f.effects || FIELD_PLACEHOLDERS.blocky_sandbox.effects}
WEAPONS/SKINS:
${f.weaponsSkins || FIELD_PLACEHOLDERS.blocky_sandbox.weaponsSkins}
STYLE:
Vibrant colors, exaggerated emotions, NO TEXT.`,

  open_world_crime: (f) => `Create a cinematic YouTube thumbnail in an Open-World Crime / heist game style.
Stylish character, dramatic expression. Ultra close-up.
Replace face with provided photo.
FACE & HAIR (STRICT):
Perfect alignment, head slightly larger (10–15%).
FACE DETAILS:
Identity 100%, pores, sweat, strong glow.
EYES:
Sharp.
HANDS:
Visible.
BACKGROUND:
${f.background || FIELD_PLACEHOLDERS.open_world_crime.background}
EFFECTS:
${f.effects || FIELD_PLACEHOLDERS.open_world_crime.effects}
WEAPONS/SKINS:
${f.weaponsSkins || FIELD_PLACEHOLDERS.open_world_crime.weaponsSkins}
STYLE:
Cinematic realism, NO TEXT.`,

  moba: (f) => `Create a cinematic YouTube thumbnail in a MOBA / splash-art-style game.
Champion-styled portrait blending splash-art aesthetic with realistic features. Ultra close-up.
Replace face with provided photo.
FACE & HAIR (STRICT):
Perfect alignment, head slightly larger (10–15%).
FACE DETAILS:
Identity 100%, splash-art highlights, magical glow.
EYES:
Glowing.
HANDS:
Visible.
BACKGROUND:
${f.background || FIELD_PLACEHOLDERS.moba.background}
EFFECTS:
${f.effects || FIELD_PLACEHOLDERS.moba.effects}
WEAPONS/SKINS:
${f.weaponsSkins || FIELD_PLACEHOLDERS.moba.weaponsSkins}
STYLE:
Cinematic splash-art realism, NO TEXT.`,

  /**
   * Custom-Mode: Style-Dropdown (Default / Comic / Realistic) bestimmt welcher
   * Prompt rendert. Default → User tippt eigenen Spielnamen. Comic/Realistic →
   * Hardcoded-Reference-Prompts mit Markennamen (User-bewusste Wahl mit Disclaimer).
   */
  custom: (f) => {
    if (f.customStyle === 'comic')     return COMIC_STYLE_PROMPT(f);
    if (f.customStyle === 'realistic') return REALISTIC_STYLE_PROMPT(f);
    return `Create a highly realistic YouTube thumbnail inspired by ${f.customGameName || 'a video game of your choice'}.
Stylized character/operator from the game (esport sweat), no helmet. Ultra close-up (Dutch tilt).
Replace face with provided photo.
FACE & HAIR (STRICT):
Perfect alignment, head slightly larger (10–15%).
FACE DETAILS:
Identity 100%, pores, sweat, strong glow.
EYES:
Sharp.
HANDS:
Visible.
BACKGROUND:
${f.background || FIELD_PLACEHOLDERS.custom.background}
EFFECTS:
${f.effects || FIELD_PLACEHOLDERS.custom.effects}
WEAPONS/SKINS:
${f.weaponsSkins || FIELD_PLACEHOLDERS.custom.weaponsSkins}
STYLE:
Ultra-realistic, NO TEXT.`;
  },
};

export function ThumbnailPage() {
  const {
    hasGeminiKey, refreshGeminiKey, generateThumbnail, exportThumbnail,
    pickImageFile, listThumbnails, deleteThumbnail,
  } = useApp();

  const [genre, setGenre] = useState<Genre>('custom');
  const [fields, setFields] = useState<FormFields>({ background: '', effects: '', weaponsSkins: '', customGameName: '', customStyle: 'default' });
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
      const prompt = PROMPTS[genre](fields);
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
    await exportThumbnail(resultPath, `thumbnail-${genre}-${Date.now()}.png`);
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

  const isCustom = genre === 'custom';

  return (
    <div className="relative h-full flex flex-col bg-fiano-black overflow-hidden">
      {/* Background-Gradient (konsistent mit Library/Pricing/Settings) */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
        <div className="fiano-bg-tint" />
        <div className="fiano-bg-glow" />
      </div>

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

      <div className="relative flex-1 overflow-y-auto">
        <div className="p-8 max-w-5xl mx-auto pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <div className="space-y-5 lg:sticky lg:top-0 lg:self-start">
            <section className="glass p-5 space-y-2">
              <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-zinc-500">{t('thumbnail.genreLabel')}</div>
              <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 snap-x snap-mandatory scrollbar-thin">
                {GENRE_CATEGORIES.flatMap((cat) => cat.genres).map((g) => (
                  <button
                    key={g}
                    onClick={() => setGenre(g)}
                    className={clsx(
                      'shrink-0 snap-start text-[11px] px-3 py-1.5 rounded-md font-medium transition-all border whitespace-nowrap',
                      genre === g
                        ? 'bg-fiano-red/15 border-fiano-red/45 text-white shadow-[0_0_12px_rgba(255,16,57,0.18)]'
                        : 'bg-white/[0.04] border-white/[0.06] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]',
                    )}
                  >
                    {t(GENRE_LABEL_KEY[g])}
                  </button>
                ))}
              </div>
              {/* Disclaimer für die generischen Genre-Bezeichnungen */}
              <p className="text-[9px] text-zinc-600 leading-relaxed pt-1">
                {t('thumbnail.genreDisclaimer')}
              </p>
            </section>

            <section className="glass p-5 space-y-3">
              {isCustom && (
                <>
                  {/* Style-Dropdown: Default / Comic / Realistic */}
                  <div>
                    <label className="text-[9px] font-semibold uppercase tracking-[0.16em] text-zinc-500 mb-1.5 block">
                      {t('thumbnail.fieldCustomStyle')}
                    </label>
                    <select
                      value={fields.customStyle}
                      onChange={(e) => setFields((s) => ({ ...s, customStyle: e.target.value as CustomStyle }))}
                      className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-[12px] text-zinc-200
                                 focus:outline-none focus:bg-white/[0.06] focus:border-fiano-red/40 transition-colors"
                    >
                      <option value="default">{t('thumbnail.customStyle.default')}</option>
                      <option value="comic">{t('thumbnail.customStyle.comic')}</option>
                      <option value="realistic">{t('thumbnail.customStyle.realistic')}</option>
                    </select>
                    <div className="text-[9px] text-zinc-600 mt-1 leading-relaxed">
                      {fields.customStyle === 'default'
                        ? t('thumbnail.customStyle.defaultHint')
                        : t('thumbnail.customStyle.presetHint')}
                    </div>
                  </div>
                  {/* Spielname-Eingabe — für alle Custom-Styles sichtbar.
                      Bei Comic/Realistic optional (leer = Reference-Default-Spiel),
                      bei Default required (User muss eigenen Namen tippen). */}
                  <FormField
                    label={t('thumbnail.fieldCustomGame')}
                    placeholder={
                      fields.customStyle === 'comic'     ? t('thumbnail.fieldCustomGamePlaceholderComic') :
                      fields.customStyle === 'realistic' ? t('thumbnail.fieldCustomGamePlaceholderRealistic') :
                      t('thumbnail.fieldCustomGamePlaceholder')
                    }
                    value={fields.customGameName}
                    onChange={(v) => setFields((s) => ({ ...s, customGameName: v }))}
                    hint={t('thumbnail.fieldCustomGameHint')}
                  />
                </>
              )}
              <FormField
                label={t('thumbnail.fieldBackground')}
                placeholder={
                  isCustom && fields.customStyle === 'comic'     ? COMIC_STYLE_DEFAULTS.background :
                  isCustom && fields.customStyle === 'realistic' ? REALISTIC_STYLE_DEFAULTS.background :
                  FIELD_PLACEHOLDERS[genre].background
                }
                value={fields.background}
                onChange={(v) => setFields((s) => ({ ...s, background: v }))}
              />
              <FormField
                label={t('thumbnail.fieldEffects')}
                placeholder={
                  isCustom && fields.customStyle === 'comic'     ? COMIC_STYLE_DEFAULTS.effects :
                  isCustom && fields.customStyle === 'realistic' ? REALISTIC_STYLE_DEFAULTS.effects :
                  FIELD_PLACEHOLDERS[genre].effects
                }
                value={fields.effects}
                onChange={(v) => setFields((s) => ({ ...s, effects: v }))}
              />
              <FormField
                label={t('thumbnail.fieldWeapons')}
                placeholder={
                  isCustom && fields.customStyle === 'comic'     ? COMIC_STYLE_DEFAULTS.weaponsSkins :
                  isCustom && fields.customStyle === 'realistic' ? REALISTIC_STYLE_DEFAULTS.weaponsSkins :
                  FIELD_PLACEHOLDERS[genre].weaponsSkins
                }
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
              disabled={busy || (isCustom && fields.customStyle === 'default' && !fields.customGameName.trim())}
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
  label, placeholder, value, onChange, hint,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
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
      {hint && <div className="text-[9px] text-zinc-600 mt-1 leading-relaxed">{hint}</div>}
    </div>
  );
}
