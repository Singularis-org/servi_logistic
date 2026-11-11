import { randomUUID } from "node:crypto";

import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { Prisma, type PrismaClient } from "@prisma/client";

import { ORDENES_BULK_FIELDS } from "../app/(app)/ordenes/_components/carga-masiva-fields";
import { conEmpresa } from "../lib/db/contexto-empresa";
import { getPrismaClient } from "../lib/db/prisma-client";
import { CatalogoGeograficoRepository } from "../lib/repositories/CatalogoGeograficoRepository";
import { OrdenRepository } from "../lib/repositories/OrdenRepository";
import { TarifaVigenteRepository } from "../lib/repositories/TarifaVigenteRepository";
import { CotizacionOrdenService } from "../lib/services/CotizacionOrdenService";
import type { BulkSummary } from "../lib/types/carga-masiva";
import { fijarEmpresa } from "../tests/fabricas/organizaciones";
import { crearUsuarioE2E, sesionDe, type EmpresaE2E, type UsuarioE2E } from "../tests/fabricas/e2e";

import type { Empresa, Letra } from "./_dos-empresas-fixture";
import { clienteDuenoLocal, sembrarEmpresa, type DistritoElegido, type EmpresaDeTarifas } from "./_zona-especial-fixture";

/**
 * SLT-89 (R41, R35; T8.1) — UNA ZONA SOBRE UN CANTÓN, DE PUNTA A PUNTA, CON DOS EMPRESAS.
 *
 * El maestro de A abre su zona en `/configuracion/zonas`, marca un CANTÓN entero (no sus distritos),
 * ve el aviso de impacto con sus cifras en el modal único y confirma. Después, la tienda de A crea por la
 * carga masiva una orden en un distrito de ese cantón: sale con la zona de A, y la cotización de ese
 * distrito da el precio de la tarifa de esa zona. B, con el mismo cantón sin asignar, no ve la zona de A
 * ni tiene cobertura en ese cantón: su carga de la misma fila sale con error y su cotización, sin precio.
 * Por detrás, como dueño, se lee la asignación en `zona_nodo`: el verde no depende solo de lo que se pinta.
 *
 * CÓMO SE CORRE (solo en local; una base no local lo aborta antes de escribir):
 * - `DATABASE_URL` a una base local desechable (p. ej. `logistic_slt89_e2e`), migrada y con catálogos
 *   (`pnpm run db:seed`). Nunca la compartida, remota ni de producción.
 * - Playwright levanta la app contra esa misma base. Sin siembra, el `beforeAll` lanza: no se salta.
 */

test.use({ actionTimeout: 30_000 });
test.describe.configure({ mode: "serial" });

/** La tarifa de cada zona: flete 2 000 + 13 % de IVA (la zona sembrada es la central: el GAM, igual). */
const FLETE = "2000.00";
const IVA_FLETE = "13.00";

interface CantonElegido {
  id: string;
  nombre: string;
  provincia: string;
  distritos: DistritoElegido[];
}

let dueno: PrismaClient | null = null;
let userAgent = "";
let canton: CantonElegido | null = null;
const empresas: Partial<Record<Letra, EmpresaDeTarifas & { zonaId: string; tienda: UsuarioE2E }>> = {};
const cookies: Partial<Record<Letra, Awaited<ReturnType<BrowserContext["cookies"]>>>> = {};

function base(): PrismaClient {
  if (!dueno) throw new Error("no hay cliente dueño: falló el beforeAll");
  return dueno;
}

function de(letra: Letra) {
  const e = empresas[letra];
  if (!e) throw new Error(`no hay siembra de ${letra}: falló el beforeAll`);
  return e;
}

function elegido(): CantonElegido {
  if (!canton) throw new Error("no hay cantón: falló el beforeAll");
  return canton;
}

/**
 * Un cantón activo con al menos dos distritos activos, cuyo nombre ASCII no aparece dentro de ningún otro
 * nombre del catálogo (la búsqueda del selector lo deja en una sola fila), y un distrito de OTRO cantón
 * para la zona sembrada de cada empresa.
 */
