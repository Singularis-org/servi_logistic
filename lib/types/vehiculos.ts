import { z } from "zod";

// Los tres tipos con que nacio el catalogo (feature 50). Sigue siendo la lista que
// SIEMBRA la base, pero ya NO es la lista de valores posibles: desde
// `20260824160000_vehiculo_name_texto` la columna es TEXT y el catalogo se administra
// por CRUD. Antes esta constante se derivaba de `Object.values(VehiculoValue)`; con la
// columna en texto ese enum ya no describe el dominio, asi que la semilla se declara.
export const VEHICULOS_SEED: string[] = ["moto", "carro", "camion"];

// Cotas del nombre. Un catalogo administrable necesita un minimo (nada de nombres
// vacios o de un caracter accidental) y un maximo (la columna es TEXT, sin tope
// propio, y sin cota un pegado accidental entraria entero).
export const VEHICULO_NOMBRE_MIN = 2;
export const VEHICULO_NOMBRE_MAX = 40;

/**
 * Normaliza el nombre de un tipo de vehiculo: recorta y colapsa espacios internos.
 *
 * POR QUE EXISTE, Y POR QUE AQUI. Con la columna en enum, "Moto " era imposible de
 * teclear; con TEXT es una fila distinta de "Moto", y el UNIQUE de la base NO las
 * distingue. La migracion declara explicitamente que este plegado es responsabilidad
 * del codigo, no de la base. NO se baja a minusculas: un tipo puede legitimamente
 * llevar mayusculas ("Furgon 3/4"), y forzarlas seria decidir por el usuario.
 */
export function normalizarNombreVehiculo(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

const nombreSchema = z
  .string()
  .transform(normalizarNombreVehiculo)
  .pipe(
    z
      .string()
      .min(VEHICULO_NOMBRE_MIN, `El nombre debe tener al menos ${VEHICULO_NOMBRE_MIN} caracteres.`)
      .max(VEHICULO_NOMBRE_MAX, `El nombre no puede superar los ${VEHICULO_NOMBRE_MAX} caracteres.`),
  );

// Validacion en el borde. `strict` rechaza campos desconocidos (patron tarifas).
export const crearVehiculoSchema = z.object({ name: nombreSchema }).strict();
export type CrearVehiculoInput = z.infer<typeof crearVehiculoSchema>;

// SL-42 (design §4.1; R5, R6, R9, R12) — las entradas del superadmin. El `id` viaja dentro del
// objeto, y no como argumento suelto, para que `strict` cubra la entrada entera: un campo de mas
// es `validation_error` aunque venga junto a un id valido.
export const renombrarVehiculoSchema = z.object({ id: z.string().min(1), name: nombreSchema }).strict();
export type RenombrarVehiculoInput = z.infer<typeof renombrarVehiculoSchema>;

export const cambiarActivacionVehiculoSchema = z
  .object({ id: z.string().min(1), activo: z.boolean() })
  .strict();
export type CambiarActivacionVehiculoInput = z.infer<typeof cambiarActivacionVehiculoSchema>;

// DTO expuesto por la capa de lectura: id (uuid PK estable), name y, desde SL-42, `activo`: la
// pantalla del superadmin lista los inactivos (R2) y las lecturas de empresa los filtran (R18).
export interface VehiculoDTO {
  id: string;
  name: string;
  activo: boolean;
}
