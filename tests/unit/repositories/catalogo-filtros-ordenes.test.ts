import { describe, it, expect, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { GeoRepository } from "@/lib/repositories/GeoRepository";
import { UserRepository } from "@/lib/repositories/UserRepository";
import { ZonaRepository } from "@/lib/repositories/ZonaRepository";

// Feature 144/B2 (R48/R49/R50/R54) — proyecciones planas del catalogo de filtros.
//
// Prisma mockeado: se afirma el `select`/`where`/`orderBy` emitido (que es donde vive el
// contrato de "campos minimos" y "orden determinista") y la forma de la fila devuelta.
//
// SLT-44 (design §10, «cambian de entrada, no de salida»): las listas de `GeoRepository` dejan de
// leer `provincia`/`canton`/`distrito` y salen del catalogo (`nodo_geografico`) y de las
// asignaciones de la empresa. Se reescribe EL DOBLE: devuelve los nodos y las asignaciones que
// equivalen a las filas que simulaba. Las salidas esperadas no cambian. Los casos que miraban la
// consulta emitida la miran ahora sobre el modelo nuevo.

/** Un nodo del catalogo tal como lo devuelve el `select` de `CatalogoGeograficoRepository`. */
function nodo(id: string, nombre: string, profundidad: number, padreId: string | null, activo = true) {
  return {
    id,
    nombre,
    nombreNormalizado: nombre.toLowerCase(),
    profundidad,
    padreId,
    tipoId: `t${profundidad}`,
    codigoOficial: null,
    activo,
  };
}

/**
 * El cliente que lee el catalogo: los nodos de un pais, las asignaciones de zona por distrito y
 * ninguna marca. `$transaction` pasa el mismo doble como cliente de la transaccion. Las tablas
 * viejas siguen en el doble para afirmar que NO se consultan.
 */
function prismaConCatalogo(nodos: unknown[], zonas: { distritoId: string; zonaId: string }[] = []) {
  const prisma = {
    provincia: { findMany: vi.fn() },
    canton: { findMany: vi.fn() },
    distrito: { findMany: vi.fn() },
    organizacion: { findFirst: vi.fn().mockResolvedValue({ paisId: "CR" }) },
    tipoNivelGeografico: { findMany: vi.fn().mockResolvedValue([]) },
    nodoGeografico: { findMany: vi.fn().mockResolvedValue(nodos) },
    zonaDistrito: {
      findMany: vi.fn().mockResolvedValue(
        zonas.map((z) => ({ distritoId: z.distritoId, zona: { id: z.zonaId, nombre: z.zonaId, esCentral: false } })),
      ),
    },
    distritoZonaEspecial: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  return prisma;
}

/** La consulta de nodos que emite el catalogo: solo por pais (sin recorte por `activo`), por nombre. */
const CONSULTA_DE_NODOS = {
  where: { paisId: "CR" },
  select: {
    id: true,
    padreId: true,
    profundidad: true,
    tipoId: true,
    nombre: true,
    nombreNormalizado: true,
    codigoOficial: true,
    activo: true,
  },
  orderBy: [{ nombre: "asc" }, { id: "asc" }],
};

describe("GeoRepository — la geografia de UNA zona", () => {
  // Pedido humano (2026-08-19): el adminSatelite filtra por provincia/canton/distrito, pero
  // solo por los de SU zona. La asociacion se lee de la N:M `zona_distrito` (feature 24),
  // unica fuente de verdad desde que `distrito.zona_id` se elimino.
  const LIMON = nodo("p9", "Limon", 1, null);
  const POCOCI = nodo("c9", "Pococi", 2, "p9");
  const GUACIMO = nodo("c8", "Guacimo", 2, "p9");

  it("filtra por la N:M y DERIVA cantones y provincias de los distritos de la zona", async () => {
    // FICHA 374: todo activo. Lo que este archivo mide es el recorte por zona, no la retirada de
    // un nodo. Un distrito de otra zona, con su canton y su provincia, NO debe salir.
    const prisma = prismaConCatalogo(
      [
        LIMON,
        nodo("p8", "Heredia", 1, null),
        POCOCI,
        GUACIMO,
        nodo("c7", "Barva", 2, "p8"),
        nodo("d2", "Guapiles", 3, "c9"),
        nodo("d1", "Cariari", 3, "c9"),
        nodo("d3", "Rio Jimenez", 3, "c8"),
        nodo("d4", "San Pablo", 3, "c7"),
      ],
      [
        { distritoId: "d2", zonaId: "z-1" },
        { distritoId: "d1", zonaId: "z-1" },
        { distritoId: "d3", zonaId: "z-1" },
        { distritoId: "d4", zonaId: "z-2" },
      ],
    );
    const repo = new GeoRepository(prisma as unknown as PrismaClient);

    const r = await repo.listGeografiaLitePorZona("z-1");

    // La zona entra por la puente (`zona_distrito`), no por una columna del distrito, y la
    // geografia sale de UNA consulta de nodos: las tablas viejas no se consultan.
    expect(prisma.zonaDistrito.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.nodoGeografico.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.nodoGeografico.findMany).toHaveBeenCalledWith(CONSULTA_DE_NODOS);
    expect(prisma.distrito.findMany).not.toHaveBeenCalled();
    expect(prisma.canton.findMany).not.toHaveBeenCalled();
    expect(prisma.provincia.findMany).not.toHaveBeenCalled();

    expect(r.provincias).toEqual([{ id: "p9", nombre: "Limon", disponible: true }]);
    // Deduplicado (Pococi aparece en dos distritos) y en orden alfabetico.
    expect(r.cantones).toEqual([
      { id: "c8", nombre: "Guacimo", padreId: "p9", disponible: true },
      { id: "c9", nombre: "Pococi", padreId: "p9", disponible: true },
    ]);
    expect(r.distritos).toEqual([
      { id: "d1", nombre: "Cariari", padreId: "c9", disponible: true },
      { id: "d2", nombre: "Guapiles", padreId: "c9", disponible: true },
      { id: "d3", nombre: "Rio Jimenez", padreId: "c8", disponible: true },
    ]);
  });

  it("zona sin distritos asociados -> las tres listas vacias, no un error", async () => {
    const prisma = prismaConCatalogo([LIMON, POCOCI, nodo("d1", "Cariari", 3, "c9")]);
    const repo = new GeoRepository(prisma as unknown as PrismaClient);

    expect(await repo.listGeografiaLitePorZona("z-vacia")).toEqual({
      provincias: [],
      cantones: [],
      distritos: [],
    });
  });
});

describe("GeoRepository — catalogo plano (R48/R49)", () => {
  // ⚠️ FICHA 374: las tres filas ganan `disponible`. La consulta NO recorta por `activo` y eso se
  // sigue afirmando aqui: el `where` de la consulta de nodos es SOLO el pais —estas lecturas
  // PROYECTAN la disponibilidad, no recortan por ella—.
  it("R49: las provincias se piden con su flag, ordenadas por nombre asc y SIN `where`", async () => {
    const prisma = prismaConCatalogo([
      nodo("p1", "Alajuela", 1, null, true),
      nodo("p2", "San Jose", 1, null, false),
    ]);
    const repo = new GeoRepository(prisma as unknown as PrismaClient);

    const r = await repo.listProvinciasLite();

    expect(prisma.nodoGeografico.findMany).toHaveBeenCalledWith(CONSULTA_DE_NODOS);
    expect(prisma.provincia.findMany).not.toHaveBeenCalled();
    // La provincia retirada SIGUE SALIENDO, con `disponible: false`.
    expect(r).toEqual([
      { id: "p1", nombre: "Alajuela", disponible: true },
      { id: "p2", nombre: "San Jose", disponible: false },
    ]);
  });

  it("R48: cada canton trae su PADRE (provincia) como `padreId` y su disponibilidad", async () => {
    // Un canton RETIRADO bajo una provincia activa: sale igual, y NO disponible. (El canton activo
    // bajo una provincia retirada no cabe en este doble con un solo `p1`: lo cubren la cascada de
    // `geografia-dominio.test.ts` y `tests/integration/db/geografia-catalogo-activo.test.ts`.)
    const prisma = prismaConCatalogo([
      nodo("p1", "Alajuela", 1, null),
      nodo("c1", "Central", 2, "p1"),
      nodo("c2", "Escazu", 2, "p1", false),
    ]);
    const repo = new GeoRepository(prisma as unknown as PrismaClient);

    const r = await repo.listCantonesLite();

    expect(prisma.nodoGeografico.findMany).toHaveBeenCalledWith(CONSULTA_DE_NODOS);
    expect(prisma.canton.findMany).not.toHaveBeenCalled();
    expect(r).toEqual([
      { id: "c1", nombre: "Central", padreId: "p1", disponible: true },
      { id: "c2", nombre: "Escazu", padreId: "p1", disponible: false },
    ]);
  });

  it("R48: cada distrito trae su PADRE (canton) como `padreId`, sin la zona", async () => {
    const prisma = prismaConCatalogo([
      nodo("p1", "Alajuela", 1, null),
      nodo("c1", "Central", 2, "p1"),
      nodo("d1", "Carmen", 3, "c1"),
    ]);
    const repo = new GeoRepository(prisma as unknown as PrismaClient);

    const r = await repo.listDistritosLite();

    // Sin `zonas`: la zona de la ORDEN esta congelada en `orden.zona_id`.
    expect(prisma.nodoGeografico.findMany).toHaveBeenCalledWith(CONSULTA_DE_NODOS);
    expect(prisma.distrito.findMany).not.toHaveBeenCalled();
    expect(r).toEqual([{ id: "d1", nombre: "Carmen", padreId: "c1", disponible: true }]);
    expect(Object.keys(r[0]).sort()).toEqual(["disponible", "id", "nombre", "padreId"]);
  });

  it("R49: la misma entrada produce el mismo orden (determinista)", async () => {
    const prisma = prismaConCatalogo([
      nodo("p1", "Alajuela", 1, null),
      nodo("p2", "Heredia", 1, null),
      nodo("c1", "Alajuelita", 2, "p1"),
      nodo("c2", "Belen", 2, "p2"),
    ]);
    const repo = new GeoRepository(prisma as unknown as PrismaClient);
    expect(await repo.listCantonesLite()).toEqual(await repo.listCantonesLite());
  });
});

describe("ZonaRepository.listLite (R48/R49)", () => {
  it("R48/R49: `{id,nombre}` de TODAS las zonas, por nombre asc", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: "z1", nombre: "GAM" },
      { id: "z2", nombre: "Zona Norte" },
    ]);
    const repo = new ZonaRepository({ zona: { findMany } } as unknown as PrismaClient);

    const r = await repo.listLite();

    expect(findMany).toHaveBeenCalledWith({
      select: { id: true, nombre: true },
      orderBy: { nombre: "asc" },
    });
    expect(r).toEqual([
      { id: "z1", nombre: "GAM" },
      { id: "z2", nombre: "Zona Norte" },
    ]);
  });
});

