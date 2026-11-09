import { afterEach, describe, expect, it, vi } from "vitest";

import { enviarReporteBugAction, type EnviarReporteBugDeps } from "@/lib/actions/reporte-bug";
import { DESCRIPCION_MAX } from "@/lib/config/reporte-bug";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { IReporteBugService } from "@/lib/interfaces/services/IReporteBugService";
import { MODULO_POR_ACTION } from "@/lib/modulos/reparto";

// SLT-87 (design §4; R9–R13) — el borde del reporte de problemas con el actor, la cabecera y el
// servicio inyectados: ni sesión ni base. La puerta de empresa y el correo están en
// `tests/unit/services/reporte-bug-service.test.ts`; el SQL, en `tests/integration/db/bug-report.test.ts`.

const ACTOR: Actor = { usuarioId: "u-1", rol: "maestro", organizacionId: "org-1" };
const AGENTE = "Mozilla/5.0 (X11; Linux) Firefox/131";
const VALIDA = { descripcion: "  El botón no responde  ", pagina: "/ordenes", ventana: { ancho: 1280, alto: 720 }, appInstalada: false };

function deps(o: { actor?: Actor | null; servicio?: Partial<IReporteBugService> } = {}) {
  const enviar = vi.fn().mockResolvedValue({ status: "enviado" });
  const servicio = { enviar, ...o.servicio } as IReporteBugService;
  const contextoPeticion = vi.fn().mockResolvedValue({ ipAddress: "1.2.3.4", userAgent: AGENTE });
  const d: EnviarReporteBugDeps = {
    getActor: async () => (o.actor === undefined ? ACTOR : o.actor),
    contextoPeticion,
    servicio,
  };
  return { d, enviar: servicio.enviar as ReturnType<typeof vi.fn>, contextoPeticion };
}

afterEach(() => vi.restoreAllMocks());

describe("SLT-87 · enviarReporteBugAction", () => {
  it("R11 — sin sesión responde unauthenticated sin llamar al servicio", async () => {
    const { d, enviar, contextoPeticion } = deps({ actor: null });

    expect(await enviarReporteBugAction(VALIDA, d)).toEqual({ status: "unauthenticated" });
    expect(enviar).not.toHaveBeenCalled();
    expect(contextoPeticion).not.toHaveBeenCalled();
  });

  it("R12 — descripción vacía tras recortar, de 501 caracteres (y 500 pasa), página con query o con fragmento y campos de más (`organizacionId`, `rol`) dan validation_error sin llamar al servicio", async () => {
    const malas: [string, unknown][] = [
      ["vacía", { ...VALIDA, descripcion: "" }],
      ["solo espacios", { ...VALIDA, descripcion: "   \n\t " }],
      ["501", { ...VALIDA, descripcion: "x".repeat(DESCRIPCION_MAX + 1) }],
      ["query", { ...VALIDA, pagina: "/ordenes?estado=entregada" }],
      ["fragmento", { ...VALIDA, pagina: "/ordenes#fila-3" }],
      ["sin barra", { ...VALIDA, pagina: "ordenes" }],
      ["otro origen", { ...VALIDA, pagina: "//malo.example/x" }],
      ["organizacionId", { ...VALIDA, organizacionId: "org-otra" }],
      ["rol", { ...VALIDA, rol: "superadmin" }],
      ["usuarioId", { ...VALIDA, usuarioId: "u-otro" }],
      ["campo de más en la ventana", { ...VALIDA, ventana: { ancho: 1, alto: 1, dpr: 2 } }],
      ["ventana fuera de rango", { ...VALIDA, ventana: { ancho: 0, alto: 720 } }],
      ["sin descripción", { pagina: "/ordenes" }],
      ["no es objeto", "texto"],
    ];
    for (const [caso, entrada] of malas) {
      const { d, enviar } = deps();
      const r = await enviarReporteBugAction(entrada, d);
      expect(r.status, caso).toBe("validation_error");
      expect(enviar, caso).not.toHaveBeenCalled();
    }

    const { d, enviar } = deps();
    expect(await enviarReporteBugAction({ ...VALIDA, descripcion: "x".repeat(DESCRIPCION_MAX) }, d)).toEqual({
      status: "enviado",
    });
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it("R12 — el campo de más se nombra como error de entrada y la página con query en su campo", async () => {
    const { d } = deps();
    const extra = await enviarReporteBugAction({ ...VALIDA, organizacionId: "org-otra" }, d);
    expect(extra).toMatchObject({ status: "validation_error", fieldErrors: { entrada: expect.any(Array) } });
    const query = await enviarReporteBugAction({ ...VALIDA, pagina: "/a?b=c" }, d);
    expect(query).toMatchObject({ status: "validation_error", fieldErrors: { pagina: expect.any(Array) } });
  });

  it("R13 — el agente de usuario sale de la cabecera", async () => {
    const { d, enviar, contextoPeticion } = deps();

    await enviarReporteBugAction(VALIDA, d);

    expect(contextoPeticion).toHaveBeenCalledTimes(1);
    expect(enviar).toHaveBeenCalledWith(
      ACTOR,
      { descripcion: "El botón no responde", pagina: "/ordenes", ventana: { ancho: 1280, alto: 720 }, appInstalada: false },
      { userAgent: AGENTE },
    );
  });

  it("R9 — la respuesta buena es solo «enviado», sin id ni datos del reporte", async () => {
    const { d } = deps();
    expect(await enviarReporteBugAction(VALIDA, d)).toEqual({ status: "enviado" });
  });

  it("R11 — el forbidden del servicio llega tal cual", async () => {
    const { d } = deps({ servicio: { enviar: vi.fn().mockResolvedValue({ status: "forbidden" }) } });
    expect(await enviarReporteBugAction(VALIDA, d)).toEqual({ status: "forbidden" });
  });

  it("R10 — si guardar falla responde error y el log lleva solo el nombre de la causa", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const fallo = new Error('violates check constraint, Failing row contains (El botón no responde)');
    fallo.name = "DriverAdapterError";
    const { d } = deps({ servicio: { enviar: vi.fn().mockRejectedValue(fallo) } });

    expect(await enviarReporteBugAction(VALIDA, d)).toEqual({ status: "error" });
    expect(log).toHaveBeenCalledWith("[reporte-bug] fallo al guardar causa=DriverAdapterError");
    for (const [linea] of log.mock.calls) expect(String(linea)).not.toContain("El botón no responde");
  });

  it("es de núcleo en el reparto de módulos (SL-23): sin puerta de módulo", () => {
    expect(MODULO_POR_ACTION["reporte-bug"]).toBe("nucleo");
  });
});
