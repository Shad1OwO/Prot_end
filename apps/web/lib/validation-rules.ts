import {
  emailFormat,
  isoDate,
  maxLength,
  minLength,
  numericText,
  required,
  type Validator,
  type ValidationMessages,
} from "@tourism/ui";
import type { Dictionary } from "./i18n";

/**
 * Validation rules shared by every form. Bounds mirror the zod contracts in
 * `@tourism/contracts`, so the browser warns with exactly the limits the API enforces.
 */
export const limits = {
  auth: { displayNameMin: 2, displayNameMax: 80, emailMax: 254, passwordMin: 8, passwordMax: 128 },
  profile: { displayNameMin: 2, displayNameMax: 80 },
  trip: { nameMax: 120, notesMax: 5_000 },
  recommendation: { promptMin: 10, promptMax: 1_500 },
  catalog: { queryMax: 120, countryLength: 2, maxDistanceMin: 1, maxDistanceMax: 20_000 },
} as const;

/** The dictionary's `validation` block already satisfies `ValidationMessages`. */
export const messagesOf = (dictionary: Dictionary): ValidationMessages => dictionary.validation;

const mustFill = (dictionary: Dictionary): Validator<string> => required(dictionary.validation) as Validator<string>;

export const emailRules = (dictionary: Dictionary): Validator<string>[] => {
  const messages = messagesOf(dictionary);
  return [mustFill(dictionary), maxLength(limits.auth.emailMax, messages), emailFormat(messages)];
};

export const passwordRules = (dictionary: Dictionary): Validator<string>[] => {
  const messages = messagesOf(dictionary);
  return [mustFill(dictionary), minLength(limits.auth.passwordMin, messages), maxLength(limits.auth.passwordMax, messages)];
};

export const displayNameRules = (dictionary: Dictionary): Validator<string>[] => {
  const messages = messagesOf(dictionary);
  return [mustFill(dictionary), minLength(limits.profile.displayNameMin, messages), maxLength(limits.profile.displayNameMax, messages)];
};

export const tripNameRules = (dictionary: Dictionary): Validator<string>[] => {
  const messages = messagesOf(dictionary);
  return [mustFill(dictionary), maxLength(limits.trip.nameMax, messages)];
};

export const tripNotesRules = (dictionary: Dictionary): Validator<string>[] => [maxLength(limits.trip.notesMax, messagesOf(dictionary))];

export const promptRules = (dictionary: Dictionary): Validator<string>[] => {
  const messages = messagesOf(dictionary);
  return [mustFill(dictionary), minLength(limits.recommendation.promptMin, messages), maxLength(limits.recommendation.promptMax, messages)];
};

export const catalogQueryRules = (dictionary: Dictionary): Validator<string>[] => [maxLength(limits.catalog.queryMax, messagesOf(dictionary))];

export const countryRules = (dictionary: Dictionary): Validator<string>[] => [
  (value) => (value === "" || /^[A-Za-z]{2}$/.test(value) ? undefined : messagesOf(dictionary).pattern),
];

export const distanceRules = (dictionary: Dictionary): Validator<string>[] => [
  numericText(limits.catalog.maxDistanceMin, limits.catalog.maxDistanceMax, messagesOf(dictionary)),
];

export const dateRules = (dictionary: Dictionary): Validator<string>[] => [isoDate(messagesOf(dictionary))];