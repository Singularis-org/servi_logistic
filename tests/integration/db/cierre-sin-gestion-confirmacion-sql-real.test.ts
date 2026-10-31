import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { reintentosConfig } from "@/lib/config/reintentos";
import { ConfirmacionFisicaNoAplicableError } from "@/lib/repositories/CierresAdminRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import {
  HAY_BASE_DE_DATOS,
  clienteConSavepoint,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type TxDeTest,
} from "./_postgres-real";
import { montarServicios } from "./454/_escenario";

/**
 * Ficha 451 / SLT-72 (T4.5; R11, R21, R26, R6, R22) — LAS BARRIDAS SE CONFIRMAN PARA APROBAR, contra
 * Postgres real y por el SERVICIO real.
 *
 * DATOS PROPIOS, sembrados en una transaccion que SIEMPRE se revierte y en la empresa de esa
 * transaccion (patron de `recoleccion-recibida-libera-mensajero.int.test.ts`, SLT-63). No usa el
 * `prepararMundo` de la 454: ese asume ordenes y zonas YA sembradas en la base y hoy cae por
 * «referencia a otra empresa» (sus suites estan en `tests/baseline-rojos.json`).
 *
 * El corpus es el del incidente: un cierre `solicitado` del mensajero M con DOS ordenes que el corte
 * barrio a `sin_gestionar` (`novedad_interna`) y que quedaron registradas en `cierre_sin_gestion`:
 *   - oLib : por debajo del tope de intentos -> la liberacion (109) la manda a bodega;
 *   - oTope: EN el tope -> la 276 la rechaza y la 139 la lleva a `por_devolver*`.
 * Y oAjena: tambien `sin_gestionar` y del mismo mensajero, barrida por un cierre ANTERIOR y no por
 * este (R9; y 271: la liberacion esta acotada al registro de ESTE cierre).
 *
 * Tres corridas, cada una en su transaccion revertida:
 *  (a) `incompleta`: TODAS las barridas menos una -> rechaza; el cierre sigue `solicitado`, las
 *      ordenes siguen sin liberar y no hay ni una marca (R11).
 *  (b) `completa`: la confirmacion exacta -> aprueba; TODA orden que la aprobacion movio desde
 *      `sin_gestionar` quedo marcada (R26), y la lista barrida es la misma antes y despues (R6).
 *  (c) `repo`: el repositorio recibe una barrida que NO es de este cierre -> lanza y el SAVEPOINT real
 *      revierte la aprobacion entera, liberacion incluida (R21).
 *  (d) `alcance`: `findBarridasDelCierre` con un alcance que NO incluye el cierre -> `[]`; con el
 *      alcance correcto, las dos barridas (control positivo) (R8, el alcance en el WHERE).
 *
 * Sin `if (!x) return;`: la siembra exige sus catalogos y la anti-vacuidad exige las dos barridas.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;
const UMBRAL = reintentosConfig.MIN_INTENTOS_ENTREGA;
const ALCANCE_CENTRAL = { destinoTipo: "bodega_central" as const, destinoZonaId: null };

type Tx = TxDeTest;

interface Corpus {
  cierreId: string;
  zonaId: string;
  maestro: Actor;
  maestroId: string;
  oLib: string;
  oTope: string;
  oAjena: string;
  id: (value: string) => string;
}

async function sembrar(tx: Tx): Promise<Corpus> {
  await serializarEscriturasReales(tx);
  const sufijo = `slt72-${randomUUID().slice(0, 8)}`;

  const canton = await tx.canton.findFirst({ select: { id: true, provinciaId: true } });
  const [tipoIdentificacion, rolTienda, rolMensajero, rolMaestro] = await Promise.all([
    tx.tipoIdentificacion.findFirst({ select: { id: true } }),
    tx.rol.findFirst({ where: { value: "adminTienda" }, select: { id: true } }),
    tx.rol.findFirst({ where: { value: "mensajero" }, select: { id: true } }),
    tx.rol.findFirst({ where: { value: "maestro" }, select: { id: true } }),
  ]);
  // Fallo ruidoso, nunca un `return`: sin catalogos el caso no puede salir `passed`.
  if (!canton || !tipoIdentificacion || !rolTienda || !rolMensajero || !rolMaestro) {
    throw new Error("la base no tiene catalogos (geografia / roles / identificacion): corre `pnpm run db:seed`");
  }
  const catalogo = new Map(
    (await tx.orderStatus.findMany({ select: { id: true, value: true } })).map((s) => [s.value as string, s.id]),
  );
  const id = (value: string): string => {
    const v = catalogo.get(value);
    if (v === undefined) throw new Error(`el catalogo no tiene el estatus ${value}`);
    return v;
  };

  const zona = (
    await tx.zona.create({
      data: { sinpeNumero: "80000000", sinpeNombre: "Titular de Prueba", nombre: `${sufijo}-zona` },
      select: { id: true },
    })
  ).id;
  const crearUsuario = async (nombre: string, rolId: string, zonaId: string | null) =>
    (
      await tx.usuario.create({
        data: {
          nombre,
          primerApellido: "Prueba",
          email: `${sufijo}-${nombre}@slt72.local`,
          telefono: "88880000",
          passwordHash: "no-es-una-credencial",
          cedula: `${sufijo}-${nombre}`,
          tipoIdentificacionId: tipoIdentificacion.id,
          rolId,
          zonaId,
        },
        select: { id: true },
      })
    ).id;
  const maestroId = await crearUsuario("Maestra", rolMaestro.id, null);
  const tienda = await crearUsuario("Tienda", rolTienda.id, null);
  const mensajero = await crearUsuario("Mensa", rolMensajero.id, zona);

  const crearOrden = async (clave: string): Promise<{ id: string; numGuia: number }> => {
    const [{ guia }] = await tx.$queryRawUnsafe<{ guia: number }[]>(
      `SELECT nextval('orden_num_guia_seq')::int AS guia`,
    );
    const orden = await tx.orden.create({
      data: {
        numRemision: `${sufijo}-${clave}`,
        numGuia: guia,
        destinatario: `Cliente ${clave}`,
        telefonoDest: "80000000",
        direccion: `Direccion ${clave}`,
        producto: "caja",
        estatusId: id("novedad_interna"),
        tiendaId: tienda,
        zonaId: zona,
        provinciaId: canton.provinciaId,
        cantonId: canton.id,
        cobraComision: true,
        mensajeroAsignadoId: mensajero,
      },
      select: { id: true },
    });
    return { id: orden.id, numGuia: guia };
  };
  const oLib = await crearOrden("lib");
  const oTope = await crearOrden("tope");
  const oAjena = await crearOrden("ajena");

  // oTope llega al umbral: UMBRAL intentos vigentes en cierres APROBADOS distintos (molde de
  // `sembrarIntentoPasado` de la 454, con el resultado `rechazada` que cuenta como intento).
  for (let i = 0; i < UMBRAL; i++) {
    const en = new Date(Date.UTC(2026, 8, 1 + i, 16));
    const viejo = await tx.cierreDia.create({
      data: { mensajeroId: mensajero, estado: "aprobado", destinoTipo: "bodega_central", destinoZonaId: zona, solicitadoAt: en },
      select: { id: true },
    });
    const g = await tx.gestionOrden.create({
      data: {
        ordenId: oTope.id,
        mensajeroId: mensajero,
        resultado: "devolucion_a_origen_por_rechazo",
        cierreId: viejo.id,
        createdAt: en,
      },
      select: { id: true },
    });
    await tx.ordenHistorialEstado.create({
      data: {
        ordenId: oTope.id,
        estatusDestinoId: id("devolucion_a_origen_por_rechazo"),
        origenTipo: "gestion",
        gestionOrdenId: g.id,
        createdAt: en,
      },
    });
  }

  // El cierre del dia, ya `solicitado`, con su registro de barridas (lo que el corte deja al vencer).
  const cierre = await tx.cierreDia.create({
    data: {
      mensajeroId: mensajero,
      estado: "solicitado",
      destinoTipo: "bodega_central",
      destinoZonaId: zona,
      sinGestionRegistrado: true,
    },
    select: { id: true },
  });
  for (const o of [oLib, oTope]) {
    await tx.cierreSinGestion.create({
      data: {
        cierreId: cierre.id,
        ordenId: o.id,
        numGuia: o.numGuia,
        numRemision: `${sufijo}-rem`,
        destinatario: "Cliente",
        producto: "caja",
        tiendaNombre: "Tienda",
        zonaNombre: "Zona",
        estatusOrigenId: id("en_reparto"),
      },
    });
  }

  // TESTIGO DEL `cierreId` EN EL WHERE (R9): un cierre ANTERIOR del mismo mensajero, en el mismo
  // alcance, que SI barrio a oAjena. Sin el `cierreId` en la lectura, oAjena entraria en el conjunto
  // esperado de ESTE cierre y la aprobacion exacta dejaria de serlo.
  const anterior = await tx.cierreDia.create({
    data: {
      mensajeroId: mensajero,
      estado: "vencido",
      destinoTipo: "bodega_central",
      destinoZonaId: zona,
      sinGestionRegistrado: true,
      solicitadoAt: new Date(Date.UTC(2026, 8, 20, 16)),
    },
    select: { id: true },
  });
  await tx.cierreSinGestion.create({
    data: {
      cierreId: anterior.id,
      ordenId: oAjena.id,
      numGuia: oAjena.numGuia,
      numRemision: `${sufijo}-rem`,
      destinatario: "Cliente",
      producto: "caja",
      tiendaNombre: "Tienda",
      zonaNombre: "Zona",
      estatusOrigenId: id("en_reparto"),
    },
  });

  return {
    cierreId: cierre.id,
    zonaId: zona,
    maestroId,
    maestro: { usuarioId: maestroId, rol: "maestro" } as Actor,
    oLib: oLib.id,
    oTope: oTope.id,
    oAjena: oAjena.id,
    id,
  };
}

async function filasBarridas(tx: Tx, cierreId: string) {
  return tx.cierreSinGestion.findMany({
    where: { cierreId },
    select: { ordenId: true, numGuia: true, confirmadaFisicaAt: true, numRemision: true, destinatario: true },
    orderBy: { ordenId: "asc" },
  });
}

async function estadoDe(tx: Tx, ordenId: string): Promise<string> {
  const o = await tx.orden.findUniqueOrThrow({ where: { id: ordenId }, select: { estatus: { select: { value: true } } } });
  return o.estatus.value as string;
}

/** La confirmacion EXACTA que bodega mandaria: cada barrida con su guia CONGELADA. */
async function confirmacionExacta(tx: Tx, cierreId: string) {
  const s = montarServicios(tx as unknown as PrismaClient);
  const [gestiones, barridas] = await Promise.all([
    s.adminRepo.findGestionesRetornablesDelCierre(cierreId, ALCANCE_CENTRAL),
    s.adminRepo.findBarridasDelCierre(cierreId, ALCANCE_CENTRAL),
  ]);
  return [
    ...gestiones.map((g) => ({ origen: "gestion" as const, gestionId: g.gestionId, numGuia: g.numGuia as number })),
    ...barridas.map((b) => ({ origen: "barrida" as const, ordenId: b.ordenId, numGuia: b.numGuia as number })),
  ];
}