describe("UserRepository.listCuentasTienda (R50/R54/R49)", () => {
  function buildRepo(rows: unknown[]) {
    const findMany = vi.fn().mockResolvedValue(rows);
    const repo = new UserRepository({ usuario: { findMany } } as unknown as PrismaClient);
    return { repo, findMany };
  }

  const FILAS = [
    { id: "t1", nombre: "Tienda Activa", estado: "activo", rol: { value: "adminTienda" } },
    { id: "t2", nombre: "Tienda Inactiva", estado: "inactivo", rol: { value: "adminTienda" } },
    { id: "k1", nombre: "Integracion X", estado: "activo", rol: { value: "apiKey" } },
    { id: "k2", nombre: "Integracion Vieja", estado: "inactivo", rol: { value: "apiKey" } },
  ];

  it("R50: consulta los DOS roles dueños posibles (`adminTienda` y `apiKey`)", async () => {
    const { repo, findMany } = buildRepo(FILAS);
    await repo.listCuentasTienda();
    expect(findMany.mock.calls[0][0].where).toEqual({
      rol: { value: { in: ["adminTienda", "apiKey"] } },
      // Ficha 351: el filtro de estado es HERMANO del de rol (AND), no una rama de un `OR`.
      estado: { notIn: ["inactivo", "bloqueado"] },
    });
  });

  /**
   * ⚠️ FICHA 351 (2026-08-29) — ESTE CASO AFIRMA LO CONTRARIO DE LO QUE AFIRMABA, Y ES A
   * PROPÓSITO. Hasta hoy decía «R50: NO filtra por `estado` — las cuentas inactivas se
   * incluyen», que era la decisión (e) de la feature 144. El humano la revirtió al ver 2 de 4
   * tiendas del desplegable dadas de baja: «eso es información que no debe mostrarse».
   *
   * La lista de estados se escribe LITERAL (`["inactivo","bloqueado"]`) y no se importa de
   * `ESTADOS_USUARIO_NO_ASIGNABLES`: comparar el `WHERE` contra su propia fuente lo dejaría
   * verde para siempre. Si la constante cambia a propósito, este literal se edita a mano y se
   * ve en el diff.
   *
   * Lo que este caso NO puede afirmar —porque el doble responde lo mismo se filtre como se
   * filtre— es que Postgres realmente descarte esas filas. Eso lo mide
   * `tests/integration/db/filtros-catalogo-sin-inactivos.test.ts` contra la base real.
   */
  it("R50 / ficha 351: FILTRA por `estado` y deja fuera a las cuentas dadas de baja", async () => {
    const { repo, findMany } = buildRepo(FILAS);
    await repo.listCuentasTienda();
    expect(findMany.mock.calls[0][0].where.estado).toEqual({
      notIn: ["inactivo", "bloqueado"],
    });
    // `pendiente` NO está en la lista: una cuenta recién creada sigue ofreciéndose, porque hoy
    // puede tener órdenes vivas. Si alguien la añade, este caso se pone rojo.
    expect(findMany.mock.calls[0][0].where.estado.notIn).not.toContain("pendiente");
  });

  it("R50/R51: expone las DOS banderas (`esApiKey`, `activa`) por cuenta", async () => {
    const { repo } = buildRepo(FILAS);
    const r = await repo.listCuentasTienda();
    expect(r).toEqual([
      { id: "t1", nombre: "Tienda Activa", esApiKey: false, activa: true },
      { id: "t2", nombre: "Tienda Inactiva", esApiKey: false, activa: false },
      { id: "k1", nombre: "Integracion X", esApiKey: true, activa: true },
      { id: "k2", nombre: "Integracion Vieja", esApiKey: true, activa: false },
    ]);
  });

  it("R54: no pide ni devuelve PII (email/telefono/cedula/hash)", async () => {
    const { repo, findMany } = buildRepo(FILAS);
    const r = await repo.listCuentasTienda();
    const select = findMany.mock.calls[0][0].select;
    expect(select).toEqual({
      id: true,
      nombre: true,
      estado: true,
      rol: { select: { value: true } },
    });
    for (const campo of ["email", "telefono", "cedula", "passwordHash"]) {
      expect(select[campo]).toBeUndefined();
      expect(Object.keys(r[0])).not.toContain(campo);
    }
    expect(Object.keys(r[0]).sort()).toEqual(["activa", "esApiKey", "id", "nombre"]);
  });

  it("R49: orden determinista por nombre asc", async () => {
    const { repo, findMany } = buildRepo(FILAS);
    await repo.listCuentasTienda();
    expect(findMany.mock.calls[0][0].orderBy).toEqual({ nombre: "asc" });
  });
});

