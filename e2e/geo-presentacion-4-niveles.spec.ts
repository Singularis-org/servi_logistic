import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";
import ExcelJS from "exceljs";

import { solicitarCierre } from "./_escenarios/cierres";
import { baseReparto, paginaDe, type GeoE2E, type MensajeroE2E, type OrdenE2E, type RepartoE2E } from "./_escenarios/reparto";
import { crearEmpresaE2E, crearUsuarioE2E } from "../tests/fabricas/e2e";
import { escenarioReparto } from "../tests/fabricas/escenarios/reparto";
import { fijarEmpresa } from "../tests/fabricas/organizaciones";

/**
 * E2E — Un país de 4 niveles en la descarga, la etiqueta y el cierre (SLT-125 T4.1; R43, design §10).
 *
 * El país `XB` tiene cuatro niveles: «Región», «Comuna», «Barrio» y «Sector». SLT-48 (R26, decisión
 * «Nivel 4 de la orden»): las dos órdenes están en un SECTOR (nivel 4), la hoja de su rama; hasta SLT-48
 * una orden no bajaba al 4 y estaban en un barrio. Se comprueba:
 *  1. la descarga de `/ordenes`: las cabeceras «Región», «Comuna», «Barrio» y «Sector» en el sitio de
 *     las tres de lugar de hoy, y en cada orden la ruta en las cuatro, «Sector» LLENA (R26);
 *  2. la etiqueta de guía de cada orden: la línea «zona / región / comuna / barrio / sector»;
 *  3. el cierre del día: el admin lee «zona · región · comuna · barrio · sector» en la fila de cada orden,
 *     y el `ubicacion_snapshot` de las dos filas de `cierre_detail` lleva los 4 niveles de la ruta del
 *     nodo (R27), con sus tipos y nombres.
 *
 * DATOS. Las órdenes NO salen de la carga masiva (eso lo prueba `carga-masiva-4-niveles.test.ts`, R46). Se
 * siembra así, con el cliente dueño del E2E:
 *  - el país `XB` por upsert: la base del E2E persiste entre corridas y el país se reutiliza. El trigger
 *    `pais_tipos_de_nivel` crea `nivel_1`..`nivel_3` desde la fila `pais`; `nivel_4` se inserta aparte
 *    (como `tests/integration/db/_fixtures/geo-47.ts`), también idempotente;
 *  - la geografía (una región, una comuna, dos barrios y un sector bajo el barrio central) en
 *    `nodo_geografico`, con sufijo aleatorio por corrida. SLT-48: `provincia`, `canton` y `distrito` son
 *    vistas de solo lectura sobre los nodos (design §9);
 *  - la empresa, sus zonas (una por barrio), la tienda y el mensajero por los servicios del escenario de
 *    reparto (`escenarioReparto`), con la empresa dada de alta en `XB` (`crearEmpresaE2E(…, { paisId })`);
 *  - las dos órdenes por SQL, en `en_preparacion`, con su nodo (el sector) y las 3 FK viejas en NULL
 *    (R15), y CON coordenadas: así la asignación las acepta sin pasar por la cola de geocodificación (no hay
 *    job que drenar para una orden que no entró por la carga). Desde ahí, guía, asignación, recogida,
 *    gestión y cierre van por los servicios reales (`llevarVariasA`, `gestionar`, `solicitarCierre`).
 */

const PAIS = "XB";
const TIPOS = ["Región", "Comuna", "Barrio", "Sector"] as const;
const EVIDENCIA = path.join(__dirname, "fixtures", "evidencia.jpg");

let evidenciaBytes: Uint8Array | undefined;

// El núcleo del escenario de reparto, como lo monta `./_escenarios/reparto.ts`, con dos diferencias:
// la empresa nace en `XB` y la asignación no drena la geocodificación (las órdenes ya tienen coordenadas).
const nucleo = escenarioReparto({
  lector: baseReparto,
  evidencia: () => (evidenciaBytes ??= new Uint8Array(fs.readFileSync(EVIDENCIA))),
  prepararAsignacion: async () => {},
  altas: {
    empresa: (etiqueta) => crearEmpresaE2E(etiqueta, { paisId: PAIS }),
    usuario: (empresa, _perfil, rol, extra) => crearUsuarioE2E(empresa, rol, extra),
  },
});

