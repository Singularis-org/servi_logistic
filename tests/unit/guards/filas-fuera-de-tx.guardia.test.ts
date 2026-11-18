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
