import type { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  comprobarMarcaDeQa,
  validarEntornoDemo,
  type CodigoRechazoEntorno,
  type EnvDemo,
  type LectorMarca,
} from "@/scripts/demo-qa/guardia-entorno";

// SL-43 (design §2.1–§2.3; R2, R3, R4, R5, R25) — la guardia anti-producción de la demo de QA. Las
// capas 1 y 2 y la contraseña son puras; la capa 3 se prueba con un doble del cliente.
// La orquestación (con la guardia en rojo no se abre conexión) la añade T9 con `ejecutarDemo`.

const REF = "abcdefghijklmnopqrst";
const OTRO_REF = "zyxwvutsrqponmlkjihg";
const SECRETO_BD = "S3cretoDeLaBase";
const CLAVE_STORAGE = "clave-de-servicio-secreta";
const CONTRASENA = "Demo-QA-2026!";

const directa = (ref: string) => `postgresql://postgres:${SECRETO_BD}@db.${ref}.supabase.co:5432/postgres`;
const poolerTx = (ref: string) =>
  `postgresql://postgres.${ref}:${SECRETO_BD}@aws-1-us-east-2.pooler.supabase.com:6543/postgres`;
const poolerSesion = (ref: string) =>
  `postgresql://postgres.${ref}:${SECRETO_BD}@aws-1-us-east-2.pooler.supabase.com:5432/postgres`;
const storage = (ref: string) => `https://${ref}.supabase.co`;
const LOCAL_BD = `postgresql://postgres:${SECRETO_BD}@localhost:5432/servi_logistic`;
const LOCAL_STORAGE = "http://127.0.0.1:54321";

const REMOTO: EnvDemo = {
  VERCEL_ENV: "preview",
  DIRECT_URL: directa(REF),
  DATABASE_URL: poolerTx(REF),
  SUPABASE_URL: storage(REF),
  SUPABASE_SERVICE_ROLE_KEY: CLAVE_STORAGE,
  DEMO_QA_CONTRASENA: CONTRASENA,
};
const LOCAL: EnvDemo = {
  DATABASE_URL: LOCAL_BD,
  SUPABASE_URL: LOCAL_STORAGE,
  SUPABASE_SERVICE_ROLE_KEY: CLAVE_STORAGE,
  DEMO_QA_CONTRASENA: CONTRASENA,
};

/** Todo lo secreto o identificable que nunca puede salir en un motivo (R5). */
const PROHIBIDOS = [SECRETO_BD, CLAVE_STORAGE, CONTRASENA, REF, OTRO_REF, "://", "supabase.co", "localhost"];

function rechazoDe(env: EnvDemo): { codigo: CodigoRechazoEntorno; motivo: string } {
  const r = validarEntornoDemo(env);
  if (r.ok) throw new Error("se esperaba un rechazo y la guardia dejó pasar");
  return r;
}

describe("validarEntornoDemo — casos verdes", () => {
  it("todo local (base y Storage en esta máquina), sin DIRECT_URL: pasa", () => {
    expect(validarEntornoDemo(LOCAL)).toEqual({ ok: true });
  });

  it("remoto con el mismo ref en la directa, el pooler y el Storage: pasa", () => {
    expect(validarEntornoDemo(REMOTO)).toEqual({ ok: true });
  });

  it("remoto con el pooler de sesión como DIRECT_URL y el mismo ref: pasa", () => {
    expect(validarEntornoDemo({ ...REMOTO, DIRECT_URL: poolerSesion(REF) })).toEqual({ ok: true });
  });

  it("remoto sin DATABASE_URL cae a DIRECT_URL: pasa", () => {
    expect(validarEntornoDemo({ ...REMOTO, DATABASE_URL: undefined })).toEqual({ ok: true });
  });
});