async function elegirCanton(db: PrismaClient): Promise<{ canton: CantonElegido; otros: DistritoElegido[] }> {
  const filas = await db.$queryRaw<{ id: string; nombre: string; provincia: string }[]>`
    WITH nombres AS (
      SELECT lower(nombre) AS n FROM distrito
      UNION ALL SELECT lower(nombre) FROM canton
      UNION ALL SELECT lower(nombre) FROM provincia
    )
    SELECT c.id, c.nombre, p.nombre AS provincia
    FROM canton c
    JOIN provincia p ON p.id = c.provincia_id
    WHERE c.activo AND p.activo
      AND c.nombre ~ '^[A-Za-z]{5,}$'
      AND (SELECT count(*) FROM nombres WHERE nombres.n LIKE '%' || lower(c.nombre) || '%') = 1
      AND (SELECT count(*) FROM distrito d WHERE d.canton_id = c.id AND d.activo) >= 2
    ORDER BY c.nombre
    LIMIT 1`;
  if (filas.length === 0) throw new Error("SLT-89 T8.1: el catálogo no tiene un cantón buscable con dos distritos (¿base sin `db:seed`?)");
  const [c] = filas;
  const distritos = await db.distrito.findMany({
    where: { cantonId: c.id, activo: true },
    orderBy: { nombre: "asc" },
    select: { id: true, nombre: true },
  });
  const otros = await db.distrito.findMany({
    where: { activo: true, cantonId: { not: c.id }, canton: { activo: true, provincia: { activo: true } } },
    orderBy: { nombre: "asc" },
    take: 2,
    select: { id: true, nombre: true },
  });
  if (otros.length < 2) throw new Error("SLT-89 T8.1: faltan distritos fuera del cantón elegido");
  return { canton: { ...c, distritos }, otros };
}

/** La tarifa de la zona (sin tienda): la que la cascada de la feature 274 aplica a cualquier tienda. */
async function sembrarTarifa(db: PrismaClient, organizacionId: string, zonaId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    await fijarEmpresa(tx, organizacionId);
    await tx.tarifa.create({
      data: {
        zonaId,
        tiendaId: null,
        valorFlete: new Prisma.Decimal(FLETE),
        valorFleteGam: new Prisma.Decimal(FLETE),
        valorFleteDevuelto: new Prisma.Decimal("1000.00"),
        valorFleteDevueltoGam: new Prisma.Decimal("1000.00"),
        comisionCod: new Prisma.Decimal("0.00"),
        ivaFlete: new Prisma.Decimal(IVA_FLETE),
        ivaComisionCod: new Prisma.Decimal("0.00"),
      },
    });
  });
}

function comoEmpresaE2E(e: Empresa): EmpresaE2E {
  return {
    organizacionId: e.organizacionId,
    maestro: { id: e.maestroId, email: e.email, password: e.password, nombre: `Maestro ${e.letra}` },
    slug: e.slug,
  };
}

/** La fila de la carga en un distrito del cantón, con la plantilla de siempre para el resto. */
function filaEn(distrito: DistritoElegido, numRemision: string): Record<string, string> {
  const cambios: Record<string, string> = {
    provincia: elegido().provincia,
    canton_distrito: `${elegido().nombre} (${distrito.nombre})`,
    destinatario: "Destinatario SLT-89",
    telefono: "88887777",
    monto_cobrar: "15000",
    num_remision: numRemision,
  };
  return Object.fromEntries(ORDENES_BULK_FIELDS.map((f) => [f.key, cambios[f.key] ?? String(f.example ?? "")]));
}

