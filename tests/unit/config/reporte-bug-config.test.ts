import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { DESCRIPCION_MAX, destinatariosReporteBug } from "@/lib/config/reporte-bug";

// SLT-87 (design §9; R16, R20) — de dónde salen los destinatarios de la copia por correo y cómo se
// documentan. Se lee la variable por parámetro: el valor por defecto (`process.env`) se prueba aparte.

const RAIZ = path.resolve(__dirname, "../../..");
const ORIGINAL = process.env.BUG_REPORT_EMAILS;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.BUG_REPORT_EMAILS;
  else process.env.BUG_REPORT_EMAILS = ORIGINAL;
  vi.restoreAllMocks();
});

describe("SLT-87 · destinatarios de BUG_REPORT_EMAILS (R16)", () => {
  it("vacía, ausente o sin direcciones válidas da []; recorta, filtra y quita duplicados", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(destinatariosReporteBug("")).toEqual([]);
    expect(destinatariosReporteBug("  ,  , ")).toEqual([]);
    expect(destinatariosReporteBug(undefined)).toEqual([]);
    expect(destinatariosReporteBug("no-es-correo, tampoco@")).toEqual([]);

    expect(
      destinatariosReporteBug(" uno@example.test ,dos@example.test,, UNO@example.test, malo, dos@example.test "),
    ).toEqual(["uno@example.test", "dos@example.test"]);
  });

  it("sin argumento lee process.env.BUG_REPORT_EMAILS, y ausente da []", () => {
    process.env.BUG_REPORT_EMAILS = "soporte@example.test";
    expect(destinatariosReporteBug()).toEqual(["soporte@example.test"]);
    delete process.env.BUG_REPORT_EMAILS;
    expect(destinatariosReporteBug()).toEqual([]);
  });

  it("si descarta alguna dirección deja una línea con la cifra y sin las direcciones", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    destinatariosReporteBug("ok@example.test, secreto-mal-escrito@, otra-mala");

    expect(warn).toHaveBeenCalledTimes(1);
    const linea = String(warn.mock.calls[0][0]);
    expect(linea).toContain("2");
    expect(linea).not.toContain("secreto-mal-escrito");
    expect(linea).not.toContain("otra-mala");
  });

  it("con todas válidas no escribe en el log", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    destinatariosReporteBug("a@example.test,b@example.test");
    expect(warn).not.toHaveBeenCalled();
  });

  it("el máximo de la descripción es 500 (Q3) y el CHECK de la migración usa el mismo número", () => {
    expect(DESCRIPCION_MAX).toBe(500);
    const migracion = readFileSync(
      path.join(RAIZ, "db/migrations/20261110120000_bug_report/migration.sql"),
      "utf8",
    );
    expect(migracion).toContain(`char_length(btrim("description")) BETWEEN 1 AND ${DESCRIPCION_MAX}`);
  });
});

describe("SLT-87 · .env.example (R20)", () => {
  it(".env.example documenta BUG_REPORT_EMAILS vacía", () => {
    const env = readFileSync(path.join(RAIZ, ".env.example"), "utf8");
    expect(env).toMatch(/^BUG_REPORT_EMAILS=$/m);

    // El comentario justo encima dice el formato y qué pasa si queda vacía.
    const linea = env.indexOf("\nBUG_REPORT_EMAILS=");
    const comentario = env.slice(env.lastIndexOf("\n\n", linea), linea);
    expect(comentario).toContain("SLT-87");
    expect(comentario).toContain("separada por «,»");
    expect(comentario).toMatch(/Vacia, ausente o sin ninguna direccion\s+#?\s*valida/);
    expect(comentario).toContain("el reporte se guarda igual y no sale correo");
  });
});