function sufijo(): string {
  return randomUUID().replace(/-/g, "").slice(0, 10);
}

/** El país `XB` de 4 niveles. Idempotente: reutiliza el de una corrida anterior y le fija los nombres. */
async function sembrarPais(): Promise<void> {
  const db = baseReparto();
  const niveles = {
    nivel1Singular: "Región",
    nivel1Plural: "Regiones",
    nivel2Singular: "Comuna",
    nivel2Plural: "Comunas",
    nivel3Singular: "Barrio",
    nivel3Plural: "Barrios",
  };
  await db.pais.upsert({
    where: { id: PAIS },
    create: { id: PAIS, nombre: "País de prueba XB", ...niveles },
    update: { ...niveles, disponible: true },
  });
  await db.$executeRawUnsafe(
    `INSERT INTO tipo_nivel_geografico (id, pais_id, clave, nombre_singular, nombre_plural)
     VALUES (gen_random_uuid()::text, $1, 'nivel_4', 'Sector', 'Sectores')
     ON CONFLICT (pais_id, clave) DO UPDATE
       SET nombre_singular = EXCLUDED.nombre_singular, nombre_plural = EXCLUDED.nombre_plural`,
    PAIS,
  );
}

/**
 * Un nodo de `XB` en `nodo_geografico`, con el tipo `nivel_<profundidad>` del país. `nombre_normalizado`
 * lo pone el trigger de invariantes (como `tests/fabricas/paises.ts > crearNodoDeNivel`).
 */
async function crearNodo(profundidad: 1 | 2 | 3 | 4, nombre: string, padreId: string | null): Promise<string> {
  const id = randomUUID();
  const filas = await baseReparto().$executeRawUnsafe(
    `INSERT INTO nodo_geografico (id, pais_id, tipo_id, padre_id, profundidad, nombre, nombre_normalizado, activo)
     SELECT $1, $2, t.id, $3, $4::int, $5, '', true
       FROM tipo_nivel_geografico t WHERE t.pais_id = $2 AND t.clave = 'nivel_' || $4::text`,
    id,
    PAIS,
    padreId,
    profundidad,
    nombre,
  );
  if (filas !== 1) throw new Error(`geo-presentacion-4-niveles: ${PAIS} no tiene el tipo nivel_${profundidad}`);
  return id;
}

/**
 * Una región, una comuna, dos barrios (uno por zona) y un sector bajo el barrio central, con nombres
 * únicos de esta corrida. La ruta de las órdenes es la del sector: los 4 niveles.
 */
async function sembrarGeografia(): Promise<{
  central: GeoE2E;
  satelite: GeoE2E;
  sectorId: string;
  ruta: [string, string, string, string];
}> {
  const s = sufijo();
  const region = `Región XB ${s}`;
  const comuna = `Comuna XB ${s}`;
  const regionId = await crearNodo(1, region, null);
  const comunaId = await crearNodo(2, comuna, regionId);
  const barrio = async (nombre: string): Promise<GeoE2E> => ({
    distritoId: await crearNodo(3, nombre, comunaId),
    provincia: region,
    canton: comuna,
    distrito: nombre,
  });
  const central = await barrio(`Barrio XB ${s}`);
  const satelite = await barrio(`Barrio satélite XB ${s}`);
  const sector = `Sector XB ${s}`;
  const sectorId = await crearNodo(4, sector, central.distritoId);
  return { central, satelite, sectorId, ruta: [region, comuna, central.distrito, sector] };
}

// SLT-48 (R15): la orden guarda solo su nodo; las 3 FK viejas quedan en NULL.
const INSERTAR_ORDEN = `INSERT INTO orden (id, num_remision, estatus_id, destinatario, telefono_dest, direccion, tienda_id,
    zona_id, nodo_geografico_id, producto, latitud, longitud, created_at, updated_at)
  VALUES ($1, $2, $3, $4, '88880000', '100 m norte de la iglesia', $5, $6, $7, 'Caja E2E',
    $8::numeric, $9::numeric, now(), now())`;