describe("validarEntornoDemo — un caso por motivo de D2.1", () => {
  const casos: Array<[string, EnvDemo, CodigoRechazoEntorno]> = [
    // Capa 1 (R2)
    ["VERCEL_ENV=production, aunque todo lo demás sea válido", { ...REMOTO, VERCEL_ENV: "production" }, "produccion"],
    ["VERCEL_ENV=production en local", { ...LOCAL, VERCEL_ENV: "production" }, "produccion"],
    // Variables (D2.1 punto 2)
    ["sin DIRECT_URL ni DATABASE_URL", { ...REMOTO, DIRECT_URL: undefined, DATABASE_URL: "  " }, "falta_url_base"],
    ["base remota sin DIRECT_URL (solo el pooler de la app)", { ...REMOTO, DIRECT_URL: undefined }, "falta_url_base"],
    ["sin SUPABASE_URL", { ...REMOTO, SUPABASE_URL: "" }, "falta_supabase_url"],
    ["sin SUPABASE_SERVICE_ROLE_KEY", { ...REMOTO, SUPABASE_SERVICE_ROLE_KEY: undefined }, "falta_service_role_key"],
    ["DIRECT_URL que no es una URL", { ...REMOTO, DIRECT_URL: `postgres ${SECRETO_BD} sin esquema` }, "url_invalida"],
    ["DATABASE_URL que no es una URL", { ...REMOTO, DATABASE_URL: `:::${SECRETO_BD}` }, "url_invalida"],
    ["SUPABASE_URL que no es http(s)", { ...REMOTO, SUPABASE_URL: `ftp://${REF}.supabase.co` }, "url_invalida"],
    // Capa 2 (R4)
    ["DIRECT_URL y DATABASE_URL de refs distintos", { ...REMOTO, DATABASE_URL: poolerTx(OTRO_REF) }, "proyectos_distintos"],
    ["base de un proyecto y Storage de otro", { ...REMOTO, SUPABASE_URL: storage(OTRO_REF) }, "proyectos_distintos"],
    ["base local y Storage remoto", { ...LOCAL, SUPABASE_URL: storage(REF) }, "mezcla_local_y_remoto"],
    ["base remota y Storage local", { ...REMOTO, SUPABASE_URL: LOCAL_STORAGE }, "mezcla_local_y_remoto"],
    ["DIRECT_URL local y DATABASE_URL remota", { ...REMOTO, DIRECT_URL: LOCAL_BD }, "mezcla_local_y_remoto"],
    [
      "host remoto del que no se saca el ref",
      { ...REMOTO, DIRECT_URL: `postgresql://postgres:${SECRETO_BD}@base.ejemplo.com:5432/postgres` },
      "proyecto_no_identificable",
    ],
    [
      "pooler con un usuario sin ref",
      { ...REMOTO, DATABASE_URL: `postgresql://postgres:${SECRETO_BD}@aws-1-us-east-2.pooler.supabase.com:6543/postgres` },
      "proyecto_no_identificable",
    ],
    [
      "host local con ?host= que lo pisa",
      { ...LOCAL, DATABASE_URL: `${LOCAL_BD}?host=db.${REF}.supabase.co` },
      "proyecto_no_identificable",
    ],
    [
      "host de un proyecto y usuario de otro en la misma URL",
      { ...REMOTO, DIRECT_URL: `postgresql://postgres.${OTRO_REF}:${SECRETO_BD}@db.${REF}.supabase.co:5432/postgres` },
      "proyecto_no_identificable",
    ],
    ["Storage remoto que no es de Supabase", { ...REMOTO, SUPABASE_URL: "https://storage.ejemplo.com" }, "proyecto_no_identificable"],
    // R25
    ["sin DEMO_QA_CONTRASENA", { ...REMOTO, DEMO_QA_CONTRASENA: undefined }, "falta_contrasena"],
    ["DEMO_QA_CONTRASENA sin símbolo", { ...REMOTO, DEMO_QA_CONTRASENA: "DemoQa2026" }, "contrasena_debil"],
    ["DEMO_QA_CONTRASENA corta", { ...REMOTO, DEMO_QA_CONTRASENA: "Aa1!" }, "contrasena_debil"],
  ];

  it.each(casos)("%s → rechaza", (_nombre, env, codigo) => {
    expect(rechazoDe(env).codigo).toBe(codigo);
  });

  it("R5 — ningún motivo contiene una URL, la clave de Storage, la contraseña ni el ref", () => {
    for (const [, env] of casos) {
      const { motivo } = rechazoDe(env);
      expect(motivo.length).toBeGreaterThan(0);
      for (const prohibido of PROHIBIDOS) expect(motivo).not.toContain(prohibido);
    }
  });

  it("la capa 1 va primero: en producción rechaza por producción aunque falte todo lo demás", () => {
    expect(rechazoDe({ VERCEL_ENV: "production" }).codigo).toBe("produccion");
  });
});

