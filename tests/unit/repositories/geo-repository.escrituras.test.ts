import { describe, it, expect, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { GeoRepository } from "@/lib/repositories/GeoRepository";
import type { PlanDivisionPorProfundidad } from "@/lib/types/division-csv";

// FICHA 374 / 375 / SL-20 — las escrituras del repositorio, con un doble.
// SLT-46 (design §4.4, §7; R1, R14, R16, R18, R19, R33, R35, R36) — todas sobre `nodo_geografico`,
// a cualquier profundidad, con el historial de plataforma de entidad `nodo_geografico` en la MISMA
// transaccion. El doble NO declara `provincia`, `canton` ni `distrito`: si el repositorio los
// tocara, reventaria (R1).
//
// ⚠️ LO QUE ESTE ARCHIVO PUEDE AFIRMAR Y LO QUE NO. Con dobles se mide el ORDEN de las llamadas y
// CUANTAS son: que el corte por «ya estaba asi» ocurre ANTES de cualquier escritura, que el `update`
// toca UNA fila y SOLO su campo, y que nada borra. Lo que depende de un `WHERE`, de la copia a la
// geografia vieja o de la atomicidad real vive contra Postgres (`tests/integration/db/`, T5).

interface Llamada {
  nombre: string;
  arg: unknown;
}

interface NodoFila {
  id: string;
  paisId: string;
  padreId: string | null;
  profundidad: number;
  nombre: string;
  activo: boolean;
  codigoOficial: string | null;
}

interface TipoFila {
  id: string;
  clave: string;
  nombreSingular: string;
  nombrePlural: string;
  digitosCodigo: number | null;
  codigoHeredaPrefijo: boolean;
}

function tipo(k: number, o: Partial<TipoFila> = {}): TipoFila {
  return {
    id: `t${k}`,
    clave: `nivel_${k}`,
    nombreSingular: `Nivel ${k}`,
    nombrePlural: `Niveles ${k}`,
    digitosCodigo: null,
    codigoHeredaPrefijo: false,
    ...o,
  };
}

const TIPOS_4 = [tipo(1), tipo(2), tipo(3), tipo(4)];

// Un pais de 4 niveles: Puntarenas > Buenos Aires > Cabagra > Barrio Uno.
const ARBOL: NodoFila[] = [
  { id: "n1", paisId: "XA", padreId: null, profundidad: 1, nombre: "Puntarenas", activo: true, codigoOficial: "6" },
  { id: "n1b", paisId: "XA", padreId: null, profundidad: 1, nombre: "Limón", activo: false, codigoOficial: null },
  { id: "n2", paisId: "XA", padreId: "n1", profundidad: 2, nombre: "Buenos Aires", activo: true, codigoOficial: "603" },
  { id: "n3", paisId: "XA", padreId: "n2", profundidad: 3, nombre: "Cabagra", activo: true, codigoOficial: null },
  { id: "n3b", paisId: "XA", padreId: "n2", profundidad: 3, nombre: "Potrero Grande", activo: false, codigoOficial: null },
  { id: "n4", paisId: "XA", padreId: "n3", profundidad: 4, nombre: "Barrio Uno", activo: true, codigoOficial: null },
];

interface Escenario {
  nodos?: NodoFila[];
  tipos?: TipoFila[];
  /** `null`: el pais no existe. */
  pais?: { id: string; nombre: string } | null;
}

/**
 * Doble del cliente Prisma que APUNTA cada llamada en un log ordenado, sobre un arbol en memoria.
 * Devuelve las filas enteras (con `hijos`, `padre` y `pais` resueltos): el repositorio solo lee lo
 * que selecciona. `$transaction` ejecuta el callback con el MISMO objeto.
 */
function prismaDoble(e: Escenario = {}) {
  const nodos = e.nodos ?? ARBOL;
  const tipos = e.tipos ?? TIPOS_4;
  const pais = e.pais === undefined ? { id: "XA", nombre: "País XA" } : e.pais;
  const log: Llamada[] = [];
  const porId = (a: NodoFila, b: NodoFila) => a.id.localeCompare(b.id);
  const hijosDe = (id: string | null) =>
    nodos.filter((n) => n.padreId === id && (id !== null || n.paisId === pais?.id)).sort(porId);
  const enriquecido = (n: NodoFila) => {
    const padre = nodos.find((p) => p.id === n.padreId) ?? null;
    return {
      ...n,
      hijos: hijosDe(n.id).map(({ id, nombre }) => ({ id, nombre })),
      padre: padre === null ? null : { hijos: hijosDe(padre.id).map(({ id, nombre }) => ({ id, nombre })) },
      pais: { tiposDeNivel: tipos },
    };
  };
  const apunta =
    <A,>(nombre: string, resultado: (arg: A) => unknown) =>
    (arg: A) => {
      log.push({ nombre, arg });
      return Promise.resolve(resultado(arg));
    };

  type ArgId = { where: { id: string } };
  type ArgMany = { where: { paisId?: string; padreId?: string | null } };

  const cliente = {
    nodoGeografico: {
      findUnique: vi.fn(
        apunta<ArgId>("nodoGeografico.findUnique", (a) => {
          const n = nodos.find((x) => x.id === a.where.id);
          return n === undefined ? null : enriquecido(n);
        }),
      ),
      findMany: vi.fn(
        apunta<ArgMany>("nodoGeografico.findMany", (a) =>
          nodos
            .filter((n) => a.where.paisId === undefined || n.paisId === a.where.paisId)
            .filter((n) => !("padreId" in a.where) || n.padreId === a.where.padreId)
            .sort(porId),
        ),
      ),
      create: vi.fn(apunta("nodoGeografico.create", () => ({ id: "n-nuevo" }))),
      createMany: vi.fn(apunta<{ data: unknown[] }>("nodoGeografico.createMany", (a) => ({ count: a.data.length }))),
      update: vi.fn(apunta("nodoGeografico.update", () => ({}))),
      updateMany: vi.fn(apunta("nodoGeografico.updateMany", () => ({ count: 1 }))),
    },
    pais: {
      findUnique: vi.fn(
        apunta("pais.findUnique", () =>
          pais === null
            ? null
            : {
                ...pais,
                tiposDeNivel: tipos,
                nodosGeograficos: hijosDe(null).map(({ id, nombre }) => ({ id, nombre })),
              },
        ),
      ),
    },
    usuario: {
      findUnique: vi.fn(
        apunta("usuario.findUnique", () => ({
          nombre: "Super",
          primerApellido: "Admin",
          rol: { value: "superadmin" },
        })),
      ),
    },
    historialPlataforma: {
      createMany: vi.fn(apunta("historialPlataforma.createMany", () => ({ count: 1 }))),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => {
      log.push({ nombre: "$transaction", arg: undefined });
      return fn(cliente);
    }),
  };
  return { cliente, log };
}

function repoCon(e: Escenario = {}) {
  const { cliente, log } = prismaDoble(e);
  return { repo: new GeoRepository(cliente as unknown as PrismaClient), cliente, log };
}

type Doble = ReturnType<typeof prismaDoble>["cliente"];

function filaDeHistorial(cliente: Doble): Record<string, unknown> {
  const llamadas = cliente.historialPlataforma.createMany.mock.calls as unknown as [{ data: Record<string, unknown>[] }][];
  expect(llamadas).toHaveLength(1);
  const { data } = llamadas[0][0];
  expect(data).toHaveLength(1);
  return data[0];
}

const nombres = (log: Llamada[]) => log.map((l) => l.nombre);

// =================================================================================================
// R19 — retirar y reactivar un nodo de cualquier profundidad
// =================================================================================================

describe("SLT-46 R19 — `cambiarActivacion` sobre el nodo", () => {
  it("un nodo que no existe es `no_existe` y no escribe nada", async () => {
    const { repo, log } = repoCon();
    expect(await repo.cambiarActivacion("fantasma", false, "u-1")).toBe("no_existe");
    expect(nombres(log)).toEqual(["$transaction", "nodoGeografico.findUnique"]);
  });

  it("pedir el estado que ya tiene es `sin_cambio`: ni update, ni actor, ni historial", async () => {
    const { repo, cliente, log } = repoCon();
    expect(await repo.cambiarActivacion("n4", true, "u-1")).toBe("sin_cambio");
    expect(await repo.cambiarActivacion("n3b", false, "u-1")).toBe("sin_cambio");
    expect(nombres(log)).toEqual([
      "$transaction",
      "nodoGeografico.findUnique",
      "$transaction",
      "nodoGeografico.findUnique",
    ]);
    expect(cliente.nodoGeografico.update).not.toHaveBeenCalled();
    expect(cliente.usuario.findUnique).not.toHaveBeenCalled();
    expect(cliente.historialPlataforma.createMany).not.toHaveBeenCalled();
  });

  it("el cambio de un nodo de profundidad 4: leer -> update -> cadena -> actor -> historial, en UNA tx", async () => {
    const { repo, log } = repoCon();
    expect(await repo.cambiarActivacion("n4", false, "u-1")).toBe("cambiado");
    expect(nombres(log)).toEqual([
      "$transaction",
      "nodoGeografico.findUnique",
      "nodoGeografico.update",
      // La cadena de la etiqueta: padre, abuelo y bisabuelo (a lo sumo P lecturas).
      "nodoGeografico.findUnique",
      "nodoGeografico.findUnique",
      "nodoGeografico.findUnique",
      "usuario.findUnique",
      "historialPlataforma.createMany",
    ]);
  });

  it("el `update` toca UNA fila del nodo por su id y escribe SOLO `activo` (sin descendientes)", async () => {
    const { repo, cliente } = repoCon();
    await repo.cambiarActivacion("n2", false, "u-1");
    expect(cliente.nodoGeografico.update).toHaveBeenCalledTimes(1);
    expect(cliente.nodoGeografico.update).toHaveBeenCalledWith({ where: { id: "n2" }, data: { activo: false } });
    expect(cliente.nodoGeografico.updateMany).not.toHaveBeenCalled();
  });

  it("R35: retirar escribe `nodo_geografico_desactivado`, reactivar `_activado`, con entidad `nodo_geografico`", async () => {
    const off = repoCon();
    await off.repo.cambiarActivacion("n4", false, "u-1");
    const on = repoCon();
    await on.repo.cambiarActivacion("n3b", true, "u-1");

    expect(filaDeHistorial(off.cliente)).toMatchObject({
      accion: "nodo_geografico_desactivado",
      entidadTipo: "nodo_geografico",
      entidadId: "n4",
      entidadEtiqueta: "Barrio Uno · Cabagra · Buenos Aires · Puntarenas",
      paisId: "XA",
      valorAnterior: null,
      valorNuevo: null,
      actorUsuarioId: "u-1",
      actorNombre: "Super Admin",
    });
    expect(filaDeHistorial(on.cliente)).toMatchObject({
      accion: "nodo_geografico_activado",
      entidadTipo: "nodo_geografico",
      entidadEtiqueta: "Potrero Grande · Buenos Aires · Puntarenas",
    });
  });

  it("R35: la entidad es `nodo_geografico` tambien en profundidad 1 (P5), con su nombre como etiqueta", async () => {
    const { repo, cliente } = repoCon();
    await repo.cambiarActivacion("n1", false, "u-1");
    const fila = filaDeHistorial(cliente);
    expect(fila.entidadTipo).toBe("nodo_geografico");
    expect(fila.entidadEtiqueta).toBe("Puntarenas");
    expect(fila).not.toHaveProperty("actorRol");
  });
});

// =================================================================================================
// R18 — renombrar un nodo de cualquier profundidad
// =================================================================================================

describe("SLT-46 R18 — `renombrar` sobre el nodo", () => {
  it("`no_existe` y `sin_cambio` cortan antes de cualquier escritura", async () => {
    const { repo, cliente } = repoCon();
    expect(await repo.renombrar("fantasma", "Otro", "u-1")).toBe("no_existe");
    expect(await repo.renombrar("n4", "Barrio Uno", "u-1")).toBe("sin_cambio");
    expect(cliente.nodoGeografico.update).not.toHaveBeenCalled();
    expect(cliente.historialPlataforma.createMany).not.toHaveBeenCalled();
  });

  it("escribe SOLO `nombre` (nunca el codigo) y registra el anterior y el nuevo con la cadena nueva (R35)", async () => {
    const { repo, cliente } = repoCon();
    expect(await repo.renombrar("n4", "Barrio Dos", "u-1")).toBe("renombrado");
    expect(cliente.nodoGeografico.update).toHaveBeenCalledTimes(1);
    expect(cliente.nodoGeografico.update).toHaveBeenCalledWith({ where: { id: "n4" }, data: { nombre: "Barrio Dos" } });
    expect(filaDeHistorial(cliente)).toMatchObject({
      accion: "nodo_geografico_renombrado",
      entidadTipo: "nodo_geografico",
      entidadId: "n4",
      entidadEtiqueta: "Barrio Dos · Cabagra · Buenos Aires · Puntarenas",
      paisId: "XA",
      valorAnterior: "Barrio Uno",
      valorNuevo: "Barrio Dos",
    });
  });
});

// =================================================================================================
// R14, R16 — el alta
// =================================================================================================

describe("SLT-46 R14/R16 — `crear` escribe el nodo con el tipo decidido y lo registra", () => {
  const ALTA_4 = { paisId: "XA", padreId: "n3", profundidad: 4, tipoId: "t4", nombre: "Barrio Tres", codigo: "B3" };

  it("un hijo de profundidad 4: lee el padre, crea el nodo y registra, en UNA tx", async () => {
    const { repo, cliente, log } = repoCon();
    expect(await repo.crear(ALTA_4, "u-1")).toBe("n-nuevo");
    expect(cliente.nodoGeografico.create).toHaveBeenCalledWith({
      data: {
        paisId: "XA",
        tipoId: "t4",
        padreId: "n3",
        profundidad: 4,
        nombre: "Barrio Tres",
        nombreNormalizado: "Barrio Tres",
        codigoOficial: "B3",
      },
      select: { id: true },
    });
    expect(nombres(log)).toEqual([
      "$transaction",
      "nodoGeografico.findUnique",
      "nodoGeografico.findUnique",
      "nodoGeografico.findUnique",
      "nodoGeografico.create",
      "usuario.findUnique",
      "historialPlataforma.createMany",
    ]);
    expect(filaDeHistorial(cliente)).toMatchObject({
      accion: "nodo_geografico_creado",
      entidadTipo: "nodo_geografico",
      entidadId: "n-nuevo",
      entidadEtiqueta: "Barrio Tres · Cabagra · Buenos Aires · Puntarenas",
      paisId: "XA",
    });
  });

  it("una raiz: sin padre, profundidad 1, etiqueta = su nombre", async () => {
    const { repo, cliente } = repoCon();
    await repo.crear({ paisId: "XA", padreId: null, profundidad: 1, tipoId: "t1", nombre: "Guanacaste", codigo: null }, "u-1");
    expect(cliente.nodoGeografico.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ padreId: null, profundidad: 1, codigoOficial: null }) }),
    );
    expect(filaDeHistorial(cliente).entidadEtiqueta).toBe("Guanacaste");
  });

  it.each([
    ["el padre no existe", { ...ALTA_4, padreId: "fantasma" }, /no existe/],
    ["el padre es de otro pais", { ...ALTA_4, paisId: "XB" }, /es de XA, no de XB/],
    ["la profundidad no es la del padre + 1", { ...ALTA_4, profundidad: 3 }, /profundidad 3/],
    ["una raiz con profundidad distinta de 1", { ...ALTA_4, padreId: null }, /raiz/],
  ])("%s: LANZA sin crear ni registrar", async (_caso, datos, motivo) => {
    const { repo, cliente } = repoCon();
    await expect(repo.crear(datos, "u-1")).rejects.toThrow(motivo);
    expect(cliente.nodoGeografico.create).not.toHaveBeenCalled();
    expect(cliente.historialPlataforma.createMany).not.toHaveBeenCalled();
  });
});

