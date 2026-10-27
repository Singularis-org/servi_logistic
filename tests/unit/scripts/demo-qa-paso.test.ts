import { describe, expect, it } from "vitest";

import { enParalelo } from "@/scripts/demo-qa/paralelo";
import { enPaso, FalloDePaso, rutaDePasos } from "@/scripts/demo-qa/paso";
import { lineaDeError, rastroDelError, tiempoVencido } from "@/scripts/demo-qa/salida";

// SL-43 (medición del build de QA) — un rojo del build tiene que decir en qué paso cayó. El build
// cayó con «PrismaClientKnownRequestError P2028» y nada más; con A y B y sus tramos a la vez, no
// había forma de saber cuál.

/** Un error con la forma de un `PrismaClientKnownRequestError` de Prisma 7, con un dato en el mensaje. */
function errorDePrisma(code: string, mensaje: string): Error {
  const e = new Error(`Invalid \`prisma.$queryRaw()\` invocation:\n\nTransaction API error: ${mensaje} host=db.secreto.example`);
  e.name = "PrismaClientKnownRequestError";
  (e as Error & { code: string }).code = code;
  return e;
}

const P2028_TIMEOUT = () =>
  errorDePrisma(
    "P2028",
    "A query cannot be executed on an expired transaction. The timeout for this transaction was 5000 ms, however 5491 ms passed since the start of the transaction.",
  );
const P2028_MAXWAIT = () => errorDePrisma("P2028", "Unable to start a transaction in the given time.");

describe("enPaso — la ruta del paso que falló", () => {
  it("el paso más interno nombra el error, con la ruta entera", async () => {
    const r = enPaso("empresa A", () =>
      enPaso("tramos", () => enPaso("mensajero-central", () => enPaso("gestionar(entregado)", async () => {
        throw P2028_TIMEOUT();
      }))),
    );
    const error = await r.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FalloDePaso);
    expect((error as FalloDePaso).ruta).toEqual(["empresa A", "tramos", "mensajero-central", "gestionar(entregado)"]);
    expect(lineaDeError(error)).toBe(
      "[demo-qa] FALLÓ la demo en «empresa A › tramos › mensajero-central › gestionar(entregado)»: " +
        "PrismaClientKnownRequestError P2028, timeout de la transacción",
    );
  });

  it("dos ramas a la vez no mezclan sus rutas", async () => {
    const vistas: string[] = [];
    await enPaso("empresa A", () =>
      enParalelo([
        enPaso("satélite", async () => {
          await new Promise((r) => setTimeout(r, 5));
          vistas.push(rutaDePasos().join(" › "));
        }),
        enPaso("incidente", async () => {
          vistas.push(rutaDePasos().join(" › "));
        }),
      ]),
    );
    expect(vistas.sort()).toEqual(["empresa A › incidente", "empresa A › satélite"]);
    expect(rutaDePasos()).toEqual([]);
  });

  it("un error de la propia demo conserva su texto; uno ajeno, solo su rastro (R5)", async () => {
    const propio = await enPaso("dinero", async () => {
      throw new Error("[demo-qa] «AbonoTiendaService.registrar» no fue ok: conflict");
    }).catch((e: unknown) => e);
    expect(lineaDeError(propio)).toBe("[demo-qa] FALLÓ la demo en «dinero»: «AbonoTiendaService.registrar» no fue ok: conflict");

    const ajeno = await enPaso("dinero", async () => {
      throw P2028_TIMEOUT();
    }).catch((e: unknown) => e);
    expect(lineaDeError(ajeno)).not.toMatch(/secreto|Invalid|5491/);
  });
});

describe("rastroDelError — cuál de los dos tiempos del P2028 venció", () => {
  it("timeout: la transacción duró más que su tiempo de vida", () => {
    expect(rastroDelError(P2028_TIMEOUT())).toBe("PrismaClientKnownRequestError P2028, timeout de la transacción");
  });

  it("maxWait: la transacción no consiguió conexión a tiempo", () => {
    expect(rastroDelError(P2028_MAXWAIT())).toBe(
      "PrismaClientKnownRequestError P2028, maxWait de la transacción (esperando conexión)",
    );
  });

  it("otro código no lleva tiempo, aunque el mensaje se parezca", () => {
    expect(rastroDelError(errorDePrisma("P2002", "Unable to start a transaction in the given time."))).toBe(
      "PrismaClientKnownRequestError P2002",
    );
    expect(tiempoVencido(new Error("cualquier cosa"))).toBeUndefined();
  });

  it("envuelto por un paso, el rastro sigue viendo el código y el tiempo de la causa", () => {
    const envuelto = new FalloDePaso(["borrado"], P2028_MAXWAIT());
    expect(rastroDelError(envuelto)).toBe("FalloDePaso P2028, maxWait de la transacción (esperando conexión)");
  });
});
