"use client";

import type { EmailLogin, EmailRegistration, Locale } from "@tourism/contracts";
import { Button, CharacterCount, Field, FormAlert, useFormValidation } from "@tourism/ui";
import { Loader2, LogIn, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { ApiError, authApi } from "@/lib/api";
import type { Dictionary } from "@/lib/i18n";
import { displayNameRules, emailRules, limits, passwordRules } from "@/lib/validation-rules";

type AuthMode = "login" | "register";
interface AuthFields extends Record<string, unknown> { displayName: string; email: string; password: string }

export function EmailAuthForm({ locale, dictionary, initialMode = "login", onSignedIn }: { locale: Locale; dictionary: Dictionary; initialMode?: AuthMode; onSignedIn: () => Promise<void> }) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  // Login mode has no display-name input, so requiring one there would block every sign-in.
  const validators = useMemo(() => ({
    ...(mode === "register" ? { displayName: displayNameRules(dictionary) } : {}),
    email: emailRules(dictionary),
    password: passwordRules(dictionary),
  }), [dictionary, mode]);
  const form = useFormValidation<AuthFields>({
    initialValues: { displayName: "", email: "", password: "" },
    validators,
    onSubmit: async (values) => {
      try {
        if (mode === "register") {
          const payload: EmailRegistration = { email: values.email.trim(), password: values.password, displayName: values.displayName.trim(), locale };
          await authApi.register(payload);
        } else {
          const payload: EmailLogin = { email: values.email.trim(), password: values.password };
          await authApi.login(payload);
        }
        await onSignedIn();
      } catch (caught) {
        if (!(caught instanceof ApiError)) {
          form.applyServerErrors(undefined, dictionary.errors.genericDescription);
          return;
        }
        // 422 responses carry per-field messages; 401/409 are mapped onto the field that caused them.
        if (caught.problem.errors) form.applyServerErrors(caught.problem.errors);
        else if (caught.status === 409) form.applyServerErrors({ email: [caught.problem.detail] });
        else if (caught.status === 401) form.applyServerErrors({ password: [caught.problem.detail] });
        else form.applyServerErrors(undefined, caught.problem.detail);
      }
    },
  });

  const busy = form.status === "submitting";
  const switchMode = () => {
    setMode((current) => (current === "login" ? "register" : "login"));
    form.reset({ displayName: form.values.displayName, email: form.values.email, password: "" });
  };
  // Login mode does not render the display-name input, so it never shows that error.
  const errorFor = (key: keyof AuthFields) => (mode === "login" && key === "displayName" ? undefined : form.visibleErrors[key]);

  return (
    <form className="grid gap-3" onSubmit={form.handleSubmit} noValidate>
      {mode === "register" ? (
        <Field label={dictionary.auth.displayName} htmlFor="auth-display-name" required error={errorFor("displayName")}>
          <input id="auth-display-name" className="text-input" autoComplete="name" maxLength={limits.auth.displayNameMax} {...form.fieldProps("displayName")} />
        </Field>
      ) : null}
      <Field label={dictionary.auth.email} htmlFor="auth-email" required error={errorFor("email")}>
        <input id="auth-email" className="text-input" type="email" inputMode="email" autoComplete="email" maxLength={limits.auth.emailMax} {...form.fieldProps("email")} />
      </Field>
      <Field label={dictionary.auth.password} htmlFor="auth-password" required error={errorFor("password")} hint={mode === "register" ? dictionary.auth.passwordHint : undefined}>
        <input
          id="auth-password"
          className="text-input"
          type="password"
          autoComplete={mode === "register" ? "new-password" : "current-password"}
          maxLength={limits.auth.passwordMax}
          {...form.fieldProps("password")}
        />
        {mode === "register" && !errorFor("password") ? <CharacterCount value={form.values.password} max={limits.auth.passwordMax} /> : null}
      </Field>
      <FormAlert message={form.formError} />
      <Button type="submit" disabled={busy} className="bg-emerald-700 text-white hover:bg-emerald-800">
        {busy ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : mode === "login" ? <LogIn size={17} aria-hidden="true" /> : <UserPlus size={17} aria-hidden="true" />}
        {busy ? dictionary.common.loading : mode === "login" ? dictionary.auth.signIn : dictionary.auth.register}
      </Button>
      <p className="text-center text-sm text-[var(--muted)]">
        {mode === "login" ? dictionary.auth.createPrompt : dictionary.auth.signInPrompt}{" "}
        <button type="button" className="font-bold text-emerald-700 underline-offset-4 hover:underline" onClick={switchMode}>
          {mode === "login" ? dictionary.auth.register : dictionary.auth.signIn}
        </button>
      </p>
    </form>
  );
}