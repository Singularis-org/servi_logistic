import { describe, it, expect, vi } from "vitest";
import type {
  CrearNotificacionInput,
  INotificacionRepository,
} from "@/lib/interfaces/repositories/INotificacionRepository";
import { periodoNumerico } from "@/lib/facturas-plataforma/resumen";
import { emitirFacturaEmitida, periodoDeFactura, textoFacturaEmitida } from "@/lib/notificaciones/emitir";
import { FACTURA_EMITIDA_TEXTOS, plantillaFacturaEmitida } from "@/lib/services/email/plantillas/factura-emitida";

// SLT-136 (T5.4; R22, R24) — el emisor del aviso «se emitió la factura N.º n de la plataforma». Se prueba la
// FORMA de la fila (cuántas, a quién, con qué entidad, tipo y texto) y que una segunda emisión no crea otra.
// Los textos se afirman con literales escritos a mano.

const FACTURA = "f0000000-0000-4000-8000-000000000001";
// La quincena del 1 al 15 de noviembre en la hora de la plataforma (−06:00): `[01 06:00Z, 16 06:00Z)`.
const DESDE = new Date("2026-11-01T06:00:00.000Z");
const HASTA = new Date("2026-11-16T06:00:00.000Z");

/** Repositorio doble que modela el índice único `(evento, entidad, destinatario)` de la base. */
class RepoDoble implements INotificacionRepository {
  creadas: CrearNotificacionInput[] = [];
  private vistas = new Set<string>();

  async crear(input: CrearNotificacionInput): Promise<string | null> {
    const quien = input.destinatario.tipo === "usuario" ? input.destinatario.usuarioId : input.destinatario.rol;
    const clave = `${input.evento}|${input.entidadId}|${quien}`;
    if (this.vistas.has(clave)) return null;
    this.vistas.add(clave);
    this.creadas.push(input);
    return `n-${this.creadas.length}`;
  }
  existeNoLeidaPara = vi.fn().mockResolvedValue(false);
  listarParaUsuario = vi.fn().mockResolvedValue([]);
  verificarVisible = vi.fn().mockResolvedValue("visible" as const);
  marcarTodasLeidas = vi.fn().mockResolvedValue(0);
  descartar = vi.fn().mockResolvedValue(undefined);
}

describe("SLT-136/R22, R24 — una sola fila al maestro, con la factura como entidad", () => {
  it("⭑ crea UNA fila `alert` al rol `maestro`, entidad = la factura, sin anexo", async () => {
    const repo = new RepoDoble();
    const n = await emitirFacturaEmitida(repo, { facturaId: FACTURA, numero: 3, desde: DESDE, hasta: HASTA });
    expect(n).toBe(1);
    expect(repo.creadas).toHaveLength(1);
    const fila = repo.creadas[0];
    expect(fila).toMatchObject({
      tipo: "alert",
      evento: "factura_plataforma_emitida",
      entidadTipo: "factura_plataforma",
      entidadId: FACTURA,
      anexo: null,
      destinatario: { tipo: "rol", rol: "maestro" },
    });
  });

  it("⭑ R24: ni admin, ni ningún usuario, ni alcance de zona", async () => {
    const repo = new RepoDoble();
    await emitirFacturaEmitida(repo, { facturaId: FACTURA, numero: 3, desde: DESDE, hasta: HASTA });
    expect(repo.creadas.map((f) => f.destinatario)).toEqual([{ tipo: "rol", rol: "maestro" }]);
  });

  it("⭑ R22: el texto nombra el número y el período (último día = hasta − 1 ms), sin montos", async () => {
    const repo = new RepoDoble();
    await emitirFacturaEmitida(repo, { facturaId: FACTURA, numero: 3, desde: DESDE, hasta: HASTA });
    const texto = repo.creadas[0].descripcion;
    expect(texto).toBe("Se emitió la factura N.º 3 de la plataforma, del 01/11/2026 al 15/11/2026.");
    expect(texto).not.toContain("₡");
    // Sin dígitos fuera del número y las fechas: ningún importe.
    expect(texto.replace(/\d{2}\/\d{2}\/\d{4}/g, "").replace("N.º 3", "")).not.toMatch(/\d/);
  });

  it("el período se lee en la hora de la plataforma: un `hasta` a las 00:00 CR cierra el día anterior", () => {
    expect(periodoDeFactura(new Date("2026-11-16T06:00:00.000Z"), new Date("2026-12-01T06:00:00.000Z"))).toBe(
      "16/11/2026 al 30/11/2026",
    );
    expect(textoFacturaEmitida(12, "01/12/2026 al 31/12/2026")).toBe(
      "Se emitió la factura N.º 12 de la plataforma, del 01/12/2026 al 31/12/2026.",
    );
  });

  it("⭑ R22: una segunda emisión de la misma factura no crea otra fila", async () => {
    const repo = new RepoDoble();
    const ctx = { facturaId: FACTURA, numero: 3, desde: DESDE, hasta: HASTA };
    const primera = await emitirFacturaEmitida(repo, ctx);
    const segunda = await emitirFacturaEmitida(repo, ctx);
    expect([primera, segunda]).toEqual([1, 0]);
    expect(repo.creadas).toHaveLength(1);
  });
});

