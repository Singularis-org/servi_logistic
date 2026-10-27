import crypto, { randomUUID } from "node:crypto";
import fs from "node:fs";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type RolValue } from "@prisma/client";

import { itemsVisibles, SIDEBAR_ITEMS } from "../lib/auth/menu-visibility";
import { comoPlataforma } from "../lib/db/contexto-empresa";
import { getPrismaClient } from "../lib/db/prisma-client";
import { OrganizacionRepository } from "../lib/repositories/OrganizacionRepository";
import { OrganizacionService } from "../lib/services/OrganizacionService";
import type { AltaEmpresaResultado } from "../lib/types/organizacion";
import { computeDeviceHash } from "../lib/utils/device";
import { hashPassword } from "../lib/utils/password";
import { fijarEmpresa } from "../tests/fabricas/organizaciones";

// SL-17 T4.2 (design §9.3, D19, R47) — lo que los E2E de dos empresas necesitan antes de abrir el
// navegador: la base local, el alta de A y B por el servicio (la usan SL-38, SL-39 y SL-40; el
// humo da de alta por la pantalla desde SL-44 D16), los datos marcados de cada empresa, la lista
// de rutas del menú del maestro y el log del servidor. El correo real del maestro, el SMTP y la
// recuperación por el servicio se retiraron con D16 (SL-44): el primer acceso del humo va por la
// pantalla con el OTP del log.

/** Proyectos remotos que este spec nunca debe tocar: aborta antes de escribir (como `marca.spec.ts`). */
const BASES_PROHIBIDAS = { literal: ["supabase"], sha256DeRef: ["5a90bb618312dada235c0abc72c00d6df493b266880f9531c1688ea1d39f2d87", "ff8fbc8104b321044f1c597d4cb267c53a9ee99aa68f6835dd04aaec24a75d82"] }; // SL-34: los dos ids, por sha256 de 20 caracteres

/** El teléfono SINPE de la zona sembrada: un número de prueba válido para el `CHECK` de `zona`. */
export const SINPE_DE_PRUEBA = "80000000";

export type Letra = "A" | "B";

/** Cualquier marcador de una empresa, de esta corrida o de otra anterior: `A-<uuid>`. */
export function patronDeMarcador(letra: Letra): RegExp {
  return new RegExp(`${letra}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}`, "g");
}

export function urlDeBase(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("SL-17 T4.2: falta DATABASE_URL. Hace falta una base local migrada y con catálogos.");
  }
  const minus = url.toLowerCase(), prohibida = BASES_PROHIBIDAS.literal.some((p) => minus.includes(p)) || Array.from({ length: Math.max(0, minus.length - 19) }, (_, i) => minus.slice(i, i + 20)).some((t) => BASES_PROHIBIDAS.sha256DeRef.includes(crypto.createHash("sha256").update(t).digest("hex")));
  if (prohibida) {
    throw new Error("SL-17 T4.2: DATABASE_URL apunta a una base remota prohibida. Aborta antes de escribir.");
  }
  return url;
}

/** Cliente dueño, sin la extensión: siembra con `fijarEmpresa` y comprueba la base por detrás. */
export function clienteDueno(): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: urlDeBase(), max: 2 }) });
}

/**
 * Las rutas del menú REAL del maestro: lo que `itemsVisibles` le deja ver, con los subítems de
 * cada desplegable (un padre con hijos no navega). Nada escrito a mano: si SL-32 quita una ruta
 * del menú, el humo deja de visitarla.
 */
export function rutasDelMenuDelMaestro(): string[] {
  const visibles = itemsVisibles(SIDEBAR_ITEMS, { usuarioId: "humo-dos-empresas", rol: "maestro" });
  const rutas = visibles.flatMap((item) =>
    item.children && item.children.length > 0 ? item.children.map((c) => c.href) : [item.href],
  );
  return Array.from(new Set(rutas));
}

/* -------------------------------------------------------------------------- */
/* Alta y primer acceso                                                        */
/* -------------------------------------------------------------------------- */

export interface Empresa {
  letra: Letra;
  organizacionId: string;
  maestroId: string;
  email: string;
  password: string;
  slug: string;
}

export interface AltaDeEmpresa {
  empresa: Empresa;
  resultado: AltaEmpresaResultado;
  repeticion: AltaEmpresaResultado;
}

function sufijo(): string {
  return randomUUID().replace(/-/g, "").slice(0, 12);
}

function servicioDeAlta(): OrganizacionService {
  return new OrganizacionService(new OrganizacionRepository(getPrismaClient()));
}

