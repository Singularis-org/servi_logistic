import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";

import { ConflictError } from "@/lib/errors/app-error";
import { TopeDelPlanAlcanzado, traducirErrorDeTope } from "@/lib/planes/tope-error";
import { mensajeDelTope, mensajeTopesPasados } from "@/lib/planes/mensajes";

// SL-24 (design §4.1, §4.5, §6.4) — el JSON del trigger, leído del MESSAGE, a `TopeDelPlanAlcanzado`.
// Los mensajes de abajo tienen la forma real de `jsonb_build_object(...)::text` (claves ordenadas por
// longitud, con espacio tras `:`); que lleguen así por Prisma contra la base lo prueba
// `tests/integration/db/plan-topes-ordenes.test.ts`.

const ORDENES = 'tope_plan {"tope": "ordenes", "maximo": 100, "usados": 99, "pedidas": 2}';
const ROL = 'tope_plan {"rol": "adminTienda", "tope": "rol", "maximo": 3, "usados": 3, "pedidas": 1}';
const KEYS = 'tope_plan {"tope": "api_keys", "maximo": 2, "usados": 2, "pedidas": 1}';

function adaptador(mensaje: string, codigo = "SL024") {
  return Object.assign(new Error(mensaje), {
    name: "DriverAdapterError",
    cause: { kind: "postgres", code: codigo, originalCode: codigo, message: mensaje },
  });
}

function p2010(mensaje: string) {
  return new Prisma.PrismaClientKnownRequestError(`Raw query failed. Code: \`SL024\`. Message: \`${mensaje}\``, {
    code: "P2010",
    clientVersion: "7.8.0",
    meta: { driverAdapterError: adaptador(mensaje) },
  });
}

describe("SL-24 — traducirErrorDeTope", () => {
  it("órdenes, desde el DriverAdapterError de una operación de modelo", () => {
    const original = adaptador(ORDENES);
    const t = traducirErrorDeTope(original);
    expect(t).toBeInstanceOf(TopeDelPlanAlcanzado);
    expect(t).toBeInstanceOf(ConflictError);
    const tope = t as TopeDelPlanAlcanzado;
    expect(tope.code).toBe("CONFLICT");
    expect(tope.details).toEqual({ codigo: "tope_plan", tope: "ordenes", maximo: 100, usados: 99, pedidas: 2 });
    expect(tope.message).toBe(
      "Tu plan permite 100 órdenes por ciclo. Llevas 99 y esta carga trae 2. Anula órdenes que no vayas a enviar o pide un cambio de plan.",
    );
    expect(tope.cause).toBe(original);
  });

  it("`detalle` es el mismo objeto que `details` y no es propio de la instancia (sin campo `declare`, apto para Babel)", () => {
    const t = new TopeDelPlanAlcanzado({ tope: "ordenes", maximo: 5, usados: 5, pedidas: 1 });
    expect(t.detalle).toBe(t.details);
    expect(t.detalle).toEqual({ codigo: "tope_plan", tope: "ordenes", maximo: 5, usados: 5, pedidas: 1 });
    expect(Object.prototype.hasOwnProperty.call(t, "detalle")).toBe(false);
    expect(t.toShape().details).toEqual(t.detalle);
  });

  it("rol, desde P2010 (SQL a mano); el rol sale con su etiqueta de pantalla", () => {
    const t = traducirErrorDeTope(p2010(ROL)) as TopeDelPlanAlcanzado;
    expect(t.details).toEqual({ codigo: "tope_plan", tope: "rol", rol: "adminTienda", maximo: 3, usados: 3, pedidas: 1 });
    expect(t.message).toBe(
      "Tu plan permite 3 usuarios activos con el rol Admin de tienda. Ya tienes 3. Inactiva alguno o pide un cambio de plan.",
    );
  });

  it("API keys, desde P2010 sin meta (solo el texto del mensaje)", () => {
    const sinMeta = new Prisma.PrismaClientKnownRequestError(`Raw query failed. Code: \`SL024\`. Message: \`${KEYS}\``, {
      code: "P2010",
      clientVersion: "7.8.0",
    });
    const t = traducirErrorDeTope(sinMeta) as TopeDelPlanAlcanzado;
    expect(t.details).toEqual({ codigo: "tope_plan", tope: "api_keys", maximo: 2, usados: 2, pedidas: 1 });
    expect(t.message).toBe("Tu plan permite 2 API keys activas. Ya tienes 2. Desactiva o elimina alguna, o pide un cambio de plan.");
  });

  it("toShape lleva el CONFLICT con details.codigo = tope_plan (lo que sale por appErrorToResponse)", () => {
    const t = traducirErrorDeTope(adaptador(ORDENES)) as TopeDelPlanAlcanzado;
    expect(t.toShape()).toEqual({
      status: "error",
      code: "CONFLICT",
      message: t.message,
      details: { codigo: "tope_plan", tope: "ordenes", maximo: 100, usados: 99, pedidas: 2 },
    });
  });

  it("ya traducido sale igual", () => {
    const t = traducirErrorDeTope(adaptador(ORDENES));
    expect(traducirErrorDeTope(t)).toBe(t);
  });

  it("otros errores salen intactos: SL017, un CHECK, P2002, un Error suelto", () => {
    const casos = [
      adaptador("tope_plan {}", "SL017"),
      adaptador(ORDENES, "23514"),
      new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "7.8.0" }),
      new Error(ORDENES),
    ];
    for (const e of casos) expect(traducirErrorDeTope(e)).toBe(e);
  });

  it("SL024 con un mensaje que no es el JSON esperado sale intacto (no inventa cifras)", () => {
    const casos = [
      adaptador("tope_plan sin json"),
      adaptador('tope_plan {"tope": "ordenes", "maximo": 100}'),
      adaptador('tope_plan {"tope": "otro", "maximo": 1, "usados": 1, "pedidas": 1}'),
      adaptador('tope_plan {"rol": "nadie", "tope": "rol", "maximo": 1, "usados": 1, "pedidas": 1}'),
      adaptador('tope_plan {"tope": "ordenes", "maximo": -1, "usados": 1, "pedidas": 1}'),
    ];
    for (const e of casos) expect(traducirErrorDeTope(e)).toBe(e);
  });
});

describe("SL-24 — mensajes del superadmin (tope_excedido)", () => {
  it("una línea por tope pasado", () => {
    expect(
      mensajeTopesPasados([
        { empresa: "Empresa A", tope: "ordenes", usados: 120, maximo: 100 },
        { empresa: "Empresa A", tope: "adminTienda", usados: 4, maximo: 3 },
        { empresa: "Empresa B", tope: "api_keys", usados: 3, maximo: 2 },
      ]),
    ).toBe(
      [
        "Empresa A ya tiene 120 órdenes en el ciclo en curso y el plan permite 100.",
        "Empresa A ya tiene 4 usuarios activos con el rol Admin de tienda y el plan permite 3.",
        "Empresa B ya tiene 3 API keys activas y el plan permite 2.",
      ].join("\n"),
    );
  });

  it("los textos no nombran ni la marca ni el país", () => {
    const textos = [
      mensajeDelTope({ tope: "ordenes", maximo: 1, usados: 1, pedidas: 1 }),
      mensajeDelTope({ tope: "rol", rol: "mensajero", maximo: 1, usados: 1, pedidas: 1 }),
      mensajeDelTope({ tope: "api_keys", maximo: 1, usados: 1, pedidas: 1 }),
    ].join(" ");
    expect(textos).not.toMatch(/servi|costa rica|colones|sinpe/i);
  });
});