// Review SLT-136 vuelta 1, menor 1 — el período y la frase viven en el emisor central; el PDF tiene su propio
// `periodoNumerico` (se arma en el navegador y no puede importar el emisor, que arrastra el repositorio). Este test
// ata las tres salidas para que no diverjan en silencio: campanita, correo y PDF dicen el mismo período.
describe("SLT-136/R8, R22, R26 — campanita, correo y PDF dicen el mismo período", () => {
  // Pares `[desde, hasta)` con bordes de medianoche en la hora de la plataforma (−06:00).
  const CASOS: Array<[string, string]> = [
    ["2026-11-01T06:00:00.000Z", "2026-11-16T06:00:00.000Z"], // hasta = 00:00 CR exacto → cierra el día 15
    ["2026-11-16T06:00:00.000Z", "2026-12-01T06:00:00.000Z"], // fin de mes
    ["2026-12-16T06:00:00.000Z", "2027-01-01T06:00:00.000Z"], // cambio de año
    ["2026-11-01T05:59:59.999Z", "2026-11-16T06:00:00.001Z"], // 1 ms antes de medianoche / 1 ms después
    ["2026-11-01T06:00:00.000Z", "2026-11-01T06:00:00.001Z"], // un día de 1 ms
    ["2026-02-16T06:00:00.000Z", "2026-03-01T06:00:00.000Z"], // febrero corto
  ];

  it.each(CASOS)("`periodoDeFactura` = `periodoNumerico` para [%s, %s)", (desde, hasta) => {
    const d = new Date(desde);
    const h = new Date(hasta);
    expect(periodoDeFactura(d, h)).toBe(periodoNumerico(d, h));
  });

  it("los bordes de medianoche caen del lado correcto (control de que el caso no es trivial)", () => {
    expect(periodoDeFactura(new Date("2026-11-01T06:00:00.000Z"), new Date("2026-11-16T06:00:00.000Z"))).toBe(
      "01/11/2026 al 15/11/2026",
    );
    expect(periodoDeFactura(new Date("2026-11-01T05:59:59.999Z"), new Date("2026-11-16T06:00:00.001Z"))).toBe(
      "31/10/2026 al 16/11/2026",
    );
    expect(periodoDeFactura(new Date("2026-12-16T06:00:00.000Z"), new Date("2027-01-01T06:00:00.000Z"))).toBe(
      "16/12/2026 al 31/12/2026",
    );
  });

  it("el correo usa la misma frase que la campanita: sin copia del texto", () => {
    expect(FACTURA_EMITIDA_TEXTOS.periodo).toBe(textoFacturaEmitida);
    const factura = {
      numero: 3,
      desde: DESDE,
      hasta: HASTA,
      cargos: "0.00",
      reversos: "0.00",
      cuota: null,
      primeraCuota: null,
      total: "0.00",
    };
    const correo = plantillaFacturaEmitida({
      to: "maestro@example.test",
      nombre: "Ana",
      empresaNombre: "Empresa",
      factura,
      contacto: null,
      urlApp: null,
    });
    const frase = textoFacturaEmitida(3, periodoDeFactura(DESDE, HASTA));
    expect(frase).toBe("Se emitió la factura N.º 3 de la plataforma, del 01/11/2026 al 15/11/2026.");
    expect(correo.text).toContain(frase);
  });
});