/** Alta por el servicio, como lo hará la action del superadmin, y la repetición idempotente (R45). */
export async function altaDeEmpresa(letra: Letra, email: string): Promise<AltaDeEmpresa> {
  const s = sufijo();
  const input = {
    nombre: `Empresa humo ${letra} ${s}`,
    slug: `humo-${letra.toLowerCase()}-${s}`,
    // SL-20 (R6): el país es obligatorio en el alta; el humo vive en Costa Rica.
    paisId: "CR",
    maestro: {
      nombre: `Maestro ${letra} humo`,
      email,
      telefono: "88880000",
      documento: `humo-${letra}-${s}`,
      tipoDocumento: "cedula",
    },
  };
  const servicio = servicioDeAlta();
  const resultado = await comoPlataforma("SL-17", "humo de dos empresas: alta", () => servicio.altaEmpresa(input));
  const repeticion = await comoPlataforma("SL-17", "humo de dos empresas: alta repetida", () =>
    servicio.altaEmpresa(input),
  );
  if (resultado.estado !== "creada") {
    throw new Error(`SL-17 T4.2: el alta de ${letra} no creó la empresa: ${JSON.stringify(resultado)}`);
  }
  return {
    empresa: {
      letra,
      organizacionId: resultado.organizacionId,
      maestroId: resultado.maestroId,
      email,
      password: crypto.randomBytes(18).toString("base64url"),
      slug: input.slug,
    },
    resultado,
    repeticion,
  };
}

/**
 * Para los E2E que no prueban el primer acceso (SL-38, SL-39, SL-40): la contraseña la fija aquí,
 * con el hasher del login, y el dispositivo del navegador queda confiado para que el login no pida
 * OTP (técnica de `marca.spec.ts`). El humo entra por la pantalla (SL-44 D16).
 */
export async function prepararAcceso(dueno: PrismaClient, e: Empresa, userAgent: string): Promise<void> {
  await dueno.usuario.update({
    where: { id: e.maestroId },
    data: { passwordHash: await hashPassword(e.password) },
  });
  await dueno.trustedDevice.create({
    data: { usuarioId: e.maestroId, deviceHash: computeDeviceHash(userAgent), ipAddress: "127.0.0.1" },
  });
}

/* -------------------------------------------------------------------------- */
/* Datos marcados                                                              */
/* -------------------------------------------------------------------------- */

/** Los marcadores de una empresa, uno por dato con texto visible. */
export interface Marcadores {
  zona: string;
  tienda: string;
  mensajero: string;
  orden: string;
  apiKey: string;
  webhook: string;
  plantilla: string;
}

export interface DatosSembrados {
  marcadores: Marcadores;
  zonaId: string;
  tiendaId: string;
  mensajeroId: string;
  ordenId: string;
  numGuia: number;
}

/**
 * Lo mínimo para que cada pantalla del maestro tenga algo que enseñar (design §9.3, punto 2), en una
 * transacción con la empresa fijada: el `DEFAULT` de `organizacion_id` y los triggers de misma
 * empresa trabajan como con la app. El movimiento de wallet, el cierre y la tarifa no tienen texto
 * libre: se ven a través de la tienda, el mensajero y la zona, que sí llevan marcador.
 */
