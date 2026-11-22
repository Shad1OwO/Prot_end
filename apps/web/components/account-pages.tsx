"use client";

import type { Locale, SessionResponse, UserPreferences } from "@tourism/contracts";
import { Button } from "@tourism/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { LogOut, Save } from "lucide-react";
import { useState } from "react";
import { ApiError, authApi, catalogApi, userApi } from "@/lib/api";
import { limits } from "@/lib/validation-rules";
import type { Dictionary } from "@/lib/i18n";
import { useAuth } from "./auth-provider";
import { ProtectedPage } from "./protected-page";

function ProfileForm({ session, locale, dictionary }: { session: SessionResponse; locale: Locale; dictionary: Dictionary }) {
  const auth = useAuth();
  const [displayName, setDisplayName] = useState(session.user.displayName);
  const [message, setMessage] = useState("");
  const mutation = useMutation({ mutationFn: () => userApi.profile({ displayName, locale }), onSuccess: async () => { await auth.refresh(); setMessage(dictionary.profile.updated); } });
  return <div className="max-w-xl rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5"><div className="form-stack"><label><span className="field-label">{dictionary.profile.displayName}</span><input className="text-input mt-2" value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label><label><span className="field-label">{dictionary.profile.email}</span><input className="text-input mt-2" value={session.user.email} disabled /></label>{message ? <div className="status-banner">{message}</div> : null}<div className="form-actions"><Button onClick={() => void auth.logout()} className="border border-[var(--border)] bg-transparent text-[var(--text)]"><LogOut size={17} />Logout</Button><Button onClick={() => mutation.mutate()} disabled={displayName.trim().length < 2 || mutation.isPending} className="bg-emerald-700 text-white hover:bg-emerald-800"><Save size={17} />{dictionary.profile.save}</Button></div></div></div>;
}

function PasswordForm({ dictionary }: { dictionary: Dictionary }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const mutation = useMutation({
    mutationFn: () => authApi.changePassword({ ...(currentPassword ? { currentPassword } : {}), newPassword }),
    onMutate: () => { setMessage(""); setError(""); },
    onSuccess: () => { setCurrentPassword(""); setNewPassword(""); setMessage(dictionary.profile.passwordUpdated); },
    onError: (caught) => setError(caught instanceof ApiError && caught.status === 403 ? dictionary.profile.passwordIncorrect : dictionary.errors.genericDescription),
  });
  const tooShort = newPassword.length < limits.auth.passwordMin;
  return <form className="mt-6 max-w-xl rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5" onSubmit={(event) => { event.preventDefault(); if (!tooShort) mutation.mutate(); }}><div className="form-stack"><h2 className="font-bold">{dictionary.profile.passwordTitle}</h2><label><span className="field-label">{dictionary.profile.currentPassword}</span><input className="text-input mt-2" type="password" autoComplete="current-password" maxLength={limits.auth.passwordMax} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /><span className="mt-1 block text-sm text-[var(--muted)]">{dictionary.profile.currentPasswordHint}</span></label><label><span className="field-label">{dictionary.profile.newPassword}</span><input className="text-input mt-2" type="password" autoComplete="new-password" minLength={limits.auth.passwordMin} maxLength={limits.auth.passwordMax} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /><span className="mt-1 block text-sm text-[var(--muted)]">{dictionary.auth.passwordHint}</span></label>{message ? <div className="status-banner" role="status">{message}</div> : null}{error ? <div className="error-banner status-banner" role="alert">{error}</div> : null}<div className="form-actions"><Button type="submit" disabled={tooShort || mutation.isPending} className="bg-emerald-700 text-white hover:bg-emerald-800"><Save size={17} />{dictionary.profile.changePassword}</Button></div></div></form>;
}

export function ProfilePage({ locale, dictionary }: { locale: Locale; dictionary: Dictionary }) {
  const auth = useAuth();
  return <ProtectedPage dictionary={dictionary}><div className="page-container list-page"><header className="page-header"><h1>{dictionary.profile.title}</h1></header>{auth.session ? <><ProfileForm key={`${auth.session.user.id}:${auth.session.user.displayName}`} session={auth.session} locale={locale} dictionary={dictionary} /><PasswordForm dictionary={dictionary} /></> : null}</div></ProtectedPage>;
}

function SettingsForm({ initial, locale, dictionary }: { initial: UserPreferences; locale: Locale; dictionary: Dictionary }) {
  const auth = useAuth();
  const categories = useQuery({ queryKey: ["categories", locale], queryFn: () => catalogApi.categories(locale) });
  const [preferences, setPreferences] = useState(initial);
  const [message, setMessage] = useState("");
  const mutation = useMutation({ mutationFn: () => userApi.preferences(preferences), onSuccess: async () => { await auth.refresh(); setMessage(dictionary.settings.updated); } });
  const toggleCategory = (slug: string) => setPreferences((current) => ({ ...current, preferredCategories: current.preferredCategories.includes(slug) ? current.preferredCategories.filter((item) => item !== slug) : [...current.preferredCategories, slug] }));
  return <div className="max-w-2xl rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5"><div className="form-stack"><label><span className="field-label">{dictionary.settings.defaultScope}</span><select className="select-input mt-2" value={preferences.defaultScope} onChange={(event) => setPreferences({ ...preferences, defaultScope: event.target.value as UserPreferences["defaultScope"] })}><option value="thailand">{dictionary.common.thailand}</option><option value="worldwide">{dictionary.common.worldwide}</option></select></label><fieldset><legend className="field-label">{dictionary.settings.categories}</legend><div className="mt-2 flex flex-wrap gap-2">{categories.data?.map((category) => <button type="button" key={category.id} className={preferences.preferredCategories.includes(category.slug) ? "filter-chip active" : "filter-chip"} onClick={() => toggleCategory(category.slug)}>{category.name}</button>)}</div></fieldset><label className="flex items-center gap-3"><input type="checkbox" checked={preferences.aiHistoryOptIn} onChange={(event) => setPreferences({ ...preferences, aiHistoryOptIn: event.target.checked })} /><span>{dictionary.settings.aiHistory}</span></label><label><span className="field-label">{dictionary.settings.theme}</span><select className="select-input mt-2" value={preferences.darkMode} onChange={(event) => setPreferences({ ...preferences, darkMode: event.target.value as UserPreferences["darkMode"] })}><option value="system">{dictionary.settings.system}</option><option value="light">{dictionary.settings.light}</option><option value="dark">{dictionary.settings.dark}</option></select></label>{message ? <div className="status-banner">{message}</div> : null}<div className="form-actions"><Button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="bg-emerald-700 text-white hover:bg-emerald-800"><Save size={17} />{dictionary.settings.save}</Button></div></div></div>;
}

export function SettingsPage({ locale, dictionary }: { locale: Locale; dictionary: Dictionary }) {
  const auth = useAuth();
  return <ProtectedPage dictionary={dictionary}><div className="page-container list-page"><header className="page-header"><h1>{dictionary.settings.title}</h1><p>{dictionary.settings.preferences}</p></header>{auth.session ? <SettingsForm key={JSON.stringify(auth.session.preferences)} initial={auth.session.preferences} locale={locale} dictionary={dictionary} /> : null}</div></ProtectedPage>;
}
