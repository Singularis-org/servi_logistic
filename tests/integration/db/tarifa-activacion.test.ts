import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import {
  activarTarifasNuevas,
  crearGrupoDistritos,
  borrarGrupoDistritos,
  guardarValoresTarifa,
} from "@/lib/actions/tarifas";
import { conEmpresa } from "@/lib/db/contexto-empresa";
import { conAislamientoPorEmpresa } from "@/lib/db/extension-empresa";
import { usaModeloNuevo } from "@/lib/repositories/_shared/resolver-tarifas";
import { GrupoDistritosRepository } from "@/lib/repositories/GrupoDistritosRepository";
import { TarifaActivacionRepository } from "@/lib/repositories/TarifaActivacionRepository";
import { TarifaValorRepository } from "@/lib/repositories/TarifaValorRepository";
import { TarifaActivacionService } from "@/lib/services/TarifaActivacionService";
import { serviciosDeTarifas } from "@/lib/tarifas/servicios";
import { comoApp, crearOrganizacion, fijarEmpresa, sembrarActivacion } from "@/tests/fabricas/organizaciones";
import { crearFksDeOrden, crearUsuarioDePrueba } from "./_fixtures/orden-minima";
import { conCandado459, limpiar459, sembrarPersonas459, type Personas459 } from "./_fixtures/escrituras-459";
import {
  HAY_BASE_DE_DATOS,
  RegistroCaido,
  clienteConSavepoint,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  urlDeBaseDeDatos,
  type FksDeOrden,
  type TxDeTest,
} from "./_postgres-real";

// SLT-54 T1.4 (design §3, §4, R3, R4, R7, R9, R12) — ACTIVAR, CONTRA POSTGRES REAL.
//
// Lo que se prueba es SQL: que la fila y su historial caigan juntos, que el unico por empresa resuelva
// una carrera de verdad entre dos conexiones, que la RLS no deje ver ni crear la activacion de otra
// empresa y que activar no toque ninguna otra fila. El repositorio corre como `servi_app` con la empresa
// fijada (`comoApp`): sin bajar de rol, la RLS no actuaria y el aislamiento pasaria aunque no existiera.
//
// Todo en una transaccion que siempre se revierte, salvo la carrera: dos conexiones no pueden compartir
// una transaccion, asi que esa siembra se commitea y se limpia. Cada caso afirma lo que sembro.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

beforeAll(() => {
  if (!HAY_BASE_DE_DATOS) return;
  base = crearPrismaDeTest();
});

afterAll(async () => {
  if (base) await base.$disconnect();
});

async function comoEmpresa<T>(tx: TxDeTest, org: string, fn: () => Promise<T>): Promise<T> {
  await comoApp(tx, org);
  try {
    return await fn();
  } finally {
    await tx.$executeRawUnsafe("RESET ROLE");
  }
}

interface Escenario {
  A: string;
  B: string;
  fksA: FksDeOrden;
  maestroA: string;
  /** Un valor nuevo de A, de zona. */
  valorA: string;
  /** La fila de cada empresa que un activar mal hecho podria tocar. */
  distritoA: string;
}

