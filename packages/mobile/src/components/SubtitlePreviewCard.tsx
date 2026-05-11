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
  return (
    <View style={styles.card}>
      <View style={styles.frame}>
        <SubtitleOverlay
          settings={settings}
          demoBig={demoBig}
          demoSmall={demoSmall}
          forceVisible
        />
      </View>
      {!settings.enabled && (
        <Text style={styles.note}>
          ⓘ Untertitel sind aktuell deaktiviert — Toggle oben drüber, um sie im Export zu aktivieren.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 8,
  },
  frame: {
    aspectRatio: 9 / 16,
    width: '75%',
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
