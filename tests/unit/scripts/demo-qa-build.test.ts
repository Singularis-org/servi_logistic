import { readFileSync } from "node:fs";
import path from "node:path";

import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import {
  ejecutarDemo,
  TOPE_MS,
  type EfectosDemo,
  type EntornoDemoQa,
  type PasosDemo,
} from "@/scripts/demo-qa";
import type { CandadoDemo, OpcionesCandado } from "@/scripts/demo-qa/candado";
import { decidirDemo, type DecisionDemo } from "@/scripts/demo-qa/decision-build";
import type { ComprobacionEmpresaDemo, ResumenEmpresaDemo } from "@/scripts/demo-qa/receta";

// SL-43 (design §10.1 y §9.1; R29, R30, R31, R33) — cuándo corre el paso de demo del build. Una fila de
// la tabla de D10.1 por caso. Debajo, la orquestación de `ejecutarDemo` con dobles (omitida sin
// conectar, fallo → salir(1), tope → salir(1)) y el orden de `build` en `package.json`.

function motivo(d: DecisionDemo): string {
  if (d.correr) throw new Error("se esperaba la demo omitida y corre");
  return d.motivo;
}

describe("decidirDemo — tabla de D10.1", () => {
  it("production, aunque los dos flags estén puestos → omitida, y avisa de DEMO_ON_PREVIEW", () => {
    const d = decidirDemo({ VERCEL_ENV: "production", MIGRATE_ON_PREVIEW: "true", DEMO_ON_PREVIEW: "true" });
    expect(motivo(d)).toMatch(/producción nunca recrea la demo/);
    expect(motivo(d)).toMatch(/DEMO_ON_PREVIEW está puesta en producción/);
  });

  it("production sin DEMO_ON_PREVIEW → omitida, sin aviso", () => {
    const d = decidirDemo({ VERCEL_ENV: "production" });
    expect(motivo(d)).toMatch(/producción nunca recrea la demo/);
    expect(motivo(d)).not.toMatch(/DEMO_ON_PREVIEW/);
  });

  it("preview con MIGRATE_ON_PREVIEW=true y DEMO_ON_PREVIEW=true → corre (R29)", () => {
    expect(decidirDemo({ VERCEL_ENV: "preview", MIGRATE_ON_PREVIEW: "true", DEMO_ON_PREVIEW: "true" })).toEqual({
      correr: true,
    });
  });

  it.each([undefined, "", "TRUE", "1", "si", " true "])(
    "preview con migraciones y DEMO_ON_PREVIEW=%j → omitida: «preview sin DEMO_ON_PREVIEW=true»",
    (valor) => {
      const d = decidirDemo({ VERCEL_ENV: "preview", MIGRATE_ON_PREVIEW: "true", DEMO_ON_PREVIEW: valor });
      expect(motivo(d)).toBe("preview sin DEMO_ON_PREVIEW=true");
    },
  );

  it.each([undefined, "", "TRUE", "false"])(
    "preview sin migraciones (MIGRATE_ON_PREVIEW=%j), aunque DEMO_ON_PREVIEW=true → omitida (R30)",
    (valor) => {
      const d = decidirDemo({ VERCEL_ENV: "preview", MIGRATE_ON_PREVIEW: valor, DEMO_ON_PREVIEW: "true" });
      expect(motivo(d)).toMatch(/sin migraciones en este preview/);
    },
  );

  it.each([undefined, ""])("VERCEL_ENV=%j (build local) → omitida: usa pnpm demo:qa", (valor) => {
    const d = decidirDemo({ VERCEL_ENV: valor, MIGRATE_ON_PREVIEW: "true", DEMO_ON_PREVIEW: "true" });
    expect(motivo(d)).toMatch(/build local.*pnpm demo:qa/);
  });

  it("otro entorno (development) → omitida, nombrándolo", () => {
    const d = decidirDemo({ VERCEL_ENV: "development", MIGRATE_ON_PREVIEW: "true", DEMO_ON_PREVIEW: "true" });
    expect(motivo(d)).toMatch(/entorno 'development'/);
  });
});

// ─── La orquestación de `ejecutarDemo` con dobles (design §9.1) ─────────────────────────────────

const CONTRASENA_DEMO = "Demo-QA-2026!";
const SECRETO_BD = "S3cretoDeLaBase";