/** Dos empresas, con modelo viejo, valores, marca de zona especial y un cierre ya creado. */
async function sembrar(tx: TxDeTest): Promise<Escenario> {
  await serializarEscriturasReales(tx);
  const A = (await crearOrganizacion(tx)).id;
  const B = (await crearOrganizacion(tx)).id;

  await fijarEmpresa(tx, B);
  const fksB = await crearFksDeOrden(tx);
  await tx.tarifaValor.create({
    data: { concepto: "tienda_flete_entregado", modo: "monto", valor: "7777.00", ivaPct: "13.00", zonaId: fksB.zonaId },
  });

  await fijarEmpresa(tx, A);
  const fksA = await crearFksDeOrden(tx);
  const maestroA = (await crearUsuarioDePrueba(tx, "maestro")).id;
  const mensajero = (await crearUsuarioDePrueba(tx, "mensajero")).id;
  const distritoA = (await tx.distrito.findFirstOrThrow({ where: { cantonId: fksA.cantonId }, select: { id: true } })).id;
  const valorA = (
    await tx.tarifaValor.create({
      data: { concepto: "tienda_flete_entregado", modo: "monto", valor: "1500.00", ivaPct: "13.00", zonaId: fksA.zonaId },
      select: { id: true },
    })
  ).id;
  await tx.tarifa.create({
    data: {
      tiendaId: fksA.tiendaId,
      zonaId: fksA.zonaId,
      valorFlete: "2000.00",
      valorFleteDevuelto: "1000.00",
      valorFleteGam: "2500.00",
      valorFleteDevueltoGam: "1200.00",
      comisionCod: "0.00",
      ivaFlete: "13.00",
      ivaComisionCod: "13.00",
    },
  });
  await tx.tarifaZonaMensajero.create({
    data: { zonaId: fksA.zonaId, vehiculoId: null, cobroEntregado: "1500.00", cobroRechazado: "1000.00" },
  });
  await tx.distritoZonaEspecial.create({ data: { distritoId: distritoA } });

  const orden = await tx.orden.create({
    data: {
      numRemision: `R-SLT54-${randomUUID().slice(0, 12)}`,
      destinatario: "Activacion SLT-54",
      telefonoDest: "88880000",
      producto: "caja",
      estatusId: fksA.estatusId,
      tiendaId: fksA.tiendaId,
      zonaId: fksA.zonaId,
      provinciaId: fksA.provinciaId,
      cantonId: fksA.cantonId,
      distritoId: distritoA,
      montoCobrar: new Prisma.Decimal("10000.00"),
    },
    select: { id: true },
  });
  const cierre = await tx.cierreDia.create({
    data: { mensajeroId: mensajero, destinoTipo: "bodega_central", destinoZonaId: fksA.zonaId },
    select: { id: true },
  });
  await tx.$executeRawUnsafe(
    `INSERT INTO "cierre_detail" ("id", "cierre_id", "orden_id", "cobra_comision", "zona_id", "tienda_id", "es_central",
       "num_remision", "destinatario", "producto", "tienda_nombre", "zona_nombre", "provincia_nombre", "canton_nombre",
       "tarifa_valor_flete", "tarifa_modelo")
     VALUES ($1, $2, $3, false, $4, $5, false, 'R', 'D', 'P', 'T', 'Z', 'Pr', 'Ca', 2500, 'viejo')`,
    randomUUID(),
    cierre.id,
    orden.id,
    fksA.zonaId,
    fksA.tiendaId,
  );

  return { A, B, fksA, maestroA, valorA, distritoA };
}

async function afirmarSiembra(tx: TxDeTest, e: Escenario) {
  for (const org of [e.A, e.B]) {
    expect(await tx.tarifaActivacion.count({ where: { organizacionId: org } })).toBe(0);
    expect(await tx.tarifaValor.count({ where: { organizacionId: org } })).toBe(1);
  }
  expect(await tx.tarifa.count({ where: { organizacionId: e.A } })).toBe(1);
  expect(await tx.tarifaZonaMensajero.count({ where: { organizacionId: e.A } })).toBe(1);
  expect(await tx.distritoZonaEspecial.count({ where: { organizacionId: e.A } })).toBe(1);
  expect(await tx.cierreDetail.count({ where: { organizacionId: e.A } })).toBe(1);
}

function conEscenario(fn: (tx: TxDeTest, e: Escenario) => Promise<void>) {
  return enTransaccionRevertida(base, async (tx) => {
    const e = await sembrar(tx);
    await afirmarSiembra(tx, e);
    await fn(tx, e);
  });
}

function repo(tx: TxDeTest) {
  return new TarifaActivacionRepository(clienteConSavepoint(tx));
}

