import { describe, it, expect, vi } from "vitest";

import { GeografiaService } from "@/lib/services/GeografiaService";
import type {
  ArbolDePais,
  ContextoDeAltaDeNodo,
  IGeoRepository,
} from "@/lib/interfaces/repositories/IGeoRepository";
import type { Actor } from "@/lib/interfaces/services/IVehiculoService";
import type { ProvinciaArbolDTO, TipoNivelDTO } from "@/lib/types/geografia-nodo";

// FICHA 374 (R14/R17/R21/R22/R24) — la regla del servicio, con dobles.
// SLT-46 (T4.1; R12, R14–R21, R39): la misma regla por NODO. Los casos de SL-20 conservan su desenlace
// y sus mensajes; solo cambia la forma de la entrada (`{id}` / `{paisId|padreId}` en vez de `{nivel, …}`)
// y la del doble, que ahora es el contrato por nodo de `IGeoRepository`.
//
// ⚠️ LO QUE ESTE ARCHIVO NO PUEDE AFIRMAR, y por eso vive en otro sitio: nada que dependa de un
// `WHERE`. En este repo esta medido cuatro veces que una mutacion del `WHERE` pasa en verde con
// dobles. Todo eso va a `tests/integration/db/**`. Aqui se mide la puerta de rol, el orden de las
// llamadas y la comparacion por forma normalizada, que son logica pura del servicio.

// SL-32 (R24, R25): la gestion es de la plataforma. Las reglas del modulo (unicidad, padre,
// idempotencia, conteo) se miden con el `superadmin`, que es quien las ejecuta; el `maestro` solo
// conserva `listarArbol`, la lectura de Tarifas.
// SLT-46 (2026-11-09, §4.1): el renombre lleva el «antes» que mostró la pantalla. Aquí siempre el
// mismo: el doble del repositorio no lo compara, y cada caso mide lo que medía.
const NOMBRE_ANTERIOR = "Nombre de antes";

const SUPERADMIN: Actor = { usuarioId: "u-superadmin", rol: "superadmin" };
const MAESTRO: Actor = { usuarioId: "u-maestro", rol: "maestro" };
const OTROS_ROLES: Actor[] = [
  { usuarioId: "u-1", rol: "admin" },
  { usuarioId: "u-2", rol: "adminTienda" },
  { usuarioId: "u-3", rol: "adminSatelite" },
  { usuarioId: "u-4", rol: "mensajero" },
];
// Quien no gestiona: todos los roles de empresa, el `maestro` incluido.
const SIN_GESTION: Actor[] = [MAESTRO, ...OTROS_ROLES];

const ARBOL: ProvinciaArbolDTO[] = [
  {
    id: "p1",
    nombre: "Puntarenas",
    activo: true,
    cantones: [
      {
        id: "c1",
        nombre: "Buenos Aires",
        activo: false,
        distritos: [
          {
            id: "d1",
            nombre: "Cabagra",
            zonaId: null,
            zonaNombre: null,
            zonas: [],
            zonaEspecial: false,
            activo: true,
          },
        ],
      },
    ],
  },
];

// SLT-46: lo que `contextoDeAlta` devuelve es el CONTEXTO del alta (pais, profundidad, tipo de esa
// profundidad y del padre, codigo del padre y hermanos). Por defecto, un tipo SIN regla de codigo y
// sin hermanos. La regla de CR es la de SL-20 leida del tipo (`digitos_codigo` y prefijo heredado).
function tipoDe(k: number, digitosCodigo: number | null = null): TipoNivelDTO {
  return {
    id: `t${k}`,
    clave: `nivel_${k}`,
    profundidad: k,
    nombreSingular: ["Provincia", "Cantón", "Distrito", "Barrio", "Manzana"][k - 1] ?? `Nivel ${k}`,
    nombrePlural: `Niveles ${k}`,
    digitosCodigo,
    codigoHeredaPrefijo: digitosCodigo !== null && k > 1,
  };
}
const DIGITOS_CR = [1, 3, 5];
const tipoCR = (k: number) => tipoDe(k, DIGITOS_CR[k - 1]);

function contexto(o: Partial<ContextoDeAltaDeNodo> = {}): ContextoDeAltaDeNodo {
  return {
    paisId: "XA",
    profundidad: 1,
    tipo: tipoDe(1),
    tipoDelPadre: null,
    codigoPadre: null,
    hermanos: [],
    ...o,
  };
}

/** El contexto de un hijo de profundidad `k` en CR (tipo y tipo del padre con la regla de CR). */
function contextoCR(k: number, o: Partial<ContextoDeAltaDeNodo> = {}): ContextoDeAltaDeNodo {
  return contexto({
    paisId: "CR",
    profundidad: k,
    tipo: tipoCR(k),
    tipoDelPadre: k > 1 ? tipoCR(k - 1) : null,
    ...o,
  });
}

const ARBOL_PAIS: ArbolDePais = {
  tipos: [tipoDe(1), tipoDe(2)],
  raices: [{ id: "p1", nombre: "Región", codigo: null, activo: true, profundidad: 1, tipoId: "t1", hijos: [] }],
};

