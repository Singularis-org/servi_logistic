import { describe, it, expect, vi } from "vitest";

import { GeografiaService } from "@/lib/services/GeografiaService";
import type {
  ContextoDeAlta,
  IGeoRepository,
} from "@/lib/interfaces/repositories/IGeoRepository";
import type { Actor } from "@/lib/interfaces/services/IVehiculoService";
import type { ProvinciaArbolDTO, ProvinciaPlataformaDTO } from "@/lib/types/geografia-nodo";

// FICHA 374 (R14/R17/R21/R22/R24) — la regla del servicio, con dobles.
//
// ⚠️ LO QUE ESTE ARCHIVO NO PUEDE AFIRMAR, y por eso vive en otro sitio: nada que dependa de un
// `WHERE`. En este repo esta medido cuatro veces que una mutacion del `WHERE` pasa en verde con
// dobles. Todo eso va a `tests/integration/db/**`. Aqui se mide la puerta de rol, el orden de las
// llamadas y la comparacion por forma normalizada, que son logica pura del servicio.

// SL-32 (R24, R25): la gestion es de la plataforma. Las reglas del modulo (unicidad, padre,
// idempotencia, conteo) se miden con el `superadmin`, que es quien las ejecuta; el `maestro` solo
// conserva `listarArbol`, la lectura de Tarifas.
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

// SL-20: lo que `findHermanos` devuelve ahora es el CONTEXTO del alta (pais, regla, codigo del
// padre y hermanos). Por defecto, un pais SIN regla de codigo y sin hermanos.
const SIN_REGLA = { digitosCodigoNivel1: null, digitosCodigoNivel2: null, digitosCodigoNivel3: null };
const REGLA_CR = { digitosCodigoNivel1: 1, digitosCodigoNivel2: 3, digitosCodigoNivel3: 5 };

function contexto(o: Partial<ContextoDeAlta> = {}): ContextoDeAlta {
  return { paisId: "XA", regla: SIN_REGLA, codigoPadre: null, hermanos: [], ...o };
}

const ARBOL_PAIS: ProvinciaPlataformaDTO[] = [
  { id: "p1", nombre: "Región", codigo: null, activo: true, cantones: [] },
];

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
    findHermanos: vi.fn(async () => contexto() as ContextoDeAlta | null),
    crear: vi.fn(async () => "id-nuevo"),
    // SL-20
    listArbolDePais: vi.fn(async () => ARBOL_PAIS),
    leerDivisionDePais: vi.fn(async () => null),
    importarDivision: vi.fn(),
    cambiarActivacion: vi.fn(async () => "cambiado" as const),
    // FICHA 375
    findHermanosDeNodo: vi.fn(async () => [] as { id: string; nombre: string }[] | null),
    renombrar: vi.fn(async () => "renombrado" as const),
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
    const r = await service.crear({ nivel: "provincia", nombre: "Nueva", paisId: "XA" }, actor);
    expect(r).toEqual({ status: "forbidden" });
    expect(repo.findHermanos).not.toHaveBeenCalled();
    expect(repo.crear).not.toHaveBeenCalled();
  });

  // Retirar y reactivar son la misma operacion con otro `activo`: se prueban las dos, porque el
  // `maestro` las perdio a la vez.
  it.each(SIN_GESTION.flatMap((actor) => [true, false].map((activo) => ({ ...actor, activo }))))(
    "cambiarActivacion (activo=$activo) con rol $rol",
    async ({ activo, ...actor }) => {
      const { service, repo } = build();
      const r = await service.cambiarActivacion({ nivel: "distrito", id: "d1", activo }, actor);
      expect(r).toEqual({ status: "forbidden" });
      expect(repo.cambiarActivacion).not.toHaveBeenCalled();
    },
  );

  // FICHA 375 — la quinta operacion pasa por la MISMA puerta. Cinco cuerpos con la comprobacion
  // repetida serian cuatro sitios donde olvidarla; este caso es lo que lo impide.
  it.each(SIN_GESTION)("renombrar con rol $rol", async (actor) => {
    const { service, repo } = build();
    const r = await service.renombrar({ nivel: "distrito", id: "d1", nombre: "Otro" }, actor);
    expect(r).toEqual({ status: "forbidden" });
    expect(repo.findHermanosDeNodo).not.toHaveBeenCalled();
    expect(repo.renombrar).not.toHaveBeenCalled();
  });

  // SL-20 (R37): el arbol de plataforma es solo del superadmin; el `maestro` lee el de su pais
  // con `listarArbol`.
  it.each(SIN_GESTION)("SL-20 listarArbolDePais con rol $rol", async (actor) => {
    const { service, repo } = build();
    expect(await service.listarArbolDePais("CR", actor)).toEqual({ status: "forbidden" });
    expect(repo.listArbolDePais).not.toHaveBeenCalled();
  });

  it.each(SIN_GESTION)("contarOrdenesSinEntregar con rol $rol", async (actor) => {
    const { service, ordenes } = build();
    const r = await service.contarOrdenesSinEntregar({ nivel: "distrito", id: "d1" }, actor);
    expect(r).toEqual({ status: "forbidden" });
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
    expect(await service.crear({ nivel: "provincia", nombre: "Nueva", paisId: "XA" }, SUPERADMIN)).toEqual({
      status: "ok",
      id: "id-nuevo",
      nivel: "provincia",
    });
    expect(
      await service.renombrar({ nivel: "distrito", id: "d1", nombre: "Otro" }, SUPERADMIN),
    ).toEqual({ status: "ok", nivel: "distrito", id: "d1", nombre: "Otro" });
    expect(
      await service.cambiarActivacion({ nivel: "distrito", id: "d1", activo: false }, SUPERADMIN),
    ).toEqual({ status: "ok", nivel: "distrito", id: "d1", activo: false });
    expect(
      await service.cambiarActivacion({ nivel: "distrito", id: "d1", activo: true }, SUPERADMIN),
    ).toEqual({ status: "ok", nivel: "distrito", id: "d1", activo: true });
    expect(
      await service.contarOrdenesSinEntregar({ nivel: "distrito", id: "d1" }, SUPERADMIN),
    ).toEqual({ status: "ok", ordenes: 3 });
    expect(await service.listarArbolDePais("XA", SUPERADMIN)).toEqual({
      status: "ok",
      provincias: ARBOL_PAIS,
    });
    expect(repo.listArbol).toHaveBeenCalledTimes(1);
    expect(repo.listArbolDePais).toHaveBeenCalledWith("XA");
    expect(repo.findHermanos).toHaveBeenCalledTimes(1);
    expect(repo.crear).toHaveBeenCalledTimes(1);
    expect(repo.renombrar).toHaveBeenCalledWith("distrito", "d1", "Otro", "u-superadmin");
    expect(repo.cambiarActivacion).toHaveBeenCalledTimes(2);
    expect(ordenes.contarSinEntregarPorNodoGeografico).toHaveBeenCalledTimes(1);
  });
});

