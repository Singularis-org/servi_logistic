import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

import { crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";
import { crearFksDeOrden } from "./_fixtures/orden-minima";
import { comoDueno, errorEnSavepoint, intentar, revertida, sqlstateDe } from "./_fixtures/pais-20";
import { sentenciasSql, soloEjecutable } from "./_fixtures/sql-ejecutable";
import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";

// SLT-75 (T6, design §3, R9-R13) — las dos migraciones de la ficha, contra Postgres real.
//
//   20261101090000_zona_distrito_duplicados_sin_zona      (datos: respaldo + DELETE)
//   20261101090100_zona_distrito_distrito_unico_por_empresa (indice unico por empresa)
//
// COMO SE MIDE. Todo dentro de UNA transaccion del dueno que SIEMPRE se revierte (`revertida`):
//   1. se vuelve al estado ANTERIOR a la ficha con los dos `down.sql` REALES, en orden inverso (la
//      base de test ya las tiene aplicadas, y con el indice puesto no se puede sembrar un duplicado).
//      Desde SLT-76 (`20261102090100_slt76_retirar_respaldos`) la base ya no tiene el respaldo, asi
//      que el down de datos toma el camino «no hace nada» (avisa con un NOTICE, design §9.2 de SLT-76);
//   2. se siembra: un distrito en DOS zonas NO centrales de la empresa A (R9b), el mismo distrito en
//      una zona de la empresa B, otro distrito en una sola zona de A y una orden de A en el distrito
//      duplicado (las combinaciones con zona central, R9, van en su propio bloque al final);
//   3. se aplican los dos `migration.sql` REALES y se toma la foto;
//   4. se aplican los dos `down.sql` REALES en orden inverso y se toma otra foto.
// El rollback deja la base como estaba (indice incluido), pase lo que pase.
//
// ESQUEMA COMPARTIDO (review B1). `respaldo` no es de esta ficha: SLT-73 guardaba ahi
// `respaldo.slt73_asientos` (SLT-76 retiro los dos respaldos). El down borra SU tabla y el esquema SOLO si queda vacio. Se mide en los
// dos sentidos: con una tabla AJENA sembrada en `respaldo` (queda intacta, con su fila, y el esquema
// tambien), y con el esquema vaciado a proposito en la transaccion revertida (el down lo quita).
//
// Datos SINTETICOS: zonas y empresas inventadas; los distritos son ids del catalogo, sin nombres.
//
// Mutaciones (progress/impl_SLT-75.md): PARTITION sin empresa (R9), lado conservado invertido,
// sin distinguir `es_central` y R9 tambien con 3 zonas (R9/R9b), respaldo en `public` (R10),
// UPDATE de la orden (R11), down sin INSERT (R12), indice sin `organizacion_id` o sin indice (R7).

const MIGRACIONES = path.join(process.cwd(), "db", "migrations");
const DIR_DATOS = "20261101090000_zona_distrito_duplicados_sin_zona";
const DIR_INDICE = "20261101090100_zona_distrito_distrito_unico_por_empresa";
const INDICE = "zona_distrito_organizacion_id_distrito_id_key";
const RESPALDO = "respaldo.slt75_zona_distrito_duplicado";
/** Tabla AJENA sembrada en `respaldo` por el test: hace de respaldo de otra ficha. */
const AJENA = "respaldo.slt75_test_tabla_ajena";

function leer(dir: string, archivo: "migration.sql" | "down.sql"): string {
  return fs.readFileSync(path.join(MIGRACIONES, dir, archivo), "utf8");
}

async function aplicar(tx: TxDeTest, sql: string): Promise<void> {
  // `sentenciasSql` respeta el bloque `DO $slt75$ … $slt75$` del down: viaja entero.
  for (const stmt of sentenciasSql(sql)) await tx.$executeRawUnsafe(stmt);
}

async function subir(tx: TxDeTest): Promise<void> {
  await aplicar(tx, leer(DIR_DATOS, "migration.sql"));
  await aplicar(tx, leer(DIR_INDICE, "migration.sql"));
}

/** Los dos `down.sql`, en orden INVERSO (el del indice primero: design §3.1). */
async function bajar(tx: TxDeTest): Promise<void> {
  await aplicar(tx, leer(DIR_INDICE, "down.sql"));
  await aplicar(tx, leer(DIR_DATOS, "down.sql"));
}

interface Fila {
  id: string;
  zona_id: string;
  distrito_id: string;
  organizacion_id: string;
}

async function filasDeZonas(tx: TxDeTest, zonas: string[]): Promise<Fila[]> {
  return tx.$queryRawUnsafe<Fila[]>(
    `SELECT id, zona_id, distrito_id, organizacion_id FROM zona_distrito
      WHERE zona_id = ANY($1::text[]) ORDER BY id`,
    zonas,
  );
}

async function indiceDef(tx: TxDeTest): Promise<string | null> {
  const filas = await tx.$queryRawUnsafe<Array<{ indexdef: string }>>(
    `SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = $1`,
    INDICE,
  );
  return filas[0]?.indexdef ?? null;
}

async function esquemasDelRespaldo(tx: TxDeTest): Promise<string[]> {
  const filas = await tx.$queryRawUnsafe<Array<{ s: string }>>(
    `SELECT table_schema AS s FROM information_schema.tables
      WHERE table_name = 'slt75_zona_distrito_duplicado' ORDER BY 1`,
  );
  return filas.map((f) => f.s);
}

async function existeEsquemaRespaldo(tx: TxDeTest): Promise<boolean> {
  const [f] = await tx.$queryRawUnsafe<Array<{ n: number }>>(
    `SELECT count(*)::int AS n FROM pg_namespace WHERE nspname = 'respaldo'`,
  );
  return f.n > 0;
}

/** Filas de la tabla ajena; `null` si ya no existe. */
async function filasAjenas(tx: TxDeTest): Promise<number | null> {
  const [{ existe }] = await tx.$queryRawUnsafe<Array<{ existe: boolean }>>(
    `SELECT to_regclass('${AJENA}') IS NOT NULL AS existe`,
  );
  if (!existe) return null;
  const [f] = await tx.$queryRawUnsafe<Array<{ n: number }>>(`SELECT count(*)::int AS n FROM ${AJENA}`);
  return f.n;
}

async function totalZonaDistrito(tx: TxDeTest): Promise<number> {
  const [f] = await tx.$queryRawUnsafe<Array<{ n: number }>>(
    `SELECT count(*)::int AS n FROM zona_distrito`,
  );
  return f.n;
}

/** Tres distritos distintos de un mismo canton del catalogo (lo da `crearFksDeOrden`). */
async function tresDistritos(tx: TxDeTest, cantonId: string): Promise<[string, string, string]> {
  const ds = await tx.distrito.findMany({
    where: { cantonId },
    select: { id: true },
    orderBy: { id: "asc" },
    take: 3,
  });
  if (ds.length < 3) throw new Error("faltan distritos en el catalogo: aplica las migraciones");
  return [ds[0].id, ds[1].id, ds[2].id];
}

async function crearZona(tx: TxDeTest, nombre: string): Promise<string> {
  const z = await tx.zona.create({
    data: {
      nombre: `${nombre} ${randomUUID().slice(0, 8)}`,
      sinpeNumero: "80000000",
      sinpeNombre: "Titular de Prueba",
    },
    select: { id: true },
  });
  return z.id;
}

async function vincular(tx: TxDeTest, org: string, zonaId: string, distritoId: string): Promise<string> {
  const id = randomUUID();
  await tx.$executeRawUnsafe(
    `INSERT INTO zona_distrito (id, zona_id, distrito_id, organizacion_id) VALUES ($1, $2, $3, $4)`,
    id,
    zonaId,
    distritoId,
    org,
  );
  return id;
}

/** Lo que el `servi_app` puede o no hacer con el respaldo: SQLSTATE o `null` si pudo. */
async function servi_appSobreRespaldo(tx: TxDeTest, sql: string): Promise<string | null> {
  const error = await errorEnSavepoint(tx, async () => {
    await tx.$executeRawUnsafe(`SET LOCAL ROLE servi_app`);
    await tx.$queryRawUnsafe(sql);
  });
  await comoDueno(tx);
  return error === null ? null : sqlstateDe(error);
}

// ---------------------------------------------------------------------------------------------
// Estatico: corre SIEMPRE, tambien sin base.
// ---------------------------------------------------------------------------------------------
describe("SLT-75 — forma en disco de las dos migraciones", () => {
  it("las dos carpetas traen migration.sql y down.sql", () => {
    for (const dir of [DIR_DATOS, DIR_INDICE]) {
      expect(fs.existsSync(path.join(MIGRACIONES, dir, "migration.sql"))).toBe(true);
      expect(fs.existsSync(path.join(MIGRACIONES, dir, "down.sql"))).toBe(true);
    }
  });

  // R11: el SQL ejecutable de los datos no nombra la tabla de ordenes en absoluto.
  it("R11 — la migracion de datos no menciona `orden`", () => {
    expect(soloEjecutable(leer(DIR_DATOS, "migration.sql"))).not.toMatch(/orden/i);
  });

  it("R12 — el down de datos reinserta con organizacion_id, WHERE EXISTS y ON CONFLICT DO NOTHING", () => {
    const down = soloEjecutable(leer(DIR_DATOS, "down.sql"));
    expect(down).toMatch(/INSERT INTO zona_distrito \(id, zona_id, distrito_id, organizacion_id\)/);
    expect(down).toMatch(/WHERE EXISTS/);
    expect(down).toMatch(/ON CONFLICT DO NOTHING/);
  });
});

// ---------------------------------------------------------------------------------------------
// Contra Postgres real.
// ---------------------------------------------------------------------------------------------
const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

interface Foto {
  indiceAntesDeLaPrueba: string | null;
  filasAntes: Fila[];
  ids: { dupA1: string; dupA2: string; soloA: string; dupB: string };
  // tras los dos migration.sql
  filasTrasUp: Fila[];
  respaldoTrasUp: Array<Fila & { respaldado_at: Date }>;
  respaldoTotalTrasUp: number;
  esquemasRespaldo: string[];
  privilegios: { usoEsquema: boolean; select: boolean; insert: boolean };
  selectComoApp: string | null;
  insertComoApp: string | null;
  ordenAntes: { zona_id: string; updated_at: Date };
  ordenTrasUp: { zona_id: string; updated_at: Date };
  indiceTrasUp: string | null;
  segundaFilaEnA: string | null;
  mismaFilaEnB: string | null;
  // tras los dos down.sql
  errorDelDown: string | null;
  filasTrasDown: Fila[];
  indiceTrasDown: string | null;
  esquemasRespaldoTrasDown: string[];
  esquemaRespaldoTrasDown: boolean;
  filasAjenasTrasDown: number | null;
}

describeSiHayBase("SLT-75 — migraciones contra Postgres (R7, R9-R12)", () => {
  let base: PrismaClient;
  let f: Foto;

  beforeAll(async () => {
    base = crearPrismaDeTest();
    f = await revertida(base, async (tx) => {
      const indiceAntesDeLaPrueba = await indiceDef(tx);
      await bajar(tx); // estado anterior a la ficha

      const A = (await crearOrganizacion(tx, { nombre: "Empresa A SLT75 migracion" })).id;
      const B = (await crearOrganizacion(tx, { nombre: "Empresa B SLT75 migracion" })).id;

      await fijarEmpresa(tx, A);
      const fksA = await crearFksDeOrden(tx);
      const [dDup, dSolo, dOtro] = await tresDistritos(tx, fksA.cantonId);
      const zA1 = await crearZona(tx, "Zona Uno A");
      const zA2 = await crearZona(tx, "Zona Dos A");
      const dupA1 = await vincular(tx, A, zA1, dDup);
      const dupA2 = await vincular(tx, A, zA2, dDup);
      const soloA = await vincular(tx, A, zA1, dSolo);

      const ordenId = randomUUID();
      await tx.$executeRawUnsafe(
        `INSERT INTO orden (id, num_remision, estatus_id, destinatario, telefono_dest, tienda_id,
                            zona_id, provincia_id, canton_id, distrito_id, producto, created_at, updated_at)
         VALUES ($1, $2, $3, 'Destinatario Sintetico', '88880000', $4, $5, $6, $7, $8, 'caja',
                 '2001-02-03 04:05:06', '2001-02-03 04:05:06')`,
        ordenId,
        `SLT75M-${ordenId.slice(0, 8)}`,
        fksA.estatusId,
        fksA.tiendaId,
        zA1,
        fksA.provinciaId,
        fksA.cantonId,
        dDup,
      );

      await fijarEmpresa(tx, B);
      const zB1 = await crearZona(tx, "Zona Uno B");
      const dupB = await vincular(tx, B, zB1, dDup);

      const zonas = [zA1, zA2, zB1];
      const leerOrden = async () =>
        (
          await tx.$queryRawUnsafe<Array<{ zona_id: string; updated_at: Date }>>(
            `SELECT zona_id, updated_at FROM orden WHERE id = $1`,
            ordenId,
          )
        )[0];

      const filasAntes = await filasDeZonas(tx, zonas);
      const ordenAntes = await leerOrden();

      await subir(tx);

      const filasTrasUp = await filasDeZonas(tx, zonas);
      // El respaldo se lee DONDE ESTE, no donde deberia estar: si naciera en `public`, las
      // aserciones de R10 tienen que caer por eso, no por un «no existe la tabla» del `SELECT`.
      const esquemasRespaldo = await esquemasDelRespaldo(tx);
      const esq = esquemasRespaldo[0] ?? "respaldo";
      const tabla = `${esq}.slt75_zona_distrito_duplicado`;
      const respaldoTrasUp = await tx.$queryRawUnsafe<Array<Fila & { respaldado_at: Date }>>(
        `SELECT id, zona_id, distrito_id, organizacion_id, respaldado_at FROM ${tabla} ORDER BY id`,
      );
      const respaldoTotalTrasUp = respaldoTrasUp.length;
      const [priv] = await tx.$queryRawUnsafe<
        Array<{ uso_esquema: boolean; sel: boolean; ins: boolean }>
      >(
        `SELECT has_schema_privilege('servi_app', '${esq}', 'USAGE') AS uso_esquema,
                has_table_privilege('servi_app', '${tabla}', 'SELECT') AS sel,
                has_table_privilege('servi_app', '${tabla}', 'INSERT') AS ins`,
      );
      const selectComoApp = await servi_appSobreRespaldo(tx, `SELECT count(*) FROM ${tabla}`);
      const insertComoApp = await servi_appSobreRespaldo(
        tx,
        `INSERT INTO ${tabla} (id) VALUES ('${randomUUID()}')`,
      );
      const ordenTrasUp = await leerOrden();
      const indiceTrasUp = await indiceDef(tx);

      // R7 con el indice recien creado: otra fila de dOtro en A, en otra zona, se rechaza; en B no.
      await vincular(tx, A, zA1, dOtro);
      const segundaFilaEnA = await intentar(
        tx,
        `INSERT INTO zona_distrito (id, zona_id, distrito_id, organizacion_id) VALUES ($1, $2, $3, $4)`,
        randomUUID(),
        zA2,
        dOtro,
        A,
      );
      await fijarEmpresa(tx, B);
      const mismaFilaEnB = await intentar(
        tx,
        `INSERT INTO zona_distrito (id, zona_id, distrito_id, organizacion_id) VALUES ($1, $2, $3, $4)`,
        randomUUID(),
        zB1,
        dOtro,
        B,
      );
      // Se deshacen las dos filas de la comprobacion de R7 para que la foto del down sea limpia.
      await tx.$executeRawUnsafe(`DELETE FROM zona_distrito WHERE distrito_id = $1`, dOtro);

      // B1: un objeto AJENO en `respaldo` (otra ficha). El down no puede llevarselo ni fallar por el.
      await tx.$executeRawUnsafe(`CREATE TABLE ${AJENA} (marca text NOT NULL)`);
      await tx.$executeRawUnsafe(`INSERT INTO ${AJENA} (marca) VALUES ('de otra ficha')`);

      // En SAVEPOINT: si el down fallara, R12 cae por su asercion y no por un beforeAll roto.
      const fallo = await errorEnSavepoint(tx, () => bajar(tx));
      const errorDelDown = fallo === null ? null : sqlstateDe(fallo);

      return {
        indiceAntesDeLaPrueba,
        filasAntes,
        ids: { dupA1, dupA2, soloA, dupB },
        filasTrasUp,
        respaldoTrasUp,
        respaldoTotalTrasUp,
        esquemasRespaldo,
        privilegios: { usoEsquema: priv.uso_esquema, select: priv.sel, insert: priv.ins },
        selectComoApp,
        insertComoApp,
        ordenAntes,
        ordenTrasUp,
        indiceTrasUp,
        segundaFilaEnA,
        mismaFilaEnB,
        errorDelDown,
        filasTrasDown: await filasDeZonas(tx, zonas),
        indiceTrasDown: await indiceDef(tx),
        esquemasRespaldoTrasDown: await esquemasDelRespaldo(tx),
        esquemaRespaldoTrasDown: await existeEsquemaRespaldo(tx),
        filasAjenasTrasDown: await filasAjenas(tx),
      };
    });
  }, 120_000);

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("la siembra existio: 4 filas, y la base de test ya tenia el indice antes de la prueba", () => {
    expect(f.filasAntes).toHaveLength(4);
    expect(f.indiceAntesDeLaPrueba).not.toBeNull();
  });

  it("R9b — dos zonas NO centrales: el duplicado no tiene zona en A; la otra fila de A y la de B, intactas", () => {
    expect(f.filasTrasUp.map((r) => r.id).sort()).toEqual([f.ids.soloA, f.ids.dupB].sort());
    const esperadas = f.filasAntes.filter((r) => r.id === f.ids.soloA || r.id === f.ids.dupB);
    expect(f.filasTrasUp).toEqual(esperadas);
  });

  it("R10 — el respaldo tiene EXACTAMENTE las dos filas borradas, con sus cuatro columnas", () => {
    const borradas = f.filasAntes.filter((r) => r.id === f.ids.dupA1 || r.id === f.ids.dupA2);
    expect(borradas).toHaveLength(2);
    // La base de test no tenia duplicados (el indice estaba puesto): el respaldo entero son estas.
    expect(f.respaldoTotalTrasUp).toBe(2);
    const sinFecha = f.respaldoTrasUp.map((r) => ({
      id: r.id,
      zona_id: r.zona_id,
      distrito_id: r.distrito_id,
      organizacion_id: r.organizacion_id,
    }));
    expect(sinFecha).toEqual(borradas);
    for (const r of f.respaldoTrasUp) expect(r.respaldado_at).toBeInstanceOf(Date);
  });

  it("R10 — el respaldo vive en el esquema `respaldo`, no en `public`", () => {
    expect(f.esquemasRespaldo).toEqual(["respaldo"]);
  });

  it("R10 — `servi_app` no puede leer ni escribir el respaldo", () => {
    expect(f.privilegios).toEqual({ usoEsquema: false, select: false, insert: false });
    expect(f.selectComoApp).toBe("42501");
    expect(f.insertComoApp).toBe("42501");
  });

  it("R11 — `orden.zona_id` y `orden.updated_at` de la orden del distrito no cambian", () => {
    expect(f.ordenTrasUp.zona_id).toBe(f.ordenAntes.zona_id);
    expect(f.ordenTrasUp.updated_at.toISOString()).toBe(f.ordenAntes.updated_at.toISOString());
  });

  it("R7 — el indice es UNICO sobre (organizacion_id, distrito_id)", () => {
    expect(f.indiceTrasUp).toMatch(/^CREATE UNIQUE INDEX/);
    expect(f.indiceTrasUp).toMatch(/\(organizacion_id, distrito_id\)/);
  });

  it("R7 — una segunda fila del mismo distrito en otra zona de A se rechaza; en B se acepta", () => {
    expect(f.segundaFilaEnA).toBe("23505");
    expect(f.mismaFilaEnB).toBeNull();
  });

  it("R12 — los dos down.sql (en orden inverso) restauran las filas y quitan indice y SU tabla de respaldo", () => {
    expect(f.errorDelDown).toBeNull();
    expect(f.filasTrasDown).toEqual(f.filasAntes);
    expect(f.indiceTrasDown).toBeNull();
    expect(f.esquemasRespaldoTrasDown).toEqual([]);
  });

  it("R12/B1 — con un objeto ajeno en `respaldo`, el down lo deja intacto (con su fila) y el esquema sigue", () => {
    expect(f.errorDelDown).toBeNull();
    expect(f.filasAjenasTrasDown).toBe(1);
    expect(f.esquemaRespaldoTrasDown).toBe(true);
  });
});

describeSiHayBase("SLT-75 — down con el esquema `respaldo` vacio (R12, B1)", () => {
  let base: PrismaClient;
  let f: { esquemaTrasUp: boolean; esquemaTrasDown: boolean };

  beforeAll(async () => {
    base = crearPrismaDeTest();
    f = await revertida(base, async (tx) => {
      await bajar(tx);
      // Se vacia `respaldo` (la base de test trae el de SLT-73): la transaccion se revierte.
      await tx.$executeRawUnsafe(`DROP SCHEMA IF EXISTS respaldo CASCADE`);
      await subir(tx);
      const esquemaTrasUp = await existeEsquemaRespaldo(tx);
      await bajar(tx);
      return { esquemaTrasUp, esquemaTrasDown: await existeEsquemaRespaldo(tx) };
    });
  }, 120_000);

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("si solo quedaba el respaldo de esta ficha, el down quita tambien el esquema", () => {
    expect(f.esquemaTrasUp).toBe(true);
    expect(f.esquemaTrasDown).toBe(false);
  });
});

describeSiHayBase("SLT-75 — down con una zona borrada despues (R12)", () => {
  let base: PrismaClient;
  let f: { restauradas: string[]; dupA1: string; dupA2: string };

  beforeAll(async () => {
    base = crearPrismaDeTest();
    f = await revertida(base, async (tx) => {
      await bajar(tx);
      const A = (await crearOrganizacion(tx, { nombre: "Empresa A SLT75 down" })).id;
      await fijarEmpresa(tx, A);
      const fksA = await crearFksDeOrden(tx);
      const [dDup] = await tresDistritos(tx, fksA.cantonId);
      const zA1 = await crearZona(tx, "Zona Uno A");
      const zA2 = await crearZona(tx, "Zona Dos A");
      const dupA1 = await vincular(tx, A, zA1, dDup);
      const dupA2 = await vincular(tx, A, zA2, dDup);
      await subir(tx);
      // La zona Dos se borra DESPUES de la migracion: su fila respaldada ya no tiene a quien volver.
      await tx.$executeRawUnsafe(`DELETE FROM zona WHERE id = $1`, zA2);
      await bajar(tx);
      const restauradas = (await filasDeZonas(tx, [zA1, zA2])).map((r) => r.id);
      return { restauradas, dupA1, dupA2 };
    });
  }, 120_000);

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("restaura solo la fila cuya zona sigue existiendo, sin fallar por la FK", () => {
    expect(f.restauradas).toEqual([f.dupA1]);
  });
});

describeSiHayBase("SLT-75 — sin duplicados (R13)", () => {
  let base: PrismaClient;
  let f: { totalAntes: number; totalDespues: number; respaldo: number; filasAntes: Fila[]; filasDespues: Fila[] };

  beforeAll(async () => {
    base = crearPrismaDeTest();
    f = await revertida(base, async (tx) => {
      await bajar(tx);
      const A = (await crearOrganizacion(tx, { nombre: "Empresa A SLT75 sin duplicados" })).id;
      await fijarEmpresa(tx, A);
      const fksA = await crearFksDeOrden(tx);
      const [d1, d2] = await tresDistritos(tx, fksA.cantonId);
      const zA1 = await crearZona(tx, "Zona Uno A");
      const zA2 = await crearZona(tx, "Zona Dos A");
      await vincular(tx, A, zA1, d1);
      await vincular(tx, A, zA2, d2);
      const filasAntes = await filasDeZonas(tx, [zA1, zA2]);
      const totalAntes = await totalZonaDistrito(tx);
      await subir(tx);
      const [r] = await tx.$queryRawUnsafe<Array<{ n: number }>>(
        `SELECT count(*)::int AS n FROM ${RESPALDO}`,
      );
      return {
        totalAntes,
        totalDespues: await totalZonaDistrito(tx),
        respaldo: r.n,
        filasAntes,
        filasDespues: await filasDeZonas(tx, [zA1, zA2]),
      };
    });
  }, 120_000);

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("se aplica sin error, no borra ninguna fila y el respaldo queda vacio", () => {
    expect(f.filasAntes).toHaveLength(2);
    expect(f.filasDespues).toEqual(f.filasAntes);
    expect(f.totalDespues).toBe(f.totalAntes);
    expect(f.respaldo).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------
// R9 / R9b con zona central (enmienda 2026-11-01). Empresa A con su zona central C y tres no
// centrales N1, N2, N3; empresa B con su propia central y una no central.
//   d1: C + N1        → R9: sale la de C, queda la de N1.
//   d2: N1 + N2       → R9b: salen las dos.
//   d3: C + N1 + N2   → R9b: salen las tres (aunque una sea central: R9 es SOLO con 2 zonas).
//   d4: solo N3       → intacto.
//   d1 en B: central de B + no central de B → R9 en B, independiente de A (las de A no cuentan).
//   d2 en B: solo la no central de B → intacto (en A esta repetido, en B no).
// ---------------------------------------------------------------------------------------------
async function distritosDelCatalogo(tx: TxDeTest, n: number): Promise<string[]> {
  const ds = await tx.distrito.findMany({ select: { id: true }, orderBy: { id: "asc" }, take: n });
  if (ds.length < n) throw new Error("faltan distritos en el catalogo: aplica las migraciones");
  return ds.map((d) => d.id);
}

async function crearZonaCentral(tx: TxDeTest, nombre: string): Promise<string> {
  const z = await tx.zona.create({
    data: {
      nombre: `${nombre} ${randomUUID().slice(0, 8)}`,
      esCentral: true,
      sinpeNumero: "80000000",
      sinpeNombre: "Titular de Prueba",
    },
    select: { id: true },
  });
  return z.id;
}

describeSiHayBase("SLT-75 — R9/R9b con zona central (enmienda 2026-11-01)", () => {
  let base: PrismaClient;
  let f: {
    ids: Record<string, string>;
    filasAntes: Fila[];
    filasTrasUp: Fila[];
    respaldo: Fila[];
    errorDelIndice: string | null;
    indiceTrasUp: string | null;
    filasTrasDown: Fila[];
  };

  beforeAll(async () => {
    base = crearPrismaDeTest();
    f = await revertida(base, async (tx) => {
      await bajar(tx);
      const [d1, d2, d3, d4] = await distritosDelCatalogo(tx, 4);

      const A = (await crearOrganizacion(tx, { nombre: "Empresa A SLT75 central" })).id;
      await fijarEmpresa(tx, A);
      const zC = await crearZonaCentral(tx, "Zona Central A");
      const zN1 = await crearZona(tx, "Zona N1 A");
      const zN2 = await crearZona(tx, "Zona N2 A");
      const zN3 = await crearZona(tx, "Zona N3 A");
      const ids: Record<string, string> = {
        d1C: await vincular(tx, A, zC, d1),
        d1N1: await vincular(tx, A, zN1, d1),
        d2N1: await vincular(tx, A, zN1, d2),
        d2N2: await vincular(tx, A, zN2, d2),
        d3C: await vincular(tx, A, zC, d3),
        d3N1: await vincular(tx, A, zN1, d3),
        d3N2: await vincular(tx, A, zN2, d3),
        d4N3: await vincular(tx, A, zN3, d4),
      };

      const B = (await crearOrganizacion(tx, { nombre: "Empresa B SLT75 central" })).id;
      await fijarEmpresa(tx, B);
      const zBC = await crearZonaCentral(tx, "Zona Central B");
      const zBN = await crearZona(tx, "Zona N B");
      ids.Bd1C = await vincular(tx, B, zBC, d1);
      ids.Bd1N = await vincular(tx, B, zBN, d1);
      ids.Bd2N = await vincular(tx, B, zBN, d2);

      const zonas = [zC, zN1, zN2, zN3, zBC, zBN];
      const filasAntes = await filasDeZonas(tx, zonas);

      await aplicar(tx, leer(DIR_DATOS, "migration.sql"));
      // El indice en SAVEPOINT: si la limpieza dejara un duplicado, cae su asercion (23505).
      const fallo = await errorEnSavepoint(tx, () => aplicar(tx, leer(DIR_INDICE, "migration.sql")));
      const errorDelIndice = fallo === null ? null : sqlstateDe(fallo);
      const filasTrasUp = await filasDeZonas(tx, zonas);
      const respaldo = await tx.$queryRawUnsafe<Fila[]>(
        `SELECT id, zona_id, distrito_id, organizacion_id FROM ${RESPALDO} ORDER BY id`,
      );
      const indiceTrasUp = await indiceDef(tx);

      await bajar(tx);
      return {
        ids,
        filasAntes,
        filasTrasUp,
        respaldo,
        errorDelIndice,
        indiceTrasUp,
        filasTrasDown: await filasDeZonas(tx, zonas),
      };
    });
  }, 120_000);

  afterAll(async () => {
    await base?.$disconnect();
  });

  const borradas = (): string[] => [
    f.ids.d1C,
    f.ids.d2N1,
    f.ids.d2N2,
    f.ids.d3C,
    f.ids.d3N1,
    f.ids.d3N2,
    f.ids.Bd1C,
  ];
  const idsTrasUp = (): string[] => f.filasTrasUp.map((r) => r.id);
  const idsRespaldo = (): string[] => f.respaldo.map((r) => r.id);

  it("la siembra existio: 11 filas", () => {
    expect(f.filasAntes).toHaveLength(11);
  });

  it("R9 — central + no central: sale la fila de la central y queda la de la no central", () => {
    expect(idsTrasUp()).not.toContain(f.ids.d1C);
    expect(idsTrasUp()).toContain(f.ids.d1N1);
    expect(idsRespaldo()).toContain(f.ids.d1C);
    expect(idsRespaldo()).not.toContain(f.ids.d1N1);
  });

  it("R9b — dos zonas NO centrales: salen las dos y las dos estan en el respaldo", () => {
    expect(idsTrasUp()).not.toContain(f.ids.d2N1);
    expect(idsTrasUp()).not.toContain(f.ids.d2N2);
    expect(idsRespaldo()).toEqual(expect.arrayContaining([f.ids.d2N1, f.ids.d2N2]));
  });

  it("R9b — tres zonas (una central): salen las tres y las tres estan en el respaldo", () => {
    for (const id of [f.ids.d3C, f.ids.d3N1, f.ids.d3N2]) expect(idsTrasUp()).not.toContain(id);
    expect(idsRespaldo()).toEqual(expect.arrayContaining([f.ids.d3C, f.ids.d3N1, f.ids.d3N2]));
  });

  it("R9/R9b — el mismo distrito en la empresa B se decide con las filas de B; el resto, intacto", () => {
    const quedan = f.filasAntes.filter((r) => !borradas().includes(r.id));
    expect(f.filasTrasUp).toEqual(quedan);
    expect([...idsTrasUp()].sort()).toEqual([f.ids.d1N1, f.ids.d4N3, f.ids.Bd1N, f.ids.Bd2N].sort());
  });

  it("R10 — el respaldo tiene EXACTAMENTE las filas borradas, con sus cuatro columnas", () => {
    const esperadas = f.filasAntes.filter((r) => borradas().includes(r.id));
    expect(esperadas).toHaveLength(7);
    // La base de test no tenia duplicados (el indice estaba puesto): el respaldo entero son estas.
    expect(f.respaldo).toEqual(esperadas);
  });

  it("R7 — tras la limpieza el indice unico se crea sin error", () => {
    expect(f.errorDelIndice).toBeNull();
    expect(f.indiceTrasUp).toMatch(/^CREATE UNIQUE INDEX/);
  });

  it("R12 — los down.sql devuelven las 11 filas", () => {
    expect(f.filasTrasDown).toEqual(f.filasAntes);
  });
});
