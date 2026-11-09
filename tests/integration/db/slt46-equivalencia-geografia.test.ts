import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import type { Actor } from "@/lib/interfaces/services/IVehiculoService";
import { GeoRepository } from "@/lib/repositories/GeoRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { CargaDivisionService } from "@/lib/services/CargaDivisionService";
import { GeografiaService } from "@/lib/services/GeografiaService";
import { crearOrganizacion } from "@/tests/fabricas/organizaciones";
import {
  PAIS_CUATRO_NIVELES,
  claveDeRuta,
  residuosDePaisesDePrueba,
  sembrarPaisDePruebaGeo,
} from "@/tests/fixtures/paises-de-prueba-geo";
import { revertida } from "./_fixtures/pais-20";
import { idDeRol, insertarUsuario } from "./_fixtures/superadmin-32";
import { HAY_BASE_DE_DATOS, clienteConSavepoint, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";

// SLT-46 (T5.2; design §2.2, §11; R11, R12) — después de una secuencia COMPLETA hecha por los services
// de la pantalla (alta, renombre, retiro, reactivación y carga CSV), los nodos de profundidad 1–3 de
// cada país y sus filas de `provincia`/`canton`/`distrito` son iguales fila a fila: mismo id, nombre,
// código, `activo`, padre y país, y ninguno de un lado sin el otro. La app ya no escribe la geografía
// vieja (R1): lo que se mide aquí es que la copia del trigger no se queda atrás en ninguna operación.
//
// Dos países, cada uno en una transacción del dueño que se revierte:
//   · Costa Rica tal cual está en la base (585 nodos), con sus reglas de código (1/3/5 dígitos con
//     prefijo): la secuencia toca nodos sembrados y nodos nuevos, y se compara el país ENTERO.
//   · `XP`, el país de prueba de 4 niveles: además, ningún nodo de profundidad 4 tiene fila vieja.
// La contraprueba apaga la copia en la transacción revertida y ve la diferencia: la comparación no es
// vacía por construcción.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const TRIGGER_DE_COPIA = "nodo_geografico_copia_a_geografia_vieja";

let base: PrismaClient;

interface Diferencia {
  id: string;
  nodo: string | null;
  vieja: string | null;
}

/**
 * Las filas de profundidad 1–3 del país donde el nodo y la geografía vieja NO coinciden, como texto
 * legible (`[]` = 0 diferencias). Un id que solo existe de un lado también es una diferencia.
 */
async function diferencias(tx: TxDeTest, paisId: string): Promise<{ comparadas: number; distintas: Diferencia[] }> {
  const filas = await tx.$queryRawUnsafe<(Diferencia & { igual: boolean })[]>(
    `WITH n AS (
       SELECT id, nombre, codigo_oficial AS codigo, activo, padre_id AS padre, pais_id AS pais, profundidad
         FROM nodo_geografico WHERE pais_id = $1 AND profundidad <= 3
     ), v AS (
       SELECT id, nombre, codigo_dta AS codigo, activo, NULL::text AS padre, pais_id AS pais, 1 AS profundidad FROM provincia WHERE pais_id = $1
       UNION ALL SELECT id, nombre, codigo_dta, activo, provincia_id, pais_id, 2 FROM canton WHERE pais_id = $1
       UNION ALL SELECT id, nombre, codigo_dta, activo, canton_id, pais_id, 3 FROM distrito WHERE pais_id = $1
     )
     SELECT COALESCE(n.id, v.id) AS id,
            CASE WHEN n.id IS NULL THEN NULL ELSE concat_ws(' | ', n.nombre, n.codigo, n.activo, n.padre, n.pais, n.profundidad) END AS nodo,
            CASE WHEN v.id IS NULL THEN NULL ELSE concat_ws(' | ', v.nombre, v.codigo, v.activo, v.padre, v.pais, v.profundidad) END AS vieja,
            (n.id IS NOT NULL AND v.id IS NOT NULL
             AND (n.nombre, n.codigo, n.activo, n.padre, n.pais, n.profundidad)
                 IS NOT DISTINCT FROM (v.nombre, v.codigo, v.activo, v.padre, v.pais, v.profundidad)) AS igual
       FROM n FULL OUTER JOIN v ON v.id = n.id`,
    paisId,
  );
  return {
    comparadas: filas.length,
    distintas: filas.filter((f) => !f.igual).map(({ id, nodo, vieja }) => ({ id, nodo, vieja })),
  };
}

/** Los nodos de profundidad 4 o más del país que tienen fila en alguna tabla vieja (R3: ninguno). */
async function profundosConFilaVieja(tx: TxDeTest, paisId: string): Promise<number> {
  const [{ n }] = await tx.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM nodo_geografico g
      WHERE g.pais_id = $1 AND g.profundidad > 3
        AND (EXISTS (SELECT 1 FROM provincia WHERE id = g.id) OR EXISTS (SELECT 1 FROM canton WHERE id = g.id)
             OR EXISTS (SELECT 1 FROM distrito WHERE id = g.id))`,
    paisId,
  );
  return n;
}

interface Contexto {
  tx: TxDeTest;
  geografia: GeografiaService;
  carga: CargaDivisionService;
  actor: Actor;
}

async function conServicios<T>(tx: TxDeTest, fn: (c: Contexto) => Promise<T>): Promise<T> {
  const org = await crearOrganizacion(tx);
  const u = await insertarUsuario(tx, await idDeRol(tx, "maestro"), org.id);
  if (!u.desenlace.ok) throw new Error(`no se sembró el actor: ${JSON.stringify(u.desenlace)}`);
  const cliente = clienteConSavepoint(tx);
  const geo = new GeoRepository(cliente);
  return fn({
    tx,
    geografia: new GeografiaService(geo, new OrdenRepository(cliente)),
    carga: new CargaDivisionService(geo),
    actor: { usuarioId: u.id, rol: "superadmin" },
  });
}

function csv(cabecera: string, ...lineas: string[]) {
  return { nombre: "division.csv", bytes: new TextEncoder().encode([cabecera, ...lineas, ""].join("\n")) };
}

function exigirOk<T extends { status: string }>(paso: string, r: T): Extract<T, { status: "ok" }> {
  if (r.status !== "ok") throw new Error(`${paso}: ${JSON.stringify(r)}`);
  return r as Extract<T, { status: "ok" }>;
}

/** La secuencia de la pantalla sobre Costa Rica, con sus reglas de código. Devuelve lo que pasó. */
async function secuenciaEnCostaRica({ tx, geografia, carga, actor }: Contexto) {
  const sanJose = await tx.nodoGeografico.findFirstOrThrow({ where: { paisId: "CR", profundidad: 1, codigoOficial: "1" } });
  const cantonSembrado = await tx.nodoGeografico.findFirstOrThrow({ where: { paisId: "CR", profundidad: 2, padreId: sanJose.id }, orderBy: { codigoOficial: "asc" } });
  const distritoSembrado = await tx.nodoGeografico.findFirstOrThrow({ where: { paisId: "CR", profundidad: 3, padreId: cantonSembrado.id }, orderBy: { codigoOficial: "asc" } });

  // Altas: una provincia sin código y, bajo San José, un cantón y un distrito con el código de la regla.
  const prov = exigirOk("alta provincia", await geografia.crear({ paisId: "CR", nombre: "Provincia Equivalencia" }, actor));
  const canton = exigirOk("alta cantón", await geografia.crear({ padreId: sanJose.id, nombre: "Cantón Equivalencia", codigo: "199" }, actor));
  const distrito = exigirOk("alta distrito", await geografia.crear({ padreId: canton.id, nombre: "Distrito Equivalencia", codigo: "19901" }, actor));

  // Renombres: los nuevos y un distrito sembrado.
  exigirOk("renombre provincia", await geografia.renombrar({ id: prov.id, nombre: "Provincia Renombrada", nombreAnterior: "Provincia Equivalencia" }, actor));
  exigirOk("renombre cantón", await geografia.renombrar({ id: canton.id, nombre: "Cantón Renombrado", nombreAnterior: "Cantón Equivalencia" }, actor));
  exigirOk("renombre sembrado", await geografia.renombrar({ id: distritoSembrado.id, nombre: `${distritoSembrado.nombre} Sur`, nombreAnterior: distritoSembrado.nombre }, actor));

  // Retiro y reactivación de un cantón sembrado; el distrito nuevo queda retirado.
  exigirOk("retiro cantón", await geografia.cambiarActivacion({ id: cantonSembrado.id, activo: false }, actor));
  exigirOk("reactivación cantón", await geografia.cambiarActivacion({ id: cantonSembrado.id, activo: true }, actor));
  exigirOk("retiro distrito", await geografia.cambiarActivacion({ id: distrito.id, activo: false }, actor));

  // Carga CSV con el formato de SL-20: completa el código de la provincia nueva y le crea cantón y distrito.
  const resumen = await carga.cargar(
    "CR",
    csv(
      "nivel_1,codigo_nivel_1,nivel_2,codigo_nivel_2,nivel_3,codigo_nivel_3",
      "Provincia Renombrada,8,Cantón CSV,801,Distrito CSV,80101",
      "Provincia Renombrada,8,Cantón CSV,801,Otro Distrito CSV,80102",
    ),
    actor,
  );
  return { resumen };
}

/** La misma secuencia sobre `XP` (4 niveles, códigos libres), con escrituras también en la profundidad 4. */
async function secuenciaEnCuatroNiveles({ tx, geografia, carga, actor }: Contexto) {
  const { nodoPorRuta } = await sembrarPaisDePruebaGeo(tx, PAIS_CUATRO_NIVELES);
  const nodo = (ruta: string[]): string => nodoPorRuta.get(claveDeRuta(ruta)) ?? "";

  const r1 = exigirOk("alta 1", await geografia.crear({ paisId: "XP", nombre: "Biobío", codigo: "08" }, actor));
  const r2 = exigirOk("alta 2", await geografia.crear({ padreId: r1.id, nombre: "Concepción", codigo: "081" }, actor));
  const r3 = exigirOk("alta 3", await geografia.crear({ padreId: r2.id, nombre: "Talcahuano", codigo: "08110" }, actor));
  const r4 = exigirOk("alta 4", await geografia.crear({ padreId: r3.id, nombre: "Las Higueras" }, actor));

  exigirOk("renombre 2", await geografia.renombrar({ id: r2.id, nombre: "Gran Concepción", nombreAnterior: "Concepción" }, actor));
  exigirOk("renombre 4", await geografia.renombrar({ id: r4.id, nombre: "Higueras", nombreAnterior: "Las Higueras" }, actor));
  exigirOk(
    "renombre sembrado 3",
    await geografia.renombrar({ id: nodo(["Ñuble", "Diguillín", "Chillán"]), nombre: "Chillán Viejo", nombreAnterior: "Chillán" }, actor),
  );

  const quilpue = nodo(["Valparaíso", "Marga Marga", "Quilpué"]);
  exigirOk("retiro 3", await geografia.cambiarActivacion({ id: quilpue, activo: false }, actor));
  exigirOk("reactivación 3", await geografia.cambiarActivacion({ id: quilpue, activo: true }, actor));
  exigirOk("reactivación sembrado 3", await geografia.cambiarActivacion({ id: nodo(["Valparaíso", "Marga Marga", "Villa Alemana"]), activo: true }, actor));
  exigirOk("retiro 1", await geografia.cambiarActivacion({ id: r1.id, activo: false }, actor));

  const resumen = await carga.cargar(
    "XP",
    csv(
      "nivel_1,codigo_nivel_1,nivel_2,codigo_nivel_2,nivel_3,codigo_nivel_3,nivel_4,codigo_nivel_4",
      "Valparaíso,05,Marga Marga,058,Quilpué,05801,Los Pinos,0580199",
      "Los Lagos,10,Osorno,103,Purranque,10303,,",
      "Ñuble,16,Diguillín,161,Chillán Viejo,16101,Centro,1610101",
    ),
    actor,
  );
  return { resumen };
}

describeSiHayBase("SLT-46 T5.2 — R11/R12: nodos 1–3 = geografía vieja tras la secuencia de la pantalla", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    const residuos = base === undefined ? null : await residuosDePaisesDePrueba(base);
    await base?.$disconnect();
    expect(residuos).toEqual({ paises: 0, tipos: 0, nodos: 0, organizaciones: 0 });
  });

  it("control: antes de la secuencia, Costa Rica ya es igual en los dos lados", async () => {
    const r = await revertida(base, (tx) => diferencias(tx, "CR"));
    expect(r.distintas).toEqual([]);
    expect(r.comparadas).toBeGreaterThan(0);
  });

  it("Costa Rica: alta, renombre, retiro, reactivación y CSV por los services → 0 diferencias fila a fila", async () => {
    const r = await revertida(base, (tx) =>
      conServicios(tx, async (c) => {
        const antes = await diferencias(tx, "CR");
        const { resumen } = await secuenciaEnCostaRica(c);
        return { resumen, antes: antes.comparadas, despues: await diferencias(tx, "CR") };
      }),
    );

    expect(r.resumen).toEqual({
      status: "ok",
      creados: { 1: 0, 2: 1, 3: 2 },
      existentes: 1,
      codigosCompletados: 1,
      avisos: [],
    });
    expect(r.despues.distintas).toEqual([]);
    // Tres altas por el service y tres nodos del CSV: seis filas más a cada lado.
    expect(r.despues.comparadas).toBe(r.antes + 6);
  });

  it("país de 4 niveles: la misma secuencia → 0 diferencias en 1–3 y ninguna fila vieja de profundidad 4", async () => {
    const r = await revertida(base, (tx) =>
      conServicios(tx, async (c) => {
        const { resumen } = await secuenciaEnCuatroNiveles(c);
        return {
          resumen,
          despues: await diferencias(tx, "XP"),
          profundos: await profundosConFilaVieja(tx, "XP"),
          nodos4: await tx.nodoGeografico.count({ where: { paisId: "XP", profundidad: 4 } }),
        };
      }),
    );

    expect(r.resumen).toMatchObject({ status: "ok", creados: { 1: 1, 2: 1, 3: 1, 4: 1 }, codigosCompletados: 1 });
    expect(r.despues.distintas).toEqual([]);
    // Sembrados 1–3: 7; altas 1–3: 3; CSV 1–3: 3 (Los Lagos, Osorno, Purranque).
    expect(r.despues.comparadas).toBe(13);
    // Sembrados 3 (El Belloto, Peñablanca, Centro) + alta 1 + CSV 1 (Los Pinos), y ninguno con fila vieja (R3).
    expect(r.nodos4).toBe(5);
    expect(r.profundos).toBe(0);
  });

  it("CONTRAPRUEBA: con la copia apagada en la transacción, un renombre por el service SÍ deja una diferencia", async () => {
    const r = await revertida(base, (tx) =>
      conServicios(tx, async ({ geografia, actor }) => {
        const { nodoPorRuta } = await sembrarPaisDePruebaGeo(tx, PAIS_CUATRO_NIVELES);
        const id = nodoPorRuta.get(claveDeRuta(["Valparaíso", "Marga Marga"])) ?? "";
        await tx.$executeRawUnsafe(`ALTER TABLE "nodo_geografico" DISABLE TRIGGER "${TRIGGER_DE_COPIA}"`);
        exigirOk("renombre", await geografia.renombrar({ id, nombre: "Marga Marga Norte", nombreAnterior: "Marga Marga" }, actor));
        const d = await diferencias(tx, "XP");
        await tx.$executeRawUnsafe(`ALTER TABLE "nodo_geografico" ENABLE TRIGGER "${TRIGGER_DE_COPIA}"`);
        return { id, d };
      }),
    );

    expect(r.d.distintas).toHaveLength(1);
    expect(r.d.distintas[0]).toMatchObject({ id: r.id });
    expect(r.d.distintas[0].nodo).toContain("Marga Marga Norte");
    expect(r.d.distintas[0].vieja).not.toContain("Marga Marga Norte");
    // La transacción se revirtió: el trigger sigue encendido.
    const [trigger] = await base.$queryRawUnsafe<{ tgenabled: string }[]>(
      `SELECT t."tgenabled"::text AS "tgenabled" FROM "pg_trigger" t JOIN "pg_class" c ON c."oid" = t."tgrelid"
        WHERE t."tgname" = $1 AND c."relname" = 'nodo_geografico'`,
      TRIGGER_DE_COPIA,
    );
    expect(trigger?.tgenabled).toBe("O");
  });
});