export async function sembrarDatos(dueno: PrismaClient, e: Empresa): Promise<DatosSembrados> {
  const m = (): string => `${e.letra}-${randomUUID()}`;
  const marcadores: Marcadores = {
    zona: m(),
    tienda: m(),
    mensajero: m(),
    orden: m(),
    apiKey: m(),
    webhook: m(),
    plantilla: m(),
  };

  return dueno.$transaction(async (tx) => {
    await fijarEmpresa(tx, e.organizacionId);

    const roles = await tx.rol.findMany({ select: { id: true, value: true } });
    const rolId = (v: RolValue): string => {
      const r = roles.find((x) => x.value === v);
      if (!r) throw new Error(`SL-17 T4.2: falta el rol «${v}»: corre \`pnpm run db:seed\``);
      return r.id;
    };
    const tipo = await tx.tipoIdentificacion.findUnique({ where: { value: "cedula" }, select: { id: true } });
    const estatus = await tx.orderStatus.findUnique({ where: { value: "en_preparacion" }, select: { id: true } });
    const canton = await tx.canton.findFirst({
      where: { nombre: "Cartago", provincia: { nombre: "Cartago" } },
      select: { id: true, provinciaId: true },
    });
    if (!tipo || !estatus || !canton) {
      throw new Error("SL-17 T4.2: faltan catálogos o geografía (¿base sin migrar o sin `pnpm run db:seed`?)");
    }

    const zona = await tx.zona.create({
      // `sinpeRevisadoAt`: sin él, cada pantalla abre el modal «Confirmá el SINPE» y tapa los clics.
      data: { nombre: marcadores.zona, sinpeNumero: SINPE_DE_PRUEBA, sinpeNombre: "Titular Humo", esCentral: true, sinpeRevisadoAt: new Date() },
      select: { id: true },
    });

    const persona = (nombre: string, rol: RolValue, extra: { zonaId?: string } = {}) => {
      const s = sufijo();
      return tx.usuario.create({
        data: {
          nombre,
          primerApellido: "Humo",
          email: `humo-${rol.toLowerCase()}-${s}@example.test`,
          telefono: "88880000",
          passwordHash: "x",
          cedula: `humo-${s}`,
          tipoIdentificacionId: tipo.id,
          rolId: rolId(rol),
          estado: "activo",
          organizacionId: e.organizacionId,
          ...extra,
        },
        select: { id: true },
      });
    };
    const tienda = await persona(marcadores.tienda, "adminTienda");
    const mensajero = await persona(marcadores.mensajero, "mensajero", { zonaId: zona.id });
    const maquina = await persona(marcadores.apiKey, "apiKey");

    const [{ n }] = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('orden_num_guia_seq') AS n`;
    const numGuia = Number(n);
    const orden = await tx.orden.create({
      data: {
        numGuia,
        numRemision: marcadores.orden,
        estatusId: estatus.id,
        destinatario: marcadores.orden,
        telefonoDest: "88881111",
        tiendaId: tienda.id,
        zonaId: zona.id,
        provinciaId: canton.provinciaId,
        cantonId: canton.id,
        producto: `Producto ${marcadores.orden}`,
        montoCobrar: 15000,
        mensajeroAsignadoId: mensajero.id,
        asignadoAt: new Date(),
        fechaReparto: new Date(),
      },
      select: { id: true },
    });

    await tx.walletMovimiento.create({
      data: {
        tipo: "ingreso",
        categoria: "ingreso_ajuste",
        monto: 1234.5,
        origenTipo: "manual",
        registradoPor: e.maestroId,
      },
    });

    await tx.cierreDia.create({
      data: {
        mensajeroId: mensajero.id,
        destinoTipo: "bodega_central",
        destinoZonaId: zona.id,
        totalEfectivo: 15000,
        totalGeneral: 15000,
      },
    });

    await tx.tarifa.create({
      data: {
        zonaId: zona.id,
        tiendaId: tienda.id,
        valorFlete: 2500,
        valorFleteDevuelto: 1500,
        valorFleteGam: 2000,
        valorFleteDevueltoGam: 1200,
        comisionCod: 2,
        ivaFlete: 13,
        ivaComisionCod: 13,
      },
    });

    await tx.apiKey.create({
      data: {
        identificador: marcadores.apiKey,
        slug: `humo-${e.letra.toLowerCase()}-${sufijo()}`,
        keyPrefix: `sl_${sufijo().slice(0, 8)}`,
        keyHash: crypto.randomBytes(32).toString("hex"),
        usuarioId: maquina.id,
        tiendaDestinoId: tienda.id,
        createdById: e.maestroId,
      },
    });
    await tx.webhookSuscripcion.create({
      data: {
        // Con tienda destino, el dueño del webhook es la tienda (`resolverOwnerApiKey`).
        ownerUsuarioId: tienda.id,
        url: `https://example.test/webhook/${marcadores.webhook}`,
        secret: crypto.randomBytes(24).toString("hex"),
      },
    });

    await tx.plantillaMensaje.create({
      data: {
        nombre: marcadores.plantilla,
        cuerpo: `Hola, ${marcadores.plantilla}`,
        estado: "activo",
        createdBy: e.maestroId,
      },
    });

    return {
      marcadores,
      zonaId: zona.id,
      tiendaId: tienda.id,
      mensajeroId: mensajero.id,
      ordenId: orden.id,
      numGuia,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Log del servidor                                                            */
/* -------------------------------------------------------------------------- */

/**
 * El stdout/stderr del servidor de la app, que `e2e/_servidor-app.mjs` escribe en el archivo de
 * `E2E_LOG_SERVIDOR` (SL-44 D3; lo fija `playwright.config.ts`). De ahí salen los OTP (R15) y la
 * prueba de que no hubo `EmpresaNoResuelta`. Sin él, FALLA.
 */
export class LogDelServidor {
  private desde = 0;
  constructor(private readonly ruta: string) {}

  static desdeEntorno(): LogDelServidor {
    const ruta = process.env.E2E_LOG_SERVIDOR;
    if (!ruta || !fs.existsSync(ruta)) {
      throw new Error(
        "SL-44 D3: falta el log del servidor (E2E_LOG_SERVIDOR sin definir o sin archivo). Lo crea e2e/_servidor-app.mjs al arrancar desde el webServer de Playwright; sin él no hay OTP ni se ve EmpresaNoResuelta.",
      );
    }
    const log = new LogDelServidor(ruta);
    log.desde = fs.statSync(ruta).size;
    return log;
  }

  /** Lo que el servidor escribió desde la última lectura. */
  nuevo(): string {
    const tam = fs.statSync(this.ruta).size;
    if (tam <= this.desde) return "";
    const fd = fs.openSync(this.ruta, "r");
    try {
      const buf = Buffer.alloc(tam - this.desde);
      fs.readSync(fd, buf, 0, buf.length, this.desde);
      this.desde = tam;
      return buf.toString("utf8");
    } finally {
      fs.closeSync(fd);
    }
  }
}