/** Dos órdenes de la tienda en el sector (nivel 4) de la zona central, `en_preparacion`, con coordenadas. */
async function sembrarOrdenes(r: RepartoE2E, sectorId: string): Promise<OrdenE2E[]> {
  const db = baseReparto();
  const estado = await db.orderStatus.findUniqueOrThrow({ where: { value: "en_preparacion" }, select: { id: true } });
  const ordenes: OrdenE2E[] = [];
  await db.$transaction(async (tx) => {
    await fijarEmpresa(tx, r.empresa.organizacionId);
    for (let i = 0; i < 2; i++) {
      const o: OrdenE2E = {
        id: randomUUID(),
        numRemision: `E2E-${sufijo()}`,
        destinatario: `Destinatario E2E ${sufijo()}`,
        montoCobrar: 0,
        zona: "central",
        numGuia: null,
      };
      await tx.$executeRawUnsafe(
        INSERTAR_ORDEN,
        o.id,
        o.numRemision,
        estado.id,
        o.destinatario,
        r.tienda.id,
        r.zonaCentral.id,
        sectorId,
        "-33.0245000",
        "-71.5518000",
      );
      ordenes.push(o);
    }
  });
  return ordenes;
}

/** Los valores de texto de la fila 1 (las cabeceras) de la hoja. */
function cabecerasDe(hoja: ExcelJS.Worksheet): string[] {
  const fila = hoja.getRow(1);
  const salida: string[] = [];
  for (let c = 1; c <= fila.cellCount; c++) salida.push(fila.getCell(c).text);
  return salida;
}

async function abrirOrdenes(page: Page, ordenes: readonly OrdenE2E[]): Promise<void> {
  await page.goto("/ordenes");
  const tabla = page.getByRole("table", { name: "Órdenes" });
  for (const o of ordenes) await expect(tabla.getByRole("row", { name: new RegExp(o.numRemision) })).toBeVisible();
}

let r: RepartoE2E;
let m: MensajeroE2E;
let ordenes: OrdenE2E[];
let ruta: [string, string, string, string];