// =================================================================================================
// Lecturas del alta y del renombre (R15, R16, R18, R20)
// =================================================================================================

describe("SLT-46 — `contextoDeAlta`, `hermanosDeNodo` y `profundidadDeNodo`", () => {
  it("raiz: el pais, profundidad 1, el tipo `nivel_1` y las raices (activas e inactivas) por su nombre crudo", async () => {
    const { repo } = repoCon();
    expect(await repo.contextoDeAlta({ paisId: "XA" })).toEqual({
      paisId: "XA",
      profundidad: 1,
      tipo: { ...tipo(1), profundidad: 1 },
      tipoDelPadre: null,
      codigoPadre: null,
      hermanos: [
        { id: "n1", nombre: "Puntarenas" },
        { id: "n1b", nombre: "Limón" },
      ],
    });
  });

  it("hijo: el pais del padre, profundidad + 1, su codigo y sus hijos", async () => {
    const { repo } = repoCon();
    expect(await repo.contextoDeAlta({ padreId: "n2" })).toEqual({
      paisId: "XA",
      profundidad: 3,
      tipo: { ...tipo(3), profundidad: 3 },
      tipoDelPadre: { ...tipo(2), profundidad: 2 },
      codigoPadre: "603",
      hermanos: [
        { id: "n3", nombre: "Cabagra" },
        { id: "n3b", nombre: "Potrero Grande" },
      ],
    });
  });

  it("R15: sin tipo para la profundidad siguiente, `tipo: null`", async () => {
    const { repo } = repoCon({ tipos: TIPOS_4.slice(0, 3) });
    expect((await repo.contextoDeAlta({ padreId: "n3" }))?.tipo).toBeNull();
  });

  it("R16: un pais o un padre que no existen dan `null`", async () => {
    expect(await repoCon({ pais: null }).repo.contextoDeAlta({ paisId: "XZ" })).toBeNull();
    expect(await repoCon().repo.contextoDeAlta({ padreId: "fantasma" })).toBeNull();
  });

  it("R18: los hermanos de un nodo lo incluyen; los de una raiz son las raices de su pais", async () => {
    const { repo } = repoCon();
    expect(await repo.hermanosDeNodo("n3")).toEqual([
      { id: "n3", nombre: "Cabagra" },
      { id: "n3b", nombre: "Potrero Grande" },
    ]);
    expect((await repo.hermanosDeNodo("n1"))?.map((h) => h.id)).toEqual(["n1", "n1b"]);
    expect(await repo.hermanosDeNodo("fantasma")).toBeNull();
  });

  it("R20: la profundidad del nodo, o `null`", async () => {
    const { repo } = repoCon();
    expect(await repo.profundidadDeNodo("n4")).toBe(4);
    expect(await repo.profundidadDeNodo("fantasma")).toBeNull();
  });
});

