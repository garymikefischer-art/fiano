/**
 * ClipsScreen (Tab "Highlights") — Routet zum zuletzt geöffneten Projekt im
 * Highlights-Tab. Wenn noch kein Projekt: Alert "erst Projekt erstellen".
 *
 * Pattern (Phase 9.6.x): Bottom-Tabs sind Shortcuts in den jeweiligen
 * ProjectDetail-Tab. Funktioniert wie Davinci-Resolve "letzte Session" auf
 * App-Switch.
 */

import { useEffect } from 'react';
import { Alert } from 'react-native';
import { useNavigation, useIsFocused, CommonActions } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import { useAppStore } from '../stores/appStore';
import { useProjectsStore } from '../stores/projectsStore';
import { ComingSoon } from '../components/ComingSoon';
import { useT } from '../lib/i18n';
import type { RootStackParamList } from '../navigation/types';

export function ClipsScreen() {
  const nav = useNavigation<NavigationProp<RootStackParamList>>();
  const isFocused = useIsFocused();
  const lastOpenedProjectId = useAppStore((s) => s.lastOpenedProjectId);
  const projects = useProjectsStore((s) => s.projects);
  const t = useT();

  useEffect(() => {
    if (!isFocused) return;
    // Versuche zuletzt geöffnetes Projekt — fallback auf erstes existierendes.
    const target =
      projects.find((p) => p.id === lastOpenedProjectId) ?? projects[0];
    if (!target) {
      Alert.alert(
        t('tab.noProjectTitle', 'Noch kein Projekt'),
        t('tab.noProjectBody', 'Erstelle erst ein Projekt, dann öffnet sich hier dein letzter Clip-Workspace.'),
        [
          {
            text: t('tab.createProject', 'Projekt erstellen'),
            onPress: () => nav.navigate('AddVideoProject' as never),
          },
          { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        ],
      );
      return;
    }
    // Direkt zum Project, Highlights-Tab.
    nav.dispatch(
      CommonActions.navigate({
        name: 'ProjectDetail',
        params: { projectId: target.id, initialTab: 'highlights' },
      }),
    );
  }, [isFocused, lastOpenedProjectId, projects, nav, t]);

  // Während Navigation passiert: kurz Coming-Soon-Placeholder zeigen (sollte
  // user kaum sehen — Alert ODER navigate kommt sofort).
  return (
    <ComingSoon
      icon="cut-outline"
      title={t('tab.highlights', 'Highlights')}
      description={t('tab.openingProject', 'Öffne dein zuletzt bearbeitetes Projekt …')}
    />
  );
}