function repoDoble(overrides: Partial<IGeoRepository> = {}) {
  const repo = {
    listProvinciasLite: vi.fn(async () => []),
    listCantonesLite: vi.fn(async () => []),
    listDistritosLite: vi.fn(async () => []),
    listGeografiaLitePorZona: vi.fn(async () => ({
      provincias: [],
      cantones: [],
      distritos: [],
    })),
    listArbol: vi.fn(async () => ARBOL),
    // SLT-46: los contratos por nodo
    arbolDePais: vi.fn(async () => ARBOL_PAIS as ArbolDePais | null),
    contextoDeAlta: vi.fn(async () => contexto() as ContextoDeAltaDeNodo | null),
    crear: vi.fn(async () => "id-nuevo"),
    leerDivisionDePais: vi.fn(async () => null),
    importarDivision: vi.fn(),
    cambiarActivacion: vi.fn(async () => "cambiado" as const),
    hermanosDeNodo: vi.fn(async () => [] as { id: string; nombre: string }[] | null),
    renombrar: vi.fn(async () => "renombrado" as const),
    profundidadDeNodo: vi.fn(async () => 3 as number | null),
    ...overrides,
  };
  return repo as unknown as IGeoRepository & typeof repo;
}

function ordenesDoble(n = 0) {
  return { contarSinEntregarPorNodoGeografico: vi.fn(async () => n) };
}

function build(overrides: Partial<IGeoRepository> = {}, n = 0) {
  const repo = repoDoble(overrides);
  const ordenes = ordenesDoble(n);
  return { service: new GeografiaService(repo, ordenes), repo, ordenes };
}

/**
 * SLT-46 R39 — un repositorio (y un repositorio de ordenes) que LANZA en cuanto se toca cualquier
 * metodo. Con el, «forbidden» no puede salir de un doble que devuelve algo por defecto: si el
 * servicio leyera antes de mirar el rol, el test reventaria.
 */
function queFalla<T extends object>(nombre: string): T {
  return new Proxy({} as T, {
    get(_t, metodo) {
      if (metodo === "then") return undefined; // no es una promesa
      return () => {
        throw new Error(`${nombre}.${String(metodo)} no debia llamarse`);
      };
    },
  });
}

function servicioQueFalla() {
  return new GeografiaService(
    queFalla<IGeoRepository>("repo"),
    queFalla<{ contarSinEntregarPorNodoGeografico: () => Promise<number> }>("ordenes"),
  );
}

// =================================================================================================
// R24 — la puerta de rol, ANTES de tocar la base
// =================================================================================================

describe("374/R24 + SL-32 — sin rol de plataforma -> forbidden SIN llamar al repositorio", () => {
  // `listarArbol` es la excepcion: el `maestro` lo sigue leyendo (R25), asi que aqui solo entran
  // los demas roles de empresa.
  it.each(OTROS_ROLES)("listarArbol con rol $rol", async (actor) => {
    const { service, repo } = build();
    expect(await service.listarArbol(actor)).toEqual({ status: "forbidden" });
    expect(repo.listArbol).not.toHaveBeenCalled();
  });

  it.each(SIN_GESTION)("crear con rol $rol", async (actor) => {
    const { service, repo } = build();
    const r = await service.crear({ paisId: "XA", nombre: "Nueva" }, actor);
    expect(r).toEqual({ status: "forbidden" });
    expect(repo.contextoDeAlta).not.toHaveBeenCalled();
    expect(repo.crear).not.toHaveBeenCalled();
  });

  // Retirar y reactivar son la misma operacion con otro `activo`: se prueban las dos, porque el
  // `maestro` las perdio a la vez.
  it.each(SIN_GESTION.flatMap((actor) => [true, false].map((activo) => ({ ...actor, activo }))))(
    "cambiarActivacion (activo=$activo) con rol $rol",
    async ({ activo, ...actor }) => {
      const { service, repo } = build();
      const r = await service.cambiarActivacion({ id: "d1", activo }, actor);
      expect(r).toEqual({ status: "forbidden" });
      expect(repo.cambiarActivacion).not.toHaveBeenCalled();
    },
  );

  // FICHA 375 — la quinta operacion pasa por la MISMA puerta. Cinco cuerpos con la comprobacion
  // repetida serian cuatro sitios donde olvidarla; este caso es lo que lo impide.
  it.each(SIN_GESTION)("renombrar con rol $rol", async (actor) => {
    const { service, repo } = build();
    const r = await service.renombrar({ id: "d1", nombre: "Otro", nombreAnterior: NOMBRE_ANTERIOR }, actor);
    expect(r).toEqual({ status: "forbidden" });
    expect(repo.hermanosDeNodo).not.toHaveBeenCalled();
    expect(repo.renombrar).not.toHaveBeenCalled();
  });

  // SL-20 (R37): el arbol de plataforma es solo del superadmin; el `maestro` lee el de su pais
  // con `listarArbol`.
  it.each(SIN_GESTION)("SL-20 listarArbolDePais con rol $rol", async (actor) => {
    const { service, repo } = build();
    expect(await service.listarArbolDePais("CR", actor)).toEqual({ status: "forbidden" });
    expect(repo.arbolDePais).not.toHaveBeenCalled();
  });

  it.each(SIN_GESTION)("contarOrdenesSinEntregar con rol $rol", async (actor) => {
    const { service, repo, ordenes } = build();
    const r = await service.contarOrdenesSinEntregar({ id: "d1" }, actor);
    expect(r).toEqual({ status: "forbidden" });
    expect(repo.profundidadDeNodo).not.toHaveBeenCalled();
    expect(ordenes.contarSinEntregarPorNodoGeografico).not.toHaveBeenCalled();
  });

  it("SL-32 (R25): el `maestro` sigue leyendo el arbol, que es lo que usa Tarifas", async () => {
    const { service, repo } = build();
    expect(await service.listarArbol(MAESTRO)).toEqual({ status: "ok", provincias: ARBOL });
    expect(repo.listArbol).toHaveBeenCalledTimes(1);
  });

  it("CONTRAPRUEBA (SL-32, R24): el `superadmin` llega al repositorio en las seis", async () => {
    // Sin esto, los casos de arriba podrian estar verdes porque el doble nunca se llama. Los
    // dobles son a proposito: con SL-17, el registro de acciones y el conteo de ordenes no tienen
    // empresa para el superadmin (P7, D15), y ningun test afirma su exito contra la base.
    const { service, repo, ordenes } = build({}, 3);
    expect(await service.listarArbol(SUPERADMIN)).toEqual({ status: "ok", provincias: ARBOL });
    expect(await service.crear({ paisId: "XA", nombre: "Nueva" }, SUPERADMIN)).toEqual({
      status: "ok",
      id: "id-nuevo",
    });
    expect(await service.renombrar({ id: "d1", nombre: "Otro", nombreAnterior: NOMBRE_ANTERIOR }, SUPERADMIN)).toEqual({
      status: "ok",
      id: "d1",
      nombre: "Otro",
    });
    expect(await service.cambiarActivacion({ id: "d1", activo: false }, SUPERADMIN)).toEqual({
      status: "ok",
      id: "d1",
      activo: false,
    });
    expect(await service.cambiarActivacion({ id: "d1", activo: true }, SUPERADMIN)).toEqual({
      status: "ok",
      id: "d1",
      activo: true,
    });
    expect(await service.contarOrdenesSinEntregar({ id: "d1" }, SUPERADMIN)).toEqual({
      status: "ok",
      ordenes: 3,
    });
    expect(await service.listarArbolDePais("XA", SUPERADMIN)).toEqual({ status: "ok", ...ARBOL_PAIS });
    expect(repo.listArbol).toHaveBeenCalledTimes(1);
    expect(repo.arbolDePais).toHaveBeenCalledWith("XA");
    expect(repo.contextoDeAlta).toHaveBeenCalledTimes(1);
    expect(repo.crear).toHaveBeenCalledTimes(1);
    expect(repo.renombrar).toHaveBeenCalledWith("d1", "Otro", NOMBRE_ANTERIOR, "u-superadmin");
    expect(repo.cambiarActivacion).toHaveBeenCalledTimes(2);
    expect(ordenes.contarSinEntregarPorNodoGeografico).toHaveBeenCalledTimes(1);
  });
});