// =================================================================================================
// R33, R36 — la carga CSV
// =================================================================================================

describe("SLT-46 R33/R36 — `leerDivisionDePais` e `importarDivision` sobre el nodo", () => {
  it("lee los tipos en orden de profundidad y los nodos con la suya, ordenados por id", async () => {
    const { repo, cliente } = repoCon({ tipos: [tipo(2), tipo(1)] });
    const division = await repo.leerDivisionDePais("XA");
    expect(division?.tipos.map((t) => [t.clave, t.profundidad])).toEqual([
      ["nivel_1", 1],
      ["nivel_2", 2],
    ]);
    expect(division?.nodos.find((n) => n.id === "n4")).toEqual({
      id: "n4",
      nombre: "Barrio Uno",
      codigo: null,
      activo: true,
      padreId: "n3",
      profundidad: 4,
    });
    expect(cliente.nodoGeografico.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { paisId: "XA" }, orderBy: { id: "asc" } }),
    );
    expect(await repoCon({ pais: null }).repo.leerDivisionDePais("XZ")).toBeNull();
  });

  const PLAN: PlanDivisionPorProfundidad = {
    altas: {
      1: [],
      2: [],
      3: [{ clave: "nivel_3-1", nombre: "Nuevo", codigo: null, padre: { tipo: "existente", id: "n2" } }],
      4: [{ clave: "nivel_4-2", nombre: "Barrio Nuevo", codigo: "BN", padre: { tipo: "nuevo", clave: "nivel_3-1" } }],
    },
    codigosACompletar: [{ profundidad: 3, id: "n3", codigo: "60301" }],
    resumen: { creados: { 1: 0, 2: 0, 3: 1, 4: 1 }, existentes: 2, codigosCompletados: 1 },
  };

  it("un `createMany` por profundidad, de arriba abajo, con el tipo de cada una y el padre ya creado", async () => {
    const { repo, cliente } = repoCon();
    const resumen = await repo.importarDivision("XA", PLAN, "u-1");
    expect(resumen).toEqual({ creados: { 1: 0, 2: 0, 3: 1, 4: 1 }, existentes: 2, codigosCompletados: 1 });

    const llamadas = cliente.nodoGeografico.createMany.mock.calls as unknown as [{ data: Record<string, unknown>[] }][];
    expect(llamadas).toHaveLength(2);
    const [[{ data: d3 }], [{ data: d4 }]] = llamadas;
    expect(d3).toEqual([
      expect.objectContaining({ paisId: "XA", tipoId: "t3", padreId: "n2", profundidad: 3, nombre: "Nuevo", codigoOficial: null }),
    ]);
    expect(d4).toEqual([
      expect.objectContaining({ tipoId: "t4", padreId: d3[0].id, profundidad: 4, nombre: "Barrio Nuevo", codigoOficial: "BN" }),
    ]);
    expect(cliente.nodoGeografico.updateMany).toHaveBeenCalledWith({
      where: { id: "n3", codigoOficial: null },
      data: { codigoOficial: "60301" },
    });
  });

  it("R36: escribe UNA fila `division_cargada` con `creados` por profundidad", async () => {
    const { repo, cliente } = repoCon();
    await repo.importarDivision("XA", PLAN, "u-1");
    expect(filaDeHistorial(cliente)).toMatchObject({
      accion: "division_cargada",
      entidadTipo: "pais",
      entidadId: "XA",
      entidadEtiqueta: "País XA",
      detalle: { creados: { 1: 0, 2: 0, 3: 1, 4: 1 }, existentes: 2, codigosCompletados: 1 },
    });
  });

  it("R36: una carga que no escribe nada no deja historial", async () => {
    const { repo, cliente } = repoCon();
    const vacio: PlanDivisionPorProfundidad = {
      altas: { 1: [], 2: [], 3: [], 4: [] },
      codigosACompletar: [],
      resumen: { creados: { 1: 0, 2: 0, 3: 0, 4: 0 }, existentes: 5, codigosCompletados: 0 },
    };
    await repo.importarDivision("XA", vacio, "u-1");
    expect(cliente.nodoGeografico.createMany).not.toHaveBeenCalled();
    expect(cliente.historialPlataforma.createMany).not.toHaveBeenCalled();
  });

  it("una profundidad sin tipo en el pais LANZA sin registrar (la tx se deshace)", async () => {
    const { repo, cliente } = repoCon({ tipos: TIPOS_4.slice(0, 3) });
    await expect(repo.importarDivision("XA", PLAN, "u-1")).rejects.toThrow(/no tiene tipo nivel_4/);
    expect(cliente.historialPlataforma.createMany).not.toHaveBeenCalled();
  });
});