describeSiHayBase("SLT-54 R3 — fijar y quitar no cambian el modelo", () => {
  it("fijar y quitar no cambian el modelo: sin activar sigue viejo, activada sigue nuevo", async () => {
    await conEscenario(async (tx, e) => {
      const modelo = () => comoEmpresa(tx, e.A, () => usaModeloNuevo(tx));
      const valores = () => new TarifaValorRepository(clienteConSavepoint(tx));
      const grupos = () => new GrupoDistritosRepository(clienteConSavepoint(tx));
      const datos = {
        concepto: "mensajero_entregado" as const,
        modo: "monto" as const,
        valor: "800.00",
        ivaPct: null,
        nivel: "zona" as const,
        zonaId: e.fksA.zonaId,
        grupoId: null,
        tiendaId: null,
        mensajeroId: null,
        vehiculoId: null,
      };
      const recorrer = async () => {
        const fijado = await comoEmpresa(tx, e.A, () => valores().fijar(datos, e.maestroA));
        if (fijado === "nivel_ocupado") throw new Error("el nivel estaba ocupado");
        const grupo = await comoEmpresa(tx, e.A, () =>
          grupos().crear({ zonaId: e.fksA.zonaId, nombre: `G-${randomUUID().slice(0, 6)}`, distritoIds: [] }, e.maestroA),
        );
        if (grupo.status !== "ok") throw new Error(`el grupo no se creo: ${grupo.status}`);
        await comoEmpresa(tx, e.A, () => grupos().renombrar(grupo.id, `R-${randomUUID().slice(0, 6)}`, e.maestroA));
        await comoEmpresa(tx, e.A, () => grupos().borrar(grupo.id, e.maestroA));
        await comoEmpresa(tx, e.A, () => valores().quitar(fijado.id, e.maestroA));
      };

      expect(await modelo()).toBe(false);
      await recorrer();
      expect(await modelo()).toBe(false);
      // Sin ningun valor tampoco cambia: el interruptor no mira la tabla.
      await comoEmpresa(tx, e.A, () => valores().quitar(e.valorA, e.maestroA));
      expect(await tx.tarifaValor.count({ where: { organizacionId: e.A } })).toBe(0);
      expect(await modelo()).toBe(false);

      await comoEmpresa(tx, e.A, () => repo(tx).activar(e.maestroA, 0));
      expect(await modelo()).toBe(true);
      await recorrer();
      expect(await tx.tarifaValor.count({ where: { organizacionId: e.A } })).toBe(0);
      expect(await modelo()).toBe(true);
    });
  });
});

describeSiHayBase("SLT-54 R4 — la activación y su rastro", () => {
  it("activación con actor e historial en la misma transacción", async () => {
    await conEscenario(async (tx, e) => {
      const res = await comoEmpresa(tx, e.A, () => repo(tx).activar(e.maestroA, 4));
      expect(res.creada).toBe(true);
      const fila = await tx.tarifaActivacion.findFirstOrThrow({
        where: { organizacionId: e.A },
        select: { id: true, activadaAt: true, activadaPor: true },
      });
      expect(fila.activadaPor).toBe(e.maestroA);
      expect(fila.activadaAt).toEqual(res.activadaAt);
      const rastro = await tx.historialAccion.findMany({
        where: { organizacionId: e.A, accion: "tarifas_activadas" },
        select: {
          entidadTipo: true,
          entidadId: true,
          entidadEtiqueta: true,
          actorUsuarioId: true,
          actorRol: true,
          valorAnterior: true,
          valorNuevo: true,
        },
      });
      expect(rastro).toEqual([
        {
          entidadTipo: "tarifa_activacion",
          entidadId: fila.id,
          entidadEtiqueta: "Tarifas nuevas",
          actorUsuarioId: e.maestroA,
          actorRol: "maestro",
          valorAnterior: null,
          valorNuevo: "faltantes: 4",
        },
      ]);
    });
  });

  it("si el historial falla, la activación no queda", async () => {
    await conEscenario(async (tx, e) => {
      await expect(
        comoEmpresa(tx, e.A, () => new TarifaActivacionRepository(clienteConSavepoint(tx, true)).activar(e.maestroA, 0)),
      ).rejects.toBeInstanceOf(RegistroCaido);
      expect(await tx.tarifaActivacion.count({ where: { organizacionId: e.A } })).toBe(0);
      expect(await tx.historialAccion.count({ where: { organizacionId: e.A, accion: "tarifas_activadas" } })).toBe(0);
    });
  });
});

