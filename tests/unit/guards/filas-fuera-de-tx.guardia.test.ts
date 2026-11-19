import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import {
  NOMBRE_INFORME,
  codigoDeSalida,
  comparar,
  enSoloLectura,
  leerEstado,
  leerFoto,
  lineasDeInforme,
  motivoSeguro,
  unir,
  type Estado,
  type Foto,
  type Informe,
} from "@/scripts/filas-fuera-de-tx";
import { crearOrganizacion, fijarEmpresa } from "../../fabricas/organizaciones";
import { HAY_BASE_DE_DATOS, crearPrismaDeTest, serializarEscriturasReales } from "../../integration/db/_postgres-real";
import { crearFksDeOrden } from "../../integration/db/_fixtures/orden-minima";

// SLT-188 «Tests que dejan filas fuera de su transacción» — la comprobacion TIENE que morder
// (R1176, `docs/gate.md > Probar que muerde`): filas nuevas -> salida 1 con esas filas; nada nuevo
// -> 0; filas que ya estaban en la foto «antes» -> 0. Primero con fixtures (la regla, sin base) y
// despues contra Postgres real (el SQL que descubre las tablas y cuenta: un doble no lo veria).

// Valores imposibles de encontrar por casualidad en una base de prueba.
const ORG_PREVIA = "org-previa-slt188-k7q2";
const ORG_NUEVA = "org-nueva-slt188-x9w4";
const REMISION = "R-SLT188-FIXTURE-Q7Z";
const ZONA = "Zona SLT188 fixture Q7Z";

const ANTES: Foto = {
  version: 2,
  organizaciones: [ORG_PREVIA],
  orderStatus: ["en_preparacion"],
  conteos: { orden: 0, zona: 0, usuario: 0 },
  insercionesOrganizacion: 7,
};

/** Un «despues» sin filas nuevas sobre una base con 3 tablas de empresa y 40 inserciones de la suite. */
function limpio(orderStatus: string[] = ["en_preparacion"]): Estado {
  return { organizaciones: [], orderStatus, tablas: 3, insercionesOrganizacion: 47 };
}

function estadoConFuga(): Estado {
  return {
    organizaciones: [
      {
        id: ORG_NUEVA,
        nombre: "Empresa de prueba slt188",
        slug: "prueba-slt188",
        filas: { organizacion: 1, orden: 1, zona: 1 },
        muestras: { orden: [REMISION], zona: [ZONA] },
      },
    ],
    orderStatus: ["en_preparacion"],
    tablas: 3,
    insercionesOrganizacion: 47,
  };
}

describe("SLT-188 R1170/R1176 — comparar: la regla, con fixtures", () => {
  it("R1176: una organizacion nueva con una orden y una zona suyas -> informe con esas filas y salida 1", () => {
    const informe = comparar(ANTES, estadoConFuga());
    expect(informe.organizaciones.map((o) => o.id), "SLT-188: la org nueva tiene que salir").toEqual([ORG_NUEVA]);
    expect(informe.organizaciones[0].filas).toEqual({ organizacion: 1, orden: 1, zona: 1 });
    expect(informe.totalFilas).toBe(3);
    expect(codigoDeSalida(informe)).toBe(1);
    const texto = lineasDeInforme(informe).join("\n");
    expect(texto).toContain(REMISION);
    expect(texto).toContain(ZONA);
    expect(texto).toContain("orden: 1");
    expect(texto).toContain("3 filas fuera de su transacción");
  });

  it("R1176: sin filas nuevas -> salida 0 y la linea «0 filas fuera de su transacción»", () => {
    const informe = comparar(ANTES, limpio());
    expect(codigoDeSalida(informe)).toBe(0);
    expect(informe.totalFilas).toBe(0);
    expect(lineasDeInforme(informe)).toEqual([
      "0 filas fuera de su transacción",
      "control: 3 tablas con organizacion_id antes / 3 despues; foto con 1 organizacion(es) y 0 fila(s) en esas tablas; 40 insercion(es) en organizacion durante la suite",
    ]);
  });

  it("R1176: filas de una organizacion que ya estaba en la foto «antes» -> salida 0", () => {
    const despues = estadoConFuga();
    despues.organizaciones[0].id = ORG_PREVIA;
    const informe = comparar(ANTES, despues);
    expect(informe.organizaciones).toEqual([]);
    expect(codigoDeSalida(informe)).toBe(0);
  });

  it("R1170: un `value` de order_status que no estaba -> salida 1 y se nombra", () => {
    const informe = comparar(ANTES, limpio(["en_preparacion", "estado_slt188_q7z"]));
    expect(informe.orderStatusNuevos).toEqual(["estado_slt188_q7z"]);
    expect(codigoDeSalida(informe)).toBe(1);
    expect(lineasDeInforme(informe).join("\n")).toContain("estado_slt188_q7z");
  });

  it("R1174: un informe que no pudo comparar cuenta como fallo (salida 1)", () => {
    const informe: Informe = {
      version: 2,
      estado: "error",
      motivo: "no hay foto «antes»",
      organizaciones: [],
      orderStatusNuevos: [],
      totalFilas: 0,
    };
    expect(codigoDeSalida(informe)).toBe(1);
  });
});