/** Un entorno de QA que pasa la decisión y la guardia: todo local. */
const ENTORNO_QA: EntornoDemoQa = {
  VERCEL_ENV: "preview",
  MIGRATE_ON_PREVIEW: "true",
  DEMO_ON_PREVIEW: "true",
  DATABASE_URL: `postgresql://postgres:${SECRETO_BD}@localhost:5432/servi_logistic`,
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_SERVICE_ROLE_KEY: "clave-de-servicio-secreta",
  DEMO_QA_CONTRASENA: CONTRASENA_DEMO,
};

function comprobacionLimpia(): ComprobacionEmpresaDemo {
  return {
    ordenesPorEstado: { en_bodega_central: 2, entregado: 3 },
    estadosFaltantes: [],
    estadosFaltantesPorDecision: [],
    noAsignables: 0,
    jobsAbiertos: {},
    tablasConFilas: {},
    limpia: true,
  };
}

function resumenDe(clave: "A" | "B", extra: Partial<ResumenEmpresaDemo> = {}): ResumenEmpresaDemo {
  const slug = `demo-qa-${clave.toLowerCase()}`;
  return {
    clave,
    slug,
    organizacionId: `org-${clave}`,
    recortada: false,
    usuarios: [
      { perfil: "maestro", correo: `${slug}-maestro@example.test` },
      { perfil: "mensajero-central", correo: `${slug}-mensajero-central@example.test` },
    ],
    jobsCerrados: { completados: { geocodificacion: 43 }, sinEjecutar: { optimizacion_ruta: 27 } },
    tiposNoEsperados: [],
    comprobacion: comprobacionLimpia(),
    duracionMs: 6000,
    ...extra,
  };
}

function pasosDobles(sobre: Partial<PasosDemo> = {}): PasosDemo {
  return {
    comprobarMarca: vi.fn(async () => ({ ok: true }) as const),
    comprobarSlugs: vi.fn(async () => undefined),
    borrar: vi.fn(async () => ({
      empresas: ["vieja-a", "vieja-b"],
      storage: { rutas: 4, temporales: 1 },
      base: { filas: 900, pasadas: 3, usuarios: 26, organizaciones: 2 },
    })),
    crearEmpresa: vi.fn(async (_d: PrismaClient, clave: "A" | "B") => resumenDe(clave)),
    comprobarEmpresa: vi.fn(async () => comprobacionLimpia()),
    empresasDemo: vi.fn(async () => ["org-A", "org-B"]),
    novedadInternaConCorteDeManana: true,
    ...sobre,
  };
}

/** Todos los efectos con dobles: nada toca una base, Storage, la consola ni el proceso. */
function dobles(opciones: { argumentos?: string[]; env?: EntornoDemoQa; pasos?: PasosDemo; topeVence?: boolean } = {}) {
  const lineas: string[] = [];
  const errores: string[] = [];
  const cerrar = vi.fn(async () => undefined);
  const conectar = vi.fn(async () => ({ dueno: {} as PrismaClient, lector: {} as PrismaClient, cerrar }));
  const candado = {
    tomar: vi.fn<CandadoDemo["tomar"]>(async () => true),
    soltar: vi.fn(async () => undefined),
  };
  const salir = vi.fn();
  const cargarPasos = vi.fn(async () => opciones.pasos ?? pasosDobles());
  const efectos: Partial<EfectosDemo> = {
    argumentos: opciones.argumentos ?? ["--build"],
    env: opciones.env ?? ENTORNO_QA,
    conectar,
    cargarPasos,
    candado,
    salida: { log: (l) => lineas.push(l), error: (l) => errores.push(l) },
    salir,
    ahora: () => 0,
    esperar: async () => undefined,
    // Sin `topeVence`, el tope no vence nunca: la promesa no se resuelve.
    armarTope: () => ({
      vencido: opciones.topeVence ? Promise.resolve() : new Promise<void>(() => {}),
      desarmar: () => {},
    }),
    topeMs: TOPE_MS,
  };
  return { efectos, lineas, errores, conectar, cerrar, candado, salir, cargarPasos };
}

