import type { PrismaClient } from "@prisma/client";

import { strongPasswordSchema } from "@/lib/types/password-policy";

// SL-43 (design §2; R2, R3, R4, R5, R25) — la guardia anti-producción de la demo de QA, en tres capas:
//   1. `VERCEL_ENV` no es `production`;
//   2. la base del dueño, la de la app y el Storage son del MISMO proyecto (o todos locales);
//   3. la base lleva la marca de QA (`comprobarMarcaDeQa`, ya con la conexión abierta).
// Las capas 1 y 2 van antes de conectar: con ellas en rojo no se abre ninguna conexión.
//
// Ningún motivo lleva un valor del entorno: las URLs llevan la contraseña, y la clave de Storage y la
// de los usuarios demo son secretas (R5). Solo se nombra la variable.

/** El subconjunto del entorno que mira la guardia. Acepta `process.env` tal cual. */
export type EnvDemo = Readonly<Record<string, string | undefined>>;

export type CodigoRechazoEntorno =
  | "produccion"
  | "falta_url_base"
  | "url_invalida"
  | "falta_supabase_url"
  | "falta_service_role_key"
  | "mezcla_local_y_remoto"
  | "proyectos_distintos"
  | "proyecto_no_identificable"
  | "falta_contrasena"
  | "contrasena_debil";

export type ResultadoGuardia =
  | { ok: true }
  | { ok: false; codigo: CodigoRechazoEntorno; motivo: string };

/** Los hosts que cuentan como «esta máquina». Cualquier otro es una base de alguien. */
const HOSTS_LOCALES = new Set(["localhost", "127.0.0.1"]);

/**
 * El ref de un proyecto de Supabase: 20 caracteres en minúscula y dígitos. Si Supabase cambiara el
 * formato, la guardia rechazaría por «proyecto no identificable»: falla cerrada, que es lo seguro.
 */
const REF_SUPABASE = /^[a-z0-9]{20}$/;

type Proyecto = { tipo: "local" } | { tipo: "remoto"; ref: string } | { tipo: "desconocido" };

function presente(valor: string | undefined): valor is string {
  return valor !== undefined && valor.trim() !== "";
}