// =================================================================================================
// R1 — ninguna escritura toca la geografia vieja
// =================================================================================================
//
// SLT-46 (T4): las formas por nivel de SL-20 (`crear(nivel, …)`, `cambiarActivacion(nivel, …)`,
// `renombrar(nivel, …)`, `findHermanos`, `findHermanosDeNodo`, el plan por nivel de
// `importarDivision`) se retiraron del repositorio. Sus casos se quitaron de aqui; lo que afirmaban
// lo afirman los bloques de arriba sobre el nodo. «Un id de otra profundidad que la del nivel es
// «no existe»» no tiene equivalente: el nivel ya no viaja con el id.

describe("SLT-46 R1 — el doble no declara la geografia vieja", () => {
  it("el doble no declara provincia, canton ni distrito: ninguna escritura de arriba los toco", () => {
    const { cliente } = prismaDoble();
    for (const tabla of ["provincia", "canton", "distrito"]) {
      expect((cliente as Record<string, unknown>)[tabla], `el doble no declara ${tabla}`).toBeUndefined();
    }
  });
});

// =================================================================================================
// Lo que la version de SL-20 de este archivo afirmaba y la adaptacion de T3.1 dejo sin cubrir:
// los mismos hechos, sobre el nodo. La entidad del historial pasa a `nodo_geografico` (R35, P5) y la
// escritura al nodo (R1); lo demas no cambia.
// =================================================================================================

