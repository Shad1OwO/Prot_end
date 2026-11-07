import { describe, expect, test } from "bun:test";
import { emailFormat, isoDate, maxLength, minLength, numericText, required, type ValidationMessages } from "./validation";

const messages: ValidationMessages = {
  required: "required",
  tooShort: "short:{min}",
  tooLong: "long:{max}",
  email: "email",
  dateOrder: "order",
  dateInvalid: "date",
  number: "number",
  numberRange: "range:{min}-{max}",
  pattern: "pattern",
};

describe("validators", () => {
  test("required rejects blank values only", () => {
    const rule = required(messages);
    for (const value of ["", "   ", null, undefined]) expect(rule(value)).toBe("required");
    for (const value of ["a", 0, false]) expect(rule(value)).toBeUndefined();
  });

  test("length rules use the given bounds and leave blanks to required", () => {
    expect(minLength(2, messages)("")).toBeUndefined();
    expect(minLength(2, messages)(" a ")).toBe("short:2");
    expect(minLength(2, messages)("ab")).toBeUndefined();
    expect(maxLength(3, messages)("abc")).toBeUndefined();
    expect(maxLength(3, messages)("abcd")).toBe("long:3");
  });

  test("emailFormat accepts addresses and leaves blanks to required", () => {
    const rule = emailFormat(messages);
    expect(rule("")).toBeUndefined();
    expect(rule(" name@example.com ")).toBeUndefined();
    for (const value of ["name", "name@", "@example.com", "name@example", "a b@example.com"]) expect(rule(value)).toBe("email");
  });

  test("numericText checks type, then range", () => {
    const rule = numericText(1, 10, messages);
    expect(rule("")).toBeUndefined();
    expect(rule("5")).toBeUndefined();
    expect(rule("abc")).toBe("number");
    expect(rule("11")).toBe("range:1-10");
  });

  test("isoDate rejects malformed and impossible dates", () => {
    const rule = isoDate(messages);
    expect(rule("")).toBeUndefined();
    expect(rule("2026-02-28")).toBeUndefined();
    expect(rule("2028-02-29")).toBeUndefined();
    for (const value of ["2026-02-30", "2026-13-01", "01/02/2026", "2026-1-1"]) expect(rule(value)).toBe("date");
  });
});
