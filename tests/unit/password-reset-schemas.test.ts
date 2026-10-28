import { describe, it, expect } from "vitest";
import { requestResetSchema, crearConEnlaceSchema } from "@/lib/types/password-reset";

// Feature 20 / R7 (mas R8 via composicion). SL-18 (R20): el paso del codigo ya no existe, asi que
// la coincidencia y la politica se prueban sobre el schema del canje del enlace, el unico que queda.

const ENLACE = "0b9d7c1e-2f3a-4b5c-8d6e-7f8091a2b3c4.Zq3_x-Kp9LmN2oPqRsTuVwXyZ0123456789abcdEFGH";

describe("crearConEnlaceSchema (R7/R8)", () => {
  const base = { enlace: ENLACE };

  it("acepta una entrada valida", () => {
    const result = crearConEnlaceSchema.safeParse({
      ...base,
      password: "Abcdef1!",
      confirmPassword: "Abcdef1!",
    });
    expect(result.success).toBe(true);
  });

  it("rechaza cuando password y confirmacion difieren (R7)", () => {
    const result = crearConEnlaceSchema.safeParse({
      ...base,
      password: "Abcdef1!",
      confirmPassword: "Otra1234!",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.confirmPassword).toBeDefined();
    }
  });

  it("rechaza password que no cumple la politica (R8)", () => {
    const result = crearConEnlaceSchema.safeParse({
      ...base,
      password: "debil",
      confirmPassword: "debil",
    });
    expect(result.success).toBe(false);
  });
});

describe("requestResetSchema", () => {
  it("rechaza email invalido", () => {
    expect(requestResetSchema.safeParse({ email: "no-email" }).success).toBe(false);
  });
});
