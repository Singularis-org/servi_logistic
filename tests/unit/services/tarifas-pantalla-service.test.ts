import { describe, expect, it, vi, type Mock } from "vitest";
import type { RolValue } from "@prisma/client";

import { cargarPantallaTarifas, cargarZonaTarifas } from "@/lib/actions/tarifas";
import type { ITarifasPantallaRepository } from "@/lib/interfaces/repositories/ITarifasPantallaRepository";
import type { Actor } from "@/lib/interfaces/services/ITarifasPantallaService";
import { TarifasPantallaService } from "@/lib/services/TarifasPantallaService";

// SLT-54 T2.3 (design §7, R55) — la matriz de roles y lo que el service decide sin base. Lo que dice
// Postgres (dos empresas, RLS, `WHERE`) esta en `tests/integration/db/tarifas-referencia.test.ts`.

const MAESTRO: Actor = { usuarioId: "u-m", rol: "maestro" };
const ADMIN: Actor = { usuarioId: "u-a", rol: "admin" };
const NO_LEEN: Actor[] = [
  { usuarioId: "u-t", rol: "adminTienda" },
  { usuarioId: "u-me", rol: "mensajero" },
  { usuarioId: "u-s", rol: "adminSatelite" },
  { usuarioId: "u-k", rol: "apiKey" },
  { usuarioId: "u-su", rol: "superadmin" },
  { usuarioId: "u-x", rol: "invitado" as RolValue },
];

type RepoDoble = { [K in keyof ITarifasPantallaRepository]: Mock };

function repoDoble(overrides: Partial<RepoDoble> = {}): RepoDoble {
  return {
    leerActivacion: vi.fn().mockResolvedValue(null),
    listarZonas: vi.fn().mockResolvedValue([]),
    buscarZona: vi.fn().mockResolvedValue({ id: "z1", nombre: "Norte", esCentral: false }),
    listarGruposDeEmpresa: vi.fn().mockResolvedValue([]),
    gruposConDistritos: vi.fn().mockResolvedValue([]),
    valoresDeZonaOGrupo: vi.fn().mockResolvedValue([]),
    valoresDeZona: vi.fn().mockResolvedValue([]),
    preciosDeTienda: vi.fn().mockResolvedValue([]),
    listarVehiculos: vi.fn().mockResolvedValue([]),
    listarTiendas: vi.fn().mockResolvedValue([]),
    distritosDeZona: vi.fn().mockResolvedValue([]),
    // SLT-89 (T5.3): el doble declara la lectura nueva del sub-arbol cubierto.
    nodosDeZona: vi.fn().mockResolvedValue(null),
    leerModeloViejo: vi.fn().mockResolvedValue({ cobros: new Map(), pagos: new Map() }),
    ...overrides,
  };
}

function servicio(repo: RepoDoble) {
  return new TarifasPantallaService(repo as unknown as ITarifasPantallaRepository);
}

describe("SLT-54 R55 — matriz de roles", () => {
  it("el maestro lee y puede escribir", async () => {
    const res = await servicio(repoDoble()).cargarPantalla(MAESTRO);
    expect(res).toMatchObject({ status: "ok", puedeEscribir: true });
  });

  it("el admin lee los mismos datos en solo lectura", async () => {
    const res = await servicio(repoDoble()).cargarPantalla(ADMIN);
    expect(res).toMatchObject({ status: "ok", puedeEscribir: false });
  });

  it.each([MAESTRO, ADMIN])("$rol abre una zona", async (actor) => {
    const res = await servicio(repoDoble()).cargarZona({ zonaId: "z1" }, actor);
    expect(res.status).toBe("ok");
  });

  it.each(NO_LEEN)("$rol recibe forbidden en la pantalla, sin leer nada", async (actor) => {
    const repo = repoDoble();
    expect(await servicio(repo).cargarPantalla(actor)).toEqual({ status: "forbidden" });
    for (const metodo of Object.values(repo)) expect(metodo).not.toHaveBeenCalled();
  });

  it.each(NO_LEEN)("$rol recibe forbidden en una zona, sin leer nada", async (actor) => {
    const repo = repoDoble();
    expect(await servicio(repo).cargarZona({ zonaId: "z1" }, actor)).toEqual({ status: "forbidden" });
    for (const metodo of Object.values(repo)) expect(metodo).not.toHaveBeenCalled();
  });

  it("sin sesión las actions responden unauthenticated sin tocar el servicio", async () => {
    const doble = { cargarPantalla: vi.fn(), cargarZona: vi.fn() };
    const deps = { getActor: async () => null, servicio: doble };
    expect(await cargarPantallaTarifas(deps)).toEqual({ status: "unauthenticated" });
    expect(await cargarZonaTarifas({ zonaId: "z1" }, deps)).toEqual({ status: "unauthenticated" });
    expect(doble.cargarPantalla).not.toHaveBeenCalled();
    expect(doble.cargarZona).not.toHaveBeenCalled();
  });
});

