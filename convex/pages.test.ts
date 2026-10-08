import { expect, test } from "vitest";
import { validateBookPage } from "./pages";

test("printed page numbers are positive whole numbers within the known book length", () => {
  for (const page of [-5, 0, 1.5, 256, NaN, Infinity]) {
    expect(() => validateBookPage(page, 255)).toThrow("Printed page must be a whole number from 1 to 255");
  }
  for (const page of [1, 255, undefined]) {
    expect(() => validateBookPage(page, 255)).not.toThrow();
  }
});

test("an unknown book length permits any positive whole page number or clearing the field", () => {
  expect(() => validateBookPage(1000, undefined)).not.toThrow();
  expect(() => validateBookPage(undefined, undefined)).not.toThrow();
  expect(() => validateBookPage(-1, undefined)).toThrow("Printed page must be a whole number from 1");
});