// =================================================================================================
// R14 — el padre que no existe
// =================================================================================================

describe("374/R14 — padre inexistente -> not_found y CERO filas creadas", () => {
  it("alta de canton con `provinciaId` inexistente", async () => {
    const { service, repo } = build({ findHermanos: vi.fn(async () => null) });
    const r = await service.crear(
      { nivel: "canton", nombre: "Buenos Aires", provinciaId: "no-existe" },
      SUPERADMIN,
    );
    expect(r).toEqual({ status: "not_found" });
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it("alta de distrito con `cantonId` inexistente", async () => {
    const { service, repo } = build({ findHermanos: vi.fn(async () => null) });
    const r = await service.crear(
      { nivel: "distrito", nombre: "Cabagra", cantonId: "no-existe" },
      SUPERADMIN,
    );
    expect(r).toEqual({ status: "not_found" });
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it("UNA sola consulta resuelve las DOS preguntas (padre y hermanos)", async () => {
    const { service, repo } = build();
    await service.crear({ nivel: "distrito", nombre: "Cabagra", cantonId: "c1" }, SUPERADMIN);
    expect(repo.findHermanos).toHaveBeenCalledTimes(1);
    expect(repo.findHermanos).toHaveBeenCalledWith("distrito", "c1");
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
      const { service, repo } = build({ findHermanos: vi.fn(async () => contexto({ hermanos: HERMANOS })) });
      const r = await service.crear({ nivel: "distrito", nombre, cantonId: "c1" }, SUPERADMIN);
      expect(r).toEqual({ status: "conflict" });
      expect(repo.crear).not.toHaveBeenCalled();
    },
  );

  it("un hermano INACTIVO tambien ocupa el nombre", async () => {
    // `findHermanos` trae activos e inactivos a proposito: el UNIQUE de la base no distingue
    // estados, y reactivar el viejo despues chocaria con el nuevo.
    const { service, repo } = build({
      findHermanos: vi.fn(async () =>
        contexto({ hermanos: [{ id: "d-retirado", nombre: "Cabagra" }] }),
      ),
    });
    const r = await service.crear({ nivel: "distrito", nombre: "cabagra", cantonId: "c1" }, SUPERADMIN);
    expect(r).toEqual({ status: "conflict" });
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it("CONTRAPRUEBA: un nombre que NO choca entra, con su forma de guardar", async () => {
    const { service, repo } = build({ findHermanos: vi.fn(async () => contexto({ hermanos: HERMANOS })) });
    const r = await service.crear(
      { nivel: "distrito", nombre: "Cabagra", cantonId: "c1" },
      SUPERADMIN,
    );
    expect(r).toEqual({ status: "ok", id: "id-nuevo", nivel: "distrito" });
    expect(repo.crear).toHaveBeenCalledWith(
      "distrito",
      "Cabagra",
      "c1",
      { paisId: "XA", codigo: null },
      "u-superadmin",
    );
  });

  it("el nombre que se pasa al repositorio conserva mayusculas y acentos", async () => {
    const { service, repo } = build();
    await service.crear({ nivel: "provincia", nombre: "San José", paisId: "XA" }, SUPERADMIN);
    expect(repo.crear).toHaveBeenCalledWith(
      "provincia",
      "San José",
      null,
      { paisId: "XA", codigo: null },
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
    expect(
      await service.cambiarActivacion({ nivel: "distrito", id: "d1", activo: false }, SUPERADMIN),
    ).toEqual({ status: "ok", nivel: "distrito", id: "d1", activo: false });
    expect(
      await service.cambiarActivacion({ nivel: "canton", id: "c1", activo: true }, SUPERADMIN),
    ).toEqual({ status: "ok", nivel: "canton", id: "c1", activo: true });
  });

  it("`activo` viaja como estado DESEADO al repositorio, junto al actor", async () => {
    const { service, repo } = build();
    await service.cambiarActivacion({ nivel: "provincia", id: "p1", activo: false }, SUPERADMIN);
    expect(repo.cambiarActivacion).toHaveBeenCalledWith("provincia", "p1", false, "u-superadmin");
  });
});

describe("374/R22 — nodo inexistente -> not_found", () => {
  it("el repositorio dice `no_existe` y el servicio traduce", async () => {
    const { service } = build({ cambiarActivacion: vi.fn(async () => "no_existe" as const) });
    expect(
      await service.cambiarActivacion({ nivel: "distrito", id: "fantasma", activo: true }, SUPERADMIN),
    ).toEqual({ status: "not_found" });
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
    expect(await service.contarOrdenesSinEntregar({ nivel: "distrito", id: "d1" }, SUPERADMIN)).toEqual(
      { status: "ok", ordenes: 40 },
    );
    expect(ordenes.contarSinEntregarPorNodoGeografico).toHaveBeenCalledWith("distrito", "d1");
  });

  it("cero es un resultado, no un fallo", async () => {
    const { service } = build({}, 0);
    expect(await service.contarOrdenesSinEntregar({ nivel: "canton", id: "c1" }, SUPERADMIN)).toEqual({
      status: "ok",
      ordenes: 0,
    });
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
      findHermanosDeNodo: vi.fn(async () => HERMANOS),
    });
    expect(await service.renombrar({ nivel: "distrito", id: "d1", nombre }, SUPERADMIN)).toEqual({
      status: "conflict",
    });
    // Y NO se intenta escribir: el UNIQUE de la base es la ultima palabra, no la primera. Ademas
    // ese UNIQUE compara LITERALES, asi que «Perez Zeledon» le pasaria por delante.
    expect(repo.renombrar).not.toHaveBeenCalled();
  });

  it("⭑ renombrarlo a SU PROPIO nombre NO es conflicto: guardar sin cambios funciona", async () => {
    const { service, repo } = build({ findHermanosDeNodo: vi.fn(async () => HERMANOS) });
    const r = await service.renombrar({ nivel: "distrito", id: "d1", nombre: "Cabagra" }, SUPERADMIN);
    expect(r).toEqual({ status: "ok", nivel: "distrito", id: "d1", nombre: "Cabagra" });
    expect(repo.renombrar).toHaveBeenCalledWith("distrito", "d1", "Cabagra", "u-superadmin");
  });

  it("⭑ ni una variante que se normaliza IGUAL que el suyo: «cabagra» -> `ok`", async () => {
    // Es un cambio REAL de la etiqueta (cambian las mayusculas) y no choca con nadie mas.
    const { service, repo } = build({ findHermanosDeNodo: vi.fn(async () => HERMANOS) });
    const r = await service.renombrar({ nivel: "distrito", id: "d1", nombre: "cabagra" }, SUPERADMIN);
    expect(r).toEqual({ status: "ok", nivel: "distrito", id: "d1", nombre: "cabagra" });
    expect(repo.renombrar).toHaveBeenCalledWith("distrito", "d1", "cabagra", "u-superadmin");
  });

  it("un nombre libre entre los hermanos pasa", async () => {
    const { service, repo } = build({ findHermanosDeNodo: vi.fn(async () => HERMANOS) });
    expect(
      await service.renombrar({ nivel: "distrito", id: "d1", nombre: "Cabagrita" }, SUPERADMIN),
    ).toEqual({ status: "ok", nivel: "distrito", id: "d1", nombre: "Cabagrita" });
    expect(repo.renombrar).toHaveBeenCalledTimes(1);
  });

  it("un hermano INACTIVO tambien produce conflicto: el nombre sigue ocupado", async () => {
    // El repositorio devuelve activos e inactivos; el servicio no distingue, y no debe: el UNIQUE
    // de la base tampoco lo hace, y reactivar el viejo despues chocaria con el nuevo.
    const { service } = build({
      findHermanosDeNodo: vi.fn(async () => [
        { id: "d1", nombre: "Cabagra" },
        { id: "d9", nombre: "Boruca" }, // retirado, pero sigue en la lista
      ]),
    });
    expect(
      await service.renombrar({ nivel: "distrito", id: "d1", nombre: "boruca" }, SUPERADMIN),
    ).toEqual({ status: "conflict" });
  });
});

describe("375 — renombrar: el nodo que no existe", () => {
  it("`null` del repositorio -> not_found, y NO se escribe nada", async () => {
    const { service, repo } = build({ findHermanosDeNodo: vi.fn(async () => null) });
    expect(
      await service.renombrar({ nivel: "distrito", id: "fantasma", nombre: "Otro" }, SUPERADMIN),
    ).toEqual({ status: "not_found" });
    expect(repo.renombrar).not.toHaveBeenCalled();
  });

  it("una carrera (existia al leer, ya no al escribir) tambien acaba en not_found", async () => {
    const { service } = build({
      findHermanosDeNodo: vi.fn(async () => [{ id: "d1", nombre: "Cabagra" }]),
      renombrar: vi.fn(async () => "no_existe" as const),
    });
    expect(
      await service.renombrar({ nivel: "distrito", id: "d1", nombre: "Cabagrita" }, SUPERADMIN),
    ).toEqual({ status: "not_found" });
  });

  it("`sin_cambio` del repositorio se cuenta como ok: pedir lo que ya esta es exito", async () => {
    const { service } = build({
      findHermanosDeNodo: vi.fn(async () => [{ id: "d1", nombre: "Cabagra" }]),
      renombrar: vi.fn(async () => "sin_cambio" as const),
    });
    expect(
      await service.renombrar({ nivel: "distrito", id: "d1", nombre: "Cabagra" }, SUPERADMIN),
    ).toEqual({ status: "ok", nivel: "distrito", id: "d1", nombre: "Cabagra" });
  });
});

// =================================================================================================
// SL-20 (R15, R29) — el alta por pais
// =================================================================================================

describe("SL-20/R15, R29 — la provincia cuelga de un pais y compite solo con las de ese pais", () => {
  it("las hermanas se piden por el PAIS de la provincia, no por la tabla entera", async () => {
    const { service, repo } = build();
    await service.crear({ nivel: "provincia", nombre: "Central", paisId: "XA" }, SUPERADMIN);
    expect(repo.findHermanos).toHaveBeenCalledWith("provincia", "XA");
  });

  it("«central» choca con «Central» del MISMO pais: `conflict` sin escribir", async () => {
    const { service, repo } = build({
      findHermanos: vi.fn(async () => contexto({ hermanos: [{ id: "p1", nombre: "Central" }] })),
    });
    const r = await service.crear({ nivel: "provincia", nombre: "central", paisId: "XA" }, SUPERADMIN);
    expect(r).toEqual({ status: "conflict" });
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it("un pais que no existe es `not_found` y no crea nada", async () => {
    const { service, repo } = build({ findHermanos: vi.fn(async () => null) });
    const r = await service.crear({ nivel: "provincia", nombre: "Central", paisId: "XZ" }, SUPERADMIN);
    expect(r).toEqual({ status: "not_found" });
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it("el pais que se registra es el del CONTEXTO (el del padre), con el actor", async () => {
    const { service, repo } = build({
      findHermanos: vi.fn(async () => contexto({ paisId: "XB" })),
    });
    await service.crear({ nivel: "canton", nombre: "Comuna", provinciaId: "p1" }, SUPERADMIN);
    expect(repo.crear).toHaveBeenCalledWith(
      "canton",
      "Comuna",
      "p1",
      { paisId: "XB", codigo: null },
      "u-superadmin",
    );
  });
});

// =================================================================================================
// SL-20 (R17) — el codigo del alta sigue la regla del pais
// =================================================================================================

describe("SL-20/R17 — el codigo del alta a mano", () => {
  it.each([
    { nivel: "provincia", codigo: "12", motivo: /exactamente 1 dígito/ },
    { nivel: "canton", codigo: "2001", motivo: /exactamente 3 dígitos/ },
    { nivel: "canton", codigo: "201", motivo: /empezar por el código de su padre/ },
  ] as const)(
    "CR: «$codigo» en $nivel es `validation_error` en `codigo` y NO crea",
    async ({ nivel, codigo, motivo }) => {
      const { service, repo } = build({
        findHermanos: vi.fn(async () =>
          contexto({ paisId: "CR", regla: REGLA_CR, codigoPadre: nivel === "canton" ? "1" : null }),
        ),
      });
      const input =
        nivel === "provincia"
          ? { nivel, nombre: "Nueva", paisId: "CR", codigo }
          : { nivel, nombre: "Nueva", provinciaId: "p1", codigo };
      const r = await service.crear(input, SUPERADMIN);
      expect(r.status).toBe("validation_error");
      if (r.status !== "validation_error") throw new Error("no fue validation_error");
      expect(r.fieldErrors.codigo?.[0]).toMatch(motivo);
      expect(repo.crear).not.toHaveBeenCalled();
    },
  );

  it("CR: un hijo con codigo bajo un padre SIN codigo es `validation_error`", async () => {
    const { service, repo } = build({
      findHermanos: vi.fn(async () => contexto({ paisId: "CR", regla: REGLA_CR, codigoPadre: null })),
    });
    const r = await service.crear(
      { nivel: "distrito", nombre: "Nuevo", cantonId: "c1", codigo: "10101" },
      SUPERADMIN,
    );
    expect(r.status).toBe("validation_error");
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it("CR: un codigo con el prefijo del padre entra y llega al repositorio", async () => {
    const { service, repo } = build({
      findHermanos: vi.fn(async () => contexto({ paisId: "CR", regla: REGLA_CR, codigoPadre: "101" })),
    });
    const r = await service.crear(
      { nivel: "distrito", nombre: "Nuevo", cantonId: "c1", codigo: "10199" },
      SUPERADMIN,
    );
    expect(r).toEqual({ status: "ok", id: "id-nuevo", nivel: "distrito" });
    expect(repo.crear).toHaveBeenCalledWith(
      "distrito",
      "Nuevo",
      "c1",
      { paisId: "CR", codigo: "10199" },
      "u-superadmin",
    );
  });

  it("un pais SIN regla acepta texto libre de 1 a 20 caracteres sin espacios", async () => {
    const { service, repo } = build();
    const ok = await service.crear(
      { nivel: "provincia", nombre: "Nueva", paisId: "XA", codigo: "RM-13" },
      SUPERADMIN,
    );
    expect(ok.status).toBe("ok");
    expect(repo.crear).toHaveBeenCalledTimes(1);

    const mal = await service.crear(
      { nivel: "provincia", nombre: "Otra", paisId: "XA", codigo: "con espacio" },
      SUPERADMIN,
    );
    expect(mal.status).toBe("validation_error");
    expect(repo.crear).toHaveBeenCalledTimes(1);
  });

  it("sin codigo no se valida nada: un hijo SIN codigo bajo un padre sin codigo entra en CR", async () => {
    const { service } = build({
      findHermanos: vi.fn(async () => contexto({ paisId: "CR", regla: REGLA_CR, codigoPadre: null })),
    });
    const r = await service.crear({ nivel: "distrito", nombre: "Nuevo", cantonId: "c1" }, SUPERADMIN);
    expect(r.status).toBe("ok");
  });

  it("el nombre repetido gana al codigo invalido: `conflict` antes que la regla", async () => {
    const { service } = build({
      findHermanos: vi.fn(async () =>
        contexto({ regla: REGLA_CR, hermanos: [{ id: "p1", nombre: "Nueva" }] }),
      ),
    });
    const r = await service.crear(
      { nivel: "provincia", nombre: "Nueva", paisId: "CR", codigo: "99" },
      SUPERADMIN,
    );
    expect(r).toEqual({ status: "conflict" });
  });
});