describe("SLT-54 — los bordes de la lectura", () => {
  it("una entrada sin zona es validation_error en zonaId, sin tocar el servicio", async () => {
    const doble = { cargarPantalla: vi.fn(), cargarZona: vi.fn() };
    const res = await cargarZonaTarifas({}, { getActor: async () => MAESTRO, servicio: doble });
    expect(res).toMatchObject({ status: "validation_error" });
    if (res.status === "validation_error") expect(Object.keys(res.fieldErrors)).toEqual(["zonaId"]);
    expect(doble.cargarZona).not.toHaveBeenCalled();
  });

  it("R57: un fallo de lectura es `error`, no una lista vacía", async () => {
    const doble = {
      cargarPantalla: vi.fn().mockRejectedValue(new Error("base caida")),
      cargarZona: vi.fn().mockRejectedValue(new Error("base caida")),
    };
    const deps = { getActor: async () => MAESTRO, servicio: doble };
    expect(await cargarPantallaTarifas(deps)).toEqual({ status: "error" });
    expect(await cargarZonaTarifas({ zonaId: "z1" }, deps)).toEqual({ status: "error" });
  });

  it("una zona que no se ve es not_found", async () => {
    const repo = repoDoble({ buscarZona: vi.fn().mockResolvedValue(null) });
    expect(await servicio(repo).cargarZona({ zonaId: "de-otra" }, MAESTRO)).toEqual({ status: "not_found" });
    expect(repo.valoresDeZona).not.toHaveBeenCalled();
  });

  it("R24: activada, la referencia es null y no se pide el modelo viejo ni la marca", async () => {
    const repo = repoDoble({ leerActivacion: vi.fn().mockResolvedValue({ activadaAt: new Date("2026-11-04") }) });
    const res = await servicio(repo).cargarZona({ zonaId: "z1", tiendaId: "t1" }, MAESTRO);
    expect(res).toMatchObject({ status: "ok", referencia: null });
    expect(repo.leerModeloViejo).not.toHaveBeenCalled();
    expect(repo.distritosDeZona).toHaveBeenCalledWith("z1", { conMarca: false });
  });

  it("sin activar pide la marca y el modelo viejo, con la tarifa de la zona y una resolución por vehículo", async () => {
    const repo = repoDoble({
      listarVehiculos: vi.fn().mockResolvedValue([{ id: "moto", nombre: "Moto", activo: false }]),
    });
    await servicio(repo).cargarZona({ zonaId: "z1" }, MAESTRO);
    expect(repo.distritosDeZona).toHaveBeenCalledWith("z1", { conMarca: true });
    expect(repo.leerModeloViejo).toHaveBeenCalledTimes(1);
    expect(repo.leerModeloViejo.mock.calls[0][0]).toEqual({
      pares: [{ tiendaId: "", zonaId: "z1" }],
      pagos: [
        { zonaId: "z1", vehiculoId: null },
        { zonaId: "z1", vehiculoId: "moto" },
      ],
    });
  });

  it("con tienda pide también su fila en la zona y en todas sus zonas", async () => {
    const repo = repoDoble();
    await servicio(repo).cargarZona({ zonaId: "z1", tiendaId: "t1" }, MAESTRO);
    expect(repo.leerModeloViejo.mock.calls[0][0].pares).toEqual([
      { tiendaId: "", zonaId: "z1" },
      { tiendaId: "t1", zonaId: "z1" },
      { tiendaId: "t1", zonaId: null },
    ]);
  });

  it("R42: cada distrito lleva el grupo en el que ya está", async () => {
    const repo = repoDoble({
      gruposConDistritos: vi.fn().mockResolvedValue([
        { id: "g1", zonaId: "z1", nombre: "Sur", distritos: [{ id: "d1", nombre: "Uno" }] },
      ]),
      distritosDeZona: vi.fn().mockResolvedValue([
        { id: "d1", nombre: "Uno", zonaEspecial: true },
        { id: "d2", nombre: "Dos", zonaEspecial: false },
      ]),
    });
    const res = await servicio(repo).cargarZona({ zonaId: "z1" }, MAESTRO);
    if (res.status !== "ok") throw new Error(res.status);
    expect(res.distritos).toEqual([
      { id: "d1", nombre: "Uno", zonaEspecial: true, grupoId: "g1" },
      { id: "d2", nombre: "Dos", zonaEspecial: false, grupoId: null },
    ]);
  });
});