describeSiHayBase("451/T4.5 — aprobar exige y marca las barridas del cierre (Postgres real)", () => {
  let prisma: PrismaClient;
  let incompleta: Awaited<ReturnType<typeof correrIncompleta>>;
  let completa: Awaited<ReturnType<typeof correrCompleta>>;
  let repo: Awaited<ReturnType<typeof correrRepo>>;
  let alcance: Awaited<ReturnType<typeof correrAlcance>>;

  function correrIncompleta() {
    return enTransaccionRevertida(prisma, async (tx) => {
      const c = await sembrar(tx);
      const exacta = await confirmacionExacta(tx, c.cierreId);
      const sinUna = exacta.filter((x) => !(x.origen === "barrida" && x.ordenId === c.oLib));
      const r = await montarServicios(tx as unknown as PrismaClient).cierresAdmin.aprobarCierre(
        c.cierreId,
        c.maestro,
        [],
        sinUna,
      );
      const cierre = await tx.cierreDia.findUniqueOrThrow({ where: { id: c.cierreId }, select: { estado: true } });
      return {
        c,
        barridasEsperadas: exacta.filter((x) => x.origen === "barrida").length,
        r,
        estado: cierre.estado,
        estados: { oLib: await estadoDe(tx, c.oLib), oTope: await estadoDe(tx, c.oTope) },
        filas: await filasBarridas(tx, c.cierreId),
      };
    });
  }

  function correrCompleta() {
    return enTransaccionRevertida(prisma, async (tx) => {
      const c = await sembrar(tx);
      const filasAntes = await filasBarridas(tx, c.cierreId);
      const exacta = await confirmacionExacta(tx, c.cierreId);
      const r = await montarServicios(tx as unknown as PrismaClient).cierresAdmin.aprobarCierre(
        c.cierreId,
        c.maestro,
        [],
        exacta,
      );
      const cierre = await tx.cierreDia.findUniqueOrThrow({ where: { id: c.cierreId }, select: { estado: true } });
      // Las ordenes que ESTA aprobacion movio desde `sin_gestionar`, leidas del historial de estados
      // y no de la lista de barridas: es la otra mitad de la igualdad de R26.
      const movidas = await tx.ordenHistorialEstado.findMany({
        where: { ordenId: { in: [c.oLib, c.oTope, c.oAjena] }, estatusOrigenId: c.id("novedad_interna") },
        select: { ordenId: true },
      });
      return {
        c,
        r,
        estado: cierre.estado,
        enviadas: exacta.filter((x) => x.origen === "barrida").map((x) => x.ordenId).sort(),
        filasAntes,
        filasDespues: await filasBarridas(tx, c.cierreId),
        movidas: [...new Set(movidas.map((m) => m.ordenId))].sort(),
        estados: {
          oLib: await estadoDe(tx, c.oLib),
          oTope: await estadoDe(tx, c.oTope),
          oAjena: await estadoDe(tx, c.oAjena),
        },
      };
    });
  }

  function correrRepo() {
    return enTransaccionRevertida(prisma, async (tx) => {
      const c = await sembrar(tx);
      const exacta = await confirmacionExacta(tx, c.cierreId);
      let error: unknown = null;
      try {
        // Savepoint REAL: el `throw` del repositorio tiene que revertir lo que ya escribio,
        // incluida la liberacion de las barridas, que corre ANTES de la marca.
        await montarServicios(clienteConSavepoint(tx)).adminRepo.resolverCierre({
          cierreId: c.cierreId,
          alcance: ALCANCE_CENTRAL,
          nuevoEstado: "aprobado",
          resueltoPor: c.maestroId,
          motivoRechazo: null,
          aplicacionGestiones: {
            enRepartoId: c.id("en_reparto"),
            destinoPorResultado: {
              entregado: c.id("entregado"),
              reprogramado: c.id("reprogramado"),
              devolucion_a_origen_por_rechazo: c.id("devolucion_a_origen_por_rechazo"),
              novedad: c.id("novedad"),
              incidente: c.id("incidente"),
            },
          },
          liberacionSinGestionar: {
            sinGestionarEstatusId: c.id("novedad_interna"),
            enBodegaEstatusId: c.id("en_bodega_central"),
            enBodegaSateliteEstatusId: c.id("en_bodega_satelite"),
            centralZonaId: null,
            rechazadaEstatusId: c.id("devolucion_a_origen_por_rechazo"),
            umbralIntentos: UMBRAL,
          },
          confirmacionFisica: [
            ...exacta.map((x) => (x.origen === "gestion" ? { gestionId: x.gestionId } : { ordenId: x.ordenId })),
            { ordenId: c.oAjena }, // NO es de este cierre
          ],
        });
      } catch (err) {
        error = err;
      }
      const cierre = await tx.cierreDia.findUniqueOrThrow({ where: { id: c.cierreId }, select: { estado: true } });
      return {
        esFallaCerrada: error instanceof ConfirmacionFisicaNoAplicableError,
        error: error instanceof Error ? error.name : String(error),
        estado: cierre.estado,
        estados: { oLib: await estadoDe(tx, c.oLib), oTope: await estadoDe(tx, c.oTope) },
        filas: await filasBarridas(tx, c.cierreId),
      };
    });
  }

  function correrAlcance() {
    return enTransaccionRevertida(prisma, async (tx) => {
      const c = await sembrar(tx);
      const adminRepo = montarServicios(tx as unknown as PrismaClient).adminRepo;
      // El cierre es de `bodega_central` con `destinoZonaId` = la zona sembrada. El alcance AJENO
      // comparte esa MISMA zona y solo cambia el tipo: lo unico que lo excluye es el `destinoTipo`
      // de la relacion al cierre, y eso solo lo ve el WHERE (R8).
      const ajeno = { destinoTipo: "bodega_satelite" as const, destinoZonaId: c.zonaId };
      const ordenar = (xs: { ordenId: string }[]) => xs.map((x) => x.ordenId).sort();
      return {
        c,
        propio: ordenar(await adminRepo.findBarridasDelCierre(c.cierreId, ALCANCE_CENTRAL)),
        ajeno: ordenar(await adminRepo.findBarridasDelCierre(c.cierreId, ajeno)),
      };
    });
  }

  beforeAll(async () => {
    prisma = crearPrismaDeTest();
    incompleta = await correrIncompleta();
    completa = await correrCompleta();
    repo = await correrRepo();
    alcance = await correrAlcance();
  }, 240_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("anti-vacuidad: el cierre tiene EXACTAMENTE las dos barridas sembradas, y las dos se esperan", () => {
    expect(completa.filasAntes.map((f) => f.ordenId).sort()).toEqual([completa.c.oLib, completa.c.oTope].sort());
    expect(incompleta.barridasEsperadas).toBe(2);
  });

  it("R11/R12: con una barrida sin confirmar NO aprueba: error en ESA barrida, cierre `solicitado`, nada liberado, cero marcas", () => {
    expect(incompleta.r.status).toBe("validation_error");
    const fieldErrors = (incompleta.r as { fieldErrors: Record<string, string[]> }).fieldErrors;
    expect(Object.keys(fieldErrors)).toEqual([incompleta.c.oLib]);
    expect(incompleta.estado).toBe("solicitado");
    expect(incompleta.estados).toEqual({ oLib: "novedad_interna", oTope: "novedad_interna" });
    expect(incompleta.filas).toHaveLength(2);
    expect(incompleta.filas.filter((f) => f.confirmadaFisicaAt !== null)).toEqual([]);
  });

  it("R20/R26: con la cobertura exacta aprueba, y TODA orden que la aprobacion movio quedo marcada", () => {
    expect(completa.r.status).toBe("ok");
    expect(completa.estado).toBe("aprobado");
    // Las DOS ramas de la liberacion se ejercieron de verdad: a bodega (109) y por tope (276 + 139).
    expect(["en_bodega_central", "en_bodega_satelite"]).toContain(completa.estados.oLib);
    expect(["por_devolver_a_tienda", "por_devolver_a_bodega_central"]).toContain(completa.estados.oTope);
    // La orden no barrida por este cierre no se toca (271).
    expect(completa.estados.oAjena).toBe("novedad_interna");
    // R26: lo movido desde `sin_gestionar` es EXACTAMENTE lo marcado.
    const marcadas = completa.filasDespues
      .filter((f) => f.confirmadaFisicaAt !== null)
      .map((f) => f.ordenId)
      .sort();
    expect(completa.movidas).toEqual([completa.c.oLib, completa.c.oTope].sort());
    expect(marcadas).toEqual(completa.movidas);
  });

  it("R6/R9: la lista barrida no crece ni cambia entre validar y aprobar, y la cobertura es EXACTA", () => {
    const antes = completa.filasAntes.map((f) => f.ordenId).sort();
    const despues = completa.filasDespues.map((f) => f.ordenId).sort();
    expect(despues).toEqual(antes);
    expect(completa.enviadas).toEqual(antes);
  });

  it("R22: la marca no altera los descriptivos congelados de la barrida", () => {
    const sinMarca = (f: (typeof completa.filasAntes)[number]) => ({
      ordenId: f.ordenId,
      numGuia: f.numGuia,
      numRemision: f.numRemision,
      destinatario: f.destinatario,
    });
    expect(completa.filasDespues.map(sinMarca)).toEqual(completa.filasAntes.map(sinMarca));
  });

  it("R21: una barrida ajena en la escritura LANZA y revierte la aprobacion entera, liberacion incluida", () => {
    expect(repo.error).toBe("ConfirmacionFisicaNoAplicableError");
    expect(repo.esFallaCerrada).toBe(true);
    expect(repo.estado).toBe("solicitado");
    expect(repo.estados).toEqual({ oLib: "novedad_interna", oTope: "novedad_interna" });
    expect(repo.filas).toHaveLength(2);
    expect(repo.filas.filter((f) => f.confirmadaFisicaAt !== null)).toEqual([]);
  });

  it("R8: las barridas de un cierre fuera del alcance NO se leen (alcance en el WHERE), y dentro si", () => {
    // Control positivo: con el alcance del cierre salen sus DOS barridas, asi el `[]` de abajo no es vacio.
    expect(alcance.propio).toEqual([alcance.c.oLib, alcance.c.oTope].sort());
    expect(alcance.ajeno).toEqual([]);
  });
});
