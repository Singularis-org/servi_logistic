import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@prisma/client";

import { conEmpresa } from "../lib/db/contexto-empresa";
import { getPrismaClient } from "../lib/db/prisma-client";
import { OrdenRepository } from "../lib/repositories/OrdenRepository";
import { TarifaVigenteRepository } from "../lib/repositories/TarifaVigenteRepository";
import { ZonaRepository } from "../lib/repositories/ZonaRepository";
import { BulkOrdenService } from "../lib/services/BulkOrdenService";
import { ZonaService } from "../lib/services/ZonaService";
import { crearZonaSchema } from "../lib/types/zona";
import type { EmpresaE2E, UsuarioE2E } from "../tests/fabricas/e2e";

import { SINPE_DE_PRUEBA } from "./_dos-empresas-fixture";

// SL-44 T4.3 (D4; R7, R8) — lo que `rastreo-publico` y `analitica-roles` necesitan además de la
// empresa y sus usuarios: una zona y una orden con guía. Las dos por el servicio que las crea en la
// app (`ZonaService.crear`, el de la pantalla «Zonas»; `BulkOrdenService.cargarMasiva`, el de la
// carga masiva de la tienda), con la empresa fijada por `conEmpresa`. Nada se escribe a mano.

/** La geografía de la zona: los nombres son los que la carga masiva resuelve. */
export interface GeoE2E {
  distritoId: string;
  provincia: string;
  canton: string;
  distrito: string;
}

export interface ZonaE2E {
  id: string;
  nombre: string;
  geo: GeoE2E;
}

function sufijo(): string {
  return randomUUID().replace(/-/g, "").slice(0, 10);
}

/**
 * Un distrito que la plantilla de carga puede nombrar sin ambigüedad: sin paréntesis en su nombre
 * ni en el de su cantón (el formato de `canton_distrito` es `Cantón (Distrito)`). La cobertura es
 * por empresa, así que no hace falta que esté libre en otras.
 */
async function distritoDeCatalogo(db: PrismaClient): Promise<GeoE2E> {
  const d = await db.distrito.findFirst({
    where: {
      activo: true,
      NOT: [{ nombre: { contains: "(" } }, { canton: { nombre: { contains: "(" } } }],
      canton: { activo: true, provincia: { activo: true } },
    },
    select: { id: true, nombre: true, canton: { select: { nombre: true, provincia: { select: { nombre: true } } } } },
    orderBy: { id: "asc" },
  });
  if (!d) throw new Error("SL-44 E2E: no hay distritos en el catálogo (¿base sin migrar?).");
  return { distritoId: d.id, provincia: d.canton.provincia.nombre, canton: d.canton.nombre, distrito: d.nombre };
}

/**
 * Una zona de la empresa con un distrito, dada de alta por su maestro. Central por defecto; un
 * `adminSatelite` va en una satélite (`esCentral: false`).
 */
export async function crearZonaE2E(
  db: PrismaClient,
  e: EmpresaE2E,
  opciones: { esCentral?: boolean } = {},
): Promise<ZonaE2E> {
  const geo = await distritoDeCatalogo(db);
  const nombre = `Zona E2E ${sufijo()}`;
  // El mismo esquema del borde que la action: pone los `default` que el servicio espera.
  const input = crearZonaSchema.parse({
    nombre,
    cobroVehiculo: false,
    distritoIds: [geo.distritoId],
    esCentral: opciones.esCentral ?? true,
    sinpeNumero: SINPE_DE_PRUEBA,
    sinpeNombre: "Titular E2E",
  });
  const servicio = new ZonaService(new ZonaRepository(getPrismaClient()));
  const r = await conEmpresa(e.organizacionId, () =>
    servicio.crear(input, { usuarioId: e.maestro.id, rol: "maestro" }),
  );
  if (r.status !== "ok") throw new Error(`SL-44 E2E: el alta de la zona falló: ${JSON.stringify(r)}`);
  return { id: r.zona.id, nombre, geo };
}

export interface OrdenE2E {
  id: string;
  numGuia: number;
  telefono: string;
}

/**
 * Una orden de la tienda, por la carga masiva (la vía de sesión de `adminTienda`). Una tienda sin
 * bodega propia la crea con guía y con su primera fila de historial, que es lo que el rastreo
 * público enseña.
 */
export async function crearOrdenE2E(
  db: PrismaClient,
  e: EmpresaE2E,
  tienda: UsuarioE2E,
  zona: ZonaE2E,
  telefono: string,
): Promise<OrdenE2E> {
  const numRemision = `E2E-${sufijo()}`;
  const servicio = new BulkOrdenService(new OrdenRepository(getPrismaClient()), new TarifaVigenteRepository(getPrismaClient()));
  const r = await conEmpresa(e.organizacionId, () =>
    servicio.cargarMasiva(
      [
        {
          num_remision: numRemision,
          destinatario: `Destinatario E2E ${sufijo()}`,
          telefono,
          producto: "Caja E2E",
          provincia: zona.geo.provincia,
          canton_distrito: `${zona.geo.canton} (${zona.geo.distrito})`,
          direccion: "",
          notas: "",
          monto_cobrar: "",
        },
      ],
      { usuarioId: tienda.id, rol: "adminTienda" },
    ),
  );
  if (r.status !== "ok" || r.summary.creadas !== 1) {
    throw new Error(`SL-44 E2E: la carga de la orden no la creó: ${JSON.stringify(r)}`);
  }
  const orden = await db.orden.findFirst({
    where: { numRemision, organizacionId: e.organizacionId },
    select: { id: true, numGuia: true },
  });
  if (!orden?.numGuia) throw new Error("SL-44 E2E: la orden cargada no tiene guía (¿tienda con bodega propia?).");
  return { id: orden.id, numGuia: orden.numGuia, telefono };
}
