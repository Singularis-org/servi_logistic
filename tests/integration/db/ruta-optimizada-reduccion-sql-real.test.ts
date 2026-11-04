import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomInt, randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";

import { RutaOptimizadaRepository } from "@/lib/repositories/RutaOptimizadaRepository";

/**
 * SLT-59 (R48, R50; D19/m2; tasks T6.7) — el `WHERE` de `reducirSecuencia` contra Postgres REAL.
 *
 * POR QUE AQUI Y NO SOLO CON DOBLES. `tests/integration/repositories/ruta-optimizada-repo.test.ts`
 * afirma el `where` que el repositorio MANDA; lo que hace el motor con el (que `estado` sea el enum
 * `ruta_estado`, que la RLS esconda la fila de otra empresa, que el borrado y la reinsercion no
 * choquen con `(ruta_id, secuencia)`) solo lo dice Postgres.
 *
 * ⚠️ SOLO `DATABASE_URL` DEL ENTORNO, NUNCA `.env` (instruccion del humano, 2026-10-30).
 *   - `_postgres-real.ts` llama a `process.loadEnvFile()` AL IMPORTARSE si falta `DATABASE_URL`, y
 *     `_jobs-dos-empresas.ts` lo importa. Por eso este archivo NO los importa estaticamente: se
 *     cargan con `await import(...)` dentro de `beforeAll`, que solo corre si la condicion pasa.
 *   - La condicion mira `process.env.DATABASE_URL` tal cual llega al proceso, ANTES de cualquier
 *     importacion que pudiera leer `.env`, y exige un host `localhost` o `127.0.0.1` (el del job de
 *     CI lo es: `.github/workflows/gate.yml`). Contra una base remota, jamas: se salta.
 *
 * Todo corre en una transaccion que SIEMPRE se revierte (`conDosEmpresas`), con el lock de la 227
 * primero. La siembra va como DUENO, con `organizacion_id` explicito; la reduccion va como
 * `servi_app` con la empresa A fijada (`comoApp`), que es lo que hace la extension en produccion,
 * y con un `$transaction` que abre un SAVEPOINT real (`clienteConSavepoint`). Lo que se mide se lee
 * otra vez como dueno, sin RLS: ve todo lo que de verdad quedo en la base.
 */

/** La URL tal cual llega al proceso. Se lee AQUI, antes de que nada pueda cargar `.env`. */
const URL_DEL_ENTORNO = process.env.DATABASE_URL;

function esHostLocal(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return false; // una URL que no se puede leer no es una base local demostrada
  }
}

const HAY_BASE_LOCAL =
  URL_DEL_ENTORNO !== undefined && URL_DEL_ENTORNO !== "" && esHostLocal(URL_DEL_ENTORNO);

const describeSiBaseLocal = HAY_BASE_LOCAL ? describe : describe.skip;

type Tx = Prisma.TransactionClient;
type PostgresReal = typeof import("./_postgres-real");
type DosEmpresas = typeof import("./_jobs-dos-empresas");
type Organizaciones = typeof import("../../fabricas/organizaciones");

const RUN = randomUUID().replace(/-/g, "").slice(0, 10);
const HUELLA = `huella-slt59-${RUN}`;
const CALCULADA_AT = new Date("2026-10-30T13:00:00.000Z");

interface RutaSembrada {
  mensajeroId: string;
  rutaId: string;
  /** Las ordenes de la ruta, en el orden de su `secuencia` sembrada (1..n). */
  ordenIds: string[];
}