describe("SLT-188 R1174 — una comprobacion CIEGA no da 0: da fallo", () => {
  it("0 tablas con organizacion_id (base sin migrar o equivocada) -> error y salida 1", () => {
    const informe = comparar({ ...ANTES, conteos: {} }, { ...limpio(), tablas: 0 });
    expect(informe.estado).toBe("error");
    expect(informe.motivo).toContain("comprobacion ciega");
    expect(codigoDeSalida(informe)).toBe(1);
  });

  it("con exigirSuite: si la suite no inserto ninguna organizacion en ESTA base -> error y salida 1", () => {
    const informe = comparar(ANTES, { ...limpio(), insercionesOrganizacion: 7 }, { exigirSuite: true });
    expect(informe.estado).toBe("error");
    expect(informe.motivo).toContain("no inserto ninguna organizacion");
    expect(informe.control?.insercionesDuranteLaSuite).toBe(0);
    expect(codigoDeSalida(informe)).toBe(1);
    expect(lineasDeInforme(informe, "shard 1/3: ")[1]).toContain("0 insercion(es) en organizacion durante la suite");
  });

  it("con exigirSuite y escrituras de la suite -> ok, 0, y el control lo cuenta", () => {
    const informe = comparar(ANTES, limpio(), { exigirSuite: true });
    expect(informe.estado).toBe("ok");
    expect(informe.control?.insercionesDuranteLaSuite).toBe(40);
    expect(codigoDeSalida(informe)).toBe(0);
  });
});

describe("SLT-188 R1173/R1174 — unir: el veredicto de los shards", () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "slt188-unir-"));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function shard(base: string, i: number, informe: Informe | string): void {
    mkdirSync(join(base, `informe-shard-${i}`), { recursive: true });
    const cuerpo = typeof informe === "string" ? informe : JSON.stringify(informe);
    writeFileSync(join(base, `informe-shard-${i}`, NOMBRE_INFORME), cuerpo);
  }

  it("R1173: los tres en 0 -> salida 0 y el total dice «0 filas fuera de su transacción»", () => {
    const base = join(dir, "todo-cero");
    const cero = comparar(ANTES, limpio([]));
    for (const i of [1, 2, 3]) shard(base, i, cero);
    const r = unir(base, 3, "rojo");
    expect(r.codigo).toBe(0);
    expect(r.lineas).toContain("total: 0 filas fuera de su transacción");
  });

  it("R1173: un shard con filas -> rojo, nombrando shard, organizacion, tabla y conteo", () => {
    const base = join(dir, "con-fuga");
    shard(base, 1, comparar(ANTES, limpio([])));
    shard(base, 2, comparar(ANTES, estadoConFuga()));
    shard(base, 3, comparar(ANTES, limpio([])));
    const r = unir(base, 3, "rojo");
    expect(r.codigo).toBe(1);
    const linea = r.lineas.find((l) => l.startsWith("shard 2/3: organizacion"));
    expect(linea, "SLT-188: la linea del shard 2 con la org").toBeDefined();
    expect(linea).toContain(ORG_NUEVA);
    expect(linea).toContain("orden: 1");
    expect(linea).toContain("zona: 1");
  });

  it("R1174: falta el informe de un shard -> rojo (falla cerrado); JSON roto, tambien", () => {
    const base = join(dir, "falta");
    shard(base, 1, comparar(ANTES, limpio([])));
    shard(base, 2, "{ no es json");
    const r = unir(base, 3, "rojo");
    expect(r.codigo).toBe(1);
    expect(r.lineas.some((l) => l.startsWith("shard 3/3: falta el informe"))).toBe(true);
    expect(r.lineas.some((l) => l.startsWith("shard 2/3:") && l.includes("no es JSON"))).toBe(true);
  });

  it("T2: en modo informe se mide pero no pone rojo", () => {
    const base = join(dir, "informe");
    shard(base, 1, comparar(ANTES, estadoConFuga()));
    const r = unir(base, 2, "informe");
    expect(r.codigo).toBe(0);
    expect(r.lineas.some((l) => l.includes(ORG_NUEVA))).toBe(true);
    expect(r.lineas.some((l) => l.startsWith("shard 2/2: falta el informe"))).toBe(true);
  });
});

