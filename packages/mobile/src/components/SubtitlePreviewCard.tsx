/**
 * SubtitlePreviewCard — Mini-Vorschau im SubtitleSettingsModal.
 *
 * Wrapper um SubtitleOverlay mit 9:16-Frame als Hintergrund. Settings.enabled
 * wird hier ignoriert (in der Card immer angezeigt) — dafür forced enabled=true
 * im übergebenen settings-Klon. Im Stacked-Preview greift dagegen das echte
 * enabled-Toggle.
 */

import { StyleSheet, Text, View } from 'react-native';
import { SubtitleOverlay } from './SubtitleOverlay';
import type { SubtitleSettings } from '../data/demoProjects';

interface Props {
  settings: SubtitleSettings;
  demoBig?: string;
  demoSmall?: string;
}

export function SubtitlePreviewCard({ settings, demoBig, demoSmall }: Props) {
  // In der Modal-Preview wollen wir den Text auch sehen wenn der User das
  // Subtitle-Feature global aus hat — sonst weiß er nicht wie's aussähe.
  const previewSettings = { ...settings, enabled: true };
  return (
    <View style={styles.card}>
      <View style={styles.frame}>
        <SubtitleOverlay
          settings={previewSettings}
          demoBig={demoBig}
          demoSmall={demoSmall}
        />
      </View>
      <Text style={styles.note}>
        ⓘ Preview zeigt ~80% der Effekte. Gradient/Metallic kommen beim Export.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 8,
  },
  frame: {
    aspectRatio: 9 / 16,
    width: '60%',
    alignSelf: 'center',
    backgroundColor: '#0d0509',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  note: {
    color: '#52525b',
    fontSize: 9,
    fontStyle: 'italic',
    textAlign: 'center',
  },
});