/** La cotización de un distrito del cantón, con el servicio de la API v1, en el contexto de la empresa. */
async function cotizar(letra: Letra, distrito: DistritoElegido) {
  const e = de(letra);
  const cli = getPrismaClient();
  return conEmpresa(e.empresa.organizacionId, () =>
    new CotizacionOrdenService(
      new OrdenRepository(cli),
      new TarifaVigenteRepository(cli),
      new CatalogoGeograficoRepository(cli),
    ).cotizar(
      [{ provincia: elegido().provincia, canton: elegido().nombre, distrito: distrito.nombre }],
      { usuarioId: e.tienda.id, rol: "apiKey" },
    ),
  );
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(300_000);
  dueno = clienteDuenoLocal();
  const { canton: c, otros } = await elegirCanton(dueno);
  canton = c;

  const ctx = await browser.newContext();
  userAgent = await (await ctx.newPage()).evaluate(() => navigator.userAgent);
  await ctx.close();

  for (const [i, letra] of (["A", "B"] as const).entries()) {
    const sembrada = await sembrarEmpresa(dueno, letra, userAgent, [otros[i]]);
    const zona = await dueno.zona.findFirstOrThrow({
      where: { organizacionId: sembrada.empresa.organizacionId, nombre: sembrada.zonaNombre },
      select: { id: true },
    });
    await sembrarTarifa(dueno, sembrada.empresa.organizacionId, zona.id);
    const tienda = await crearUsuarioE2E(comoEmpresaE2E(sembrada.empresa), "adminTienda");
    empresas[letra] = { ...sembrada, zonaId: zona.id, tienda };

    const cm = await browser.newContext({ userAgent });
    const p = await cm.newPage();
    await p.goto("/login");
    await p.fill('input[type="email"]', sembrada.empresa.email);
    await p.fill('input[type="password"]', sembrada.empresa.password);
    await p.click('button[type="submit"]');
    await p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 120_000 });
    cookies[letra] = await cm.cookies();
    await cm.close();
  }
});

test.afterAll(async () => {
  await dueno?.$disconnect();
});

async function comoMaestro(browser: Browser, letra: Letra): Promise<Page> {
  const sesion = cookies[letra];
  expect(sesion?.length ?? 0, `no hay sesión de ${letra}: el login del beforeAll no dejó cookies`).toBeGreaterThan(0);
  const ctx = await browser.newContext({ userAgent });
  await ctx.addCookies(sesion ?? []);
  const page = await ctx.newPage();
  await page.goto("/configuracion/zonas", { waitUntil: "load", timeout: 180_000 });
  await expect(page.getByRole("heading", { level: 1, name: "Zonas" })).toBeVisible({ timeout: 60_000 });
  return page;
}