describe("SLT-46 R39 — `maestro` es `forbidden` en cada metodo de gestion ANTES de leer nada", () => {
  // El repositorio y el de ordenes LANZAN si se les llama: el `forbidden` tiene que salir antes
  // de la primera lectura, tambien antes de validar el nombre.
  const casos: [string, (s: GeografiaService) => Promise<{ status: string }>][] = [
    ["listarArbolDePais", (s) => s.listarArbolDePais("CR", MAESTRO)],
    ["crear (raiz)", (s) => s.crear({ paisId: "CR", nombre: "Nueva" }, MAESTRO)],
    ["crear (hijo)", (s) => s.crear({ padreId: "n3", nombre: "Barrio" }, MAESTRO)],
    ["crear con un nombre que la etiqueta no imprime", (s) => s.crear({ paisId: "CR", nombre: "🙂🙂" }, MAESTRO)],
    ["renombrar", (s) => s.renombrar({ id: "n4", nombre: "Otro", nombreAnterior: NOMBRE_ANTERIOR }, MAESTRO)],
    ["cambiarActivacion (retiro)", (s) => s.cambiarActivacion({ id: "n4", activo: false }, MAESTRO)],
    ["cambiarActivacion (reactivacion)", (s) => s.cambiarActivacion({ id: "n4", activo: true }, MAESTRO)],
    ["contarOrdenesSinEntregar", (s) => s.contarOrdenesSinEntregar({ id: "n4" }, MAESTRO)],
  ];

  it.each(casos)("%s", async (_m, llamar) => {
    expect(await llamar(servicioQueFalla())).toEqual({ status: "forbidden" });
  });

  it("CONTRAPRUEBA: con el superadmin el mismo doble SI revienta (el doble no es decorativo)", async () => {
    await expect(servicioQueFalla().crear({ paisId: "CR", nombre: "Nueva" }, SUPERADMIN)).rejects.toThrow(
      /repo\.contextoDeAlta no debia llamarse/,
    );
    await expect(servicioQueFalla().contarOrdenesSinEntregar({ id: "n4" }, SUPERADMIN)).rejects.toThrow(
      /repo\.profundidadDeNodo/,
    );
  });
});

// =================================================================================================
// R14 — el padre que no existe
// =================================================================================================

