import type { ModuloApagable, PrismaClient, RolValue } from "@prisma/client";

import { comoPlataforma, conEmpresa } from "../../lib/db/contexto-empresa";
import { getPrismaClient } from "../../lib/db/prisma-client";
import { ORDEN_MODULOS } from "../../lib/modulos/catalogo";
import { CierreBodegaRepository } from "../../lib/repositories/CierreBodegaRepository";
import { OrganizacionRepository } from "../../lib/repositories/OrganizacionRepository";
import { SessionRepository } from "../../lib/repositories/SessionRepository";
import { UserRepository } from "../../lib/repositories/UserRepository";
import { VehiculoRepository } from "../../lib/repositories/VehiculoRepository";
import { ZonaRepository } from "../../lib/repositories/ZonaRepository";
import { OrganizacionService } from "../../lib/services/OrganizacionService";
import { UsuarioService } from "../../lib/services/UsuarioService";
import { VEHICULOS_SEED } from "../../lib/types/vehiculos";
import { hashPassword } from "../../lib/utils/password";

// SL-43 T4 (design D1.2; R11, R12) — el alta de una empresa y de sus usuarios, sin decidir los
// datos ni la base. Es el cuerpo que tenía `tests/fabricas/e2e.ts` (SL-44), con el cliente dueño y
// los datos como parámetros: el E2E pone correos aleatorios y su base local; la demo de QA
// (`scripts/demo-qa/`), sus correos fijos y su base. No lee `process.env` ni importa Playwright.
//
// Los servicios se montan con `getPrismaClient()`, como en su Server Action. El cliente dueño
// (`base`) solo lee catálogos y hace la única escritura directa de `design.md > D5.3`: la
// contraseña del maestro. `altaEmpresa` le pone a propósito una que nadie conoce y el único camino
// de la app para fijarla es el correo de bienvenida o «recuperar contraseña»; se fija con
// `hashPassword`, el hasher del login.

/** El tipo de identificación con el que se da de alta a todos. */
export const TIPO_IDENTIFICACION = "cedula";

/** El teléfono de todas las altas: cumple el formato y no es de nadie. */
const TELEFONO = "88880000";

export interface UsuarioCreado {
  id: string;
  email: string;
  password: string;
  nombre: string;
}

export interface EmpresaCreada {
  organizacionId: string;
  maestro: UsuarioCreado;
  slug: string;
}

export interface DatosEmpresa {
  nombre: string;
  slug: string;
  correoMaestro: string;
  /** Tiene que cumplir `strongPasswordSchema`: el login la compara tal cual. */
  contrasena: string;
  /** Por defecto, «Maestro <nombre>». */
  nombreMaestro?: string;
  /** Único global (`usuario.cedula`). Por defecto, el slug. */
  documentoMaestro?: string;
  /**
   * Escribe también `usuario.contrasena_definida_at` (D5.3): la empresa deja de salir con la
   * bienvenida pendiente en la pantalla del superadmin. Por defecto no, como hacía el E2E.
   */
  marcarContrasenaDefinida?: boolean;
  /**
   * SL-23 (design §10) — los módulos que nacen encendidos. Por defecto `"todos"`: el alta de la app
   * deja la empresa solo con el núcleo, y los E2E y la demo de QA recorren pantallas de módulos.
   * `[]` deja la empresa como la crea la app.
   */
  modulos?: "todos" | readonly ModuloApagable[];
}

/** Con qué ficha y motivo corre el alta en `comoPlataforma`. */
export interface ContextoPlataforma {
  ficha: `SL-${number}`;
  motivo: string;
}

/** Alta de una empresa por el servicio del superadmin, y su maestro listo para entrar. */
export async function crearEmpresa(
  base: PrismaClient,
  datos: DatosEmpresa,
  plataforma: ContextoPlataforma = { ficha: "SL-43", motivo: "fábrica: alta de empresa" },
): Promise<EmpresaCreada> {
  const nombreMaestro = datos.nombreMaestro ?? `Maestro ${datos.nombre}`;
  const servicio = new OrganizacionService(new OrganizacionRepository(getPrismaClient()));
  const resultado = await comoPlataforma(plataforma.ficha, plataforma.motivo, () =>
    servicio.altaEmpresa({
      nombre: datos.nombre,
      slug: datos.slug,
      maestro: {
        nombre: nombreMaestro,
        email: datos.correoMaestro,
        telefono: TELEFONO,
        documento: datos.documentoMaestro ?? datos.slug,
        tipoDocumento: TIPO_IDENTIFICACION,
      },
    }),
  );
  if (resultado.estado !== "creada") {
    throw new Error(`fábrica: el alta de la empresa «${datos.slug}» no la creó: ${JSON.stringify(resultado)}`);
  }
  // SL-23 (design §10): como dueño y sin historial. Es una fábrica, no el superadmin encendiendo.
  const modulos = datos.modulos === undefined || datos.modulos === "todos" ? ORDEN_MODULOS : datos.modulos;
  if (modulos.length > 0) {
    await base.organizacionModulo.createMany({
      data: modulos.map((modulo) => ({ organizacionId: resultado.organizacionId, modulo })),
    });
  }
  // La escritura directa de D5.3 (cabecera).
  await base.usuario.update({
    where: { id: resultado.maestroId },
    data: {
      passwordHash: await hashPassword(datos.contrasena),
      ...(datos.marcarContrasenaDefinida ? { contrasenaDefinidaAt: new Date() } : {}),
    },
  });
  return {
    organizacionId: resultado.organizacionId,
    slug: datos.slug,
    maestro: { id: resultado.maestroId, email: datos.correoMaestro, password: datos.contrasena, nombre: nombreMaestro },
  };
}

