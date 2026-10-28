import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { esViolacionDeClaveForanea, sqlStateDe } from "@/lib/repositories/_shared/prisma-fk";

// SL-43 — las formas en que llega una FK bajo `@prisma/adapter-pg`, MEDIDAS el 2026-10-26 con un
// `$executeRawUnsafe` (`DELETE` sobre una fila referenciada) contra Postgres 17.11 y 18.2. Se copian
// tal cual, sin el mensaje (lleva datos). Las literales SON el contrato: si el adapter cambia de
// forma, este archivo es el que tiene que ponerse rojo.

/** `P2010` de un raw con el error del driver colgado de `meta.driverAdapterError.cause`. */
function p2010(cause: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError("Raw query failed", {
    code: "P2010",
    clientVersion: "7.8.0",
    meta: { driverAdapterError: { name: "DriverAdapterError", cause } },
  });
}

/** 23503: `NO ACTION` en 17 y 18, y `RESTRICT` en 17. El adapter lo traduce a un `kind`: sin `code`. */
const FK_TRADUCIDA = { originalCode: "23503", kind: "ForeignKeyConstraintViolation", constraint: { index: "x_fkey" } };
/** 23001: `RESTRICT` en 18. El adapter no lo traduce: `kind: "postgres"` y `code`. */
const RESTRICT_18 = { originalCode: "23001", kind: "postgres", code: "23001", severity: "ERROR" };

describe("esViolacionDeClaveForanea", () => {
  it("reconoce el 23503 traducido, que solo trae `originalCode` (Postgres 17: la FK RESTRICT de CI)", () => {
    expect(esViolacionDeClaveForanea(p2010(FK_TRADUCIDA))).toBe(true);
    expect(sqlStateDe(p2010(FK_TRADUCIDA))).toBe("23503");
  });

  it("reconoce el 23001 sin traducir (Postgres 18)", () => {
    expect(esViolacionDeClaveForanea(p2010(RESTRICT_18))).toBe(true);
    expect(sqlStateDe(p2010(RESTRICT_18))).toBe("23001");
  });

  it("reconoce la forma suelta del adapter (`DriverAdapterError` con `cause`)", () => {
    const suelto = Object.assign(new Error("x"), { name: "DriverAdapterError", cause: FK_TRADUCIDA });
    expect(esViolacionDeClaveForanea(suelto)).toBe(true);
  });

  it("no confunde otro SQLSTATE con una FK, venga en `code` o en `originalCode`", () => {
    expect(esViolacionDeClaveForanea(p2010({ originalCode: "23505", kind: "UniqueConstraintViolation" }))).toBe(false);
    expect(esViolacionDeClaveForanea(p2010({ originalCode: "P0001", kind: "postgres", code: "P0001" }))).toBe(false);
    expect(sqlStateDe(p2010({ originalCode: "P0001", kind: "postgres", code: "P0001" }))).toBe("P0001");
    expect(esViolacionDeClaveForanea(new Error("boom"))).toBe(false);
    expect(sqlStateDe(null)).toBeNull();
  });
});