describeSiHayBase("SLT-54 R7 — dos activaciones simultáneas", () => {
  /** Un cliente con la MISMA envoltura que `getPrismaClient()`, en su propio pool: otra conexion de verdad. */
  function clienteDePeticion(): { cliente: PrismaClient; cerrar: () => Promise<void> } {
    const crudo = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlDeBaseDeDatos(), max: 2 }) });
    return {
      cliente: conAislamientoPorEmpresa(crudo as unknown as PrismaClient, async () => null),
      cerrar: () => crudo.$disconnect(),
    };
  }

  async function conPersonas(cuerpo: (p: Personas459) => Promise<void>) {
    await conCandado459(base, async () => {
      let p: Personas459 | null = null;
      try {
        p = await sembrarPersonas459(base);
        await cuerpo(p);
      } finally {
        if (p !== null) {
          // El dueño puede: el REVOKE es solo para `servi_app`. Sin esto, RESTRICT impide borrar la empresa.
          await base.tarifaActivacion.deleteMany({ where: { organizacionId: p.organizacionId } });
        }
        await limpiar459(base, p);
      }
    });
  }

  /**
   * Las dos peticiones pasan por la lectura del servicio ANTES de que ninguna escriba: la barrera solo
   * abre cuando las dos han llegado a los faltantes. Sin ella, la segunda podria ver la fila y responder
   * «ya activada» por la lectura, y este test no estaria midiendo el unico de la base.
   */
  function barreraDeDos() {
    let llegadas = 0;
    let abrir: () => void = () => undefined;
    const abierta = new Promise<void>((r) => {
      abrir = r;
    });
    return async () => {
      llegadas += 1;
      if (llegadas === 2) abrir();
      await abierta;
    };
  }

  it("dos activaciones simultáneas: una fila y un historial, `ok` y `ya_activada`", async () => {
    await conPersonas(async (p) => {
      expect(await base.tarifaActivacion.count({ where: { organizacionId: p.organizacionId } })).toBe(0);
      const a = clienteDePeticion();
      const b = clienteDePeticion();
      try {
        const esperar = barreraDeDos();
        const faltantes = {
          faltantesPorZona: async () => {
            await esperar();
            return [];
          },
        };
        const pedir = (cliente: PrismaClient) =>
          activarTarifasNuevas(
            { confirmaFaltantes: false },
            {
              getActor: async () => p.maestro,
              servicio: new TarifaActivacionService(new TarifaActivacionRepository(cliente), faltantes),
            },
          );
        const respuestas = await conEmpresa(p.organizacionId, () => Promise.all([pedir(a.cliente), pedir(b.cliente)]));

        expect(respuestas.map((r) => r.status).sort()).toEqual(["ok", "ya_activada"]);
        const fila = await base.tarifaActivacion.findFirstOrThrow({
          where: { organizacionId: p.organizacionId },
          select: { id: true, activadaAt: true, activadaPor: true },
        });
        expect(fila.activadaPor).toBe(p.maestro.usuarioId);
        // La perdedora informa la fecha de la ganadora, no una propia.
        for (const r of respuestas) {
          if (r.status !== "ok" && r.status !== "ya_activada") throw new Error(`respuesta ${r.status}`);
          expect(r.activadaAt).toEqual(fila.activadaAt);
        }
        expect(await base.tarifaActivacion.count({ where: { organizacionId: p.organizacionId } })).toBe(1);
        expect(
          await base.historialAccion.count({ where: { organizacionId: p.organizacionId, accion: "tarifas_activadas" } }),
        ).toBe(1);

        // Y una tercera, ya sin carrera, no escribe nada.
        const tercera = await conEmpresa(p.organizacionId, () => pedir(a.cliente));
        expect(tercera.status).toBe("ya_activada");
        expect(
          await base.historialAccion.count({ where: { organizacionId: p.organizacionId, accion: "tarifas_activadas" } }),
        ).toBe(1);
      } finally {
        await a.cerrar();
        await b.cerrar();
      }
    });
  }, 120_000);
});

