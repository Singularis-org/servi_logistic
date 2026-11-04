import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { ROLES_SEED } from "@/lib/types/roles";
import { CODIGO_VIGENTE_DE_ANTERIOR, ORDER_STATUS_SEED } from "@/lib/types/order-status";
import { VEHICULOS_SEED } from "@/lib/types/vehiculos";
import { getPrismaClient } from "@/lib/db/prisma-client";

// SLT-42: desde 20261103120100 los tipos son por pais y la migracion ya deja los
// cinco de CR en cualquier base, asi que el `create` no deberia correr nunca.
// Lleva la fila completa (la misma de la migracion) solo para que, si corriera,
// no cree un tipo sin pais ni regla.
const TIPOS_IDENTIFICACION = [
  { value: "cedula", clave: "cedula_fisica", nombre: "Cédula física", caracteres: "digitos", largoMin: 9, largoMax: 9, orden: 1 },
  { value: "ruc", clave: "cedula_juridica", nombre: "Cédula jurídica", caracteres: "digitos", largoMin: 10, largoMax: 10, orden: 2 },
  { value: "pasaporte", clave: "pasaporte", nombre: "Pasaporte", caracteres: "alfanumerico", largoMin: 6, largoMax: 20, orden: 5 },
] as const;
const PAIS_DE_LOS_TIPOS_SEMBRADOS = "CR";

// Siembra idempotente de los tipos de identificacion. Recibe el cliente Prisma
// por parametro para poder testear la logica sin instanciar la conexion real.
// `update: {}`: una fila que ya existe no se toca nunca.
export async function seedTiposIdentificacion(
  prisma: Pick<PrismaClient, "tipoIdentificacion">
): Promise<void> {
  for (const tipo of TIPOS_IDENTIFICACION) {
    await prisma.tipoIdentificacion.upsert({
      where: { value: tipo.value },
      update: {},
      create: { ...tipo, paisId: PAIS_DE_LOS_TIPOS_SEMBRADOS },
    });
  }
}

// Siembra idempotente de los roles. Itera `ROLES_SEED` (fuente unica de verdad
// derivada del enum `RolValue`), sin lista literal duplicada y sin sembrar
// 'usuario' (R11). El upsert por `value` conserva la fila y su `id` si ya
// existe (R9, R10) y no borra ni toca otras tablas (R12).
export async function seedRoles(
  prisma: Pick<PrismaClient, "rol">
): Promise<void> {
  for (const value of ROLES_SEED) {
    await prisma.rol.upsert({
      where: { value },
      update: {},
      create: { value },
    });
  }
}

// Siembra idempotente de los estatus de orden (R2, R3). Itera ORDER_STATUS_SEED
// (fuente unica de verdad en TS) con upsert por `value`: conserva la fila y su
// `id` si ya existe, sin duplicar (patron seedRoles). La geografia NO se siembra
// (R4). Recibe el cliente Prisma por parametro para testear sin conexion real.
//
// FICHA 455 (2026-09-24, R20, design §3.3): ANTES de escribir nada comprueba que la base no tenga
// ningun codigo ANTERIOR de la 455. Sembrar una base sin migrar crearia una SEGUNDA fila
// (`entregado` junto a `entregada`): dos estados con el mismo nombre visible, y la migracion M1
// fallaria despues por el choque. Falla con el codigo en el mensaje y sin insertar ninguna fila.
export async function seedOrderStatus(
  prisma: Pick<PrismaClient, "orderStatus">
): Promise<void> {
  const anterior = await prisma.orderStatus.findFirst({
    where: { value: { in: Object.keys(CODIGO_VIGENTE_DE_ANTERIOR) } },
    select: { value: true },
    orderBy: { value: "asc" },
  });
  if (anterior !== null) {
    throw new Error(
      `order_status: la base tiene el código anterior '${anterior.value}'; aplica la migración 455 antes de sembrar`,
    );
  }
  for (const value of ORDER_STATUS_SEED) {
    await prisma.orderStatus.upsert({
      where: { value },
      update: {},
      create: { value },
    });
  }
}

// Siembra idempotente del catalogo de vehiculos (feature 50, R7/R8). Itera
// VEHICULOS_SEED (fuente unica de verdad derivada del enum VehiculoValue) con
// upsert por `name` (OJO: `name`, NO `value` como los demas catalogos): conserva
// la fila y su `id` si ya existe, sin duplicar ni tocar otras tablas. Recibe el
// cliente Prisma por parametro para testear sin conexion real.
export async function seedVehiculos(
  prisma: Pick<PrismaClient, "vehiculo">
): Promise<void> {
  for (const name of VEHICULOS_SEED) {
    await prisma.vehiculo.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
}

async function main(): Promise<void> {
  // Prisma 7 no auto-carga el .env; ese loadEnvFile solo lo hace el CLI de
  // Prisma via `prisma.config.ts`. Este script corre por `tsx`, no por el CLI,
  // asi que sin esto `process.env.DATABASE_URL` llega undefined a
  // `getPrismaClient()` y `PrismaPg` se construye sin connectionString.
  try {
    process.loadEnvFile();
  } catch {
    // sin .env: se usan las variables ya presentes en process.env
  }

  const prisma = getPrismaClient();
  try {
    await seedTiposIdentificacion(prisma);
    await seedRoles(prisma);
    await seedOrderStatus(prisma);
    await seedVehiculos(prisma);
    console.log(
      "Seed de catalogos completado (tipo_identificacion, rol, order_status, vehiculos)."
    );
  } finally {
    await prisma.$disconnect();
  }
}

// Solo auto-ejecuta el seed cuando este archivo es el entrypoint del proceso
// (p. ej. `pnpm db:seed` -> `tsx scripts/seed-catalogos.ts`). Cuando un test lo
// importa para ejercitar `seedRoles`, `main()` NO se dispara.
const isEntrypoint =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  main().catch((error: unknown) => {
    console.error("Fallo el seed de catalogos:", error);
    process.exit(1);
  });
}
