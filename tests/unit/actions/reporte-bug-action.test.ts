import { afterEach, describe, expect, it, vi } from "vitest";

import {
  enviarReporteBugAction,
  prepararSubidaImagenesReporteAction,
  type EnviarReporteBugDeps,
} from "@/lib/actions/reporte-bug";
import { DESCRIPCION_MAX, IMAGEN_BYTES_MAX } from "@/lib/config/reporte-bug";
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
  const prepararSubidas = vi.fn().mockResolvedValue({ status: "listas", permisos: [] });
  const servicio = { enviar, prepararSubidas, ...o.servicio } as IReporteBugService;
  const contextoPeticion = vi.fn().mockResolvedValue({ ipAddress: "1.2.3.4", userAgent: AGENTE });
  const d: EnviarReporteBugDeps = {
    getActor: async () => (o.actor === undefined ? ACTOR : o.actor),
    contextoPeticion,
    servicio,
  };
  return {
    d,
    enviar: servicio.enviar as ReturnType<typeof vi.fn>,
    prepararSubidas: servicio.prepararSubidas as ReturnType<typeof vi.fn>,
    contextoPeticion,
  };
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
      // SLT-98: sin el campo, el zod pone `imagenes: []` (un reporte sin imágenes).
      {
        descripcion: "El botón no responde",
        pagina: "/ordenes",
        ventana: { ancho: 1280, alto: 720 },
        appInstalada: false,
        imagenes: [],
      },
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

// ─── SLT-98 (design §4.1, §5.2; R9, R11, R12, R14) ───────────────────────────────────────────────

const ID1 = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";
const PNG = { tipo: "image/png", tamano: 2048 };

describe("SLT-98 · prepararSubidaImagenesReporteAction", () => {
  it("R9 — pedir permisos sin sesión da unauthenticated; 0 o 6 imágenes, un tipo image/gif, un tamaño 0 o de 5 242 881 y un campo de más dan validation_error, sin llamar al servicio", async () => {
    const sinSesion = deps({ actor: null });
    expect(await prepararSubidaImagenesReporteAction({ imagenes: [PNG] }, sinSesion.d)).toEqual({
      status: "unauthenticated",
    });
    expect(sinSesion.prepararSubidas).not.toHaveBeenCalled();

    const malas: [string, unknown][] = [
      ["0 imágenes", { imagenes: [] }],
      ["6 imágenes", { imagenes: Array.from({ length: 6 }, () => PNG) }],
      ["gif", { imagenes: [{ tipo: "image/gif", tamano: 10 }] }],
      ["tamaño 0", { imagenes: [{ tipo: "image/png", tamano: 0 }] }],
      ["5 MB + 1", { imagenes: [{ tipo: "image/png", tamano: IMAGEN_BYTES_MAX + 1 }] }],
      ["tamaño no entero", { imagenes: [{ tipo: "image/png", tamano: 1.5 }] }],
      ["campo de más arriba", { imagenes: [PNG], organizacionId: "org-otra" }],
      ["campo de más en una imagen (la ruta)", { imagenes: [{ ...PNG, ruta: "otro/x.png" }] }],
      ["sin imágenes", {}],
      ["no es objeto", "texto"],
    ];
    for (const [caso, entrada] of malas) {
      const { d, prepararSubidas } = deps();
      const r = await prepararSubidaImagenesReporteAction(entrada, d);
      expect(r.status, caso).toBe("validation_error");
      expect(prepararSubidas, caso).not.toHaveBeenCalled();
    }

    // Los límites justos pasan: 1 byte, 5 MB y 5 imágenes.
    const { d, prepararSubidas } = deps();
    const limites = {
      imagenes: [
        { tipo: "image/png", tamano: 1 },
        { tipo: "image/jpeg", tamano: IMAGEN_BYTES_MAX },
        { tipo: "image/webp", tamano: 3 },
        PNG,
        PNG,
      ],
    };
    expect((await prepararSubidaImagenesReporteAction(limites, d)).status).toBe("listas");
    expect(prepararSubidas).toHaveBeenCalledWith(ACTOR, limites);
  });

  it("R9 — devuelve los permisos del servicio tal cual, y su forbidden", async () => {
    const permisos = [
      { imagenId: ID1, url: "https://subida.test/1" },
      { imagenId: ID2, url: "https://subida.test/2" },
    ];
    const ok = deps({ servicio: { prepararSubidas: vi.fn().mockResolvedValue({ status: "listas", permisos }) } });
    expect(await prepararSubidaImagenesReporteAction({ imagenes: [PNG, PNG] }, ok.d)).toEqual({
      status: "listas",
      permisos,
    });

    const prohibido = deps({ servicio: { prepararSubidas: vi.fn().mockResolvedValue({ status: "forbidden" }) } });
    expect(await prepararSubidaImagenesReporteAction({ imagenes: [PNG] }, prohibido.d)).toEqual({
      status: "forbidden",
    });
  });

  it("R9 — si el almacén falla responde error y el log lleva solo el nombre de la causa", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const fallo = new Error("Bucket not found org-1/u-1");
    fallo.name = "StorageError";
    const { d } = deps({ servicio: { prepararSubidas: vi.fn().mockRejectedValue(fallo) } });

    expect(await prepararSubidaImagenesReporteAction({ imagenes: [PNG] }, d)).toEqual({ status: "error" });
    expect(log).toHaveBeenCalledWith("[reporte-bug] fallo al preparar la subida causa=StorageError");
  });
});