test.describe.serial("Geografía de 4 niveles — descarga, etiqueta y cierre (R43)", () => {
  test.beforeAll(async () => {
    await sembrarPais();
    const geo = await sembrarGeografia();
    r = await nucleo.crearEscenarioReparto("geo-presentacion-4-niveles", {
      distritos: { central: geo.central, satelite: geo.satelite },
    });
    m = await nucleo.crearMensajero(r, "central");
    ruta = geo.ruta;
    const sembradas = await sembrarOrdenes(r, geo.sectorId);
    ordenes = await nucleo.llevarVariasA(r, sembradas, "mensajero_recogiendo_en_bodega", { mensajero: m });
  });

  test("1. la descarga de /ordenes lleva una columna por nivel, con «Sector» llena", async ({ browser }) => {
    const page = await paginaDe(browser, r.empresa.maestro);
    await abrirOrdenes(page, ordenes);

    const [descarga] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Descargar Órdenes", exact: true }).click(),
    ]);
    expect(descarga.suggestedFilename()).toMatch(/\.xlsx$/);
    const archivo = await descarga.path();
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.readFile(archivo);
    const hoja = libro.worksheets[0];

    // Las cuatro de lugar van donde hoy van las tres: entre «Zona» y «Monto a cobrar».
    const cabeceras = cabecerasDe(hoja);
    const zona = cabeceras.indexOf("Zona");
    expect(zona, "la descarga lleva la columna «Zona»").toBeGreaterThanOrEqual(0);
    expect(cabeceras.slice(zona + 1, zona + 6)).toEqual([...TIPOS, "Monto a cobrar"]);

    const remision = cabeceras.indexOf("Nº Remisión");
    for (const o of ordenes) {
      const filas: string[][] = [];
      hoja.eachRow((fila, n) => {
        if (n > 1 && fila.getCell(remision + 1).text === o.numRemision) {
          filas.push([1, 2, 3, 4].map((k) => fila.getCell(zona + 1 + k).text));
        }
      });
      // SLT-48 R26 (decisión «Nivel 4 de la orden»): la cuarta columna sale llena. Antes: `[[...ruta de 3, ""]]`.
      expect(filas, `la orden ${o.numRemision} sale una vez, con su ruta y «Sector» llena`).toEqual([[...ruta]]);
    }
  });

  test("2. la etiqueta de guía de cada orden lleva «zona / región / comuna / barrio / sector»", async ({ browser }) => {
    const page = await paginaDe(browser, r.empresa.maestro);
    await abrirOrdenes(page, ordenes);
    for (const o of ordenes) await page.getByRole("checkbox", { name: `Seleccionar orden ${o.numRemision}` }).check();
    await page.getByRole("button", { name: "Imprimir etiquetas", exact: true }).click();

    const dialogo = page.getByRole("dialog", { name: "Imprimir etiquetas" });
    await expect(dialogo).toBeVisible();
    // SLT-48 R26: la ruta llega al nivel del nodo (el sector). Antes, con la orden en el barrio, 3 niveles.
    const linea = [r.zonaCentral.nombre, ...ruta].join(" / ");
    for (const o of ordenes) {
      const etiqueta = dialogo.getByRole("article", { name: `Etiqueta de la orden ${o.numRemision}` });
      await expect(etiqueta.getByText(linea, { exact: true })).toBeVisible();
    }

    // El PDF se arma con la misma línea (`geografiaLegible`, `lib/pdf/etiquetas-dibujo.ts`).
    const [descarga] = await Promise.all([
      page.waitForEvent("download"),
      dialogo.getByRole("button", { name: "Descargar etiquetas" }).click(),
    ]);
    expect(descarga.suggestedFilename()).toMatch(/\.pdf$/);
    expect(await descarga.failure()).toBeNull();
  });

  test("3. el cierre muestra «zona · región · comuna · barrio · sector» y congela 4 niveles en el snapshot", async ({ browser }) => {
    ordenes = await nucleo.llevarVariasA(r, ordenes, "en_reparto", { mensajero: m });
    for (const o of ordenes) await nucleo.gestionar(r, o, m, { resultado: "entregado" });
    const cierreId = await solicitarCierre(r, m);

    const page = await paginaDe(browser, r.empresa.maestro);
    await page.goto("/cierres-admin");
    const pendientes = page.getByRole("region", { name: "Pendientes de decisión" });
    const comprobante = pendientes.getByRole("region", { name: `Comprobante del cierre de ${m.nombre}` });
    await comprobante.getByRole("button", { name: "Ver / decidir" }).click();
    const detalle = page.getByRole("dialog", { name: "Detalle del cierre" });
    await expect(detalle).toBeVisible();

    const filas = detalle.getByRole("region", { name: "Órdenes del cierre" });
    for (const o of ordenes) {
      await filas.getByRole("button", { name: new RegExp(o.numRemision), expanded: false }).click();
    }
    const ubicacion = [r.zonaCentral.nombre, ...ruta].join(" · ");
    await expect(filas.getByText(ubicacion, { exact: true })).toHaveCount(ordenes.length);

    // El snapshot de cada fila: los niveles de la ruta del nodo, con el tipo de cada uno en el país y su
    // nombre. SLT-48 R26, R27: la orden está en el nivel 4, así que son 4. Antes, 3 (la orden en el barrio).
    const detalles = await baseReparto().cierreDetail.findMany({
      where: { cierreId },
      select: { ordenId: true, ubicacionSnapshot: true },
    });
    expect(detalles.map((d) => d.ordenId).sort()).toEqual(ordenes.map((o) => o.id).sort());
    for (const d of detalles) {
      const snapshot = d.ubicacionSnapshot as { v?: unknown; niveles?: { profundidad: number; tipo: string; nombre: string }[] } | null;
      expect(snapshot?.v, `la fila de la orden ${d.ordenId} tiene snapshot v1`).toBe(1);
      expect(snapshot?.niveles?.map(({ profundidad, tipo, nombre }) => ({ profundidad, tipo, nombre }))).toEqual([
        { profundidad: 1, tipo: TIPOS[0], nombre: ruta[0] },
        { profundidad: 2, tipo: TIPOS[1], nombre: ruta[1] },
        { profundidad: 3, tipo: TIPOS[2], nombre: ruta[2] },
        { profundidad: 4, tipo: TIPOS[3], nombre: ruta[3] },
      ]);
    }
  });
});
