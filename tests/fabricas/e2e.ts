import { randomBytes, randomUUID } from "node:crypto";

import type { Browser, Cookie } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type RolValue } from "@prisma/client";

import { ORDER_STATUS_SEED } from "../../lib/types/order-status";
import { ROLES_SEED } from "../../lib/types/roles";
import { VEHICULOS_SEED } from "../../lib/types/vehiculos";
import { computeDeviceHash } from "../../lib/utils/device";

import { crearEmpresa, crearUsuario, TIPO_IDENTIFICACION, type EmpresaCreada, type UsuarioCreado } from "./empresa-y-usuarios";

// SL-44 T3.1 (design D4; R7, R10, R11, R12) — la fábrica de datos de los E2E. Cada spec crea su
// empresa y sus usuarios aquí, por los mismos servicios que usa la app, y no depende de nada que no
// siembre `pnpm run db:seed`. Sin `.test` en el nombre: lo importan los E2E y, después, SL-43.
// SL-43 T4: el alta en sí vive en `./empresa-y-usuarios.ts`, que comparte con la demo de QA. Aquí
// quedan lo propio del E2E: la base solo local, los correos y contraseñas aleatorios y el login.
//
// Excepciones de R8 (escritura directa, sin servicio), con su motivo:
// - la contraseña del maestro: `altaEmpresa` le pone a propósito una que nadie conoce, y el único
//   camino de la app para fijarla es «recuperar contraseña» con OTP por correo. La fija
//   `crearEmpresa` con `hashPassword`, el hasher del login;
// - el dispositivo confiado: lo crea el login tras un OTP. Es la técnica de `prepararAcceso`.
// Ninguna de las dos es un estado de negocio: son credenciales para entrar sin OTP.

/** Los hosts en los que el E2E puede escribir. Cualquier otro es una base de alguien. */
const HOSTS_LOCALES = new Set(["localhost", "127.0.0.1"]);

/**
 * Valida la URL de la base del E2E sin abrir conexión (R11, R12). Devuelve la URL tal cual o lanza.
 * Los mensajes nunca incluyen la URL: lleva la contraseña.
 */
export function validarUrlBaseE2E(url: string | undefined): string {
  if (!url || url.trim() === "") {
    throw new Error(
      "SL-44 E2E: falta DATABASE_URL. Hace falta una base local (localhost o 127.0.0.1), migrada y con `pnpm run db:seed`.",
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("SL-44 E2E: DATABASE_URL no es una URL válida. Aborta antes de abrir conexión.");
  }
  // `pg` deja que `?host=` y `?hostaddr=` pisen el host de la URL: un host local delante y uno
  // remoto en la query acabaría escribiendo en el remoto.
  const hostEnQuery = parsed.searchParams.has("host") || parsed.searchParams.has("hostaddr");
  if (!HOSTS_LOCALES.has(parsed.hostname.toLowerCase()) || hostEnQuery) {
    throw new Error(
      "SL-44 E2E: DATABASE_URL apunta a un host distinto de localhost o 127.0.0.1. Aborta antes de abrir conexión.",
    );
  }
  return url;
}

/** Lee y valida `DATABASE_URL`. Va delante de toda conexión, también de la de `getPrismaClient`. */
function urlBaseE2E(): string {
  return validarUrlBaseE2E(process.env.DATABASE_URL);
}

/**
 * Cliente dueño, sin la extensión de empresa: para comprobar la base por detrás y para las
 * excepciones de R8. Lanza antes de crear el cliente si la URL no es local (R12).
 */
export function abrirBaseE2E(): PrismaClient {
  const url = urlBaseE2E();
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 2 }) });
}

let duenoCompartido: PrismaClient | undefined;
function dueno(): PrismaClient {
  urlBaseE2E();
  return (duenoCompartido ??= abrirBaseE2E());
}

/** Lo que encontró la base, para `catalogosQueFaltan`. */
export interface CatalogosPresentes {
  roles: string[];
  estatusDeOrden: string[];
  vehiculos: string[];
  tiposIdentificacion: string[];
  provincias: number;
}

/** El tipo de identificación con el que la fábrica da de alta a todos. */
const TIPO_IDENTIFICACION_E2E = TIPO_IDENTIFICACION;

/** Qué catálogo de `db:seed` (o de la geografía migrada) falta. Vacío = la base sirve. */
export function catalogosQueFaltan(p: CatalogosPresentes): string[] {
  const faltan = (nombre: string, esperados: readonly string[], hay: string[]): string[] => {
    const ausentes = esperados.filter((v) => !hay.includes(v));
    return ausentes.length > 0 ? [`${nombre}: ${ausentes.join(", ")}`] : [];
  };
  return [
    ...faltan("rol", ROLES_SEED, p.roles),
    ...faltan("order_status", ORDER_STATUS_SEED, p.estatusDeOrden),
    ...faltan("vehiculo", VEHICULOS_SEED, p.vehiculos),
    ...faltan("tipo_identificacion", [TIPO_IDENTIFICACION_E2E], p.tiposIdentificacion),
    ...(p.provincias > 0 ? [] : ["provincia: ninguna (¿base sin migrar?)"]),
  ];
}

let baseComprobada: Promise<void> | undefined;

/**
 * La base responde y tiene los catálogos (R11). Una vez por proceso: los workers de Playwright
 * crean varias empresas y la respuesta no cambia entre ellas.
 */
