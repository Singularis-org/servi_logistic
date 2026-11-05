import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { VehiculoValue } from "@prisma/client";
import {
  VEHICULOS_SEED,
  VEHICULO_NOMBRE_MAX,
  cambiarActivacionVehiculoSchema,
  crearVehiculoSchema,
  renombrarVehiculoSchema,
} from "@/lib/types/vehiculos";

// Cobertura de la fuente unica de verdad de vehiculos (`lib/types/vehiculos.ts`)
// y de la declaracion del enum/modelo en `db/schema.prisma`. Patron
// roles.test.ts. Diferencia clave deliberada: la columna es `name` (NO `value`).

describe("VEHICULOS_SEED (fuente unica de verdad) (R6)", () => {
  it("tiene exactamente los tres valores del enum, sin duplicados (R6)", () => {
    expect(VEHICULOS_SEED).toHaveLength(3);
    expect(new Set(VEHICULOS_SEED).size).toBe(3);
  });

  it("se deriva del enum VehiculoValue de Prisma (R6)", () => {
    // Sin una segunda lista literal: VEHICULOS_SEED === Object.values(VehiculoValue).
    expect([...VEHICULOS_SEED].sort()).toEqual([...Object.values(VehiculoValue)].sort());
    expect([...VEHICULOS_SEED].sort()).toEqual(["camion", "carro", "moto"]);
  });

  it("los nombres de miembro coinciden con el label de la DB (sin @map) (R1)", () => {
    expect(VehiculoValue.moto).toBe("moto");
    expect(VehiculoValue.carro).toBe("carro");
    expect(VehiculoValue.camion).toBe("camion");
  });
});

