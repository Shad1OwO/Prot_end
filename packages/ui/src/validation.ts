/**
 * Messages are plain strings because dictionaries pass from Server to Client Components,
 * which rejects functions. `{min}` and `{max}` are filled in when a message is used.
 */
export interface ValidationMessages {
  readonly required: string;
  readonly tooShort: string;
  readonly tooLong: string;
  readonly email: string;
  readonly dateOrder: string;
  readonly dateInvalid: string;
  readonly number: string;
  readonly numberRange: string;
  readonly pattern: string;
}

const fill = (template: string, values: { min?: number; max?: number }): string =>
  template.replace(/\{(min|max)\}/g, (placeholder, key: "min" | "max") => String(values[key] ?? placeholder));

/** Returns an error message, or undefined when the value is acceptable. */
export type Validator<T = string> = (value: T) => string | undefined;

/** Per-field rules. Index signatures on `T` are dropped so each named field keeps its own value type. */
export type Validators<T> = {
  readonly [K in keyof T as string extends K ? never : number extends K ? never : K]?: readonly Validator<T[K]>[];
};

const isBlank = (value: unknown): boolean => value === undefined || value === null || (typeof value === "string" && value.trim() === "");

export const required = (messages: Pick<ValidationMessages, "required">): Validator<unknown> =>
  (value) => (isBlank(value) ? messages.required : undefined);

// The rules below accept blank values, so a field is only mandatory when it also uses `required`.

export const minLength = (min: number, messages: Pick<ValidationMessages, "tooShort">): Validator<string> =>
  (value) => (value !== "" && value.trim().length < min ? fill(messages.tooShort, { min }) : undefined);

export const maxLength = (max: number, messages: Pick<ValidationMessages, "tooLong">): Validator<string> =>
  (value) => (value.length > max ? fill(messages.tooLong, { max }) : undefined);

export const emailFormat = (messages: Pick<ValidationMessages, "email">): Validator<string> =>
  (value) => (value.trim() !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? messages.email : undefined);

export const numericText = (min: number, max: number, messages: Pick<ValidationMessages, "number" | "numberRange">): Validator<string> =>
  (value) => {
    if (value.trim() === "") return undefined;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return messages.number;
    return parsed < min || parsed > max ? fill(messages.numberRange, { min, max }) : undefined;
  };

export const isoDate = (messages: Pick<ValidationMessages, "dateInvalid">): Validator<string> =>
  (value) => {
    if (value === "") return undefined;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return messages.dateInvalid;
    // Date rolls impossible days forward (02-31 becomes 03-03), so a round trip exposes them.
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value) ? undefined : messages.dateInvalid;
  };