/** Abre la zona sembrada de la empresa en el formulario de edición. */
async function editarZona(page: Page, letra: Letra): Promise<void> {
  const fila = page.getByRole("listitem").filter({ hasText: de(letra).zonaNombre });
  await fila.getByRole("button", { name: "Editar" }).click();
  await expect(page.getByRole("heading", { name: "Editar zona" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("searchbox", { name: "Buscar en el catálogo geográfico" }).fill(elegido().nombre);
}

/** La casilla del cantón: «Seleccionar <nivel del país> <nombre>» (el nivel sale de `tipos`, R24). */
function casillaDelCanton(page: Page) {
  return page.getByRole("checkbox", { name: new RegExp(`^Seleccionar \\S+ ${elegido().nombre}(?:\\s|$)`) });
}

test("(1) A asigna el cantón entero: ve el aviso de impacto, confirma y queda en `zona_nodo`", async ({ browser }) => {
  test.setTimeout(300_000);
  const page = await comoMaestro(browser, "A");
  await editarZona(page, "A");

  const casilla = casillaDelCanton(page);
  await expect(casilla).toHaveCount(1);
  await casilla.click();
  // R25: sus distritos lo heredan, nombrando el cantón.
  await expect(page.getByText(new RegExp(`hereda de .* por ${elegido().nombre}`)).first()).toBeVisible();

  await page.getByRole("button", { name: "Guardar zona…" }).click();
  const modal = page.getByRole("dialog");
  await expect(modal.getByRole("region", { name: "Entran" })).toContainText(elegido().nombre);
  // R13: las cifras del servidor, y «Sí, guardar» solo cuando llegan.
  const ordenes = modal.getByRole("region", { name: "Órdenes pendientes" });
  await expect(ordenes).toContainText("cambian de zona", { timeout: 30_000 });
  await expect(ordenes).toContainText("cambian de tarifa");
  await expect(ordenes).toContainText("no se mueven aunque su zona cambiaría");
  const confirmar = modal.getByRole("button", { name: "Sí, guardar", exact: true });
  await expect(confirmar).toBeEnabled();
  await confirmar.click();

  await expect(page.getByText(/^Zona actualizada/)).toBeVisible({ timeout: 30_000 });
  await page.context().close();

  // Por detrás: el cantón es una asignación propia de la zona de A, y nada en la de B.
  const filas = await base().zonaNodo.findMany({
    where: { nodoGeograficoId: elegido().id },
    select: { zonaId: true, organizacionId: true },
  });
  expect(filas).toEqual([{ zonaId: de("A").zonaId, organizacionId: de("A").empresa.organizacionId }]);
});

test("(2) una orden nueva en un distrito del cantón sale con la zona de A y el precio de su tarifa", async ({ browser }) => {
  test.setTimeout(300_000);
  const distrito = elegido().distritos[0];
  const rem = `SLT89-A-${randomUUID().slice(0, 8)}`;

  const ctx = await browser.newContext();
  await ctx.addCookies(await sesionDe(browser, de("A").tienda));
  const page = await ctx.newPage();
  const r = await page.request.post("/api/ordenes/carga-masiva/chunk", { data: { rows: [filaEn(distrito, rem)], dryRun: false } });
  expect(r.status(), "A: la carga respondió otro estado").toBe(200);
  const resumen = (await r.json()) as BulkSummary;
  expect(resumen.creadas, `A: la orden no se creó: ${JSON.stringify(resumen.filas)}`).toBe(1);
  await ctx.close();

  const orden = await base().orden.findFirstOrThrow({
    where: { numRemision: rem },
    select: { zonaId: true, distritoId: true, organizacionId: true },
  });
  expect(orden).toEqual({ zonaId: de("A").zonaId, distritoId: distrito.id, organizacionId: de("A").empresa.organizacionId });

  // R41: el precio de ese distrito es el de la tarifa de la zona de A (flete + su IVA).
  const cot = await cotizar("A", distrito);
  expect(cot.status).toBe("ok");
  if (cot.status !== "ok") return;
  expect(cot.resumen.cotizadas).toBe(1);
  expect(cot.resumen.filas[0].costos.entregado.flete).toBe(FLETE);
  expect(cot.resumen.filas[0].costos.entregado.iva).toBe("260.00");
});

test("(3) B no ve la zona de A ni tiene cobertura en el cantón", async ({ browser }) => {
  test.setTimeout(300_000);
  const page = await comoMaestro(browser, "B");
  await expect(page.getByText(de("A").zonaNombre)).toHaveCount(0);
  await editarZona(page, "B");
  const casilla = casillaDelCanton(page);
  await expect(casilla).toHaveCount(1);
  // Para B el cantón está libre: su casilla se puede marcar y no dice ninguna zona.
  await expect(casilla).not.toHaveAttribute("aria-disabled", "true");
  await expect(page.getByText(`En ${de("A").zonaNombre}`)).toHaveCount(0);
  await expect(page.getByText(new RegExp(`hereda de ${de("A").zonaNombre}`))).toHaveCount(0);
  await page.context().close();

  // La misma fila, por la tienda de B: sin zona que cubra el distrito, no se crea.
  const distrito = elegido().distritos[1];
  const rem = `SLT89-B-${randomUUID().slice(0, 8)}`;
  const ctx = await browser.newContext();
  await ctx.addCookies(await sesionDe(browser, de("B").tienda));
  const tienda = await ctx.newPage();
  const r = await tienda.request.post("/api/ordenes/carga-masiva/chunk", { data: { rows: [filaEn(distrito, rem)], dryRun: false } });
  expect(r.status()).toBe(200);
  const resumen = (await r.json()) as BulkSummary;
  expect(resumen.creadas).toBe(0);
  expect(resumen.conError).toBe(1);
  await ctx.close();
  expect(await base().orden.count({ where: { numRemision: rem } })).toBe(0);

  // Y la cotización de B no encuentra cobertura (mismo error «sin zona» de siempre).
  const cot = await cotizar("B", distrito);
  expect(cot.status).toBe("ok");
  if (cot.status !== "ok") return;
  expect(cot.resumen.cotizadas).toBe(0);
  expect(cot.resumen.conError).toBe(1);
});
