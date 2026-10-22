import { randomUUID } from "node:crypto";

import type { RolValue } from "@prisma/client";

import type { FksDeOrden, TxDeTest } from "../_postgres-real";

// SL-11 (D6) — los datos minimos que un test de integracion necesita para colgar una orden, creados
// DENTRO de su transaccion revertida.
//
// POR QUE EXISTE. `fksDeOrden()` lee la primera orden que ya haya en la base, y `usuario.findFirst()`
// el primer usuario. Desde SL-11 la base recien migrada no trae ni usuarios ni zonas ni ordenes:
// esos tests no tienen de donde leer. Aqui se crean, y el rollback del test se los lleva.
//
// Lo unico que se LEE de la base son los catalogos y la geografia, que llegan por migracion: el
// estado `en_preparacion`, el rol pedido, el tipo de identificacion `cedula` y Cartago/Cartago.
// Si falta algo de eso, la funcion LANZA: nunca devuelve `null` ni deja que el test siga sin datos.

const SIN_MIGRACIONES = "aplica las migraciones (`pnpm exec prisma migrate deploy`)";

/** Un usuario creado por el fixture, con lo que los tests comparan del actor congelado. */
export interface UsuarioDePrueba {
  id: string;
  nombre: string;
  primerApellido: string | null;
  rol: string;
}

/**
 * Crea un usuario del rol pedido. Hasta SL-32 es el unico camino por el que un usuario existe en la
 * base de un test. Email `<rol>-<sufijo>@example.com` y cedula, ambos unicos.
 */
export async function crearUsuarioDePrueba(tx: TxDeTest, rol: RolValue): Promise<UsuarioDePrueba> {
  const filaRol = await tx.rol.findUnique({ where: { value: rol }, select: { id: true } });
  if (filaRol === null) throw new Error(`falta el rol «${rol}» en el catalogo: ${SIN_MIGRACIONES}`);
  const tipo = await tx.tipoIdentificacion.findUnique({
    where: { value: "cedula" },
    select: { id: true },
  });
  if (tipo === null) {
    throw new Error(`falta el tipo de identificacion «cedula»: ${SIN_MIGRACIONES}`);
  }

  const sufijo = randomUUID().replace(/-/g, "").slice(0, 12);
  const creado = await tx.usuario.create({
    data: {
      nombre: `Prueba ${rol}`,
      primerApellido: `Fixture ${sufijo}`,
      email: `${rol.toLowerCase()}-${sufijo}@example.com`,
      telefono: "88880000",
      passwordHash: "x",
      cedula: `fx-${sufijo}`,
      tipoIdentificacionId: tipo.id,
      rolId: filaRol.id,
      estado: "activo",
    },
    select: { id: true, nombre: true, primerApellido: true, rol: { select: { value: true } } },
  });
  return {
    id: creado.id,
    nombre: creado.nombre,
    primerApellido: creado.primerApellido,
    rol: creado.rol.value,
  };
}

/**
 * Las FK obligatorias de `orden`, con la MISMA forma que `fksDeOrden()`, pero creadas aqui: una
 * tienda y una zona inventada (no central, SINPE valido para el `CHECK`). NO crea ninguna orden:
 * cada test crea las suyas con estas FK, y una orden viva oculta contaminaria los conteos globales.
 */
export async function crearFksDeOrden(tx: TxDeTest): Promise<FksDeOrden> {
  const estatus = await tx.orderStatus.findUnique({
    where: { value: "en_preparacion" },
    select: { id: true },
  });
  if (estatus === null) throw new Error(`falta el estado «en_preparacion»: ${SIN_MIGRACIONES}`);
  const canton = await tx.canton.findFirst({
    where: { nombre: "Cartago", provincia: { nombre: "Cartago" } },
    select: { id: true, provinciaId: true },
  });
  if (canton === null) throw new Error(`falta la geografia Cartago/Cartago: ${SIN_MIGRACIONES}`);

  const tienda = await crearUsuarioDePrueba(tx, "adminTienda");
  const sufijo = randomUUID().replace(/-/g, "").slice(0, 12);
  const zona = await tx.zona.create({
    data: { nombre: `Zona fixture ${sufijo}`, sinpeNumero: "80000000", sinpeNombre: "Titular de Prueba" },
    select: { id: true },
  });
  return {
    estatusId: estatus.id,
    tiendaId: tienda.id,
    zonaId: zona.id,
    provinciaId: canton.provinciaId,
    cantonId: canton.id,
  };
}
