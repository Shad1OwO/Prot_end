"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Children, cloneElement, isValidElement, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { Validator, Validators } from "./validation";

export type FormStatus = "idle" | "submitting";
type FieldName<T> = Extract<keyof T, string>;
type FieldErrors<T> = Partial<Record<FieldName<T>, string>>;

export interface UseFormValidationOptions<T extends Record<string, unknown>> {
  initialValues: T;
  validators: Validators<T>;
  onSubmit: (values: T) => void | Promise<void>;
}

function collectErrors<T extends Record<string, unknown>>(values: T, validators: Validators<T>): FieldErrors<T> {
  const errors: Record<string, string> = {};
  for (const [name, rules] of Object.entries(validators) as [string, readonly Validator<unknown>[] | undefined][]) {
    for (const rule of rules ?? []) {
      const message = rule(values[name]);
      if (message) {
        errors[name] = message;
        break;
      }
    }
  }
  return errors as FieldErrors<T>;
}

/**
 * Tracks form values and validation. A field's error appears once it has been blurred or the
 * form has been submitted, and server errors show until that field is next edited.
 */
export function useFormValidation<T extends Record<string, unknown>>({ initialValues, validators, onSubmit }: UseFormValidationOptions<T>) {
  const [values, setValues] = useState<T>(initialValues);
  const [touched, setTouched] = useState<ReadonlySet<string>>(() => new Set());
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<FormStatus>("idle");
  const inFlight = useRef(false);

  const errors = useMemo(() => collectErrors(values, validators), [values, validators]);
  const visibleErrors = useMemo(() => {
    const visible: Record<string, string> = {};
    for (const [name, message] of Object.entries(errors) as [string, string][]) {
      if (submitted || touched.has(name)) visible[name] = message;
    }
    return { ...visible, ...serverErrors } as FieldErrors<T>;
  }, [errors, serverErrors, submitted, touched]);

  const clearServerError = (name: string) => {
    setServerErrors((current) => {
      if (!(name in current)) return current;
      const { [name]: _removed, ...rest } = current;
      return rest;
    });
  };

  const fieldProps = (name: FieldName<T>) => ({
    name,
    value: String(values[name] ?? ""),
    onChange: (event: { target: { value: string } }) => {
      const { value } = event.target;
      setValues((current) => ({ ...current, [name]: value }));
      clearServerError(name);
    },
    onBlur: () => setTouched((current) => (current.has(name) ? current : new Set(current).add(name))),
    "aria-invalid": (visibleErrors as Record<string, string | undefined>)[name] ? (true as const) : undefined,
  });

  /** Puts field errors on their fields. Errors for fields this form lacks join the form-level message so they stay visible. */
  const applyServerErrors = (fieldErrors?: Record<string, string[]>, formMessage?: string) => {
    const known: Record<string, string> = {};
    const unknown: string[] = [];
    for (const [name, messages] of Object.entries(fieldErrors ?? {})) {
      const first = messages[0];
      if (!first) continue;
      if (name in values) known[name] = first;
      else unknown.push(first);
    }
    setServerErrors(known);
    setFormError(formMessage ?? (unknown.length > 0 ? unknown.join(" ") : undefined));
  };

  const reset = (nextValues: T = initialValues) => {
    setValues(nextValues);
    setTouched(new Set());
    setSubmitted(false);
    setServerErrors({});
    setFormError(undefined);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlight.current) return;
    setSubmitted(true);
    setServerErrors({});
    setFormError(undefined);
    const firstInvalid = Object.keys(errors)[0];
    if (firstInvalid) {
      const control = event.currentTarget.elements.namedItem(firstInvalid);
      if (control instanceof HTMLElement) control.focus();
      return;
    }
    inFlight.current = true;
    setStatus("submitting");
    try {
      await onSubmit(values);
    } finally {
      inFlight.current = false;
      setStatus("idle");
    }
  };

  return { values, status, errors, visibleErrors, formError, fieldProps, applyServerErrors, reset, handleSubmit };
}

export function Field({ label, htmlFor, required, error, hint, children }: { label: ReactNode; htmlFor: string; required?: boolean; error?: string | undefined; hint?: ReactNode; children: ReactNode }) {
  const errorId = error ? `${htmlFor}-error` : undefined;
  const hintId = hint ? `${htmlFor}-hint` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;
  const control = Children.map(children, (child) => {
    if (!isValidElement<{ id?: string; "aria-describedby"?: string | undefined; "aria-required"?: boolean | undefined }>(child) || child.props.id !== htmlFor) return child;
    return cloneElement(child, { "aria-describedby": describedBy, "aria-required": required ? true : undefined });
  });
  return (
    <div className="field">
      <label className="field-label" htmlFor={htmlFor}>
        {label}
        {required ? <span className="field-required" aria-hidden="true">*</span> : null}
      </label>
      <div className="field-control">{control}</div>
      {hint ? <p id={hintId} className="field-hint">{hint}</p> : null}
      {error ? (
        <p id={errorId} className="field-error" role="alert">
          <AlertCircle size={14} aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

export function FormAlert({ message, tone = "error" }: { message?: string | null | undefined; tone?: "error" | "success" }) {
  if (!message) return null;
  const Icon = tone === "error" ? AlertCircle : CheckCircle2;
  return (
    <div className={`form-alert form-alert-${tone}`} role={tone === "error" ? "alert" : "status"}>
      <Icon size={16} aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

export function CharacterCount({ value, max }: { value: string; max: number }) {
  return <span className={value.length > max ? "char-count over" : "char-count"}>{value.length}/{max}</span>;
}