describe("SLT-98 · enviarReporteBugAction con imágenes", () => {
  it("R12 — 6 imágenes, un id repetido, un id que no es uuid, un tipo image/gif o un campo de más en una imagen dan validation_error sin llamar al servicio", async () => {
    const img = (id: string, tipo = "image/png") => ({ id, tipo });
    const ids = Array.from({ length: 6 }, (_, i) => `${i}${ID1.slice(1)}`);
    const malas: [string, unknown][] = [
      ["6 imágenes", { ...VALIDA, imagenes: ids.map((id) => img(id)) }],
      ["id repetido", { ...VALIDA, imagenes: [img(ID1), img(ID1)] }],
      ["id que no es uuid", { ...VALIDA, imagenes: [img("../u-otro/x")] }],
      ["gif", { ...VALIDA, imagenes: [img(ID1, "image/gif")] }],
      ["campo de más en una imagen", { ...VALIDA, imagenes: [{ ...img(ID1), tamano: 10 }] }],
      ["ruta en una imagen", { ...VALIDA, imagenes: [{ ...img(ID1), ruta: "u-otro/x.png" }] }],
    ];
    for (const [caso, entrada] of malas) {
      const { d, enviar } = deps();
      const r = await enviarReporteBugAction(entrada, d);
      expect(r.status, caso).toBe("validation_error");
      expect(enviar, caso).not.toHaveBeenCalled();
    }

    // 5 imágenes distintas pasan, en el orden en que llegan.
    const { d, enviar } = deps();
    const cinco = ids.slice(0, 5).map((id) => img(id));
    expect(await enviarReporteBugAction({ ...VALIDA, imagenes: cinco }, d)).toEqual({ status: "enviado" });
    expect(enviar.mock.calls[0][1].imagenes).toEqual(cinco);
  });

  it("R14 — la respuesta buena es exactamente { status: \"enviado\" }, también con imágenes", async () => {
    const { d } = deps();
    const r = await enviarReporteBugAction({ ...VALIDA, imagenes: [{ id: ID1, tipo: "image/png" }] }, d);
    expect(r).toStrictEqual({ status: "enviado" });
    expect(Object.keys(r)).toEqual(["status"]);
  });

  it("R11 — imagenes_invalidas del servicio llega al panel con los ids", async () => {
    const { d } = deps({
      servicio: { enviar: vi.fn().mockResolvedValue({ status: "imagenes_invalidas", imagenes: [ID2] }) },
    });
    const entrada = { ...VALIDA, imagenes: [{ id: ID1, tipo: "image/png" }, { id: ID2, tipo: "image/jpeg" }] };
    expect(await enviarReporteBugAction(entrada, d)).toEqual({ status: "imagenes_invalidas", imagenes: [ID2] });
  });
});