/**
 * FICHA 351 — el mismo contrato para el catálogo de MENSAJEROS de `/ordenes`.
 *
 * Nació sin filtro de `estado` (pedido humano 2026-08-25) y lo gana aquí. Se mira el `where`
 * EMITIDO, con la lista escrita literal, y en las DOS formas de llamarlo: la variante acotada a
 * una zona es donde más fácil se cae el filtro sin que nada se ponga rojo, porque la clave de
 * zona se compone con un `spread` condicional.
 *
 * Que Postgres descarte de verdad esas filas lo mide
 * `tests/integration/db/filtros-catalogo-sin-inactivos.test.ts`: con un doble, el `WHERE` no se
 * ejecuta.
 */
describe("UserRepository.listMensajerosParaFiltro (ficha 351)", () => {
  function buildRepo() {
    const findMany = vi.fn().mockResolvedValue([]);
    const repo = new UserRepository({ usuario: { findMany } } as unknown as PrismaClient);
    return { repo, findMany };
  }

  it("sin zona: filtra por rol Y por estado, como claves hermanas (AND)", async () => {
    const { repo, findMany } = buildRepo();
    await repo.listMensajerosParaFiltro();
    expect(findMany.mock.calls[0][0].where).toEqual({
      rol: { value: "mensajero" },
      estado: { notIn: ["inactivo", "bloqueado"] },
    });
  });

  it("acotado a una zona: la zona se SUMA, no sustituye al filtro de estado", async () => {
    const { repo, findMany } = buildRepo();
    await repo.listMensajerosParaFiltro("z-1");
    expect(findMany.mock.calls[0][0].where).toEqual({
      rol: { value: "mensajero" },
      estado: { notIn: ["inactivo", "bloqueado"] },
      zonaId: "z-1",
    });
  });

  it("`pendiente` sigue ofreciéndose: no está en la lista de excluidos", async () => {
    const { repo, findMany } = buildRepo();
    await repo.listMensajerosParaFiltro();
    expect(findMany.mock.calls[0][0].where.estado.notIn).not.toContain("pendiente");
  });
});