// SLT-204 «CI: avisar "se cayó un worker" en vez de culpar al PR de filas fuera de su transacción».
// Lo que de verdad dejo el run de T7 de SLT-188: el worker murio en el `beforeAll` de C02, sus casos
// quedaron sin correr y la comprobacion conto 12 filas. El artefacto del shard trae, junto al informe
// de filas, el log (`init-shard.log`) y el JSON de vitest (`.vitest-rojos.json`).
describe("SLT-204 — unir: un worker de vitest caido no se presenta como fuga del PR", () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "slt204-unir-"));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  // Ruta como la escribe vitest en CI (absoluta en el runner); el resumen la da relativa.
  const ARCHIVO_CAIDO = "/home/runner/work/x/x/tests/integration/db/454/caracterizacion/corte-concurrencia.test.ts";
  const ARCHIVO_SANO = "/home/runner/work/x/x/tests/unit/guards/otro-slt204-q8m.test.ts";

  /** Extracto del log del shard con la caida, tal como la imprime vitest 4 (pool `forks`). */
  const LOG_CON_CAIDA = [
    " ✓ tests/unit/guards/otro-slt204-q8m.test.ts (3 tests) 12ms",
    "⎯⎯⎯⎯⎯⎯ Unhandled Errors ⎯⎯⎯⎯⎯⎯",
    "Vitest caught 1 unhandled error during the test run.",
    "⎯⎯⎯⎯ Unhandled Error ⎯⎯⎯⎯",
    "Error: [vitest-pool]: Worker forks emitted error.",
    " ❯ EventEmitter.onTaskError node_modules/vitest/dist/chunks/cli-api.js:3456:21",
    "Caused by: Error: Worker exited unexpectedly",
  ].join("\n");
  const LOG_SIN_CAIDA = " ✓ tests/unit/guards/otro-slt204-q8m.test.ts (3 tests) 12ms\n Test Files  1 passed (1)\n";

  /** JSON de vitest: con `caido`, los casos de C02 quedan `pending` (estado `run`/`queued` al morir). */
  function jsonVitest(caido: boolean): string {
    const testResults = [
      {
        name: ARCHIVO_SANO,
        status: "passed",
        message: "",
        assertionResults: [{ status: "passed", title: "a" }],
      },
    ];
    if (caido) {
      testResults.push({
        name: ARCHIVO_CAIDO,
        status: "passed",
        message: "",
        assertionResults: [
          { status: "pending", title: "precondicion" },
          { status: "pending", title: "invariante" },
        ],
      });
    }
    return JSON.stringify({ success: !caido, numPendingTests: caido ? 2 : 0, testResults });
  }

  function shardCompleto(
    base: string,
    i: number,
    informe: Informe,
    extra: { log?: string; json?: string },
  ): void {
    const d = join(base, `informe-shard-${i}`);
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, NOMBRE_INFORME), JSON.stringify(informe));
    if (extra.log !== undefined) writeFileSync(join(d, "init-shard.log"), extra.log);
    if (extra.json !== undefined) writeFileSync(join(d, ".vitest-rojos.json"), extra.json);
  }

  it("con un worker caido (log + JSON) y filas sueltas: dice que se cayo el worker, nombra el archivo y pide relanzar; sigue en rojo", () => {
    const base = join(dir, "caido");
    shardCompleto(base, 1, comparar(ANTES, limpio([])), { log: LOG_SIN_CAIDA, json: jsonVitest(false) });
    shardCompleto(base, 2, comparar(ANTES, estadoConFuga()), { log: LOG_CON_CAIDA, json: jsonVitest(true) });
    shardCompleto(base, 3, comparar(ANTES, limpio([])), { log: LOG_SIN_CAIDA, json: jsonVitest(false) });
    const r = unir(base, 3, "rojo");
    expect(r.codigo, "SLT-204: el shard quedo incompleto: el rojo se mantiene").toBe(1);
    const aviso = r.lineas.find((l) => l.startsWith("shard 2/3: se cayó un worker de vitest"));
    expect(aviso, `SLT-204: falta el aviso del worker caido en:\n${r.lineas.join("\n")}`).toBeDefined();
    expect(aviso).toContain("tests/integration/db/454/caracterizacion/corte-concurrencia.test.ts");
    expect(aviso).not.toContain("/home/runner");
    expect(aviso).toContain("relanza el shard");
    // Las filas se siguen listando (sirven para limpiar), pero el cierre del shard y el total no las
    // presentan como fuga del PR.
    expect(r.lineas.some((l) => l.startsWith("shard 2/3: organizacion") && l.includes(ORG_NUEVA))).toBe(true);
    expect(r.lineas).not.toContain("shard 2/3: 3 filas fuera de su transacción");
    expect(r.lineas).toContain("shard 2/3: 3 filas sueltas tras la caída del worker: no se atribuyen al PR");
    const total = r.lineas.find((l) => l.startsWith("total:"));
    expect(total).toContain("worker de vitest caído en el shard 2");
    expect(total).toContain("relanza");
    expect(total).not.toContain("filas fuera de su transacción");
    // Los shards sanos no llevan aviso.
    expect(r.lineas.some((l) => /^shard [13]\/3: .*worker/.test(l))).toBe(false);
  });

  it("solo con el log (sin JSON de vitest, que no se escribio): avisa igual, sin nombrar archivo", () => {
    const base = join(dir, "solo-log");
    shardCompleto(base, 1, comparar(ANTES, estadoConFuga()), { log: LOG_CON_CAIDA });
    const r = unir(base, 1, "rojo");
    expect(r.codigo).toBe(1);
    expect(r.lineas.some((l) => l.startsWith("shard 1/1: se cayó un worker de vitest"))).toBe(true);
  });

  it("solo con el JSON (casos `pending` sin terminar) y log sin la traza: avisa igual", () => {
    const base = join(dir, "solo-json");
    shardCompleto(base, 1, comparar(ANTES, estadoConFuga()), { log: LOG_SIN_CAIDA, json: jsonVitest(true) });
    const r = unir(base, 1, "rojo");
    const aviso = r.lineas.find((l) => l.startsWith("shard 1/1: se cayó un worker de vitest"));
    expect(aviso).toBeDefined();
    expect(aviso).toContain("454/caracterizacion/corte-concurrencia.test.ts");
  });

  it("worker caido con 0 filas: rojo igualmente (el 0 de un shard incompleto no vale) y lo dice", () => {
    const base = join(dir, "caido-cero");
    shardCompleto(base, 1, comparar(ANTES, limpio([])), { log: LOG_CON_CAIDA, json: jsonVitest(true) });
    const r = unir(base, 1, "rojo");
    expect(r.codigo).toBe(1);
    expect(r.lineas.some((l) => l.startsWith("shard 1/1: se cayó un worker de vitest"))).toBe(true);
    expect(r.lineas).not.toContain("total: 0 filas fuera de su transacción");
    // m2 (review SLT-204): la linea del shard tampoco dice «0 filas fuera de su transacción».
    expect(r.lineas).not.toContain("shard 1/1: 0 filas fuera de su transacción");
    expect(r.lineas).toContain("shard 1/1: 0 filas sueltas, pero el shard quedó incompleto: ese 0 no mide");
  });

  it("m1: la frase del aviso DENTRO de un AssertionError o un diff, «Service Worker» y el arranque del pool no son caida", () => {
    const base = join(dir, "falso-positivo");
    const log = [
      " FAIL  tests/unit/guards/filas-fuera-de-tx.guardia.test.ts > algo",
      "AssertionError: expected 'shard 1/1: se cayó un worker de vitest («Worker exited unexpectedly»): el shard' to contain 'x'",
      "- Expected",
      "+ Received",
      "+ shard 1/1: se cayó un worker de vitest («Worker exited unexpectedly» en tests/a.test.ts)",
      "  console.log: Service Worker registrado",
      "[vitest-pool]: Worker forks started",
      "Nota: Error: Worker exited unexpectedly, citado a mitad de linea: no es la traza",
    ].join("\n");
    shardCompleto(base, 1, comparar(ANTES, limpio([])), { log, json: jsonVitest(false) });
    const r = unir(base, 1, "rojo");
    expect(r.lineas.some((l) => /se cayó un worker/.test(l)), r.lineas.join("\n")).toBe(false);
    expect(r.codigo).toBe(0);
    expect(r.lineas).toContain("total: 0 filas fuera de su transacción");
  });

  it("m1: la traza real con color ANSI y sangria delante si cuenta como caida", () => {
    const base = join(dir, "ansi");
    const log = "\u001b[31mError: [vitest-pool]: Worker forks emitted error.\u001b[39m\n";
    shardCompleto(base, 1, comparar(ANTES, limpio([])), { log });
    const r = unir(base, 1, "rojo");
    expect(r.lineas.some((l) => l.startsWith("shard 1/1: se cayó un worker de vitest"))).toBe(true);
  });

  it("sin caida (log y JSON sanos) y con filas: el mensaje de siempre, sin hablar de workers", () => {
    const base = join(dir, "sin-caida");
    shardCompleto(base, 1, comparar(ANTES, estadoConFuga()), { log: LOG_SIN_CAIDA, json: jsonVitest(false) });
    const r = unir(base, 1, "rojo");
    expect(r.codigo).toBe(1);
    expect(r.lineas).toContain("shard 1/1: 3 filas fuera de su transacción");
    expect(r.lineas).toContain("total: 3 filas fuera de su transacción; 0 shard(s) sin informe valido");
    expect(r.lineas.some((l) => /worker/i.test(l))).toBe(false);
  });

  it("sin caida y sin filas: «0 filas fuera de su transacción», salida 0", () => {
    const base = join(dir, "sin-caida-cero");
    shardCompleto(base, 1, comparar(ANTES, limpio([])), { log: LOG_SIN_CAIDA, json: jsonVitest(false) });
    const r = unir(base, 1, "rojo");
    expect(r.codigo).toBe(0);
    expect(r.lineas).toContain("total: 0 filas fuera de su transacción");
  });
});