describe("SLT-54 R6, R14 — los faltantes de la empresa", () => {
  const NORTE = { id: "z1", nombre: "Norte", esCentral: false };
  const COMPLETA = { id: "z2", nombre: "Sur", esCentral: false };
  const fila = (concepto: string, zonaId: string, extra: object = {}) => ({
    concepto,
    zonaId,
    grupoId: null,
    tiendaId: null,
    mensajeroId: null,
    vehiculoId: null,
    ...extra,
  });

  it("reparte los valores por zona y solo exige los vehículos activos", async () => {
    const repo = repoDoble({
      listarZonas: vi.fn().mockResolvedValue([NORTE, COMPLETA]),
      listarVehiculos: vi.fn().mockResolvedValue([
        { id: "moto", nombre: "Moto", activo: true },
        { id: "viejo", nombre: "Viejo", activo: false },
      ]),
      listarGruposDeEmpresa: vi.fn().mockResolvedValue([{ id: "g2", zonaId: "z2", nombre: "Especial" }]),
      valoresDeZonaOGrupo: vi.fn().mockResolvedValue([
        fila("tienda_flete_entregado", "z2"),
        fila("tienda_flete_rechazo", "z2"),
        fila("mensajero_entregado", "z2", { vehiculoId: "moto" }),
        fila("tienda_flete_entregado", "z1"),
      ]),
    });
    expect(await servicio(repo).faltantesPorZona()).toEqual([
      {
        zonaId: "z1",
        zonaNombre: "Norte",
        faltantes: [{ concepto: "tienda_flete_rechazo" }, { concepto: "mensajero_entregado" }],
        usaZona: [],
      },
      {
        zonaId: "z2",
        zonaNombre: "Sur",
        faltantes: [],
        usaZona: [
          { grupoId: "g2", grupoNombre: "Especial", concepto: "tienda_flete_entregado" },
          { grupoId: "g2", grupoNombre: "Especial", concepto: "tienda_flete_rechazo" },
          { grupoId: "g2", grupoNombre: "Especial", concepto: "mensajero_entregado" },
        ],
      },
    ]);
  });

  it("la pantalla da los mismos estados que los faltantes", async () => {
    const repo = repoDoble({ listarZonas: vi.fn().mockResolvedValue([NORTE]) });
    const res = await servicio(repo).cargarPantalla(MAESTRO);
    if (res.status !== "ok") throw new Error(res.status);
    expect(res.zonas).toEqual([
      {
        ...NORTE,
        grupos: [],
        estado: "sin_empezar",
        faltantes: [
          { concepto: "tienda_flete_entregado" },
          { concepto: "tienda_flete_rechazo" },
          { concepto: "mensajero_entregado" },
        ],
        usaZona: [],
      },
    ]);
  });

  it("cada zona lleva sus grupos con el conteo, para la lista", async () => {
    const repo = repoDoble({
      listarZonas: vi.fn().mockResolvedValue([NORTE, COMPLETA]),
      listarGruposDeEmpresa: vi.fn().mockResolvedValue([
        { id: "g1", zonaId: "z2", nombre: "Especial", distritos: 8 },
        { id: "g2", zonaId: "z2", nombre: "Costa", distritos: 2 },
      ]),
    });
    const r = await servicio(repo).cargarPantalla(MAESTRO);
    if (r.status !== "ok") throw new Error("lectura");
    expect(r.zonas.map((z) => [z.id, z.grupos])).toEqual([
      ["z1", []],
      [
        "z2",
        [
          { nombre: "Especial", distritos: 8 },
          { nombre: "Costa", distritos: 2 },
        ],
      ],
    ]);
    expect(repo.listarGruposDeEmpresa).toHaveBeenCalledTimes(1);
    expect(repo.gruposConDistritos).not.toHaveBeenCalled();
  });

  it("consultas fijas: no crecen con las zonas", async () => {
    const repo = repoDoble({ listarZonas: vi.fn().mockResolvedValue([NORTE, COMPLETA, { ...NORTE, id: "z3" }]) });
    await servicio(repo).faltantesPorZona();
    expect(repo.valoresDeZonaOGrupo).toHaveBeenCalledTimes(1);
    expect(repo.listarGruposDeEmpresa).toHaveBeenCalledTimes(1);
    expect(repo.listarVehiculos).toHaveBeenCalledTimes(1);
  });
});

