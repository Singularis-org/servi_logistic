import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { actualizarZona } from "@/lib/actions/zonas";
import { ZonaRepository } from "@/lib/repositories/ZonaRepository";
import { ZonaService } from "@/lib/services/ZonaService";

import {
  comoLaEmpresa,
  crearEscenarioSlt89,
  distritosDeZona,
  guardado,
  nodosDeZona,
  repoDeZonas,
  type EscenarioSlt89,
} from "./_fixtures/slt89-zonas";
import { revertida } from "./_fixtures/pais-20";
import { HAY_BASE_DE_DATOS, clienteConSavepoint, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";

/**
 * SLT-89 · R1, R2, R3, R4, R5, R16 (T3.4; design §5.1) — GUARDAR UNA ZONA CON NODOS DE CUALQUIER
 * PROFUNDIDAD, contra Postgres real, en la empresa de `XA` de `slt89-zonas.ts`, como la app
 * (`servi_app` con la empresa en el contexto). Todo se revierte.
 *
 *   · R1: crear y guardar dejan asignados exactamente los nodos pedidos (canton, provincia,
 *     profundidad 4), en `zona_nodo`; los distritos siguen en `zona_distrito`.
 *   · R2: un nodo de otra zona de la empresa → `distrito_en_otra_zona` con su nombre y el de la zona,
 *     sin escribir; la carrera que para el indice unico → `conflictos: null`.
 *   · R3: canton en una zona y un descendiente en otra, en los dos ordenes de guardado.
 *   · R4: un nodo inexistente, de otro pais o que es un distrito → `nodo_invalido`, sin escribir; un
 *     nodo retirado se asigna.
 *   · R5: sin ningun nodo, `validation_error` en `distritoIds` por la action, sin escribir.
 *   · R16: un «antes» que no es lo que hay en la base → `cambio_concurrente`, sin escribir nada.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

/** Lo que un guardado rechazado no puede haber tocado: nombre, distritos, nodos e historial. */
async function foto(tx: TxDeTest, zonaId: string) {
  const zona = await tx.zona.findUniqueOrThrow({ where: { id: zonaId }, select: { nombre: true } });
  return {
    nombre: zona.nombre,
    distritos: await distritosDeZona(tx, zonaId),
    nodos: await nodosDeZona(tx, zonaId),
    historial: await tx.historialAccion.count(),
    zonaNodo: await tx.zonaNodo.count(),
  };
}

describeSiHayBase("SLT-89 · R1–R5, R16 — guardar una zona con nodos de cualquier profundidad", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  async function conEscenario<T>(fn: (tx: TxDeTest, e: EscenarioSlt89) => Promise<T>): Promise<T> {
    return revertida(base, async (tx) => fn(tx, await crearEscenarioSlt89(tx)));
  }

  it("R1: crear con un canton (retirado) y guardar con canton + profundidad 4 y luego con la provincia deja exactamente esos nodos", async () => {
    const r = await conEscenario(async (tx, e) => {
      const { geo, zonas } = e.emp.base;
      const creada = await comoLaEmpresa(tx, e.empresaId, () =>
        repoDeZonas(tx).create(
          {
            nombre: `Zona nodo SLT89 ${geo.cantonId.slice(0, 6)}`,
            cobroVehiculo: false,
            esCentral: false,
            distritoIds: [],
            nodoIds: [geo.cantonRetiradoId],
            tarifas: [],
            sinpeNumero: "80000000",
            sinpeNombre: "Titular de Prueba",
          },
          e.maestroId,
        ),
      );
      if (creada.estado !== "ok") throw new Error(`crear dio ${creada.estado}`);
      const nodosCreada = await nodosDeZona(tx, creada.zona.id);

      const datos1 = await guardado(tx, zonas.surId, {
        distritoIds: [geo.distritoBajoCantonRetiradoId],
        nodoIds: [geo.cantonId, e.sectorId],
      });
      const guardado1 = await comoLaEmpresa(tx, e.empresaId, () => repoDeZonas(tx).update(zonas.surId, datos1, e.maestroId));
      const nodos1 = await nodosDeZona(tx, zonas.surId);

      const datos2 = await guardado(tx, zonas.surId, {
        distritoIds: [geo.distritoBajoCantonRetiradoId],
        nodoIds: [geo.provinciaId],
      });
      const guardado2 = await comoLaEmpresa(tx, e.empresaId, () => repoDeZonas(tx).update(zonas.surId, datos2, e.maestroId));
      return {
        e,
        creada,
        nodosCreada,
        guardado1,
        nodos1,
        guardado2,
        nodos2: await nodosDeZona(tx, zonas.surId),
        distritos2: await distritosDeZona(tx, zonas.surId),
      };
    });
    const { geo } = r.e.emp.base;
    expect(r.nodosCreada).toEqual([geo.cantonRetiradoId]);
    expect(r.creada.estado === "ok" && r.creada.zona.nodosCount).toBe(1);
    expect(r.creada.estado === "ok" && r.creada.zona.distritosCount).toBe(0);
    expect(r.guardado1.estado).toBe("ok");
    expect(r.nodos1).toEqual([geo.cantonId, r.e.sectorId].sort());
    expect(r.guardado2.estado).toBe("ok");
    expect(r.guardado2.estado === "ok" && r.guardado2.zona.nodosCount).toBe(1);
    expect(r.nodos2).toEqual([geo.provinciaId]);
    // Los distritos no se tocan: siguen en `zona_distrito`, como antes.
    expect(r.distritos2).toEqual([geo.distritoBajoCantonRetiradoId]);
  });

  it("⭑ R2: un nodo ya asignado a otra zona de la empresa → conflicto con su nombre y el de la zona, y nada escrito", async () => {
    const r = await conEscenario(async (tx, e) => {
      const { geo, zonas } = e.emp.base;
      const datosSur = await guardado(tx, zonas.surId, { distritoIds: [geo.distritoBajoCantonRetiradoId], nodoIds: [geo.cantonId] });
      await comoLaEmpresa(tx, e.empresaId, () => repoDeZonas(tx).update(zonas.surId, datosSur, e.maestroId));

      const antes = await foto(tx, zonas.norteId);
      const datosNorte = await guardado(tx, zonas.norteId, {
        nombre: "Norte NO debe guardarse",
        distritoIds: [geo.distritoDosZonasId, geo.distritoRetiradoId],
        nodoIds: [geo.cantonId],
      });
      const repo = await comoLaEmpresa(tx, e.empresaId, () => repoDeZonas(tx).update(zonas.norteId, datosNorte, e.maestroId));
      const servicio = await comoLaEmpresa(tx, e.empresaId, () =>
        new ZonaService(repoDeZonas(tx)).actualizar(zonas.norteId, { ...datosNorte }, { usuarioId: e.maestroId, rol: "maestro" }),
      );
      const nombres = await tx.zona.findUniqueOrThrow({ where: { id: zonas.surId }, select: { nombre: true } });
      const canton = await tx.canton.findUniqueOrThrow({ where: { id: geo.cantonId }, select: { nombre: true } });
      return { repo, servicio, antes, despues: await foto(tx, zonas.norteId), zonaSur: nombres.nombre, canton: canton.nombre };
    });
    expect(r.repo).toEqual({
      estado: "distrito_en_otra_zona",
      conflictos: [],
      conflictosDeNodos: [{ distritoNombre: r.canton, zonaNombre: r.zonaSur }],
    });
    expect(r.servicio).toEqual({
      status: "validation_error",
      fieldErrors: { nodoIds: [`${r.canton} ya está en la zona ${r.zonaSur}.`] },
    });
    expect(r.despues).toEqual(r.antes);
  });

  it("R2: la carrera (la lectura no vio el conflicto y el indice unico lo paro) → `conflictos: null` y nada escrito", async () => {
    const r = await conEscenario(async (tx, e) => {
      const { geo, zonas } = e.emp.base;
      const datosSur = await guardado(tx, zonas.surId, { distritoIds: [geo.distritoBajoCantonRetiradoId], nodoIds: [geo.cantonId] });
      await comoLaEmpresa(tx, e.empresaId, () => repoDeZonas(tx).update(zonas.surId, datosSur, e.maestroId));
      // El otro guardado simultaneo: la lectura de nodos en otra zona (la unica que pide
      // `select.nodoGeografico`) llega vacia y el `createMany` real choca con el indice real.
      const delegado = tx.zonaNodo;
      const zonaNodoCiego = new Proxy(delegado as object, {
        get(objetivo, prop) {
          if (prop === "findMany") {
            return async (args: { select?: { nodoGeografico?: unknown } }) =>
              args?.select?.nodoGeografico !== undefined ? [] : delegado.findMany(args as never);
          }
          const valor = Reflect.get(objetivo, prop) as unknown;
          return typeof valor === "function" ? valor.bind(objetivo) : valor;
        },
      });
      const txCiego = new Proxy(tx as object, {
        get(objetivo, prop) {
          if (prop === "zonaNodo") return zonaNodoCiego;
          const valor = Reflect.get(objetivo, prop) as unknown;
          return typeof valor === "function" ? valor.bind(objetivo) : valor;
        },
      }) as TxDeTest;
      const antes = await foto(tx, zonas.norteId);
      const datosNorte = await guardado(tx, zonas.norteId, {
        distritoIds: [geo.distritoDosZonasId, geo.distritoRetiradoId],
        nodoIds: [geo.cantonId],
      });
      const res = await comoLaEmpresa(tx, e.empresaId, () =>
        new ZonaRepository(clienteConSavepoint(txCiego)).update(zonas.norteId, datosNorte, e.maestroId),
      );
      return { res, antes, despues: await foto(tx, zonas.norteId) };
    });
    expect(r.res).toEqual({ estado: "distrito_en_otra_zona", conflictos: null });
    expect(r.despues).toEqual(r.antes);
  });

  it("R3: canton en una zona y un descendiente en otra, en los dos ordenes de guardado", async () => {
    const r = await conEscenario(async (tx, e) => {
      const { geo, zonas } = e.emp.base;
      const update = async (zonaId: string, distritoIds: string[], nodoIds: string[]) => {
        const datos = await guardado(tx, zonaId, { distritoIds, nodoIds });
        return (await comoLaEmpresa(tx, e.empresaId, () => repoDeZonas(tx).update(zonaId, datos, e.maestroId))).estado;
      };
      // 1) El distrito ya estaba en la zona central (excepcion previa) y el canton entra a sur.
      const cantonDespues = await update(zonas.surId, [geo.distritoBajoCantonRetiradoId], [geo.cantonId]);
      // 2) Con el canton en sur, el distrito «sin zona» entra a norte y el sector (profundidad 4) tambien.
      const distritoDespues = await update(
        zonas.norteId,
        [geo.distritoDosZonasId, geo.distritoRetiradoId, geo.distritoSinZonaId],
        [],
      );
      const sectorDespues = await update(zonas.centralId, [geo.distritoCentralId], [e.sectorId]);
      return {
        e,
        estados: [cantonDespues, distritoDespues, sectorDespues],
        sur: await nodosDeZona(tx, zonas.surId),
        norte: await distritosDeZona(tx, zonas.norteId),
        central: await nodosDeZona(tx, zonas.centralId),
      };
    });
    const { geo } = r.e.emp.base;
    expect(r.estados).toEqual(["ok", "ok", "ok"]);
    expect(r.sur).toEqual([geo.cantonId]);
    expect(r.norte).toContain(geo.distritoSinZonaId);
    expect(r.central).toEqual([r.e.sectorId]);
  });

  it("R4: un nodo inexistente, de otro pais o que es un distrito → `nodo_invalido` sin escribir; un nodo retirado SI se asigna", async () => {
    const r = await conEscenario(async (tx, e) => {
      const { geo, zonas } = e.emp.base;
      const [cr] = await tx.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM nodo_geografico WHERE pais_id = 'CR' AND profundidad = 2 ORDER BY id LIMIT 1`,
      );
      if (cr === undefined) throw new Error("falta la geografia de Costa Rica");
      const antes = await foto(tx, zonas.surId);
      const intento = async (nodoIds: string[]) => {
        const datos = await guardado(tx, zonas.surId, { distritoIds: [geo.distritoBajoCantonRetiradoId], nodoIds });
        return comoLaEmpresa(tx, e.empresaId, () => repoDeZonas(tx).update(zonas.surId, datos, e.maestroId));
      };
      const inexistente = await intento(["no-existe-slt89"]);
      const otroPais = await intento([cr.id]);
      const distrito = await intento([geo.distritoSinZonaId]);
      const crear = await comoLaEmpresa(tx, e.empresaId, () =>
        repoDeZonas(tx).create(
          {
            nombre: "Zona SLT89 no debe crearse",
            cobroVehiculo: false,
            esCentral: false,
            distritoIds: [],
            nodoIds: ["no-existe-slt89"],
            tarifas: [],
            sinpeNumero: "80000000",
            sinpeNombre: "Titular de Prueba",
          },
          e.maestroId,
        ),
      );
      const despuesDeRechazos = await foto(tx, zonas.surId);
      const zonasCreadas = await tx.zona.count({ where: { nombre: "Zona SLT89 no debe crearse" } });
      const retirado = await intento([geo.cantonRetiradoId]);
      return { e, inexistente, otroPais, distrito, crear, antes, despuesDeRechazos, zonasCreadas, retirado, nodos: await nodosDeZona(tx, zonas.surId) };
    });
    expect(r.inexistente).toEqual({ estado: "nodo_invalido", motivos: ["no_existe"] });
    expect(r.otroPais).toEqual({ estado: "nodo_invalido", motivos: ["no_existe"] });
    expect(r.distrito).toEqual({ estado: "nodo_invalido", motivos: ["es_distrito"] });
    expect(r.crear).toEqual({ estado: "nodo_invalido", motivos: ["no_existe"] });
    expect(r.despuesDeRechazos).toEqual(r.antes);
    expect(r.zonasCreadas).toBe(0);
    expect(r.retirado.estado).toBe("ok");
    expect(r.nodos).toEqual([r.e.emp.base.geo.cantonRetiradoId]);
  });

  it("R5: sin distritos ni nodos, la action responde `validation_error` en `distritoIds` y no escribe", async () => {
    const r = await conEscenario(async (tx, e) => {
      const { zonas } = e.emp.base;
      const antes = await foto(tx, zonas.norteId);
      const datos = await guardado(tx, zonas.norteId, { distritoIds: [], nodoIds: [] });
      const res = await comoLaEmpresa(tx, e.empresaId, () =>
        actualizarZona(zonas.norteId, datos, {
          zonaService: new ZonaService(repoDeZonas(tx)),
          getActor: async () => ({ usuarioId: e.maestroId, rol: "maestro" }),
        }),
      );
      return { res, antes, despues: await foto(tx, zonas.norteId) };
    });
    expect(r.res.status).toBe("validation_error");
    if (r.res.status === "validation_error") expect(Object.keys(r.res.fieldErrors)).toEqual(["distritoIds"]);
    expect(r.despues).toEqual(r.antes);
  });

  it("⭑ R16: un «antes» distinto de la base → `cambio_concurrente` (y `conflict` por el service), sin escribir nada", async () => {
    const r = await conEscenario(async (tx, e) => {
      const { geo, zonas } = e.emp.base;
      const antes = await foto(tx, zonas.norteId);
      const datos = await guardado(tx, zonas.norteId, {
        nombre: "Norte NO debe guardarse",
        distritoIds: [geo.distritoDosZonasId],
        nodoIds: [e.sectorId],
      });
      // Lo que el modal mostro ya no es lo que hay: otro guardado le quito un distrito a la zona.
      const viejo = { ...datos, antes: { distritoIds: [geo.distritoDosZonasId], nodoIds: [] } };
      const repo = await comoLaEmpresa(tx, e.empresaId, () => repoDeZonas(tx).update(zonas.norteId, viejo, e.maestroId));
      const servicio = await comoLaEmpresa(tx, e.empresaId, () =>
        new ZonaService(repoDeZonas(tx)).actualizar(zonas.norteId, viejo, { usuarioId: e.maestroId, rol: "maestro" }),
      );
      const trasRechazo = await foto(tx, zonas.norteId);
      // Con el «antes» correcto el mismo guardado SI se aplica (la contraprueba de la de arriba).
      const correcto = await comoLaEmpresa(tx, e.empresaId, () => repoDeZonas(tx).update(zonas.norteId, datos, e.maestroId));
      return { repo, servicio, antes, trasRechazo, despues: await foto(tx, zonas.norteId), correcto };
    });
    expect(r.repo).toEqual({ estado: "cambio_concurrente" });
    expect(r.servicio).toEqual({ status: "conflict", motivo: "cambio_concurrente" });
    expect(r.trasRechazo).toEqual(r.antes);
    expect(r.correcto.estado).toBe("ok");
    expect(r.despues.nombre).toBe("Norte NO debe guardarse");
  });
});