describe("SLT-188 R1189 — el motivo de un error no lleva la URL", () => {
  it("de un error del driver solo sale la clase y el codigo", () => {
    const e = Object.assign(new Error("connect failed: host db-slt188-q7z.invalid, credencial secreto-slt188"), {
      code: "ECONNREFUSED",
    });
    const motivo = motivoSeguro(e);
    expect(motivo).toBe("Error (ECONNREFUSED)");
    expect(motivo).not.toContain("secreto-slt188");
  });
});

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

class Revertir extends Error {}

describeSiHayBase("SLT-188 R1170/R1175/R1176 — contra Postgres real", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = crearPrismaDeTest();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("R1176/R1170: org + zona + orden + usuario nuevos (en una tx revertida) -> salen con sus conteos y muestras, salida 1", async () => {
    const sufijo = randomUUID().slice(0, 8);
    const remision = `R-SLT188-${sufijo}`;
    let medido: { informe: Informe; orgId: string; zonaNombre: string } | undefined;
    await prisma
      .$transaction(
        async (tx) => {
          await serializarEscriturasReales(tx);
          const antes = await leerFoto(tx);
          const org = await crearOrganizacion(tx, { nombre: `Empresa SLT188 ${sufijo}` });
          await fijarEmpresa(tx, org.id);
          const fks = await crearFksDeOrden(tx);
          await tx.orden.create({
            data: {
              numRemision: remision,
              destinatario: "Dest",
              telefonoDest: "88880000",
              producto: "Prod",
              estatusId: fks.estatusId,
              tiendaId: fks.tiendaId,
              zonaId: fks.zonaId,
              provinciaId: fks.provinciaId,
              cantonId: fks.cantonId,
            },
            select: { id: true },
          });
          const zona = await tx.zona.findUniqueOrThrow({ where: { id: fks.zonaId }, select: { nombre: true } });
          medido = { informe: comparar(antes, await leerEstado(tx, antes)), orgId: org.id, zonaNombre: zona.nombre };
          throw new Revertir();
        },
        { timeout: 60_000, maxWait: 30_000 },
      )
      .catch((e: unknown) => {
        if (!(e instanceof Revertir)) throw e;
      });

    expect(medido, "SLT-188: la tx tiene que haber medido").toBeDefined();
    const { informe, orgId, zonaNombre } = medido!;
    // En READ COMMITTED pueden aparecer orgs que otro worker commitea a la vez (clase b): se busca la nuestra.
    const nuestra = informe.organizaciones.find((o) => o.id === orgId);
    expect(nuestra, "SLT-188: la org creada en la tx tiene que salir en el informe").toBeDefined();
    expect(nuestra!.filas.organizacion).toBe(1);
    expect(nuestra!.filas.orden).toBe(1);
    expect(nuestra!.filas.zona).toBe(1);
    expect(nuestra!.filas.usuario).toBe(1);
    expect(nuestra!.muestras.orden).toEqual([remision]);
    expect(nuestra!.muestras.zona).toEqual([zonaNombre]);
    expect(nuestra!.muestras.usuario).toHaveLength(1);
    expect(codigoDeSalida(informe)).toBe(1);

    // Y el rollback se la llevo: fuera de la tx no existe.
    const fuera = await prisma.organizacion.count({ where: { id: orgId } });
    expect(fuera).toBe(0);
  });

  it("R1176: foto y estado en la MISMA instantanea de solo lectura, sin escribir nada -> salida 0", async () => {
    const informe = await enSoloLectura(prisma, async (c) => {
      const antes = await leerFoto(c);
      return comparar(antes, await leerEstado(c, antes));
    });
    expect(informe.estado).toBe("ok");
    expect(informe.organizaciones).toEqual([]);
    expect(codigoDeSalida(informe)).toBe(0);
  });

  it("R1175: la lectura va en una transaccion READ ONLY: un INSERT dentro revienta (25006)", async () => {
    let codigo: string | undefined;
    await enSoloLectura(prisma, async (c) => {
      await (c as unknown as { $executeRawUnsafe: (s: string) => Promise<number> })
        .$executeRawUnsafe(`INSERT INTO "organizacion" (id, nombre, slug) VALUES ('slt188-ro', 'x', 'slt188-ro')`)
        .catch((e: unknown) => {
          const o = e as { code?: string; cause?: { code?: string }; meta?: { code?: string }; message?: string };
          codigo = o.cause?.code ?? o.meta?.code ?? (o.message?.includes("25006") ? "25006" : o.code);
        });
      // Siempre se revierte: si el INSERT hubiera entrado (la transaccion NO era de solo lectura), el
      // caso tiene que fallar sin dejar la fila confirmada.
      throw new Revertir();
    }).catch((e: unknown) => {
      if (!(e instanceof Revertir)) throw e;
    });
    expect(codigo, "SLT-188: el INSERT en solo lectura tiene que fallar con 25006").toBe("25006");
    expect(await prisma.organizacion.count({ where: { id: "slt188-ro" } })).toBe(0);
  });
});
