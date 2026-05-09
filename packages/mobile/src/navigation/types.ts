/**
 * React-Navigation Type-Map. Nutzbar via `useNavigation<NavigationProp<RootStackParamList>>()`.
 */

export type RootStackParamList = {
  // Auth
  Login: undefined;
  Signup: undefined;
  // App
  Home: undefined;
  Import: undefined;
  Export: { sourceUri: string; trimStart: number; trimEnd: number; sourceDuration: number };
};
