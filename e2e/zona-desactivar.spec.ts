import { randomInt, randomUUID } from "node:crypto";

import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import type { PrismaClient } from "@prisma/client";

import { fijarEmpresa } from "../tests/fabricas/organizaciones";
import { clienteDuenoLocal, elegirDistritos, sembrarEmpresa, type EmpresaDeTarifas } from "./_zona-especial-fixture";

/**
 * SLT-225 «Desactivar zona: sacarla del trabajo nuevo sin borrar su historia» (R1759, R1760) — en
 * pantalla.
 *
 * Una empresa sembrada con la fixture de SL-38 (zona de bodega principal con un distrito) y, como
 * dueño, una zona satélite SIN distritos con un `adminSatelite` asignado. El maestro intenta
 * desactivarla y la confirmación nombra a ese usuario; le cambia la zona desde «Editar usuario»; la
 * desactiva, la ve «Desactivada» y la reactiva. Por detrás se comprueban la marca y el historial.
 *
 * CÓMO SE CORRE (solo en local; una base no local lo aborta antes de escribir): igual que
 * `zona-sin-distritos.spec.ts`. Sin siembra, el `beforeAll` lanza y el test FALLA.
 */

test.describe.configure({ mode: "serial" });

/** SINPE de prueba (ficticio, el mismo de `zonas-crear-sin-costos`): el repo es público. */
const SINPE_NUMERO = "80000000";
const SINPE_NOMBRE = "Titular de Prueba";

let dueno: PrismaClient | null = null;
let userAgent = "";
let empresa: EmpresaDeTarifas | null = null;
let sesion: Awaited<ReturnType<BrowserContext["cookies"]>> = [];
let satelite: { id: string; nombre: string } | null = null;
let usuario: { id: string; nombre: string } | null = null;

function base(): PrismaClient {
  if (!dueno) throw new Error("no hay cliente dueño: falló el beforeAll");
  return dueno;
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(240_000);
  dueno = clienteDuenoLocal();
  const distritos = await elegirDistritos(dueno);

  const ctx = await browser.newContext();
  userAgent = await (await ctx.newPage()).evaluate(() => navigator.userAgent);
  await ctx.close();

  empresa = await sembrarEmpresa(dueno, "A", userAgent, [distritos[0]]);

  // `adminSatelite`: pide zona pero no vehículo, así que «Editar usuario» guarda con solo cambiar la zona.
  const tipo = await dueno.tipoIdentificacion.findFirstOrThrow({
    where: { paisId: "CR", clave: "cedula_fisica" },
    select: { id: true },
  });
  const rol = await dueno.rol.findUniqueOrThrow({ where: { value: "adminSatelite" }, select: { id: true } });
  const sufijo = randomUUID().slice(0, 8);
  const nombreZona = `Kevin ${sufijo}`;
  const nombreUsuario = `Usuario zona ${sufijo}`;
  const cedula = `1${String(randomInt(0, 100_000_000)).padStart(8, "0")}`;
  const organizacionId = empresa.empresa.organizacionId;
  ({ satelite, usuario } = await dueno.$transaction(async (tx) => {
    await fijarEmpresa(tx, organizacionId);
    // Sin distritos: el único impedimento que queda es el usuario (R1743).
    const z = await tx.zona.create({
      data: {
        nombre: nombreZona,
        sinpeNumero: SINPE_NUMERO,
        sinpeNombre: SINPE_NOMBRE,
        esCentral: false,
        sinpeRevisadoAt: new Date(),
      },
      select: { id: true },
    });
    const u = await tx.usuario.create({
      data: {
        id: randomUUID(),
        nombre: nombreUsuario,
        email: `slt225-${sufijo}@example.test`,
        telefono: "88881111",
        passwordHash: "sin-acceso-e2e",
        estado: "activo",
        cedula,
        tipoIdentificacionId: tipo.id,
        rolId: rol.id,
        zonaId: z.id,
      },
      select: { id: true },
    });
    return { satelite: { id: z.id, nombre: nombreZona }, usuario: { id: u.id, nombre: nombreUsuario } };
  }));

  const c = await browser.newContext({ userAgent });
  const p = await c.newPage();
  await p.goto("/login");
  await p.fill('input[type="email"]', empresa.empresa.email);
  await p.fill('input[type="password"]', empresa.empresa.password);
  await p.click('button[type="submit"]');
  await p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 120_000 });
  sesion = await c.cookies();
  await c.close();
});

test.afterAll(async () => {
  await dueno?.$disconnect();
});

async function comoMaestro(browser: Browser): Promise<Page> {
  expect(sesion.length, "no hay sesión: el login del beforeAll no dejó cookies").toBeGreaterThan(0);
  const ctx = await browser.newContext({ userAgent });
  await ctx.addCookies(sesion);
  return ctx.newPage();
}