function comprobarBaseE2E(): Promise<void> {
  baseComprobada ??= (async () => {
    const db = dueno();
    let presentes: CatalogosPresentes;
    try {
      const [roles, estatus, vehiculos, tipos, provincias] = await Promise.all([
        db.rol.findMany({ select: { value: true } }),
        db.orderStatus.findMany({ select: { value: true } }),
        db.vehiculo.findMany({ select: { name: true } }),
        db.tipoIdentificacion.findMany({ select: { value: true } }),
        db.provincia.count(),
      ]);
      presentes = {
        roles: roles.map((r) => r.value),
        estatusDeOrden: estatus.map((s) => s.value),
        vehiculos: vehiculos.map((v) => v.name),
        tiposIdentificacion: tipos.map((t) => t.value),
        provincias,
      };
    } catch (e) {
      throw new Error(
        "SL-44 E2E: la base del E2E no es alcanzable o no está migrada (¿contenedor de Postgres levantado y `pnpm run db:migrate`?).",
        { cause: e },
      );
    }
    const faltan = catalogosQueFaltan(presentes);
    if (faltan.length > 0) {
      throw new Error(`SL-44 E2E: faltan catálogos en la base (corre \`pnpm run db:seed\`): ${faltan.join("; ")}`);
    }
  })();
  // Un fallo no se queda en caché: el siguiente intento vuelve a mirar.
  baseComprobada.catch(() => {
    baseComprobada = undefined;
  });
  return baseComprobada;
}

function sufijo(): string {
  return randomUUID().replace(/-/g, "").slice(0, 12);
}

/** El correo de un usuario de la corrida (R10): `@example.test` y sufijo aleatorio. */
export function correoE2E(rol: RolValue | string): string {
  // En minúsculas: `usuario.email` es único tal cual y el login no normaliza.
  return `e2e-${rol.toLowerCase()}-${sufijo()}@example.test`;
}

/** Una contraseña que cumple `strongPasswordSchema` (mayúscula, minúscula, dígito y símbolo). */
function contrasenaE2E(): string {
  return `E2e-${randomBytes(12).toString("base64url")}-9a`;
}

export type UsuarioE2E = UsuarioCreado;
export type EmpresaE2E = EmpresaCreada;

/** Alta de una empresa nueva por el servicio del superadmin, y su maestro listo para entrar. */
export async function crearEmpresaE2E(etiqueta: string): Promise<EmpresaE2E> {
  await comprobarBaseE2E();
  const s = sufijo();
  const slugEtiqueta = etiqueta.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);
  return crearEmpresa(
    dueno(),
    {
      nombre: `E2E ${etiqueta} ${s}`,
      slug: slugEtiqueta ? `e2e-${slugEtiqueta}-${s}` : `e2e-${s}`,
      correoMaestro: correoE2E("maestro"),
      contrasena: contrasenaE2E(),
      nombreMaestro: `Maestro E2E ${s}`,
      documentoMaestro: `e2e-${s}`,
    },
    { ficha: "SL-44", motivo: "fábrica E2E: alta de empresa" },
  );
}

/**
 * Un usuario de la empresa, dado de alta por su maestro (`crearUsuario`, que documenta `zonaId`,
 * `vehiculoId` y `fulfillment`), con correo y contraseña aleatorios.
 */
export async function crearUsuarioE2E(
  e: EmpresaE2E,
  rol: RolValue,
  extra: { zonaId?: string; vehiculoId?: string; fulfillment?: boolean } = {},
): Promise<UsuarioE2E> {
  await comprobarBaseE2E();
  const s = sufijo();
  return crearUsuario(dueno(), e, rol, {
    correo: correoE2E(rol),
    contrasena: contrasenaE2E(),
    nombre: `E2E ${rol} ${s}`,
    cedula: `e2e-${s}`,
    ...extra,
  });
}

/**
 * Deja confiado el dispositivo de ese navegador para que el login no pida OTP (técnica de
 * `prepararAcceso`; excepción de R8 de la cabecera). Repetirlo no falla.
 */
export async function confiarDispositivo(u: UsuarioE2E, userAgent: string): Promise<void> {
  const deviceHash = computeDeviceHash(userAgent);
  await dueno().trustedDevice.upsert({
    where: { usuarioId_deviceHash: { usuarioId: u.id, deviceHash } },
    create: { usuarioId: u.id, deviceHash, ipAddress: "127.0.0.1" },
    update: {},
  });
}

/** Entra por el `/login` real y devuelve las cookies de la sesión. Confía el dispositivo antes. */
export async function sesionDe(browser: Browser, u: UsuarioE2E): Promise<Cookie[]> {
  const ctx = await browser.newContext();
  try {
    const page = await ctx.newPage();
    await confiarDispositivo(u, await page.evaluate(() => navigator.userAgent));
    await page.goto("/login");
    await page.fill('input[type="email"]', u.email);
    await page.fill('input[type="password"]', u.password);
    await page.click('button[type="submit"]');
    try {
      await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 90_000 });
    } catch (err) {
      throw new Error(`SL-44 E2E: ${u.email} no salió de /login (¿pidió OTP o rechazó la contraseña?).`, {
        cause: err,
      });
    }
    return await ctx.cookies();
  } finally {
    await ctx.close();
  }
}