describe("ejecutarDemo --build — omitida sin conectar (R30)", () => {
  it.each<[string, EntornoDemoQa, RegExp]>([
    ["build local (sin VERCEL_ENV)", { ...ENTORNO_QA, VERCEL_ENV: undefined }, /build local/],
    ["producción", { ...ENTORNO_QA, VERCEL_ENV: "production" }, /producción nunca recrea la demo/],
    ["preview sin MIGRATE_ON_PREVIEW", { ...ENTORNO_QA, MIGRATE_ON_PREVIEW: undefined }, /sin migraciones en este preview/],
    ["preview sin DEMO_ON_PREVIEW", { ...ENTORNO_QA, DEMO_ON_PREVIEW: undefined }, /preview sin DEMO_ON_PREVIEW=true/],
    ["otro entorno", { ...ENTORNO_QA, VERCEL_ENV: "development" }, /entorno 'development'/],
  ])("%s → una línea OMITIDA, salida 0 y el doble de conexión sin llamar", async (_n, env, motivo) => {
    const d = dobles({ env });
    const r = await ejecutarDemo(d.efectos);
    expect(r).toEqual({ codigo: 0, topeVencido: false });
    expect(d.salir).toHaveBeenCalledWith(0);
    expect(d.conectar).not.toHaveBeenCalled();
    expect(d.cargarPasos).not.toHaveBeenCalled();
    expect(d.lineas).toHaveLength(1);
    expect(d.lineas[0]).toMatch(/^\[demo-qa\] OMITIDA — /);
    expect(d.lineas[0]).toMatch(motivo);
    expect(d.errores).toEqual([]);
  });

  it("omitida aunque las URLs no sirvan: la decisión va antes que la guardia y que conectar", async () => {
    const d = dobles({ env: { DATABASE_URL: "postgresql://x:y@127.0.0.1:1/x" } });
    expect((await ejecutarDemo(d.efectos)).codigo).toBe(0);
    expect(d.conectar).not.toHaveBeenCalled();
  });
});