async function irAZonas(page: Page) {
  await page.goto("/configuracion/zonas", { waitUntil: "load", timeout: 180_000 });
  await expect(page.getByRole("heading", { level: 1, name: "Zonas" })).toBeVisible({ timeout: 60_000 });
}

test("R1759, R1760: el usuario asignado frena la desactivación; sin él, se desactiva y se reactiva", async ({ browser }) => {
  test.setTimeout(300_000);
  if (!empresa || !satelite || !usuario) throw new Error("no hay siembra: falló el beforeAll");
  const principal = empresa.zonaNombre;

  const page = await comoMaestro(browser);
  await irAZonas(page);
  const fila = page.getByRole("listitem").filter({ hasText: satelite.nombre });
  await expect(fila).toHaveCount(1);
  await expect(fila).not.toContainText("Desactivada");

  // 1) Intentar desactivar: la confirmación sigue abierta y nombra al usuario (R1760).
  await fila.getByRole("button", { name: "Desactivar" }).click();
  let dialogo = page.getByRole("dialog", { name: "Desactivar zona" });
  await expect(dialogo).toBeVisible({ timeout: 30_000 });
  await dialogo.getByRole("button", { name: "Desactivar" }).click();
  const alerta = dialogo.getByRole("alert");
  await expect(alerta).toContainText("Tiene 1 usuario asignado. Cámbiale la zona:", { timeout: 30_000 });
  await expect(alerta).toContainText(`${usuario.nombre} · Admin satélite · Activo`);
  await dialogo.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialogo).toHaveCount(0);

  // 2) Cambiarle la zona al usuario desde «Editar usuario».
  await page.goto("/configuracion", { waitUntil: "load", timeout: 180_000 });
  const filaUsuario = page.getByRole("row").filter({ hasText: usuario.nombre });
  await expect(filaUsuario).toHaveCount(1, { timeout: 60_000 });
  await filaUsuario.getByRole("button", { name: "Editar" }).click();
  const edicion = page.getByRole("dialog", { name: "Editar usuario" });
  await expect(edicion).toBeVisible({ timeout: 30_000 });
  const zona = edicion.getByRole("combobox", { name: "Zona" });
  await expect(zona).toContainText(satelite.nombre, { timeout: 30_000 });
  await zona.click();
  await page.getByRole("listbox").getByRole("option", { name: principal }).click();
  await edicion.getByRole("button", { name: "Guardar" }).click();
  // Es el único Admin satélite de la zona: la pantalla avisa (FICHA 379) y deja continuar.
  const aviso = page.getByRole("dialog", { name: `La zona ${satelite.nombre} se queda sin Admin satélite` });
  await expect(aviso).toBeVisible({ timeout: 30_000 });
  await aviso.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByText("Usuario actualizado", { exact: true })).toBeVisible({ timeout: 30_000 });

  // 3) Ahora sí se desactiva: aviso, marca y solo Reactivar/Eliminar (R1759).
  await irAZonas(page);
  await fila.getByRole("button", { name: "Desactivar" }).click();
  dialogo = page.getByRole("dialog", { name: "Desactivar zona" });
  await dialogo.getByRole("button", { name: "Desactivar" }).click();
  await expect(page.getByText("Zona desactivada", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(dialogo).toHaveCount(0);
  await expect(fila).toContainText("Desactivada", { timeout: 30_000 });
  await expect(fila.getByRole("button")).toHaveText(["Reactivar", "Eliminar"]);
  // Las activas van primero: la desactivada es la última fila.
  await expect(page.getByRole("listitem").last()).toContainText(satelite.nombre);

  // 4) Reactivarla.
  await fila.getByRole("button", { name: "Reactivar" }).click();
  dialogo = page.getByRole("dialog", { name: "Reactivar zona" });
  await dialogo.getByRole("button", { name: "Reactivar" }).click();
  await expect(page.getByText("Zona reactivada", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(fila).not.toContainText("Desactivada", { timeout: 30_000 });
  await expect(fila.getByRole("button")).toHaveText(["Editar", "Desactivar", "Eliminar"]);
  await page.context().close();

  // Por detrás: activa otra vez, el usuario en la principal y las dos filas del historial.
  const z = await base().zona.findUniqueOrThrow({ where: { id: satelite.id }, select: { activa: true } });
  expect(z.activa).toBe(true);
  const u = await base().usuario.findUniqueOrThrow({
    where: { id: usuario.id },
    select: { zona: { select: { nombre: true } } },
  });
  expect(u.zona?.nombre).toBe(principal);
  const filas = await base().historialAccion.findMany({
    where: { entidadId: satelite.id, accion: { in: ["zona_desactivada", "zona_reactivada"] } },
    select: { accion: true },
    orderBy: { createdAt: "asc" },
  });
  expect(filas.map((f) => f.accion)).toEqual(["zona_desactivada", "zona_reactivada"]);
});
