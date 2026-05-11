/**
 * BuilderScreen (Tab "Builder") — Routet zum Builder-Tab des zuletzt geöffneten Projekts.
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

export function BuilderScreen() {
  const nav = useNavigation<NavigationProp<RootStackParamList>>();
  const isFocused = useIsFocused();
  const lastOpenedProjectId = useAppStore((s) => s.lastOpenedProjectId);
  const projects = useProjectsStore((s) => s.projects);
  const t = useT();

  useEffect(() => {
    if (!isFocused) return;
    const target =
      projects.find((p) => p.id === lastOpenedProjectId) ?? projects[0];
    if (!target) {
      Alert.alert(
        t('tab.noProjectTitle', 'Noch kein Projekt'),
        t('tab.noProjectBody', 'Erstelle erst ein Projekt, dann öffnet sich hier dein letzter Builder-Workspace.'),
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
    nav.dispatch(
      CommonActions.navigate({
        name: 'ProjectDetail',
        params: { projectId: target.id, initialTab: 'builder' },
      }),
    );
  }, [isFocused, lastOpenedProjectId, projects, nav, t]);

  return (
    <ComingSoon
      icon="construct-outline"
      title={t('tab.builder', 'Builder')}
      description={t('tab.openingProject', 'Öffne dein zuletzt bearbeitetes Projekt …')}
    />
  );
}