/** El mismo servicio que construye `lib/actions/usuarios.ts`. */
function servicioDeUsuarios(): UsuarioService {
  const prisma = getPrismaClient();
  return new UsuarioService(
    new UserRepository(prisma),
    new ZonaRepository(prisma),
    new VehiculoRepository(prisma),
    new SessionRepository(prisma),
    new CierreBodegaRepository(prisma),
  );
}

export interface DatosUsuario {
  /** En minúsculas: `usuario.email` es único tal cual y el login no normaliza. */
  correo: string;
  /** Tiene que cumplir `strongPasswordSchema`. */
  contrasena: string;
  /** Por defecto, «<rol> <parte local del correo>». */
  nombre?: string;
  /** Único global (`usuario.cedula`). Por defecto, la parte local del correo. */
  cedula?: string;
  zonaId?: string;
  vehiculoId?: string;
  fulfillment?: boolean;
}

/**
 * Un usuario de la empresa, dado de alta por su maestro con el servicio de la pantalla «Usuarios».
 * `zonaId` es obligatoria para `mensajero` y `adminSatelite` (la exige el servicio). No hay
 * `tiendaId`: el `adminTienda` ES la tienda (las órdenes y tarifas apuntan a su `usuario.id`).
 * El servicio exige vehículo al `mensajero`: sin `vehiculoId`, va el primero del catálogo sembrado.
 * `fulfillment` (solo `adminTienda`, lo restringe el servicio): la tienda con bodega propia, cuyas
 * órdenes nacen en `en_preparacion`, sin guía (`resolverDestinoCreacion`). Sin él, nacen en
 * `por_recolectar_en_tienda`, con guía.
 */
export async function crearUsuario(
  base: PrismaClient,
  empresa: EmpresaCreada,
  rol: RolValue,
  datos: DatosUsuario,
): Promise<UsuarioCreado> {
  const [rolFila, tipo, vehiculo] = await Promise.all([
    base.rol.findUnique({ where: { value: rol }, select: { id: true } }),
    base.tipoIdentificacion.findUnique({ where: { value: TIPO_IDENTIFICACION }, select: { id: true } }),
    base.vehiculo.findUnique({ where: { name: VEHICULOS_SEED[0] }, select: { id: true } }),
  ]);
  if (!rolFila || !tipo || !vehiculo) {
    throw new Error(`fábrica: falta el rol «${rol}», el tipo de identificación o el vehículo (corre \`pnpm run db:seed\`).`);
  }
  const local = datos.correo.split("@")[0];
  const vehiculoId = datos.vehiculoId ?? (rol === "mensajero" ? vehiculo.id : undefined);
  const nombre = datos.nombre ?? `${rol} ${local}`;
  const actor = { usuarioId: empresa.maestro.id, rol: "maestro" as const, zonaId: null, organizacionId: empresa.organizacionId };
  // El servicio hashea la contraseña con `hashPassword`, el hasher del login.
  const r = await conEmpresa(empresa.organizacionId, () =>
    servicioDeUsuarios().crear(
      {
        nombre,
        email: datos.correo,
        telefono: TELEFONO,
        tipoIdentificacionId: tipo.id,
        cedula: datos.cedula ?? local,
        rolId: rolFila.id,
        ...(datos.zonaId ? { zonaId: datos.zonaId } : {}),
        ...(vehiculoId ? { vehiculoId } : {}),
        ...(datos.fulfillment !== undefined ? { fulfillment: datos.fulfillment } : {}),
        passwordMode: "manual",
        password: datos.contrasena,
      },
      actor,
    ),
  );
  if (r.status !== "ok") {
    throw new Error(`fábrica: el alta del usuario «${rol}» falló: ${JSON.stringify(r)}`);
  }
  return { id: r.usuario.id, email: datos.correo, password: datos.contrasena, nombre };
}
