/**
 * Password-Strength für fiano Sign-up.
 *
 * Regeln:
 *  - mind. 8 Zeichen
 *  - mind. 1 Großbuchstabe
 *  - mind. 1 Kleinbuchstabe
 *  - mind. 1 Zahl
 *  - mind. 1 Sonderzeichen (!@#$%^&*()_+-=[]{};':"\\|,.<>/?`~)
 *
 * Score 0-5: Anzahl der erfüllten Regeln.
 */

export interface PasswordStrength {
  score: number;          // 0..5
  meetsAll: boolean;
  rules: {
    length: boolean;
    upper: boolean;
    lower: boolean;
    digit: boolean;
    special: boolean;
  };
}

export function checkPasswordStrength(password: string): PasswordStrength {
  const rules = {
    length:  password.length >= 8,
    upper:   /[A-Z]/.test(password),
    lower:   /[a-z]/.test(password),
    digit:   /[0-9]/.test(password),
    special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?`~]/.test(password),
  };
  const score = Object.values(rules).filter(Boolean).length;
  return { score, meetsAll: score === 5, rules };
}

/** Label für UI: "Too weak" / "Weak" / "Fair" / "Good" / "Strong" */
export function strengthLabel(score: number, t: (key: string) => string): string {
  if (score <= 1) return t('auth.strengthTooWeak');
  if (score === 2) return t('auth.strengthWeak');
  if (score === 3) return t('auth.strengthFair');
  if (score === 4) return t('auth.strengthGood');
  return t('auth.strengthStrong');
}

/** Color-Class für die Bar */
export function strengthColor(score: number): string {
  if (score <= 1) return 'bg-fiano-red';
  if (score === 2) return 'bg-amber-500';
  if (score === 3) return 'bg-amber-400';
  if (score === 4) return 'bg-emerald-400';
  return 'bg-emerald-500';
}