describe("ejecutarDemo --build — corre (R29) y su fallo tumba el build (R31)", () => {
  it("con las tres condiciones: conecta, toma el candado, crea A y B y sale con 0", async () => {
    const pasos = pasosDobles();
    const d = dobles({ pasos });
    const r = await ejecutarDemo(d.efectos);
    expect(r).toEqual({ codigo: 0, topeVencido: false });
    expect(d.salir).toHaveBeenCalledWith(0);
    expect(d.salir).not.toHaveBeenCalledWith(1);
    expect(d.conectar).toHaveBeenCalledTimes(1);
    expect(d.candado.tomar).toHaveBeenCalledTimes(1);
    expect(vi.mocked(pasos.crearEmpresa).mock.calls.map((c) => c[1])).toEqual(["A", "B"]);
    expect(vi.mocked(pasos.crearEmpresa).mock.calls[0][2]).toBe(CONTRASENA_DEMO);
    // Orden de D1.1: candado → marca → slugs → borrado → recetas → comprobación final.
    const orden = [
      d.candado.tomar,
      pasos.comprobarMarca,
      pasos.comprobarSlugs,
      pasos.borrar,
      pasos.crearEmpresa,
      pasos.comprobarEmpresa,
    ].map((f) => vi.mocked(f).mock.invocationCallOrder[0]);
    expect([...orden].sort((a, b) => a - b)).toEqual(orden);
    expect(d.candado.soltar).toHaveBeenCalledTimes(1);
    expect(d.cerrar).toHaveBeenCalledTimes(1);
    expect(d.errores).toEqual([]);
    expect(d.lineas.join("\n")).toMatch(/demo-qa-a · maestro +· demo-qa-a-maestro@example\.test/);
  });

  it("fallo de la receta → salir(1), la línea dice cómo desbloquear dev, y suelta el candado", async () => {
    const pasos = pasosDobles({
      crearEmpresa: vi.fn(async () => {
        throw new Error("[demo-qa] «CierresAdminService.aprobarCierre» no fue ok: conflict");
      }),
    });
    const d = dobles({ pasos });
    const r = await ejecutarDemo(d.efectos);
    expect(r.codigo).toBe(1);
    expect(d.salir).toHaveBeenCalledWith(1);
    expect(d.salir).not.toHaveBeenCalledWith(0);
    expect(d.errores.join("\n")).toMatch(/aprobarCierre/);
    expect(d.errores.join("\n")).toMatch(/quita DEMO_ON_PREVIEW en Vercel/);
    expect(d.candado.soltar).toHaveBeenCalledTimes(1);
    expect(d.cerrar).toHaveBeenCalledTimes(1);
  });

  it("un error de la base sale con su nombre y su código, nunca con su mensaje (R5)", async () => {
    const error = Object.assign(new Error(`connect postgresql://postgres:${SECRETO_BD}@db.x.supabase.co failed`), {
      name: "PrismaClientKnownRequestError",
      code: "P1001",
    });
    const pasos = pasosDobles({ borrar: vi.fn(async () => Promise.reject(error)) });
    const d = dobles({ pasos });
    expect((await ejecutarDemo(d.efectos)).codigo).toBe(1);
    const texto = d.errores.join("\n");
    expect(texto).toMatch(/PrismaClientKnownRequestError P1001/);
    for (const p of [SECRETO_BD, "postgresql://", "supabase.co"]) expect(texto).not.toContain(p);
    expect(vi.mocked(pasos.crearEmpresa)).not.toHaveBeenCalled();
  });

  it("sin la marca de QA → 1 sin comprobar slugs, borrar ni crear (R3)", async () => {
    const pasos = pasosDobles({
      comprobarMarca: vi.fn(
        async () => ({ ok: false, codigo: "sin_marca", motivo: "la base no tiene la marca de QA" }) as const,
      ),
    });
    const d = dobles({ pasos });
    expect((await ejecutarDemo(d.efectos)).codigo).toBe(1);
    expect(d.errores.join("\n")).toMatch(/la base no es la de QA/);
    expect(vi.mocked(pasos.comprobarSlugs)).not.toHaveBeenCalled();
    expect(vi.mocked(pasos.borrar)).not.toHaveBeenCalled();
  });

  it("un tipo de job no esperado → 1 nombrándolo, sin comprobación final (R23)", async () => {
    const pasos = pasosDobles({
      crearEmpresa: vi.fn(async (_d: PrismaClient, clave: "A" | "B") =>
        resumenDe(clave, { tiposNoEsperados: clave === "B" ? ["webhook_evento"] : [] }),
      ),
    });
    const d = dobles({ pasos });
    expect((await ejecutarDemo(d.efectos)).codigo).toBe(1);
    expect(d.salir).toHaveBeenCalledWith(1);
    expect(d.errores.join("\n")).toMatch(/demo-qa-b encoló jobs de un tipo no esperado: webhook_evento/);
    expect(vi.mocked(pasos.comprobarEmpresa)).not.toHaveBeenCalled();
  });

  it("A y B se crean a la vez, con el lector y no con la conexión del candado", async () => {
    // Cada receta anota, al terminar, cuántas habían empezado: en serie, A terminaría viendo solo A.
    const empezadas: string[] = [];
    const vistasAlTerminar: Record<string, string[]> = {};
    const pasos = pasosDobles({
      crearEmpresa: vi.fn(async (_d: PrismaClient, clave: "A" | "B") => {
        empezadas.push(clave);
        await new Promise((r) => setTimeout(r, 5));
        vistasAlTerminar[clave] = [...empezadas];
        return resumenDe(clave);
      }),
    });
    const d = dobles({ pasos });
    const lector = {} as PrismaClient;
    const dueno = {} as PrismaClient;
    d.conectar.mockResolvedValue({ dueno, lector, cerrar: d.cerrar });
    expect((await ejecutarDemo(d.efectos)).codigo).toBe(0);
    expect(vistasAlTerminar).toEqual({ A: ["A", "B"], B: ["A", "B"] });
    for (const llamada of vi.mocked(pasos.crearEmpresa).mock.calls) expect(llamada[0]).toBe(lector);
    expect(vi.mocked(pasos.borrar).mock.calls[0][0]).toBe(dueno);
  });

  it("si A falla, espera a que B termine antes de soltar el candado y cerrar", async () => {
    let bTermino = false;
    const pasos = pasosDobles({
      crearEmpresa: vi.fn(async (_d: PrismaClient, clave: "A" | "B") => {
        if (clave === "A") throw new Error("[demo-qa] «CierresAdminService.aprobarCierre» no fue ok: conflict");
        await new Promise((r) => setTimeout(r, 20));
        bTermino = true;
        return resumenDe(clave);
      }),
    });
    const d = dobles({ pasos });
    const bAlSoltar: boolean[] = [];
    d.candado.soltar.mockImplementation(async () => {
      bAlSoltar.push(bTermino);
    });
    const bAlCerrar: boolean[] = [];
    d.cerrar.mockImplementation(async () => {
      bAlCerrar.push(bTermino);
    });
    expect((await ejecutarDemo(d.efectos)).codigo).toBe(1);
    expect(d.errores.join("\n")).toMatch(/aprobarCierre/);
    expect(bAlSoltar).toEqual([true]);
    expect(bAlCerrar).toEqual([true]);
  });

  it("un estado faltante en la comprobación final → 1 nombrándolo (R15)", async () => {
    const pasos = pasosDobles({
      comprobarEmpresa: vi.fn(async () => ({ ...comprobacionLimpia(), estadosFaltantes: ["novedad_interna"], limpia: false })),
    });
    const d = dobles({ pasos });
    expect((await ejecutarDemo(d.efectos)).codigo).toBe(1);
    expect(d.errores.join("\n")).toMatch(/estados sin órdenes: novedad_interna/);
  });

  it("a mano, un fallo sale con 1 sin la línea del build", async () => {
    const pasos = pasosDobles({ borrar: vi.fn(async () => Promise.reject(new Error("x"))) });
    const d = dobles({ argumentos: [], pasos });
    expect((await ejecutarDemo(d.efectos)).codigo).toBe(1);
    expect(d.salir).toHaveBeenCalledWith(1);
    expect(d.errores.join("\n")).not.toMatch(/DEMO_ON_PREVIEW/);
  });
});