describe("SLT-46 R12 — lo que SL-20 afirmaba de las formas por nivel, sobre el nodo", () => {
  it("374/R54: la fila del cambio de estado no lleva `monto` ni `actorRol`", async () => {
    const { repo, cliente } = repoCon();
    await repo.cambiarActivacion("n3", false, "u-1");
    const fila = filaDeHistorial(cliente);
    expect(fila).not.toHaveProperty("monto");
    expect(fila).not.toHaveProperty("actorRol");
  });

  it("374: la etiqueta de un nodo de profundidad 2 es su cadena de dos", async () => {
    const { repo, cliente } = repoCon();
    await repo.cambiarActivacion("n2", false, "u-1");
    expect(filaDeHistorial(cliente).entidadEtiqueta).toBe("Buenos Aires · Puntarenas");
  });

  it("374/A8: los hermanos se leen sin `where` sobre el nombre (la normalizacion es del service)", async () => {
    const { repo, cliente } = repoCon();
    await repo.contextoDeAlta({ paisId: "XA" });
    await repo.contextoDeAlta({ padreId: "n2" });
    const [[argPais]] = cliente.pais.findUnique.mock.calls as unknown as [
      { select: { nodosGeograficos: unknown } },
    ][];
    expect(argPais.select.nodosGeograficos).toEqual({
      where: { padreId: null },
      select: { id: true, nombre: true },
      orderBy: { id: "asc" },
    });
    const [[argPadre]] = cliente.nodoGeografico.findUnique.mock.calls as unknown as [{ select: { hijos: unknown } }][];
    expect(argPadre.select.hijos).toEqual({ select: { id: true, nombre: true }, orderBy: { id: "asc" } });
  });
});

// =================================================================================================
// R42 — sin borrado fisico, en la clase
// =================================================================================================

describe("SLT-46 R42 — ninguna escritura del repositorio borra en fisico", () => {
  it("el doble del nodo no declara `delete` ni `deleteMany`, y las escrituras de arriba no los necesitaron", async () => {
    const { repo, cliente } = repoCon();
    await repo.crear({ paisId: "XA", padreId: "n3", profundidad: 4, tipoId: "t4", nombre: "Otro Barrio", codigo: null }, "u-1");
    await repo.cambiarActivacion("n4", false, "u-1");
    await repo.renombrar("n4", "Otro", "u-1");
    const delegado = cliente.nodoGeografico as unknown as Record<string, unknown>;
    expect(delegado.delete).toBeUndefined();
    expect(delegado.deleteMany).toBeUndefined();
  });

  it("la clase no expone ningun metodo cuyo nombre hable de borrar", () => {
    const metodos = Object.getOwnPropertyNames(GeoRepository.prototype);
    expect(metodos.filter((m) => /delete|borrar|eliminar|remove/i.test(m))).toEqual([]);
    // Anti-vacuidad: la clase SI tiene metodos.
    expect(metodos.length).toBeGreaterThan(5);
  });
});
