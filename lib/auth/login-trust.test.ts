import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('Login trust follow-up', () => {
  const authAction = read('app/actions/auth.ts');
  const loginPage = read('app/(auth)/login/page.tsx');
  const loginForm = read('components/auth/LoginForm.tsx');
  const swRegistration = read('components/ServiceWorkerRegistration.tsx');
  const playwrightLogin = read('tests/e2e/helpers/login.ts');

  it('returns structured login errors instead of same-path redirects', () => {
    expect(authAction).toContain('export async function login(_prevState: LoginFormState, formData: FormData)');
    expect(authAction).toContain("return { error: 'invalid' }");
    expect(authAction).toContain("return { error: 'locked' }");
    expect(authAction).not.toContain("redirect('/login?error=invalid')");
    expect(authAction).not.toContain("redirect('/login?error=locked')");
  });

  it('keeps successful login redirects intact', () => {
    expect(authAction).toContain("redirect('/pos')");
    expect(authAction).toContain("redirect('/onboarding')");
    expect(authAction).toContain("redirect('/reports/dashboard')");
  });

  it('renders login errors through useFormState client form', () => {
    expect(loginForm).toContain('useFormState(login');
    expect(loginForm).toContain('role="alert"');
    expect(loginForm).toContain('LoginSubmitGuard');
    expect(loginForm).toContain('notifyLoginSubmitting');
    expect(loginPage).toContain('<LoginForm');
    expect(loginPage).toContain('parseLoginErrorParam');
  });

  it('defers service worker reload while login is submitting', () => {
    expect(swRegistration).toContain('isLoginSubmitting()');
    expect(swRegistration).toContain('deferServiceWorkerReload(performReload)');
    expect(swRegistration).not.toContain("serviceWorkers: 'block'");
  });

  it('keeps authenticated QA login helper aligned with generic invalid copy', () => {
    expect(playwrightLogin).toMatch(/Invalid \(credentials|email or password\)/i);
  });
});