describe("ejecutarDemo — el tope de 15 min (R33)", () => {
  it("la constante es de 15 minutos", () => {
    expect(TOPE_MS).toBe(15 * 60 * 1000);
  });

  it("vencido a mitad de la receta → 1 con su mensaje, suelta el candado y cierra", async () => {
    const pasos = pasosDobles({ crearEmpresa: vi.fn(() => new Promise<ResumenEmpresaDemo>(() => {})) });
    const d = dobles({ pasos });
    let vencer: () => void = () => {};
    d.efectos.armarTope = () => ({ vencido: new Promise<void>((r) => (vencer = r)), desarmar: () => {} });
    const corrida = ejecutarDemo(d.efectos);
    await vi.waitFor(() => expect(vi.mocked(pasos.crearEmpresa)).toHaveBeenCalled());
    vencer();
    const r = await corrida;
    expect(r).toEqual({ codigo: 1, topeVencido: true });
    expect(d.salir).toHaveBeenCalledWith(1);
    expect(d.errores.join("\n")).toMatch(/ABORTADA: la demo superó su tope de 15 min/);
    expect(d.errores.join("\n")).toMatch(/quita DEMO_ON_PREVIEW/);
    expect(d.candado.soltar).toHaveBeenCalledTimes(1);
    expect(d.cerrar).toHaveBeenCalledTimes(1);
  });

  it("vencido esperando el candado de otra ejecución → 1, sin soltar un candado que no tiene", async () => {
    const d = dobles({ topeVence: true });
    d.candado.tomar = vi.fn(async (_c: unknown, o: OpcionesCandado) => {
      while (!o.cancelado()) await new Promise((r) => setTimeout(r, 1));
      return false;
    });
    const r = await ejecutarDemo(d.efectos);
    expect(r).toEqual({ codigo: 1, topeVencido: true });
    expect(d.errores.join("\n")).toMatch(/esperando el candado de otra ejecución/);
    expect(d.candado.soltar).not.toHaveBeenCalled();
  });
});

describe("package.json — el orden del build (R29)", () => {
  it("build corre migrate-deploy.ts, después demo-qa.ts --build y después next build", () => {
    const pkg = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    // Literal a propósito: es el contrato del build.
    expect(pkg.scripts.build.split("&&").map((p) => p.trim())).toEqual([
      "prisma generate",
      "tsx scripts/migrate-deploy.ts",
      "tsx scripts/demo-qa.ts --build",
      "next build",
    ]);
    expect(pkg.scripts["demo:qa"]).toBe("tsx scripts/demo-qa.ts");
  });
});