describeSiBaseLocal("SLT-59 R48/R50 — reducirSecuencia contra Postgres real (dos empresas)", () => {
  let pg: PostgresReal;
  let dos: DosEmpresas;
  let orgs: Organizaciones;
  let prisma: PrismaClient;
  let catalogo: {
    rolMensajero: string;
    rolTienda: string;
    tipoIdentificacion: string;
    estatus: string;
    provinciaId: string;
    cantonId: string;
    distritoId: string;
  };

  beforeAll(async () => {
    // Solo aqui, y solo con base local: con `DATABASE_URL` ya puesta, `urlDeBaseDeDatos` no toca
    // `.env`.
    pg = await import("./_postgres-real");
    dos = await import("./_jobs-dos-empresas");
    orgs = await import("../../fabricas/organizaciones");
    prisma = pg.crearPrismaDeTest();

    const [rolMensajero, rolTienda, tipo, estatus, distrito] = await Promise.all([
      prisma.rol.findFirst({ where: { value: "mensajero" }, select: { id: true } }),
      prisma.rol.findFirst({ where: { value: "adminTienda" }, select: { id: true } }),
      prisma.tipoIdentificacion.findFirst({ select: { id: true } }),
      prisma.orderStatus.findFirst({ where: { value: "en_reparto" }, select: { id: true } }),
      prisma.distrito.findFirst({
        select: { id: true, canton: { select: { id: true, provinciaId: true } } },
        orderBy: { id: "asc" },
      }),
    ]);
    // Fallo CERRADO: sin catalogos no se siembra nada, y un test que no siembra mide cero y se
    // pone verde.
    if (!rolMensajero || !rolTienda || !tipo || !estatus || !distrito) {
      throw new Error(
        "faltan catalogos (rol mensajero/adminTienda, tipo_identificacion, order_status " +
          "`en_reparto`, distrito): corre las migraciones y `pnpm run db:seed`.",
      );
    }
    catalogo = {
      rolMensajero: rolMensajero.id,
      rolTienda: rolTienda.id,
      tipoIdentificacion: tipo.id,
      estatus: estatus.id,
      provinciaId: distrito.canton.provinciaId,
      cantonId: distrito.canton.id,
      distritoId: distrito.id,
    };
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  /** Mensajero, tienda, zona, tres ordenes y su ruta (cabecera + 3 paradas), todo de `org`. */
  async function sembrarRuta(
    tx: Tx,
    org: string,
    letra: string,
    estado: "vigente" | "desactualizada" = "vigente",
  ): Promise<RutaSembrada> {
    const marca = `${letra}-${RUN}-${randomInt(0, 1_000_000)}`;
    const zona = await tx.zona.create({
      data: { nombre: `Zona SLT59 ${marca}`, sinpeNumero: "88880000", sinpeNombre: "Zona", organizacionId: org },
      select: { id: true },
    });
    const usuario = (rolId: string, prefijo: string, zonaId?: string) =>
      tx.usuario.create({
        data: {
          nombre: `${prefijo} ${marca}`,
          email: `${prefijo}-${marca}@slt59.test`,
          telefono: "88880000",
          passwordHash: "no-es-una-credencial",
          cedula: `SLT59-${prefijo}-${marca}`,
          tipoIdentificacionId: catalogo.tipoIdentificacion,
          rolId,
          estado: "activo",
          zonaId,
          organizacionId: org,
        },
        select: { id: true },
      });
    const mensajero = await usuario(catalogo.rolMensajero, "mensajero", zona.id);
    const tienda = await usuario(catalogo.rolTienda, "tienda");

    const ordenIds: string[] = [];
    for (let i = 1; i <= 3; i += 1) {
      const o = await tx.orden.create({
        data: {
          numRemision: `SLT59-${marca}-${i}`,
          numGuia: 1_500_000_000 + randomInt(0, 600_000_000),
          estatusId: catalogo.estatus,
          destinatario: `Cliente ${marca} ${i}`,
          telefonoDest: "88887777",
          tiendaId: tienda.id,
          zonaId: zona.id,
          provinciaId: catalogo.provinciaId,
          cantonId: catalogo.cantonId,
          distritoId: catalogo.distritoId,
          producto: "Caja",
          mensajeroAsignadoId: mensajero.id,
          organizacionId: org,
        },
        select: { id: true },
      });
      ordenIds.push(o.id);
    }

    const ruta = await tx.rutaOptimizada.create({
      data: {
        mensajeroId: mensajero.id,
        estado,
        calculadaAt: CALCULADA_AT,
        origenFuente: "gps",
        huellaSet: HUELLA,
        secuenciaFuente: "proveedor",
        trazadoPolilinea: "viejo",
        trazadoDistanciaM: 9_000,
        trazadoDuracionS: 900,
        trazadoFuente: "routes",
        organizacionId: org,
      },
      select: { id: true },
    });
    await tx.rutaOptimizadaParada.createMany({
      data: ordenIds.map((ordenId, idx) => ({
        rutaId: ruta.id,
        ordenId,
        secuencia: idx + 1,
        tramoPolilinea: `t${idx + 1}`,
        tramoDistanciaM: 1_000 * (idx + 1),
        tramoDuracionS: 100 * (idx + 1),
        organizacionId: org,
      })),
    });
    return { mensajeroId: mensajero.id, rutaId: ruta.id, ordenIds };
  }

  /** Cabecera y paradas COMPLETAS, leidas como dueno (sin RLS). */
  async function fila(tx: Tx, rutaId: string) {
    await dos.comoDueno(tx as unknown as Parameters<DosEmpresas["comoDueno"]>[0]);
    const cabecera = await tx.rutaOptimizada.findUniqueOrThrow({ where: { id: rutaId } });
    const paradas = await tx.rutaOptimizadaParada.findMany({
      where: { rutaId },
      orderBy: { secuencia: "asc" },
    });
    return { cabecera, paradas };
  }

  /** El repositorio de produccion, como `servi_app` con la empresa `org` fijada. */
  async function repoComo(tx: Tx, org: string): Promise<RutaOptimizadaRepository> {
    await orgs.comoApp(tx, org);
    const cliente = pg.clienteConSavepoint(tx as unknown as Parameters<PostgresReal["clienteConSavepoint"]>[0]);
    return new RutaOptimizadaRepository(cliente);
  }

  /** Quita la PRIMERA parada: la reduccion de una entrega hecha. */
  function reduccionSinLaPrimera(ruta: RutaSembrada) {
    const [, o2, o3] = ruta.ordenIds;
    return {
      huellaSet: `${HUELLA}-reducida`,
      paradas: [
        { ordenId: o2, tramo: { encodedPolyline: "n2", distanciaM: 1_200.4, duracionS: 180.6 } },
        { ordenId: o3, tramo: null },
      ],
      trazado: { encodedPolyline: "n2n3", distanciaM: 2_000, duracionS: 300, fuente: "routes" as const },
    };
  }

  function conDosEmpresas<T>(fn: (tx: Tx, a: string, b: string) => Promise<T>): Promise<T> {
    return dos.conDosEmpresas(prisma, (tx, a, b) => fn(tx as unknown as Tx, a, b));
  }

  it("R48: huella igual y `vigente` -> escribe; las paradas quedan 1..n con su tramo", async () => {
    const r = await conDosEmpresas(async (tx, a) => {
      const ruta = await sembrarRuta(tx, a, "A");
      const repo = await repoComo(tx, a);
      const aplicada = await repo.reducirSecuencia(ruta.mensajeroId, HUELLA, reduccionSinLaPrimera(ruta));
      return { aplicada, ruta, despues: await fila(tx, ruta.rutaId) };
    });

    expect(r.aplicada).toBe(true);
    expect(r.despues.cabecera.huellaSet).toBe(`${HUELLA}-reducida`);
    expect(r.despues.cabecera.trazadoPolilinea).toBe("n2n3");
    // R12/R17: la reduccion no es un calculo.
    expect(r.despues.cabecera.calculadaAt?.toISOString()).toBe(CALCULADA_AT.toISOString());
    expect(r.despues.cabecera.estado).toBe("vigente");
    expect(
      r.despues.paradas.map((p) => ({
        ordenId: p.ordenId,
        secuencia: p.secuencia,
        tramoPolilinea: p.tramoPolilinea,
        tramoDistanciaM: p.tramoDistanciaM,
        tramoDuracionS: p.tramoDuracionS,
      })),
    ).toEqual([
      { ordenId: r.ruta.ordenIds[1], secuencia: 1, tramoPolilinea: "n2", tramoDistanciaM: 1_200, tramoDuracionS: 181 },
      { ordenId: r.ruta.ordenIds[2], secuencia: 2, tramoPolilinea: null, tramoDistanciaM: null, tramoDuracionS: null },
    ]);
  });

  it("R48: huella DISTINTA -> false y nada cambia (cabecera y paradas, fila entera)", async () => {
    const r = await conDosEmpresas(async (tx, a) => {
      const ruta = await sembrarRuta(tx, a, "A");
      const antes = await fila(tx, ruta.rutaId);
      const repo = await repoComo(tx, a);
      const aplicada = await repo.reducirSecuencia(
        ruta.mensajeroId,
        `${HUELLA}-de-otro-disparo`,
        reduccionSinLaPrimera(ruta),
      );
      return { aplicada, antes, despues: await fila(tx, ruta.rutaId) };
    });

    expect(r.aplicada).toBe(false);
    expect(r.antes.paradas).toHaveLength(3); // anti-vacuidad: habia paradas que perder
    expect(r.despues).toEqual(r.antes);
  });

  it("R48: `desactualizada` con la huella IGUAL -> false y nada cambia", async () => {
    // `marcarDesactualizada` no mueve la huella: solo el estado en el `WHERE` impide escribir encima.
    const r = await conDosEmpresas(async (tx, a) => {
      const ruta = await sembrarRuta(tx, a, "A", "desactualizada");
      const antes = await fila(tx, ruta.rutaId);
      const repo = await repoComo(tx, a);
      const aplicada = await repo.reducirSecuencia(ruta.mensajeroId, HUELLA, reduccionSinLaPrimera(ruta));
      return { aplicada, antes, despues: await fila(tx, ruta.rutaId) };
    });

    expect(r.aplicada).toBe(false);
    expect(r.antes.cabecera.huellaSet).toBe(HUELLA); // anti-vacuidad: la huella SI encajaba
    expect(r.antes.paradas).toHaveLength(3);
    expect(r.despues).toEqual(r.antes);
  });

  it("R50: una reduccion en el contexto de A no toca la cabecera ni las paradas de B, con la misma huella", async () => {
    const r = await conDosEmpresas(async (tx, a, b) => {
      const rutaA = await sembrarRuta(tx, a, "A");
      const rutaB = await sembrarRuta(tx, b, "B");
      const bAntes = await fila(tx, rutaB.rutaId);

      const repo = await repoComo(tx, a);
      // La de A, legitima: se escribe.
      const aplicadaA = await repo.reducirSecuencia(rutaA.mensajeroId, HUELLA, reduccionSinLaPrimera(rutaA));
      // La de B pedida desde A (mensajero de B, huella identica): la empresa de la sesion no la ve.
      const aplicadaSobreB = await repo.reducirSecuencia(
        rutaB.mensajeroId,
        HUELLA,
        reduccionSinLaPrimera(rutaB),
      );

      const aDespues = await fila(tx, rutaA.rutaId);
      const bDespues = await fila(tx, rutaB.rutaId);
      return { aplicadaA, aplicadaSobreB, aDespues, bAntes, bDespues };
    });

    // Anti-vacuidad: la reduccion de A ocurrio de verdad.
    expect(r.aplicadaA).toBe(true);
    expect(r.aDespues.paradas).toHaveLength(2);
    expect(r.aDespues.cabecera.huellaSet).toBe(`${HUELLA}-reducida`);
    // B, con la misma huella, queda intacto fila a fila.
    expect(r.bAntes.cabecera.huellaSet).toBe(HUELLA);
    expect(r.bAntes.paradas).toHaveLength(3);
    expect(r.aplicadaSobreB).toBe(false);
    expect(r.bDespues).toEqual(r.bAntes);
  });
});