/* -------------------------------------------------------------------------- */
/* Capa 3: la marca de la base (R3)                                            */
/* -------------------------------------------------------------------------- */

/** Doble del cliente dueño: devuelve las filas dadas o lanza el error dado. */
function lector(respuesta: { filas: Array<{ valor: unknown }> } | { error: unknown }): LectorMarca & { llamadas: number } {
  const doble = {
    llamadas: 0,
    $queryRaw: (async () => {
      doble.llamadas++;
      if ("error" in respuesta) throw respuesta.error;
      return respuesta.filas;
    }) as unknown as PrismaClient["$queryRaw"],
  };
  return doble;
}

/** Forma del error de Prisma 7 con `adapter-pg` para un raw que falla. */
function errorPrisma(sqlstate: string, mensaje: string): Error {
  return Object.assign(new Error(mensaje), {
    name: "PrismaClientKnownRequestError",
    code: "P2010",
    meta: { code: sqlstate, message: mensaje },
  });
}

describe("comprobarMarcaDeQa", () => {
  it("con la fila ('entorno', 'qa') pasa, con una sola lectura", async () => {
    const cliente = lector({ filas: [{ valor: "qa" }] });
    expect(await comprobarMarcaDeQa(cliente)).toEqual({ ok: true });
    expect(cliente.llamadas).toBe(1);
  });

  it.each([
    ["'qa ' con espacio", "qa "],
    ["'QA' en mayúsculas", "QA"],
    ["'qaa'", "qaa"],
    ["'prod-qa'", "prod-qa"],
    ["vacía", ""],
  ])("marca %s → rechaza (comparación exacta)", async (_n, valor) => {
    const r = await comprobarMarcaDeQa(lector({ filas: [{ valor }] }));
    expect(r).toMatchObject({ ok: false, codigo: "marca_distinta" });
  });

  it("sin fila → rechaza", async () => {
    expect(await comprobarMarcaDeQa(lector({ filas: [] }))).toMatchObject({ ok: false, codigo: "sin_marca" });
  });

  it("tabla inexistente (42P01) → rechaza sin el mensaje de la base", async () => {
    const mensaje = `relation "entorno_marca" does not exist en db.${REF}.supabase.co`;
    const r = await comprobarMarcaDeQa(lector({ error: errorPrisma("42P01", mensaje) }));
    expect(r).toMatchObject({ ok: false, codigo: "sin_tabla" });
    if (!r.ok) for (const p of [REF, "supabase.co", "does not exist"]) expect(r.motivo).not.toContain(p);
  });

  it("otro error de la base → rechaza con el código, sin el mensaje", async () => {
    const mensaje = `connection to postgresql://postgres:${SECRETO_BD}@db.${REF}.supabase.co failed`;
    const r = await comprobarMarcaDeQa(lector({ error: errorPrisma("08006", mensaje) }));
    expect(r).toMatchObject({ ok: false, codigo: "error_lectura" });
    if (!r.ok) {
      expect(r.motivo).toContain("08006");
      for (const p of PROHIBIDOS) expect(r.motivo).not.toContain(p);
    }
  });
});