describe("db/schema.prisma declara el enum VehiculoValue (R1)", () => {
  const schema = fs.readFileSync(
    path.join(__dirname, "..", "..", "..", "db", "schema.prisma"),
    "utf8"
  );

  it('declara el enum VehiculoValue con @@map("vehiculo_value") (R1)', () => {
    expect(schema).toMatch(/enum\s+VehiculoValue\s*\{/);
    expect(schema).toMatch(/@@map\("vehiculo_value"\)/);
  });

  it("declara el enum con exactamente 3 miembros moto/carro/camion, sin @map (R1)", () => {
    const match = schema.match(/enum\s+VehiculoValue\s*\{([\s\S]*?)\}/);
    expect(match).not.toBeNull();
    const body = match ? match[1] : "";
    const miembros = body
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("//") && !l.startsWith("@@"))
      .map((l) => l.split(/\s|\/\//)[0]);
    expect(miembros).toEqual(["moto", "carro", "camion"]);
    // Ningun miembro lleva @map (los identificadores == label DB). El @@map del
    // enum NO cuenta: [^@]@map excluye el doble arroba de "@@map".
    expect(body).not.toMatch(/[^@]@map\(/);
  });
});

describe("db/schema.prisma declara el modelo Vehiculo con columna name (R2, R13)", () => {
  const schema = fs.readFileSync(
    path.join(__dirname, "..", "..", "..", "db", "schema.prisma"),
    "utf8"
  );

  it('mapea el modelo Vehiculo a la tabla "vehiculos" (R2)', () => {
    expect(schema).toMatch(/model\s+Vehiculo\s*\{/);
    expect(schema).toMatch(/@@map\("vehiculos"\)/);
  });

  // La columna sigue llamandose `name` y sigue siendo @unique; lo que cambio es su TIPO. La
  // migracion 20260824160000_vehiculo_name_texto retiro el enum `VehiculoValue` para que el
  // catalogo se administre por CRUD y no por una migracion por cada tipo nuevo. Lo que este
  // test protege NO era el enum: era que la columna no volviera a llamarse `value` (R2).
  it("la columna de valor se llama name String @unique (NO value) (R2)", () => {
    expect(schema).toMatch(/name\s+String\s+@unique/);
    expect(schema).not.toMatch(/name\s+VehiculoValue/);
    const match = schema.match(/model\s+Vehiculo\s*\{([\s\S]*?)\}/);
    const body = match ? match[1] : "";
    expect(body).not.toMatch(/\bvalue\b/);
  });

  it("id es String @id @default(uuid()) -> PK uuid estable para el FK feature 21 (R13)", () => {
    const match = schema.match(/model\s+Vehiculo\s*\{([\s\S]*?)\}/);
    const body = match ? match[1] : "";
    expect(body).toMatch(/id\s+String\s+@id\s+@default\(uuid\(\)\)/);
  });

  it("el modelo Usuario gana vehiculo_id en la feature 21, no en la 50 (R13)", () => {
    // Feature 50 dejo el id de Vehiculo listo como PK estable pero NO cableo el
    // FK usuario.vehiculo_id (deferido explicitamente). La feature 21
    // (postulacion de mensajero) lo agrega; este guard se actualizo en
    // consecuencia: el FK ahora vive en el schema, aportado por la 21.
    const match = schema.match(/model\s+Usuario\s*\{([\s\S]*?)\n\}/);
    const body = match ? match[1] : "";
    expect(body).toMatch(/vehiculoId\s+String\?\s+@map\("vehiculo_id"\)/);
  });
});

// SL-42 (design §4.1; R9) — los schemas del superadmin. El nombre se valida DESPUES de normalizar:
// «  a  » son 3 caracteres crudos pero 1 normalizado, y eso es lo que se guardaria.
describe("SL-42/R9 — renombrar y cambiar la activacion validan la entrada entera", () => {
  const ID = "veh-1";

  it("R9: renombrar con nombre vacio o solo espacios es error en `name`", () => {
    for (const name of ["", "    "]) {
      const r = renombrarVehiculoSchema.safeParse({ id: ID, name });
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.flatten().fieldErrors.name).toBeDefined();
    }
  });

  it("R9: renombrar con menos de 2 caracteres tras normalizar es error en `name`", () => {
    const r = renombrarVehiculoSchema.safeParse({ id: ID, name: "  a  " });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.flatten().fieldErrors.name).toBeDefined();
  });

  it("R9: renombrar con mas de 40 caracteres tras normalizar es error en `name`; 40 justos pasan", () => {
    const largo = renombrarVehiculoSchema.safeParse({ id: ID, name: "x".repeat(VEHICULO_NOMBRE_MAX + 1) });
    expect(largo.success).toBe(false);
    if (!largo.success) expect(largo.error.flatten().fieldErrors.name).toBeDefined();
    // Los espacios que la normalizacion colapsa no cuentan para el maximo.
    const conEspacios = `  ${"x".repeat(20)}     ${"y".repeat(19)}  `;
    const r = renombrarVehiculoSchema.safeParse({ id: ID, name: conEspacios });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.name).toHaveLength(VEHICULO_NOMBRE_MAX);
  });

  it("R4/R5: el nombre valido sale normalizado (recortado y espacios internos colapsados)", () => {
    const r = renombrarVehiculoSchema.safeParse({ id: ID, name: "  Furgon   3/4 " });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual({ id: ID, name: "Furgon 3/4" });
  });

  it("R9: un campo desconocido es error, en renombrar, en cambiar la activacion y en crear", () => {
    expect(renombrarVehiculoSchema.safeParse({ id: ID, name: "Moto", extra: 1 }).success).toBe(false);
    expect(cambiarActivacionVehiculoSchema.safeParse({ id: ID, activo: false, name: "x" }).success).toBe(false);
    expect(crearVehiculoSchema.safeParse({ name: "Moto", activo: false }).success).toBe(false);
  });

  it("R9/R12: sin id, o con id vacio, es error en `id`", () => {
    for (const entrada of [{ name: "Moto" }, { id: "", name: "Moto" }]) {
      const r = renombrarVehiculoSchema.safeParse(entrada);
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.flatten().fieldErrors.id).toBeDefined();
    }
    const r = cambiarActivacionVehiculoSchema.safeParse({ id: "", activo: true });
    expect(r.success).toBe(false);
  });

  it("R6/R9: `activo` tiene que ser booleano; true y false pasan", () => {
    expect(cambiarActivacionVehiculoSchema.safeParse({ id: ID, activo: "false" }).success).toBe(false);
    expect(cambiarActivacionVehiculoSchema.safeParse({ id: ID }).success).toBe(false);
    expect(cambiarActivacionVehiculoSchema.safeParse({ id: ID, activo: false }).success).toBe(true);
    expect(cambiarActivacionVehiculoSchema.safeParse({ id: ID, activo: true }).success).toBe(true);
  });

  it("R9: crear con nombre de menos de 2 o mas de 40 caracteres es error en `name`", () => {
    for (const name of ["", " b ", "z".repeat(VEHICULO_NOMBRE_MAX + 1)]) {
      const r = crearVehiculoSchema.safeParse({ name });
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.flatten().fieldErrors.name).toBeDefined();
    }
  });
});