function parsear(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/**
 * El proyecto de una URL de Postgres. Directa: `db.<ref>.supabase.co`. Poolers (sesión y
 * transaccional): usuario `postgres.<ref>`. Local: `localhost`/`127.0.0.1` sin `?host=` ni
 * `?hostaddr=`, porque `pg` deja que la query pise el host de la URL (mismo criterio que
 * `validarUrlBaseE2E`). Una URL remota con esos parámetros tampoco se puede identificar.
 */
function proyectoDeBase(url: URL): Proyecto {
  const hostEnQuery = url.searchParams.has("host") || url.searchParams.has("hostaddr");
  if (hostEnQuery) return { tipo: "desconocido" };
  const host = url.hostname.toLowerCase();
  if (HOSTS_LOCALES.has(host)) return { tipo: "local" };

  const porHost = /^db\.([^.]+)\.supabase\.co$/.exec(host)?.[1];
  const usuario = decodeURIComponent(url.username).toLowerCase();
  const porUsuario = /^postgres\.([^.]+)$/.exec(usuario)?.[1];
  // Si el host y el usuario nombran un proyecto cada uno, tienen que coincidir: dos refs en la misma
  // URL no dicen a cuál se conecta de verdad.
  if (porHost !== undefined && porUsuario !== undefined && porHost !== porUsuario) {
    return { tipo: "desconocido" };
  }
  const ref = porHost ?? porUsuario;
  return ref !== undefined && REF_SUPABASE.test(ref) ? { tipo: "remoto", ref } : { tipo: "desconocido" };
}

/** El proyecto de `SUPABASE_URL`: `https://<ref>.supabase.co`, o local. */
function proyectoDeStorage(url: URL): Proyecto {
  const host = url.hostname.toLowerCase();
  if (HOSTS_LOCALES.has(host)) return { tipo: "local" };
  const ref = /^([^.]+)\.supabase\.co$/.exec(host)?.[1];
  return ref !== undefined && REF_SUPABASE.test(ref) ? { tipo: "remoto", ref } : { tipo: "desconocido" };
}

function rechazo(codigo: CodigoRechazoEntorno, motivo: string): ResultadoGuardia {
  return { ok: false, codigo, motivo };
}

/**
 * Las tres URLs tienen que ser del mismo proyecto (R4). Recibe los proyectos ya resueltos, con el
 * nombre de su variable, para poder nombrar la que no se identifica.
 */
function mismoProyecto(proyectos: ReadonlyArray<readonly [string, Proyecto]>): ResultadoGuardia {
  for (const [variable, p] of proyectos) {
    if (p.tipo === "desconocido") {
      return rechazo(
        "proyecto_no_identificable",
        `${variable} apunta a un host remoto del que no se puede sacar el proyecto de Supabase`,
      );
    }
  }
  const locales = proyectos.filter(([, p]) => p.tipo === "local").length;
  if (locales > 0 && locales < proyectos.length) {
    return rechazo(
      "mezcla_local_y_remoto",
      "DIRECT_URL, DATABASE_URL y SUPABASE_URL mezclan una base o un Storage local con uno remoto",
    );
  }
  const refs = new Set(proyectos.flatMap(([, p]) => (p.tipo === "remoto" ? [p.ref] : [])));
  if (refs.size > 1) {
    return rechazo(
      "proyectos_distintos",
      "DIRECT_URL, DATABASE_URL y SUPABASE_URL no son del mismo proyecto de Supabase",
    );
  }
  return { ok: true };
}

/**
 * Capas 1 y 2 de la guardia, más la contraseña (R25). Pura: no abre conexiones ni lee
 * `process.env`. Rechaza en el orden de `design.md > D2.1`.
 *
 * La URL del dueño es `DIRECT_URL` y, si falta (en local), `DATABASE_URL`; la de la app es
 * `DATABASE_URL` y, si falta, `DIRECT_URL`, como la siembra de `migrate-deploy.ts`.
 */
export function validarEntornoDemo(env: EnvDemo): ResultadoGuardia {
  // Se repite aunque `decidirDemo` ya omita producción en el build: si alguien cambia la decisión, o
  // se corre a mano con el entorno de producción, la guardia sigue en pie (R2).
  if (env.VERCEL_ENV === "production") {
    return rechazo("produccion", "VERCEL_ENV=production: la demo nunca corre en producción");
  }

  const directa = presente(env.DIRECT_URL) ? env.DIRECT_URL : undefined;
  const app = presente(env.DATABASE_URL) ? env.DATABASE_URL : undefined;
  if (directa === undefined && app === undefined) {
    return rechazo("falta_url_base", "faltan DIRECT_URL y DATABASE_URL");
  }
  if (!presente(env.SUPABASE_URL)) {
    return rechazo("falta_supabase_url", "falta SUPABASE_URL");
  }
  if (!presente(env.SUPABASE_SERVICE_ROLE_KEY)) {
    return rechazo("falta_service_role_key", "falta SUPABASE_SERVICE_ROLE_KEY");
  }

  const urlDueno = parsear(directa ?? app!);
  const urlApp = parsear(app ?? directa!);
  const urlStorage = parsear(env.SUPABASE_URL);
  if (urlDueno === null) {
    return rechazo("url_invalida", `${directa ? "DIRECT_URL" : "DATABASE_URL"} no es una URL válida`);
  }
  if (urlApp === null) {
    return rechazo("url_invalida", `${app ? "DATABASE_URL" : "DIRECT_URL"} no es una URL válida`);
  }
  if (urlStorage === null || (urlStorage.protocol !== "https:" && urlStorage.protocol !== "http:")) {
    return rechazo("url_invalida", "SUPABASE_URL no es una URL http(s) válida");
  }

  const proyectoDueno = proyectoDeBase(urlDueno);
  // Solo en local se admite sin DIRECT_URL. En remoto, `DATABASE_URL` es el pooler de la app, y el
  // candado de la demo (advisory lock de sesión) y el borrado como dueño necesitan la conexión directa.
  if (directa === undefined && proyectoDueno.tipo === "remoto") {
    return rechazo("falta_url_base", "falta DIRECT_URL: con una base remota la demo necesita la del dueño");
  }

  const proyectos = mismoProyecto([
    ["DIRECT_URL", proyectoDueno],
    ["DATABASE_URL", proyectoDeBase(urlApp)],
    ["SUPABASE_URL", proyectoDeStorage(urlStorage)],
  ]);
  if (!proyectos.ok) return proyectos;

  if (!presente(env.DEMO_QA_CONTRASENA)) {
    return rechazo("falta_contrasena", "falta DEMO_QA_CONTRASENA");
  }
  // Sin el mensaje de zod: no lleva la contraseña, pero el motivo fijo basta y no cambia con zod.
  if (!strongPasswordSchema.safeParse(env.DEMO_QA_CONTRASENA).success) {
    return rechazo(
      "contrasena_debil",
      "DEMO_QA_CONTRASENA no cumple la política de contraseñas (8 a 72 caracteres, mayúscula, minúscula, dígito y símbolo)",
    );
  }
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Capa 3: la marca de la base                                                 */
/* -------------------------------------------------------------------------- */

/**
 * El cliente con el que se lee la marca: la conexión única del dueño que abre el entrypoint (un
 * `PrismaClient` con `PrismaPg` sobre `DIRECT_URL`, como `scripts/verificar-rls-despliegue.ts`).
 */
export type LectorMarca = Pick<PrismaClient, "$queryRaw">;

/** El único valor que abre la puerta. Exacto: ni mayúsculas, ni espacios, ni prefijos. */
export const MARCA_QA = "qa";

export type CodigoRechazoMarca = "sin_tabla" | "sin_marca" | "marca_distinta" | "error_lectura";

export type ResultadoMarca =
  | { ok: true }
  | { ok: false; codigo: CodigoRechazoMarca; motivo: string };

/** Código SQLSTATE de un error de Prisma (raw) o de `pg`, sin leer su mensaje. */
function sqlstate(e: unknown): string | undefined {
  const err = e as {
    code?: unknown;
    meta?: { code?: unknown; driverAdapterError?: { cause?: { originalCode?: unknown } } };
  };
  const candidatos = [err?.meta?.code, err?.meta?.driverAdapterError?.cause?.originalCode, err?.code];
  return candidatos.find((c): c is string => typeof c === "string" && /^[0-9A-Z]{5}$/.test(c));
}

/**
 * Capa 3 (R3, design §2.2 opción 3): la fila `('entorno', 'qa')` de `entorno_marca`, que pone una
 * persona solo en QA. Es lo primero que se hace con la conexión abierta, antes de leer o escribir
 * nada de negocio.
 *
 * Nunca devuelve el mensaje de la base: puede nombrar el host. Si la tabla no existe (una base sin
 * las migraciones de esta rama) es un rechazo, no un error.
 *
 * Fuera de una transacción a propósito: un error dentro de una dejaría la transacción abortada.
 */
export async function comprobarMarcaDeQa(cliente: LectorMarca): Promise<ResultadoMarca> {
  let filas: Array<{ valor: unknown }>;
  try {
    filas = await cliente.$queryRaw<Array<{ valor: unknown }>>`
      SELECT "valor" FROM "entorno_marca" WHERE "clave" = 'entorno'`;
  } catch (e) {
    const codigo = sqlstate(e);
    if (codigo === "42P01") {
      return {
        ok: false,
        codigo: "sin_tabla",
        motivo: "la base no tiene la tabla entorno_marca: no es una base de QA con las migraciones al día",
      };
    }
    return {
      ok: false,
      codigo: "error_lectura",
      motivo: `no se pudo leer la marca de QA (${codigo ?? (e instanceof Error ? e.name : "error")})`,
    };
  }
  if (filas.length === 0) {
    return {
      ok: false,
      codigo: "sin_marca",
      motivo: "la base no tiene la marca de QA (entorno_marca sin la fila 'entorno')",
    };
  }
  if (filas[0].valor !== MARCA_QA) {
    return {
      ok: false,
      codigo: "marca_distinta",
      motivo: "la marca de entorno de la base no es exactamente 'qa'",
    };
  }
  return { ok: true };
}