describe("374/R14 — padre inexistente -> not_found y CERO filas creadas", () => {
  it("alta de canton con un padre inexistente", async () => {
    const { service, repo } = build({ contextoDeAlta: vi.fn(async () => null) });
    const r = await service.crear({ padreId: "no-existe", nombre: "Buenos Aires" }, SUPERADMIN);
    expect(r).toEqual({ status: "not_found" });
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it("alta de distrito con un padre inexistente", async () => {
    const { service, repo } = build({ contextoDeAlta: vi.fn(async () => null) });
    const r = await service.crear({ padreId: "no-existe", nombre: "Cabagra" }, SUPERADMIN);
    expect(r).toEqual({ status: "not_found" });
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it("UNA sola consulta resuelve las DOS preguntas (padre y hermanos)", async () => {
    const { service, repo } = build();
    await service.crear({ padreId: "c1", nombre: "Cabagra" }, SUPERADMIN);
    expect(repo.contextoDeAlta).toHaveBeenCalledTimes(1);
    expect(repo.contextoDeAlta).toHaveBeenCalledWith({ padreId: "c1" });
  });
});

// =================================================================================================
// R17 — el duplicado se compara por la forma NORMALIZADA
// =================================================================================================

describe("374/R17 — `conflict` por forma normalizada, no por literal", () => {
  const HERMANOS = [{ id: "d-viejo", nombre: "San José" }];

  it.each(["san jose", "SAN JOSE", "San  José", "  san josé  ", "SaN jOsE"])(
    "«%s» choca con «San José» y NO crea fila",
    async (nombre) => {
      const { service, repo } = build({ contextoDeAlta: vi.fn(async () => contexto({ hermanos: HERMANOS })) });
      const r = await service.crear({ padreId: "c1", nombre }, SUPERADMIN);
      expect(r).toEqual({ status: "conflict" });
      expect(repo.crear).not.toHaveBeenCalled();
    },
  );

  it("un hermano INACTIVO tambien ocupa el nombre", async () => {
    // `contextoDeAlta` trae activos e inactivos a proposito: el UNIQUE de la base no distingue
    // estados, y reactivar el viejo despues chocaria con el nuevo.
    const { service, repo } = build({
      contextoDeAlta: vi.fn(async () =>
        contexto({ hermanos: [{ id: "d-retirado", nombre: "Cabagra" }] }),
      ),
    });
    const r = await service.crear({ padreId: "c1", nombre: "cabagra" }, SUPERADMIN);
    expect(r).toEqual({ status: "conflict" });
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it("CONTRAPRUEBA: un nombre que NO choca entra, con su forma de guardar", async () => {
    const { service, repo } = build({
      contextoDeAlta: vi.fn(async () => contexto({ profundidad: 3, tipo: tipoDe(3), tipoDelPadre: tipoDe(2), hermanos: HERMANOS })),
    });
    const r = await service.crear({ padreId: "c1", nombre: "Cabagra" }, SUPERADMIN);
    expect(r).toEqual({ status: "ok", id: "id-nuevo" });
    expect(repo.crear).toHaveBeenCalledWith(
      { paisId: "XA", padreId: "c1", profundidad: 3, tipoId: "t3", nombre: "Cabagra", codigo: null },
      "u-superadmin",
    );
  });

  it("el nombre que se pasa al repositorio conserva mayusculas y acentos", async () => {
    const { service, repo } = build();
    await service.crear({ paisId: "XA", nombre: "San José" }, SUPERADMIN);
    expect(repo.crear).toHaveBeenCalledWith(
      { paisId: "XA", padreId: null, profundidad: 1, tipoId: "t1", nombre: "San José", codigo: null },
      "u-superadmin",
    );
  });
});

// =================================================================================================
// R21 / R22 — idempotencia y nodo inexistente
// =================================================================================================

describe("374/R21 — pedir el estado en el que ya esta devuelve ok", () => {
  it("el repositorio dice `sin_cambio` y el servicio responde `ok` con ese mismo estado", async () => {
    const { service } = build({ cambiarActivacion: vi.fn(async () => "sin_cambio" as const) });
    expect(await service.cambiarActivacion({ id: "d1", activo: false }, SUPERADMIN)).toEqual({
      status: "ok",
      id: "d1",
      activo: false,
    });
    expect(await service.cambiarActivacion({ id: "c1", activo: true }, SUPERADMIN)).toEqual({
      status: "ok",
      id: "c1",
      activo: true,
    });
  });

  it("`activo` viaja como estado DESEADO al repositorio, junto al actor", async () => {
    const { service, repo } = build();
    await service.cambiarActivacion({ id: "p1", activo: false }, SUPERADMIN);
    expect(repo.cambiarActivacion).toHaveBeenCalledWith("p1", false, "u-superadmin");
  });
});

describe("374/R22 — nodo inexistente -> not_found", () => {
  it("el repositorio dice `no_existe` y el servicio traduce", async () => {
    const { service } = build({ cambiarActivacion: vi.fn(async () => "no_existe" as const) });
    expect(await service.cambiarActivacion({ id: "fantasma", activo: true }, SUPERADMIN)).toEqual({
      status: "not_found",
    });
  });
});

// =================================================================================================
// R26 / R60 — lo que devuelve la lectura y el conteo
// =================================================================================================

describe("374/R26 — el arbol sale entero, sin recortar", () => {
  it("`maestro` recibe el arbol tal cual lo da el repositorio", async () => {
    const { service } = build();
    const r = await service.listarArbol(MAESTRO);
    expect(r).toEqual({ status: "ok", provincias: ARBOL });
    // El distrito ACTIVO bajo un canton INACTIVO viaja: si el servicio lo escondiera, no habria
    // forma de reactivarlo (R10).
    if (r.status !== "ok") throw new Error("el maestro no recibio el arbol");
    expect(r.provincias[0].cantones[0].activo).toBe(false);
    expect(r.provincias[0].cantones[0].distritos[0].activo).toBe(true);
  });
});

describe("374/R60 — el conteo pasa el nivel y el id, y devuelve el numero", () => {
  it("devuelve lo que dice el repositorio de ordenes", async () => {
    const { service, ordenes } = build({}, 40);
    expect(await service.contarOrdenesSinEntregar({ id: "d1" }, SUPERADMIN)).toEqual({
      status: "ok",
      ordenes: 40,
    });
    expect(ordenes.contarSinEntregarPorNodoGeografico).toHaveBeenCalledWith("distrito", "d1");
  });

  it("cero es un resultado, no un fallo", async () => {
    const { service } = build({ profundidadDeNodo: vi.fn(async () => 2) }, 0);
    expect(await service.contarOrdenesSinEntregar({ id: "c1" }, SUPERADMIN)).toEqual({
      status: "ok",
      ordenes: 0,
    });
  });
});

describe("SLT-46 R20 — el conteo lee la profundidad del nodo y la traduce al nivel de las ordenes", () => {
  it.each([
    [1, "provincia"],
    [2, "canton"],
    [3, "distrito"],
  ] as const)("profundidad %i → contar por «%s» con el mismo id", async (profundidad, nivel) => {
    const { service, repo, ordenes } = build({ profundidadDeNodo: vi.fn(async () => profundidad) }, 7);
    expect(await service.contarOrdenesSinEntregar({ id: "n" }, SUPERADMIN)).toEqual({ status: "ok", ordenes: 7 });
    expect(repo.profundidadDeNodo).toHaveBeenCalledWith("n");
    expect(ordenes.contarSinEntregarPorNodoGeografico).toHaveBeenCalledWith(nivel, "n");
  });

  it.each([
    ["profundidad 4", 4],
    ["profundidad 10", 10],
    ["un nodo que no existe", null],
  ] as const)("%s → 0, SIN preguntar al repositorio de ordenes", async (_c, profundidad) => {
    const { service, ordenes } = build({ profundidadDeNodo: vi.fn(async () => profundidad) }, 99);
    expect(await service.contarOrdenesSinEntregar({ id: "n4" }, SUPERADMIN)).toEqual({ status: "ok", ordenes: 0 });
    expect(ordenes.contarSinEntregarPorNodoGeografico).not.toHaveBeenCalled();
  });
});

// =================================================================================================
// FICHA 375 — el renombrado: la regla de unicidad y el caso «guardar sin cambios»
// =================================================================================================
//
// ⚠️ LO QUE ESTE BLOQUE NO AFIRMA: que el `update` toque solo `nombre`, que el UNIQUE de la base
// rechace el homonimo literal ni que el registro vaya en la misma transaccion. Todo eso depende de
// un `WHERE` o del motor y vive en `tests/integration/db/geografia-renombrado.test.ts`. Aqui se
// mide la comparacion por forma NORMALIZADA y la exclusion del propio nodo, que son logica pura.

describe("375 — renombrar: el conflicto se decide por la clave NORMALIZADA", () => {
  const HERMANOS = [
    { id: "d1", nombre: "Cabagra" },
    { id: "d2", nombre: "Pérez Zeledón" },
  ];

  it.each([
    ["perez zeledon", "sin acentos ni mayusculas"],
    ["PÉREZ ZELEDÓN", "en mayusculas"],
    ["Pérez   Zeledón", "con espacios de sobra"],
    ["Perez Zeledon", "sin acentos"],
  ])("«%s» (%s) choca con el hermano y devuelve conflict", async (nombre) => {
    const { service, repo } = build({
      hermanosDeNodo: vi.fn(async () => HERMANOS),
    });
    expect(await service.renombrar({ id: "d1", nombre, nombreAnterior: NOMBRE_ANTERIOR }, SUPERADMIN)).toEqual({
      status: "conflict",
    });
    // Y NO se intenta escribir: el UNIQUE de la base es la ultima palabra, no la primera. Ademas
    // ese UNIQUE compara LITERALES, asi que «Perez Zeledon» le pasaria por delante.
    expect(repo.renombrar).not.toHaveBeenCalled();
  });

  it("⭑ renombrarlo a SU PROPIO nombre NO es conflicto: guardar sin cambios funciona", async () => {
    const { service, repo } = build({ hermanosDeNodo: vi.fn(async () => HERMANOS) });
    const r = await service.renombrar({ id: "d1", nombre: "Cabagra", nombreAnterior: NOMBRE_ANTERIOR }, SUPERADMIN);
    expect(r).toEqual({ status: "ok", id: "d1", nombre: "Cabagra" });
    expect(repo.renombrar).toHaveBeenCalledWith("d1", "Cabagra", NOMBRE_ANTERIOR, "u-superadmin");
  });

  it("⭑ ni una variante que se normaliza IGUAL que el suyo: «cabagra» -> `ok`", async () => {
    // Es un cambio REAL de la etiqueta (cambian las mayusculas) y no choca con nadie mas.
    const { service, repo } = build({ hermanosDeNodo: vi.fn(async () => HERMANOS) });
    const r = await service.renombrar({ id: "d1", nombre: "cabagra", nombreAnterior: NOMBRE_ANTERIOR }, SUPERADMIN);
    expect(r).toEqual({ status: "ok", id: "d1", nombre: "cabagra" });
    expect(repo.renombrar).toHaveBeenCalledWith("d1", "cabagra", NOMBRE_ANTERIOR, "u-superadmin");
  });

  it("un nombre libre entre los hermanos pasa", async () => {
    const { service, repo } = build({ hermanosDeNodo: vi.fn(async () => HERMANOS) });
    expect(await service.renombrar({ id: "d1", nombre: "Cabagrita", nombreAnterior: NOMBRE_ANTERIOR }, SUPERADMIN)).toEqual({
      status: "ok",
      id: "d1",
      nombre: "Cabagrita",
    });
    expect(repo.renombrar).toHaveBeenCalledTimes(1);
  });

  it("un hermano INACTIVO tambien produce conflicto: el nombre sigue ocupado", async () => {
    // El repositorio devuelve activos e inactivos; el servicio no distingue, y no debe: el UNIQUE
    // de la base tampoco lo hace, y reactivar el viejo despues chocaria con el nuevo.
    const { service } = build({
      hermanosDeNodo: vi.fn(async () => [
        { id: "d1", nombre: "Cabagra" },
        { id: "d9", nombre: "Boruca" }, // retirado, pero sigue en la lista
      ]),
    });
    expect(await service.renombrar({ id: "d1", nombre: "boruca", nombreAnterior: NOMBRE_ANTERIOR }, SUPERADMIN)).toEqual({
      status: "conflict",
    });
  });
});

describe("375 — renombrar: el nodo que no existe", () => {
  it("`null` del repositorio -> not_found, y NO se escribe nada", async () => {
    const { service, repo } = build({ hermanosDeNodo: vi.fn(async () => null) });
    expect(await service.renombrar({ id: "fantasma", nombre: "Otro", nombreAnterior: NOMBRE_ANTERIOR }, SUPERADMIN)).toEqual({
      status: "not_found",
    });
    expect(repo.renombrar).not.toHaveBeenCalled();
  });

  it("una carrera (existia al leer, ya no al escribir) tambien acaba en not_found", async () => {
    const { service } = build({
      hermanosDeNodo: vi.fn(async () => [{ id: "d1", nombre: "Cabagra" }]),
      renombrar: vi.fn(async () => "no_existe" as const),
    });
    expect(await service.renombrar({ id: "d1", nombre: "Cabagrita", nombreAnterior: NOMBRE_ANTERIOR }, SUPERADMIN)).toEqual({
      status: "not_found",
    });
  });

  it("`sin_cambio` del repositorio se cuenta como ok: pedir lo que ya esta es exito", async () => {
    const { service } = build({
      hermanosDeNodo: vi.fn(async () => [{ id: "d1", nombre: "Cabagra" }]),
      renombrar: vi.fn(async () => "sin_cambio" as const),
    });
    expect(await service.renombrar({ id: "d1", nombre: "Cabagra", nombreAnterior: NOMBRE_ANTERIOR }, SUPERADMIN)).toEqual({
      status: "ok",
      id: "d1",
      nombre: "Cabagra",
    });
  });
});

// =================================================================================================
// SL-20 (R15, R29) — el alta por pais
// =================================================================================================

describe("SL-20/R15, R29 — la provincia cuelga de un pais y compite solo con las de ese pais", () => {
  it("las hermanas se piden por el PAIS de la provincia, no por la tabla entera", async () => {
    const { service, repo } = build();
    await service.crear({ paisId: "XA", nombre: "Central" }, SUPERADMIN);
    expect(repo.contextoDeAlta).toHaveBeenCalledWith({ paisId: "XA" });
  });

  it("«central» choca con «Central» del MISMO pais: `conflict` sin escribir", async () => {
    const { service, repo } = build({
      contextoDeAlta: vi.fn(async () => contexto({ hermanos: [{ id: "p1", nombre: "Central" }] })),
    });
    const r = await service.crear({ paisId: "XA", nombre: "central" }, SUPERADMIN);
    expect(r).toEqual({ status: "conflict" });
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it("un pais que no existe es `not_found` y no crea nada", async () => {
    const { service, repo } = build({ contextoDeAlta: vi.fn(async () => null) });
    const r = await service.crear({ paisId: "XZ", nombre: "Central" }, SUPERADMIN);
    expect(r).toEqual({ status: "not_found" });
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it("el pais que se registra es el del CONTEXTO (el del padre), con el actor", async () => {
    const { service, repo } = build({
      contextoDeAlta: vi.fn(async () => contexto({ paisId: "XB", profundidad: 2, tipo: tipoDe(2), tipoDelPadre: tipoDe(1) })),
    });
    await service.crear({ padreId: "p1", nombre: "Comuna" }, SUPERADMIN);
    expect(repo.crear).toHaveBeenCalledWith(
      { paisId: "XB", padreId: "p1", profundidad: 2, tipoId: "t2", nombre: "Comuna", codigo: null },
      "u-superadmin",
    );
  });
});

// =================================================================================================
// SL-20 (R17) — el codigo del alta sigue la regla del pais (SLT-46: leida del tipo)
// =================================================================================================

describe("SL-20/R17 — el codigo del alta a mano", () => {
  it.each([
    { k: 1, codigo: "12", motivo: /exactamente 1 dígito/ },
    { k: 2, codigo: "2001", motivo: /exactamente 3 dígitos/ },
    { k: 2, codigo: "201", motivo: /empezar por el código de su padre/ },
  ] as const)(
    "CR: «$codigo» en la profundidad $k es `validation_error` en `codigo` y NO crea",
    async ({ k, codigo, motivo }) => {
      const { service, repo } = build({
        contextoDeAlta: vi.fn(async () => contextoCR(k, { codigoPadre: k === 2 ? "1" : null })),
      });
      const input = k === 1 ? { paisId: "CR", nombre: "Nueva", codigo } : { padreId: "p1", nombre: "Nueva", codigo };
      const r = await service.crear(input, SUPERADMIN);
      expect(r.status).toBe("validation_error");
      if (r.status !== "validation_error") throw new Error("no fue validation_error");
      expect(r.fieldErrors.codigo?.[0]).toMatch(motivo);
      expect(repo.crear).not.toHaveBeenCalled();
    },
  );

  it("CR: un hijo con codigo bajo un padre SIN codigo es `validation_error`", async () => {
    const { service, repo } = build({
      contextoDeAlta: vi.fn(async () => contextoCR(3, { codigoPadre: null })),
    });
    const r = await service.crear({ padreId: "c1", nombre: "Nuevo", codigo: "10101" }, SUPERADMIN);
    expect(r.status).toBe("validation_error");
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it("CR: un codigo con el prefijo del padre entra y llega al repositorio", async () => {
    const { service, repo } = build({
      contextoDeAlta: vi.fn(async () => contextoCR(3, { codigoPadre: "101" })),
    });
    const r = await service.crear({ padreId: "c1", nombre: "Nuevo", codigo: "10199" }, SUPERADMIN);
    expect(r).toEqual({ status: "ok", id: "id-nuevo" });
    expect(repo.crear).toHaveBeenCalledWith(
      { paisId: "CR", padreId: "c1", profundidad: 3, tipoId: "t3", nombre: "Nuevo", codigo: "10199" },
      "u-superadmin",
    );
  });

  it("un pais SIN regla acepta texto libre de 1 a 20 caracteres sin espacios", async () => {
    const { service, repo } = build();
    const ok = await service.crear({ paisId: "XA", nombre: "Nueva", codigo: "RM-13" }, SUPERADMIN);
    expect(ok.status).toBe("ok");
    expect(repo.crear).toHaveBeenCalledTimes(1);

    const mal = await service.crear({ paisId: "XA", nombre: "Otra", codigo: "con espacio" }, SUPERADMIN);
    expect(mal.status).toBe("validation_error");
    expect(repo.crear).toHaveBeenCalledTimes(1);
  });

  it("sin codigo no se valida nada: un hijo SIN codigo bajo un padre sin codigo entra en CR", async () => {
    const { service } = build({
      contextoDeAlta: vi.fn(async () => contextoCR(3, { codigoPadre: null })),
    });
    const r = await service.crear({ padreId: "c1", nombre: "Nuevo" }, SUPERADMIN);
    expect(r.status).toBe("ok");
  });

  it("el nombre repetido gana al codigo invalido: `conflict` antes que la regla", async () => {
    const { service } = build({
      contextoDeAlta: vi.fn(async () => contextoCR(1, { hermanos: [{ id: "p1", nombre: "Nueva" }] })),
    });
    const r = await service.crear({ paisId: "CR", nombre: "Nueva", codigo: "99" }, SUPERADMIN);
    expect(r).toEqual({ status: "conflict" });
  });
});

// =================================================================================================
// SLT-46 R14, R15 — el tipo del nodo es el de su profundidad; sin tipo, no hay alta
// =================================================================================================

describe("SLT-46 R14 — el alta a cualquier profundidad lleva el tipo de su profundidad", () => {
  it("un hijo de profundidad 4 se crea con el tipo `nivel_4` del contexto, bajo su padre", async () => {
    const { service, repo } = build({
      contextoDeAlta: vi.fn(async () =>
        contexto({ profundidad: 4, tipo: tipoDe(4), tipoDelPadre: tipoDe(3), codigoPadre: "C3", hermanos: [{ id: "n4", nombre: "Barrio Uno" }] }),
      ),
    });
    const r = await service.crear({ padreId: "n3", nombre: "Barrio Dos", codigo: "B2" }, SUPERADMIN);
    expect(r).toEqual({ status: "ok", id: "id-nuevo" });
    expect(repo.contextoDeAlta).toHaveBeenCalledWith({ padreId: "n3" });
    expect(repo.crear).toHaveBeenCalledWith(
      { paisId: "XA", padreId: "n3", profundidad: 4, tipoId: "t4", nombre: "Barrio Dos", codigo: "B2" },
      "u-superadmin",
    );
  });

  it("R16 en la profundidad 4: el nombre normalizado de un hermano es `conflict`", async () => {
    const { service, repo } = build({
      contextoDeAlta: vi.fn(async () =>
        contexto({ profundidad: 4, tipo: tipoDe(4), tipoDelPadre: tipoDe(3), hermanos: [{ id: "n4", nombre: "Barrio Uno" }] }),
      ),
    });
    expect(await service.crear({ padreId: "n3", nombre: "barrio uno" }, SUPERADMIN)).toEqual({ status: "conflict" });
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it("R17 en la profundidad 4: la regla es la del tipo `nivel_4` (con digitos y prefijo)", async () => {
    const conRegla: TipoNivelDTO = { ...tipoDe(4), digitosCodigo: 7, codigoHeredaPrefijo: true };
    const { service, repo } = build({
      contextoDeAlta: vi.fn(async () => contexto({ profundidad: 4, tipo: conRegla, tipoDelPadre: tipoDe(3), codigoPadre: "60305" })),
    });
    const r = await service.crear({ padreId: "n3", nombre: "Barrio", codigo: "6030501" }, SUPERADMIN);
    expect(r.status).toBe("ok");
    const mal = await service.crear({ padreId: "n3", nombre: "Otro", codigo: "7030501" }, SUPERADMIN);
    expect(mal).toEqual({
      status: "validation_error",
      fieldErrors: { codigo: ["El código debe empezar por el código de su padre («60305»)."] },
    });
    expect(repo.crear).toHaveBeenCalledTimes(1);
  });
});

describe("SLT-46 R15 — el pais no tiene tipo para la profundidad del alta", () => {
  it("bajo un nodo de la profundidad maxima: `validation_error` en `padreId` con el tipo del padre, sin crear", async () => {
    const { service, repo } = build({
      contextoDeAlta: vi.fn(async () => contextoCR(4, { tipo: null, tipoDelPadre: tipoCR(3), codigoPadre: "10101" })),
    });
    const r = await service.crear({ padreId: "d1", nombre: "Barrio" }, SUPERADMIN);
    expect(r).toEqual({
      status: "validation_error",
      fieldErrors: { padreId: ["Este país no tiene un nivel por debajo de Distrito"] },
    });
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it("va antes que el nombre y el codigo: ni un homonimo ni un codigo malo cambian el desenlace", async () => {
    const { service, repo } = build({
      contextoDeAlta: vi.fn(async () =>
        contexto({ profundidad: 3, tipo: null, tipoDelPadre: tipoDe(2), hermanos: [{ id: "x", nombre: "Barrio" }] }),
      ),
    });
    const r = await service.crear({ padreId: "c1", nombre: "barrio", codigo: "con espacio" }, SUPERADMIN);
    expect(r).toMatchObject({ status: "validation_error", fieldErrors: { padreId: [expect.stringMatching(/Cantón$/)] } });
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it("una raiz en un pais sin tipos (dato roto): `validation_error` en `paisId`, sin crear", async () => {
    const { service, repo } = build({ contextoDeAlta: vi.fn(async () => contexto({ tipo: null })) });
    const r = await service.crear({ paisId: "XA", nombre: "Región" }, SUPERADMIN);
    expect(r).toEqual({ status: "validation_error", fieldErrors: { paisId: ["Este país no tiene ningún nivel."] } });
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it("CONTRAPRUEBA: con tipo para esa profundidad el mismo alta SI se crea", async () => {
    const { service, repo } = build({
      contextoDeAlta: vi.fn(async () => contextoCR(3, { codigoPadre: "101" })),
    });
    expect((await service.crear({ padreId: "c1", nombre: "Barrio" }, SUPERADMIN)).status).toBe("ok");
    expect(repo.crear).toHaveBeenCalledTimes(1);
  });
});

describe("SLT-46 R18, R19 — renombre y estado a cualquier profundidad, por id", () => {
  it("renombrar un nodo de profundidad 4: los hermanos y la escritura van por su id", async () => {
    const { service, repo } = build({
      hermanosDeNodo: vi.fn(async () => [
        { id: "n4", nombre: "Barrio Uno" },
        { id: "n5", nombre: "Barrio Dos" },
      ]),
    });
    expect(await service.renombrar({ id: "n4", nombre: "barrio dos", nombreAnterior: NOMBRE_ANTERIOR }, SUPERADMIN)).toEqual({ status: "conflict" });
    expect(await service.renombrar({ id: "n4", nombre: "Barrio Primero", nombreAnterior: NOMBRE_ANTERIOR }, SUPERADMIN)).toEqual({
      status: "ok",
      id: "n4",
      nombre: "Barrio Primero",
    });
    expect(repo.hermanosDeNodo).toHaveBeenCalledWith("n4");
    expect(repo.renombrar).toHaveBeenCalledTimes(1);
    expect(repo.renombrar).toHaveBeenCalledWith("n4", "Barrio Primero", NOMBRE_ANTERIOR, "u-superadmin");
  });

  it("retirar un nodo de profundidad 4 va por su id y no lee nada mas", async () => {
    const { service, repo } = build();
    expect(await service.cambiarActivacion({ id: "n4", activo: false }, SUPERADMIN)).toEqual({
      status: "ok",
      id: "n4",
      activo: false,
    });
    expect(repo.cambiarActivacion).toHaveBeenCalledWith("n4", false, "u-superadmin");
    expect(repo.profundidadDeNodo).not.toHaveBeenCalled();
  });
});

describe("SLT-46 R21 — el arbol del pais a N niveles, con sus tipos", () => {
  it("devuelve los tipos y las raices que da el repositorio", async () => {
    const { service } = build();
    expect(await service.listarArbolDePais("XA", SUPERADMIN)).toEqual({
      status: "ok",
      tipos: ARBOL_PAIS.tipos,
      raices: ARBOL_PAIS.raices,
    });
  });

  it("un pais que no existe da el arbol vacio, como en SL-20", async () => {
    const { service } = build({ arbolDePais: vi.fn(async () => null) });
    expect(await service.listarArbolDePais("XZ", SUPERADMIN)).toEqual({ status: "ok", tipos: [], raices: [] });
  });
});