describeSiHayBase("SLT-54 R9 — activar no toca nada más", () => {
  /** Cada fila entera, como JSON, de lo que R9 protege. Ordenada para comparar sin depender del plan. */
  async function foto(tx: TxDeTest, org: string): Promise<Record<string, unknown>> {
    const salida: Record<string, unknown> = {};
    const tablas = ["tarifa_valor", "tarifas", "tarifa_zona_mensajero", "distrito_zona_especial", "cierre_dia", "cierre_detail", "zona"];
    for (const t of tablas) {
      salida[t] = await tx.$queryRawUnsafe(
        `SELECT row_to_json(x)::text AS f FROM "${t}" x WHERE x."organizacion_id" = $1 ORDER BY x."id"`,
        org,
      );
    }
    return salida;
  }

  it("activar no toca valores, viejo, marca ni cierres, ni en A ni en B", async () => {
    await conEscenario(async (tx, e) => {
      const antesA = await foto(tx, e.A);
      const antesB = await foto(tx, e.B);
      // La foto vio filas: sin esto, comparar vacio con vacio pasaria siempre.
      for (const t of ["tarifa_valor", "tarifas", "tarifa_zona_mensajero", "distrito_zona_especial", "cierre_dia", "cierre_detail", "zona"]) {
        expect((antesA[t] as unknown[]).length, t).toBeGreaterThan(0);
      }
      expect((antesB.tarifa_valor as unknown[]).length).toBe(1);

      const res = await comoEmpresa(tx, e.A, () => repo(tx).activar(e.maestroA, 0));
      expect(res.creada).toBe(true);

      expect(await foto(tx, e.A)).toEqual(antesA);
      expect(await foto(tx, e.B)).toEqual(antesB);
    });
  });
});

