# Supabase email/password Auth — implementation reference

Checked against the official Supabase Auth guide on 2026-10-24.

- Email/password authentication is enabled by default. For hosted projects, email confirmation is enabled by default; do not change this setting merely to switch the client sign-in call.
- JavaScript password sign-in uses `supabase.auth.signInWithPassword({ email, password })`. Password sign-in does not itself send an email.
- A currently authenticated user can set/change a password with `supabase.auth.updateUser({ password })`. This supports the existing magic-link user's one-time transition without creating a replacement Auth identity.
- Password recovery is separate and uses `supabase.auth.resetPasswordForEmail(email, { redirectTo })`; it sends a recovery email and requires an authenticated recovery session before `updateUser` changes the password.
- Signup confirmation and password reset flows require email delivery/SMTP. The app can be password-login-only while leaving recovery behavior as a separate project decision.

Source: [Supabase Password-based Auth](https://supabase.com/docs/guides/auth/passwords). The official guide also links to the [JavaScript `signInWithPassword` reference](https://supabase.com/docs/reference/javascript/auth-signinwithpassword) and [JavaScript `updateUser` reference](https://supabase.com/docs/reference/javascript/auth-updateuser).
