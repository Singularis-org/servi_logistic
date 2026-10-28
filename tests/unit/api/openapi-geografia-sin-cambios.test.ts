import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { openApiSpec } from "@/lib/api/openapi-spec";

// SL-20 R18 — los NOMBRES de la geografia no cambian con el pais: los campos de la API publica, las
// columnas de la base y los nombres del codigo siguen siendo `provincia`, `canton` y `distrito`.
//
// Por que hace falta: SL-20 hace que cada pais llame a sus niveles como quiera («Departamento»…),
// y lo natural seria «arreglar» tambien el contrato. Eso romperia a los integradores que ya
// mandan `provincia` por API key. Lo unico que cambia son las ETIQUETAS visibles (R19). Este archivo
// falla si alguien renombra una clave del contrato (en el objeto TS o en su espejo yaml) o una
// tabla o columna de la geografia.

const RAIZ = path.resolve(__dirname, "..", "..", "..");
const TERNA = ["provincia", "canton", "distrito"] as const;

const yaml = fs.readFileSync(path.join(RAIZ, "docs", "api", "api-key-openapi.yaml"), "utf8");
const schema = fs.readFileSync(path.join(RAIZ, "db", "schema.prisma"), "utf8");
const schemas = openApiSpec.components.schemas;

/** El bloque de un schema del yaml: desde `    <Nombre>:` hasta el siguiente schema hermano. */
function bloqueYaml(nombre: string): string {
  const inicio = yaml.indexOf(`\n    ${nombre}:\n`);
  expect(inicio, `el yaml no declara el schema ${nombre}`).toBeGreaterThan(-1);
  const resto = yaml.slice(inicio + 1);
  const fin = resto.slice(1).search(/\n {4}[A-Za-z]\w*:\n/);
  return fin === -1 ? resto : resto.slice(0, fin + 1);
}

/** Las claves de `properties` de un bloque yaml (indentadas 8 espacios bajo `properties:`). */
function propiedadesYaml(bloque: string): string[] {
  const props = bloque.split("\n      properties:\n")[1] ?? "";
  return [...props.matchAll(/^ {8}([a-z_]+):$/gm)].map((m) => m[1]);
}

describe("R18 — el contrato publico conserva provincia/canton/distrito", () => {
  it("anti-vacuidad: los artefactos se leyeron", () => {
    expect(JSON.stringify(openApiSpec).length).toBeGreaterThan(10_000);
    expect(yaml.length).toBeGreaterThan(10_000);
    expect(schema).toMatch(/^model Provincia \{/m);
  });

  it("CargaRow (objeto TS) exige y declara la terna con esos nombres", () => {
    expect(schemas.CargaRow.required).toEqual(expect.arrayContaining([...TERNA]));
    for (const clave of TERNA) {
      expect(schemas.CargaRow.properties, `CargaRow sin ${clave}`).toHaveProperty(clave);
      expect((schemas.CargaRow.properties as Record<string, { type?: string }>)[clave].type).toBe("string");
    }
  });

  it("CotizacionRow (objeto TS) declara la terna con esos nombres", () => {
    for (const clave of TERNA) {
      expect(schemas.CotizacionRow.properties, `CotizacionRow sin ${clave}`).toHaveProperty(clave);
    }
  });

  it("el espejo yaml declara la misma terna en CargaRow (required y properties) y en CotizacionRow", () => {
    const carga = bloqueYaml("CargaRow");
    for (const clave of TERNA) expect(carga).toMatch(new RegExp(`^ {8}- ${clave}$`, "m"));
    expect(propiedadesYaml(carga)).toEqual(expect.arrayContaining([...TERNA]));
    expect(propiedadesYaml(bloqueYaml("CotizacionRow"))).toEqual(expect.arrayContaining([...TERNA]));
  });

  it("ningun artefacto introduce claves neutras de nivel en el contrato", () => {
    // Los nombres neutros (`nivel_1`…) son del CSV del superadmin, no de la API publica.
    expect(JSON.stringify(openApiSpec)).not.toMatch(/nivel_[123]/);
    expect(yaml).not.toMatch(/nivel_[123]/);
  });
});

describe("R18 — la base y el codigo conservan los nombres", () => {
  it("las tablas siguen siendo provincia, canton y distrito", () => {
    for (const tabla of TERNA) expect(schema).toContain(`@@map("${tabla}")`);
  });

  it("la orden sigue apuntando a la geografia con provincia_id, canton_id y distrito_id", () => {
    const orden = schema.slice(schema.indexOf("\nmodel Orden {"));
    const cuerpo = orden.slice(0, orden.indexOf("\n}"));
    expect(cuerpo).toMatch(/provinciaId\s+String\s+@map\("provincia_id"\)/);
    expect(cuerpo).toMatch(/cantonId\s+String\s+@map\("canton_id"\)/);
    expect(cuerpo).toMatch(/distritoId\s+String\?\s+@map\("distrito_id"\)/);
  });
});