describeSiHayBase("SLT-54 R12 — activar A no cambia B", () => {
  it("activar A no cambia B: B no ve la fila, ni con SQL a mano, y sigue en el modelo viejo", async () => {
    await conEscenario(async (tx, e) => {
      await comoEmpresa(tx, e.A, () => repo(tx).activar(e.maestroA, 0));
      expect(await tx.tarifaActivacion.count({ where: { organizacionId: e.A } })).toBe(1);

      expect(await comoEmpresa(tx, e.A, () => usaModeloNuevo(tx))).toBe(true);
      expect(await comoEmpresa(tx, e.B, () => usaModeloNuevo(tx))).toBe(false);
      expect(await comoEmpresa(tx, e.B, () => repo(tx).leer())).toBeNull();

      const verComoB = (sql: string, ...args: unknown[]) =>
        comoEmpresa(tx, e.B, () => tx.$queryRawUnsafe<{ n: number }[]>(sql, ...args));
      expect(await verComoB(`SELECT count(*)::int AS n FROM "tarifa_activacion"`)).toEqual([{ n: 0 }]);
      expect(await verComoB(`SELECT count(*)::int AS n FROM "tarifa_activacion" WHERE "organizacion_id" = $1`, e.A)).toEqual([
        { n: 0 },
      ]);
      // Y A si la ve: el 0 de B no es porque la consulta no pueda ver nada.
      expect(
        await comoEmpresa(tx, e.A, () => tx.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "tarifa_activacion"`)),
      ).toEqual([{ n: 1 }]);
    });
  });

  it("como A no se puede crear la activación de B, ni con SQL a mano", async () => {
    await conEscenario(async (tx, e) => {
      await comoApp(tx, e.A);
      await tx.$executeRawUnsafe("SAVEPOINT intento");
      await expect(
        tx.$executeRawUnsafe(
          `INSERT INTO "tarifa_activacion" ("id", "organizacion_id") VALUES ($1, $2)`,
          randomUUID(),
          e.B,
        ),
      ).rejects.toThrow(/42501/);
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT intento");
      await tx.$executeRawUnsafe("RESET ROLE");
      expect(await tx.tarifaActivacion.count({ where: { organizacionId: e.B } })).toBe(0);
    });
  });

  it("activar B después de A crea su propia fila: el único es por empresa", async () => {
    await conEscenario(async (tx, e) => {
      await sembrarActivacion(tx, e.A);
      await fijarEmpresa(tx, e.B);
      const maestroB = (await crearUsuarioDePrueba(tx, "maestro")).id;
      const res = await comoEmpresa(tx, e.B, () => repo(tx).activar(maestroB, 0));
      expect(res.creada).toBe(true);
      expect(await tx.tarifaActivacion.count({ where: { organizacionId: { in: [e.A, e.B] } } })).toBe(2);
    });
  });
});

describeSiHayBase("SLT-54 R6, T2.3 — activar por la raíz de composición, con los faltantes de verdad", () => {
  function servicios(tx: TxDeTest) {
    return serviciosDeTarifas(clienteConSavepoint(tx));
  }

  const NIVEL_ZONA = (zonaId: string) => ({ zonaId, grupoId: null, tiendaId: null, vehiculoId: null });

  it("con faltantes reales pide confirmación, con la lista leída de la base y sin escribir", async () => {
    await conEscenario(async (tx, e) => {
      const maestro = { usuarioId: e.maestroA, rol: "maestro" as const };
      const res = await comoEmpresa(tx, e.A, () =>
        activarTarifasNuevas(
          { confirmaFaltantes: false },
          { getActor: async () => maestro, servicio: servicios(tx).tarifaActivacion },
        ),
      );
      // A solo tiene el flete por entregado de la zona: faltan los otros dos, y la lista es de A.
      expect(res.status).toBe("confirmacion_requerida");
      if (res.status !== "confirmacion_requerida") return;
      expect(res.faltantes.map((z) => [z.zonaId, z.faltantes.map((f) => f.concepto)])).toEqual([
        [e.fksA.zonaId, ["tienda_flete_rechazo", "mensajero_entregado"]],
      ]);
      expect(await tx.tarifaActivacion.count({ where: { organizacionId: e.A } })).toBe(0);
    });
  });

  it("confirmando, activa y el historial cuenta los faltantes reales", async () => {
    await conEscenario(async (tx, e) => {
      const maestro = { usuarioId: e.maestroA, rol: "maestro" as const };
      const res = await comoEmpresa(tx, e.A, () => servicios(tx).tarifaActivacion.activar({ confirmaFaltantes: true }, maestro));
      expect(res.status).toBe("ok");
      const rastro = await tx.historialAccion.findFirstOrThrow({
        where: { organizacionId: e.A, accion: "tarifas_activadas" },
        select: { valorNuevo: true },
      });
      expect(rastro.valorNuevo).toBe("faltantes: 2");
    });
  });

  it("con los tres esenciales digitados activa sin confirmación, aunque el 0 sea uno de ellos", async () => {
    await conEscenario(async (tx, e) => {
      const maestro = { usuarioId: e.maestroA, rol: "maestro" as const };
      const s = servicios(tx);
      const fijados = await comoEmpresa(tx, e.A, async () => [
        await s.tarifaValor.fijarValor(
          { concepto: "tienda_flete_rechazo", modo: "monto", valor: "0", ivaPct: "13", ...NIVEL_ZONA(e.fksA.zonaId) },
          maestro,
        ),
        await s.tarifaValor.fijarValor(
          { concepto: "mensajero_entregado", modo: "monto", valor: "900", ...NIVEL_ZONA(e.fksA.zonaId) },
          maestro,
        ),
      ]);
      expect(fijados.map((f) => f.status)).toEqual(["ok", "ok"]);

      const res = await comoEmpresa(tx, e.A, () => s.tarifaActivacion.activar({ confirmaFaltantes: false }, maestro));
      expect(res.status).toBe("ok");
      expect(await tx.tarifaActivacion.count({ where: { organizacionId: e.A } })).toBe(1);
    });
  });

  it("el precio de una tienda y el valor de B no le cubren nada a A", async () => {
    await conEscenario(async (tx, e) => {
      const maestro = { usuarioId: e.maestroA, rol: "maestro" as const };
      const s = servicios(tx);
      const fijado = await comoEmpresa(tx, e.A, () =>
        s.tarifaValor.fijarValor(
          { concepto: "tienda_flete_rechazo", modo: "monto", valor: "700", ivaPct: "13", zonaId: e.fksA.zonaId, grupoId: null, tiendaId: e.fksA.tiendaId, vehiculoId: null },
          maestro,
        ),
      );
      expect(fijado.status).toBe("ok");
      const res = await comoEmpresa(tx, e.A, () => s.tarifaActivacion.activar({ confirmaFaltantes: false }, maestro));
      expect(res.status).toBe("confirmacion_requerida");
      if (res.status !== "confirmacion_requerida") return;
      expect(res.faltantes[0].faltantes.map((f) => f.concepto)).toEqual(["tienda_flete_rechazo", "mensajero_entregado"]);
    });
  });
});

describeSiHayBase("SLT-54 R29 — guardar no escribe en el viejo", () => {
  async function fotoDelViejo(tx: TxDeTest, org: string): Promise<Record<string, unknown>> {
    const salida: Record<string, unknown> = {};
    for (const t of ["tarifas", "tarifa_zona_mensajero", "distrito_zona_especial", "zona"]) {
      salida[t] = await tx.$queryRawUnsafe(
        `SELECT row_to_json(x)::text AS f FROM "${t}" x WHERE x."organizacion_id" = $1 ORDER BY x."id"`,
        org,
      );
    }
    return salida;
  }

  async function recorrerPantalla(tx: TxDeTest, e: Escenario) {
    const maestro = { usuarioId: e.maestroA, rol: "maestro" as const };
    const s = serviciosDeTarifas(clienteConSavepoint(tx));
    const nivel = { zonaId: e.fksA.zonaId, tiendaId: null, vehiculoId: null };
    const clave = randomUUID().slice(0, 8);

    await comoEmpresa(tx, e.A, async () => {
      const grupoDeps = { getActor: async () => maestro, servicio: s.grupoDistritos };
      const grupo = await crearGrupoDistritos(
        { zonaId: e.fksA.zonaId, nombre: `G-${clave}`, distritoIds: [] },
        grupoDeps,
      );
      if (grupo.status !== "ok") throw new Error(`grupo: ${grupo.status}`);

      const guardado = await guardarValoresTarifa(
        {
          cambios: [
            { accion: "fijar", clave: "a", datos: { concepto: "tienda_flete_rechazo", modo: "monto", valor: "700", ivaPct: "13", grupoId: null, ...nivel } },
            { accion: "fijar", clave: "b", datos: { concepto: "mensajero_entregado", modo: "monto", valor: "800", grupoId: grupo.id, ...nivel } },
            { accion: "fijar", clave: "c", datos: { concepto: "satelite_rechazo", modo: "porcentaje", valor: "10", grupoId: null, ...nivel } },
          ],
        },
        { getActor: async () => maestro, servicio: s.tarifaValor },
      );
      if (guardado.status !== "ok") throw new Error(`guardar: ${guardado.status}`);
      expect(guardado.resultados.map((r) => r.status)).toEqual(["ok", "ok", "ok"]);

      const borrado = await borrarGrupoDistritos({ id: grupo.id }, grupoDeps);
      expect(borrado).toEqual({ status: "ok" });

      const fijados = await tx.tarifaValor.findMany({
        where: { zonaId: e.fksA.zonaId, concepto: { in: ["tienda_flete_rechazo", "satelite_rechazo"] } },
        select: { id: true },
      });
      const quitados = await guardarValoresTarifa(
        { cambios: fijados.map((f, i) => ({ accion: "quitar", clave: `q${i}`, id: f.id })) },
        { getActor: async () => maestro, servicio: s.tarifaValor },
      );
      if (quitados.status !== "ok") throw new Error(`quitar: ${quitados.status}`);
      expect(quitados.resultados.map((r) => r.status)).toEqual(["ok", "ok"]);
    });
  }

  it("guardar no escribe en el viejo, ni antes ni después de activar", async () => {
    await conEscenario(async (tx, e) => {
      const antes = await fotoDelViejo(tx, e.A);
      // La foto vio filas: comparar vacio con vacio pasaria siempre.
      for (const t of ["tarifas", "tarifa_zona_mensajero", "distrito_zona_especial", "zona"]) {
        expect((antes[t] as unknown[]).length, t).toBeGreaterThan(0);
      }

      await recorrerPantalla(tx, e);
      expect(await fotoDelViejo(tx, e.A)).toEqual(antes);

      await sembrarActivacion(tx, e.A);
      await recorrerPantalla(tx, e);
      expect(await fotoDelViejo(tx, e.A)).toEqual(antes);
    });
  });
});
