import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";

import { llevaSqlstate, mensajesDeLaCadena } from "@/lib/db/sqlstate";
import { EmpresaCruzada, traducirErrorDeEmpresa } from "@/lib/db/contexto-empresa";

// SL-24 (design §4.5) — el recorrido de la cadena de causas, extraído de `contexto-empresa.ts`. Las
// formas son las de Prisma 7.8 + adapter-pg (comentario de `lib/db/sqlstate.ts`); que de verdad
// lleguen así contra la base lo prueban `plan-topes-ordenes` (SL024) y `aislamiento-fk-misma-empresa`
// (SL017).

function adaptador(codigo: string, mensaje: string) {
  return Object.assign(new Error(mensaje), {
    name: "DriverAdapterError",
    cause: { kind: "postgres", code: codigo, originalCode: codigo, message: mensaje },
  });
}

function p2010(codigo: string, mensaje: string, conMeta = true) {
  return new Prisma.PrismaClientKnownRequestError(`Raw query failed. Code: \`${codigo}\`. Message: \`${mensaje}\``, {
    code: "P2010",
    clientVersion: "7.8.0",
    ...(conMeta ? { meta: { driverAdapterError: adaptador(codigo, mensaje) } } : {}),
  });
}

describe("SL-24 — llevaSqlstate", () => {
  it.each(["SL017", "SL024"])("%s: P2010 con meta.driverAdapterError", (codigo) => {
    expect(llevaSqlstate(p2010(codigo, "x"), codigo)).toBe(true);
  });

  it.each(["SL017", "SL024"])("%s: P2010 solo con el mensaje", (codigo) => {
    expect(llevaSqlstate(p2010(codigo, "x", false), codigo)).toBe(true);
  });

  it.each(["SL017", "SL024"])("%s: el DriverAdapterError de una operación de modelo", (codigo) => {
    expect(llevaSqlstate(adaptador(codigo, "x"), codigo)).toBe(true);
  });

  it.each(["SL017", "SL024"])("%s: pg directo con `code`", (codigo) => {
    expect(llevaSqlstate(Object.assign(new Error("x"), { code: codigo }), codigo)).toBe(true);
  });

  it("anidado en un `cause` intermedio", () => {
    const envuelto = new Error("lote", { cause: new Error("medio", { cause: adaptador("SL024", "x") }) });
    expect(llevaSqlstate(envuelto, "SL024")).toBe(true);
  });

  it("no confunde un código con otro", () => {
    expect(llevaSqlstate(adaptador("SL017", "x"), "SL024")).toBe(false);
    expect(llevaSqlstate(p2010("SL024", "x"), "SL017")).toBe(false);
    expect(llevaSqlstate(new Prisma.PrismaClientKnownRequestError("u", { code: "P2002", clientVersion: "7.8.0" }), "SL024")).toBe(false);
  });

  it("valores que no son objetos y ciclos no revientan", () => {
    expect(llevaSqlstate(null, "SL024")).toBe(false);
    expect(llevaSqlstate("SL024", "SL024")).toBe(false);
    const a: Record<string, unknown> = {};
    a.cause = a;
    expect(llevaSqlstate(a, "SL024")).toBe(false);
  });

  it("no baja más de seis niveles", () => {
    let e: unknown = { code: "SL024" };
    for (let i = 0; i < 7; i += 1) e = { cause: e };
    expect(llevaSqlstate(e, "SL024")).toBe(false);
  });
});

describe("SL-24 — mensajesDeLaCadena", () => {
  it("junta los mensajes de todo el grafo", () => {
    const e = p2010("SL024", "tope_plan {}");
    const mensajes = mensajesDeLaCadena(e);
    expect(mensajes[0]).toContain("Raw query failed");
    expect(mensajes).toContain("tope_plan {}");
  });
});

describe("SL-17 sin regresión — traducirErrorDeEmpresa usa el recorrido compartido", () => {
  it("traduce SL017 en sus cuatro formas y deja pasar SL024", () => {
    for (const e of [p2010("SL017", "x"), p2010("SL017", "x", false), adaptador("SL017", "x"), Object.assign(new Error("x"), { code: "SL017" })]) {
      expect(traducirErrorDeEmpresa(e, "orden")).toBeInstanceOf(EmpresaCruzada);
    }
    const tope = adaptador("SL024", "tope_plan {}");
    expect(traducirErrorDeEmpresa(tope)).toBe(tope);
  });
});