/** SLT-89 · R23, R37 (design §4.4, §7) — el sub-arbol cubierto de una zona, para elegir miembros. */
describe("SLT-89 — cargarZona con los nodos cubiertos", () => {
  const ARBOL = {
    tipos: [{ profundidad: 2, nombreSingular: "Canton", nombrePlural: "Cantones" }],
    raices: [{ id: "c1", nombre: "Canton", profundidad: 2, activo: true, hijos: [] }],
  };

  it.each([MAESTRO, ADMIN])("$rol recibe el arbol de la zona tal cual lo da el repositorio", async (actor) => {
    const repo = repoDoble({ nodosDeZona: vi.fn().mockResolvedValue(ARBOL) });
    const res = await servicio(repo).cargarZona({ zonaId: "z1" }, actor);
    if (res.status !== "ok") throw new Error(res.status);
    expect(res.nodos).toEqual(ARBOL);
    expect(repo.nodosDeZona).toHaveBeenCalledWith("z1");
  });

  it("R37: un rol que no lee no llega a pedir el arbol", async () => {
    const repo = repoDoble({ nodosDeZona: vi.fn().mockRejectedValue(new Error("no debia leerse")) });
    for (const actor of NO_LEEN) {
      expect(await servicio(repo).cargarZona({ zonaId: "z1" }, actor)).toEqual({ status: "forbidden" });
    }
    expect(repo.nodosDeZona).not.toHaveBeenCalled();
  });

  it("R38: una zona con solo distritos (el repositorio da `null`) responde sin `nodos`, como hoy", async () => {
    const res = await servicio(repoDoble()).cargarZona({ zonaId: "z1" }, MAESTRO);
    if (res.status !== "ok") throw new Error(res.status);
    expect(res).not.toHaveProperty("nodos");
  });

  it("un distrito heredado que es miembro de un grupo sale con su grupo", async () => {
    const repo = repoDoble({
      gruposConDistritos: vi.fn().mockResolvedValue([
        { id: "g1", zonaId: "z1", nombre: "Heredados", distritos: [{ id: "dh", nombre: "Heredado" }], nodos: [] },
      ]),
      distritosDeZona: vi.fn().mockResolvedValue([{ id: "dh", nombre: "Heredado", zonaEspecial: false }]),
    });
    const res = await servicio(repo).cargarZona({ zonaId: "z1" }, MAESTRO);
    if (res.status !== "ok") throw new Error(res.status);
    expect(res.distritos).toEqual([{ id: "dh", nombre: "Heredado", zonaEspecial: false, grupoId: "g1" }]);
  });
});
