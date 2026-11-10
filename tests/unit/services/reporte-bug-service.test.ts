import { describe, expect, it, vi } from "vitest";

import { ENLACE_CORREO_SEGUNDOS, IMAGEN_BYTES_MAX, IMAGENES_POR_DIA_MAX, tipoPorFirma } from "@/lib/config/reporte-bug";
import { contextoActual } from "@/lib/db/contexto-empresa";
import type { IAlmacenImagenesReporte } from "@/lib/interfaces/external/IAlmacenImagenesReporte";
import type { EmailMessage, IEmailSender } from "@/lib/interfaces/external/IEmailSender";
import type { IBugReportRepository } from "@/lib/interfaces/repositories/IBugReportRepository";
import type { ICupoImagenesReporte } from "@/lib/interfaces/repositories/ICupoImagenesReporte";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { ReporteBugService } from "@/lib/services/ReporteBugService";
import type { BugReportCreado, EnviarReporteBugDatos, NuevoBugReport } from "@/lib/types/reporte-bug";
import { reglasPaisFijas } from "@/tests/fabricas/reglas-pais";

// SLT-87 (design §5; R11, R15, R16, R17) — el servicio con dobles: un repositorio en memoria que anota
// lo que guarda y un emisor que anota lo que manda. El SQL se prueba en
// `tests/integration/db/bug-report.test.ts`.
//
// SLT-98 (design §5; R9–R11, R13, R20, R21): el almacén de imágenes es un doble en memoria que anota cada
// llamada con el contexto de empresa en que ocurrió.
//
// SLT-98 (design §16.4; R24, R25, R27, R28, R30): el cupo diario es otro doble que anota cada llamada y
// cuántas había hecho ya el almacén en ese momento. Las reglas del país son las de Costa Rica.

const ACTOR: Actor = { usuarioId: "u-1", rol: "mensajero", organizacionId: "org-1" };
const ENTRADA: EnviarReporteBugDatos = {
  descripcion: "No carga el mapa",
  pagina: "/mis-asignaciones",
  ventana: { ancho: 390, alto: 844 },
  appInstalada: true,
  imagenes: [],
};
const ENTORNO = { userAgent: "Mozilla/5.0 (Android)" };

type Contexto = ReturnType<typeof contextoActual>;

interface AlmacenDoble {
  almacen: IAlmacenImagenesReporte;
  /** Cada llamada, con su contexto de empresa. */
  llamadas: { op: string; args: unknown[]; contexto: Contexto }[];
}

/** `objetos` son los que hay en el bucket, por ruta relativa a la carpeta de la empresa. */
function almacenDoble(o: {
  objetos?: Record<string, Uint8Array>;
  firmar?: (rutas: string[]) => Promise<Record<string, string>>;
  borrarLanza?: Error;
} = {}): AlmacenDoble {
  const llamadas: AlmacenDoble["llamadas"] = [];
  const anota = (op: string, ...args: unknown[]) => llamadas.push({ op, args, contexto: contextoActual() });
  const almacen: IAlmacenImagenesReporte = {
    prepararSubida: async (ruta) => {
      anota("prepararSubida", ruta);
      return { url: `https://subida.test/${ruta}?token=t` };
    },
    leer: async (ruta) => {
      anota("leer", ruta);
      return o.objetos?.[ruta] ?? null;
    },
    firmar: async (rutas, ttl) => {
      anota("firmar", rutas, ttl);
      if (o.firmar) return o.firmar(rutas);
      return Object.fromEntries(rutas.map((r) => [r, `https://firmada.test/${r}?sig=1`]));
    },
    borrar: async (rutas) => {
      anota("borrar", rutas);
      if (o.borrarLanza) throw o.borrarLanza;
    },
  };
  return { almacen, llamadas };
}

interface CupoDoble {
  cupo: ICupoImagenesReporte;
  /** Cada llamada, con las del almacén que ya habían ocurrido. */
  llamadas: { op: "consumir" | "devolver"; args: unknown[]; almacenAntes: number }[];
}

interface Doble {
  servicio: ReporteBugService;
  almacen: AlmacenDoble;
  cupo: CupoDoble;
  guardados: NuevoBugReport[];
  enviados: EmailMessage[];
  log: ReturnType<typeof vi.fn>;
  /** Orden de los efectos: «guardar» y «correo:<to>». */
  orden: string[];
}

function doble(o: {
  destinatarios?: string[];
  usuarioEnLaEmpresa?: boolean;
  fallaPara?: string[];
  guardarLanza?: Error;
  almacen?: AlmacenDoble;
  ids?: string[];
  /** Lo que devuelve `consumir`; por defecto, el total como si no hubiera fila. */
  consumirDevuelve?: number | null;
  devolverLanza?: Error;
  ahora?: Date;
} = {}): Doble {
  const guardados: NuevoBugReport[] = [];
  const enviados: EmailMessage[] = [];
  const orden: string[] = [];
  const repo: IBugReportRepository = {
    crear: async (datos) => {
      orden.push("guardar");
      if (o.guardarLanza) throw o.guardarLanza;
      if (o.usuarioEnLaEmpresa === false) return null;
      guardados.push(datos);
      const creado: BugReportCreado = {
        ...datos,
        id: "rep-1",
        createdAt: new Date("2026-11-09T12:00:00.000Z"),
        reporterName: "Ana Pérez",
        reporterEmail: "ana@empresa.example",
        organizationName: "Envíos Uno",
      };
      return creado;
    },
    // SLT-97: las lecturas y el cambio de estado son del superadmin; el envío nunca los toca.
    listar: () => Promise.reject(new Error("el envío no lista reportes")),
    detalle: () => Promise.reject(new Error("el envío no lee el detalle")),
    cambiarEstado: () => Promise.reject(new Error("el envío no cambia el estado")),
  };
  const sender: IEmailSender = {
    enviar: async (m) => {
      orden.push(`correo:${m.to}`);
      if (o.fallaPara?.includes(m.to)) {
        const e = new Error("SMTP caído con datos de la fila");
        e.name = "SmtpError";
        throw e;
      }
      enviados.push(m);
      return { messageId: "id" };
    },
  };
  const log = vi.fn();
  const almacen = o.almacen ?? almacenDoble();
  const ids = [...(o.ids ?? [])];
  const nuevoId = () => ids.shift() ?? "sin-id";
  const llamadasCupo: CupoDoble["llamadas"] = [];
  const cupo: ICupoImagenesReporte = {
    consumir: async (...args) => {
      llamadasCupo.push({ op: "consumir", args, almacenAntes: almacen.llamadas.length });
      return o.consumirDevuelve === undefined ? args[2] : o.consumirDevuelve;
    },
    devolver: async (...args) => {
      llamadasCupo.push({ op: "devolver", args, almacenAntes: almacen.llamadas.length });
      if (o.devolverLanza) throw o.devolverLanza;
    },
  };
  const servicio = new ReporteBugService(
    repo,
    almacen.almacen,
    cupo,
    sender,
    reglasPaisFijas(),
    () => o.destinatarios ?? [],
    log,
    nuevoId,
    () => o.ahora ?? new Date("2026-11-10T18:00:00.000Z"),
  );
  return { servicio, almacen, cupo: { cupo, llamadas: llamadasCupo }, guardados, enviados, log, orden };
}

describe("SLT-87 · ReporteBugService.enviar", () => {
  it("R11 — el superadmin, un actor sin empresa y un usuario que el repositorio no encuentra en su empresa dan forbidden sin guardar ni enviar correo", async () => {
    const casos: { actor: Actor; usuarioEnLaEmpresa?: boolean; guardaIntento: boolean }[] = [
      { actor: { usuarioId: "sa", rol: "superadmin", organizacionId: null }, guardaIntento: false },
      // Un superadmin con empresa no existe, pero la puerta no depende de que la base lo impida.
      { actor: { usuarioId: "sa", rol: "superadmin", organizacionId: "org-1" }, guardaIntento: false },
      { actor: { usuarioId: "u-2", rol: "maestro", organizacionId: null }, guardaIntento: false },
      { actor: { usuarioId: "u-3", rol: "maestro" }, guardaIntento: false },
      { actor: ACTOR, usuarioEnLaEmpresa: false, guardaIntento: true },
    ];
    for (const c of casos) {
      const d = doble({ destinatarios: ["soporte@example.test"], usuarioEnLaEmpresa: c.usuarioEnLaEmpresa });

      const r = await d.servicio.enviar(c.actor, ENTRADA, ENTORNO);

      expect(r, JSON.stringify(c.actor)).toEqual({ status: "forbidden" });
      expect(d.guardados).toEqual([]);
      expect(d.enviados).toEqual([]);
      expect(d.orden).toEqual(c.guardaIntento ? ["guardar"] : []);
    }
  });

  it("R13 — guarda la empresa, el usuario y el rol del actor, la ruta, el agente recortado a 512 y la ventana", async () => {
    const d = doble();

    await d.servicio.enviar(ACTOR, ENTRADA, { userAgent: "A".repeat(600) });

    expect(d.guardados).toEqual([
      {
        organizationId: "org-1",
        reporterUserId: "u-1",
        reporterRole: "mensajero",
        description: "No carga el mapa",
        pagePath: "/mis-asignaciones",
        userAgent: "A".repeat(512),
        viewportWidth: 390,
        viewportHeight: 844,
        isStandalone: true,
        // SLT-98 (R13): sin imágenes en la entrada, ninguna fila de imagen.
        imagenes: [],
      },
    ]);
  });

  it("R13 — sin ventana ni modo, guarda nulos", async () => {
    const d = doble();
    await d.servicio.enviar(ACTOR, { descripcion: "x", pagina: "/", imagenes: [] }, ENTORNO);
    expect(d.guardados[0]).toMatchObject({ viewportWidth: null, viewportHeight: null, isStandalone: null });
  });

  it("R15 — manda un correo por destinatario y a nadie más, después de guardar", async () => {
    const d = doble({ destinatarios: ["uno@example.test", "dos@example.test"] });

    const r = await d.servicio.enviar(ACTOR, ENTRADA, ENTORNO);

    expect(r).toEqual({ status: "enviado" });
    expect(d.orden[0]).toBe("guardar");
    expect(d.orden.slice(1).sort()).toEqual(["correo:dos@example.test", "correo:uno@example.test"]);
    expect(d.enviados.map((m) => m.to).sort()).toEqual(["dos@example.test", "uno@example.test"]);
    // Ni a quien reporta ni a su empresa.
    expect(d.enviados.map((m) => m.to)).not.toContain("ana@empresa.example");
    for (const m of d.enviados) {
      expect(m.text).toContain("No carga el mapa");
      expect(m.text).toContain("Página: /mis-asignaciones");
    }
  });

  it("R16 — sin destinatarios guarda y responde enviado sin llamar al emisor", async () => {
    const d = doble({ destinatarios: [] });

    const r = await d.servicio.enviar(ACTOR, ENTRADA, ENTORNO);

    expect(r).toEqual({ status: "enviado" });
    expect(d.guardados).toHaveLength(1);
    expect(d.orden).toEqual(["guardar"]);
    expect(d.log).not.toHaveBeenCalled();
  });

  it("R17 — si un envío falla, los demás salen, el reporte queda guardado, la respuesta es enviado y el fallo se registra sin reintento", async () => {
    const d = doble({ destinatarios: ["uno@example.test", "cae@example.test", "tres@example.test"], fallaPara: ["cae@example.test"] });

    const r = await d.servicio.enviar(ACTOR, ENTRADA, ENTORNO);

    expect(r).toEqual({ status: "enviado" });
    expect(d.guardados).toHaveLength(1);
    expect(d.enviados.map((m) => m.to).sort()).toEqual(["tres@example.test", "uno@example.test"]);
    // Un intento por destinatario: el que cae no se reintenta.
    expect(d.orden.filter((p) => p === "correo:cae@example.test")).toHaveLength(1);
    expect(d.log).toHaveBeenCalledTimes(1);
    expect(d.log).toHaveBeenCalledWith("[reporte-bug] fallo la copia por correo reporte=rep-1 causa=SmtpError");
  });

  it("R17 — si fallan todos, igual responde enviado y registra un fallo por destinatario", async () => {
    const dest = ["uno@example.test", "dos@example.test"];
    const d = doble({ destinatarios: dest, fallaPara: dest });

    expect(await d.servicio.enviar(ACTOR, ENTRADA, ENTORNO)).toEqual({ status: "enviado" });
    expect(d.guardados).toHaveLength(1);
    expect(d.log).toHaveBeenCalledTimes(2);
    // El log no lleva la descripción ni el mensaje del error.
    for (const [linea] of d.log.mock.calls) {
      expect(String(linea)).not.toContain("No carga el mapa");
      expect(String(linea)).not.toContain("datos de la fila");
    }
  });

  it("R10 — un fallo al guardar se propaga y no sale ningún correo", async () => {
    const d = doble({ destinatarios: ["uno@example.test"], guardarLanza: new Error("base caída") });

    await expect(d.servicio.enviar(ACTOR, ENTRADA, ENTORNO)).rejects.toThrow("base caída");
    expect(d.enviados).toEqual([]);
  });
});

// ─── SLT-98 ──────────────────────────────────────────────────────────────────────────────────────

const ORG_CTX = { tipo: "empresa", organizacionId: "org-1" };
const ID1 = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";
const ID3 = "33333333-3333-4333-8333-333333333333";
const ID4 = "44444444-4444-4444-8444-444444444444";

const FIRMA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const FIRMA_JPEG = [0xff, 0xd8, 0xff];
const FIRMA_WEBP = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];

/** `largo` bytes que empiezan por `firma`. */
function bytes(firma: number[], largo = 64): Uint8Array {
  const b = new Uint8Array(largo);
  b.set(firma.slice(0, largo));
  return b;
}

const conImagenes = (imagenes: EnviarReporteBugDatos["imagenes"]): EnviarReporteBugDatos => ({ ...ENTRADA, imagenes });

describe("SLT-98 · ReporteBugService.prepararSubidas", () => {
  it("R9 — pedir permisos con un rol de plataforma o sin empresa da forbidden sin tocar el almacén", async () => {
    const actores: Actor[] = [
      { usuarioId: "sa", rol: "superadmin", organizacionId: null },
      { usuarioId: "sa", rol: "superadmin", organizacionId: "org-1" },
      { usuarioId: "u-2", rol: "maestro", organizacionId: null },
      { usuarioId: "u-3", rol: "maestro" },
    ];
    for (const actor of actores) {
      const d = doble({ ids: [ID1] });
      const r = await d.servicio.prepararSubidas(actor, { imagenes: [{ tipo: "image/png", tamano: 10 }] });
      expect(r, JSON.stringify(actor)).toEqual({ status: "forbidden" });
      expect(d.almacen.llamadas).toEqual([]);
      // SLT-98 (R24, P6): una petición que no pasa la puerta no cuenta.
      expect(d.cupo.llamadas).toEqual([]);
    }
  });

  it("R9 — da un permiso por imagen, en orden, con la ruta <usuarioId>/<uuid>.<ext> dentro de conEmpresa de la empresa del actor", async () => {
    const d = doble({ ids: [ID1, ID2, ID3] });

    const r = await d.servicio.prepararSubidas(ACTOR, {
      imagenes: [
        { tipo: "image/png", tamano: 10 },
        { tipo: "image/jpeg", tamano: 20 },
        { tipo: "image/webp", tamano: 30 },
      ],
    });

    const rutas = [`u-1/${ID1}.png`, `u-1/${ID2}.jpg`, `u-1/${ID3}.webp`];
    expect(r).toEqual({
      status: "listas",
      permisos: [
        { imagenId: ID1, url: `https://subida.test/${rutas[0]}?token=t` },
        { imagenId: ID2, url: `https://subida.test/${rutas[1]}?token=t` },
        { imagenId: ID3, url: `https://subida.test/${rutas[2]}?token=t` },
      ],
    });
    // En serie y en orden, cada una dentro del contexto de la empresa del actor.
    expect(d.almacen.llamadas).toEqual(rutas.map((ruta) => ({ op: "prepararSubida", args: [ruta], contexto: ORG_CTX })));
    expect(contextoActual()).toBeUndefined();
  });

  it("R9 — un fallo del almacén se propaga", async () => {
    const { almacen } = almacenDoble();
    almacen.prepararSubida = () => Promise.reject(new Error("Storage caído"));
    const d = doble({ ids: [ID1], almacen: { almacen, llamadas: [] } });
    await expect(d.servicio.prepararSubidas(ACTOR, { imagenes: [{ tipo: "image/png", tamano: 1 }] })).rejects.toThrow(
      "Storage caído",
    );
  });
});

describe("SLT-98 · ReporteBugService.enviar con imágenes", () => {
  it("R10 — tipoPorFirma reconoce PNG, JPEG y WebP y da null con un GIF y con bytes de menos", () => {
    expect(tipoPorFirma(bytes(FIRMA_PNG))).toBe("image/png");
    expect(tipoPorFirma(bytes(FIRMA_JPEG))).toBe("image/jpeg");
    expect(tipoPorFirma(bytes(FIRMA_WEBP))).toBe("image/webp");
    expect(tipoPorFirma(new Uint8Array(FIRMA_JPEG))).toBe("image/jpeg");
    // GIF89a.
    expect(tipoPorFirma(bytes([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBeNull();
    // Un RIFF que no es WebP (un WAV).
    expect(tipoPorFirma(bytes([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]))).toBeNull();
    // Bytes de menos.
    expect(tipoPorFirma(new Uint8Array(FIRMA_PNG.slice(0, 7)))).toBeNull();
    expect(tipoPorFirma(new Uint8Array(FIRMA_JPEG.slice(0, 2)))).toBeNull();
    expect(tipoPorFirma(new Uint8Array(FIRMA_WEBP.slice(0, 11)))).toBeNull();
    expect(tipoPorFirma(new Uint8Array(0))).toBeNull();
  });

  it("R10 — enviar lee cada imagen en la ruta del usuario de la sesión y acepta solo las que existen, pesan 1 B–5 MB y tienen la firma de su tipo", async () => {
    // Válidas: una PNG de 5 MB justos, una JPEG de 3 bytes y una WebP.
    const objetos = {
      [`u-1/${ID1}.png`]: bytes(FIRMA_PNG, IMAGEN_BYTES_MAX),
      [`u-1/${ID2}.jpg`]: new Uint8Array(FIRMA_JPEG),
      [`u-1/${ID3}.webp`]: bytes(FIRMA_WEBP),
    };
    const almacen = almacenDoble({ objetos });
    const d = doble({ almacen });

    const r = await d.servicio.enviar(
      ACTOR,
      conImagenes([
        { id: ID1, tipo: "image/png" },
        { id: ID2, tipo: "image/jpeg" },
        { id: ID3, tipo: "image/webp" },
      ]),
      ENTORNO,
    );

    expect(r).toEqual({ status: "enviado" });
    const lecturas = almacen.llamadas.filter((l) => l.op === "leer");
    expect(lecturas).toEqual(Object.keys(objetos).map((ruta) => ({ op: "leer", args: [ruta], contexto: ORG_CTX })));
    expect(d.guardados[0].imagenes.map((i) => i.id)).toEqual([ID1, ID2, ID3]);

    // La misma imagen subida por OTRO usuario de la empresa no está en la carpeta del de la sesión.
    const ajena = almacenDoble({ objetos: { [`u-otro/${ID4}.png`]: bytes(FIRMA_PNG) } });
    const d2 = doble({ almacen: ajena });
    expect(await d2.servicio.enviar(ACTOR, conImagenes([{ id: ID4, tipo: "image/png" }]), ENTORNO)).toEqual({
      status: "imagenes_invalidas",
      imagenes: [ID4],
    });
    expect(ajena.llamadas.find((l) => l.op === "leer")?.args).toEqual([`u-1/${ID4}.png`]);

    // Vacía (0 B): no vale.
    const vacia = doble({ almacen: almacenDoble({ objetos: { [`u-1/${ID1}.png`]: new Uint8Array(0) } }) });
    expect(await vacia.servicio.enviar(ACTOR, conImagenes([{ id: ID1, tipo: "image/png" }]), ENTORNO)).toEqual({
      status: "imagenes_invalidas",
      imagenes: [ID1],
    });

    // Sin imágenes no se toca el almacén.
    const sin = doble();
    await sin.servicio.enviar(ACTOR, ENTRADA, ENTORNO);
    expect(sin.almacen.llamadas).toEqual([]);
  });

  it("R11 — una imagen que falta, una de 5 MB + 1 o una «PNG» con firma JPEG da imagenes_invalidas con su id, sin llamar al repositorio ni al emisor, y borra las que existían", async () => {
    const objetos = {
      // Válida: no se borra, el panel la reutiliza en el próximo envío.
      [`u-1/${ID1}.png`]: bytes(FIRMA_PNG),
      [`u-1/${ID3}.png`]: bytes(FIRMA_PNG, IMAGEN_BYTES_MAX + 1),
      [`u-1/${ID4}.png`]: bytes(FIRMA_JPEG),
    };
    const almacen = almacenDoble({ objetos });
    const d = doble({ almacen, destinatarios: ["soporte@example.test"] });

    const r = await d.servicio.enviar(
      ACTOR,
      conImagenes([
        { id: ID1, tipo: "image/png" },
        { id: ID2, tipo: "image/png" },
        { id: ID3, tipo: "image/png" },
        { id: ID4, tipo: "image/png" },
      ]),
      ENTORNO,
    );

    expect(r).toEqual({ status: "imagenes_invalidas", imagenes: [ID2, ID3, ID4] });
    expect(d.orden).toEqual([]);
    expect(d.guardados).toEqual([]);
    expect(d.enviados).toEqual([]);
    expect(almacen.llamadas.filter((l) => l.op === "borrar")).toEqual([
      { op: "borrar", args: [[`u-1/${ID3}.png`, `u-1/${ID4}.png`]], contexto: ORG_CTX },
    ]);
    expect(almacen.llamadas.some((l) => l.op === "firmar")).toBe(false);

    // Si borrar falla, se registra y la respuesta no cambia.
    const fallo = new Error("Storage caído");
    fallo.name = "StorageError";
    const d2 = doble({ almacen: almacenDoble({ objetos, borrarLanza: fallo }) });
    expect(await d2.servicio.enviar(ACTOR, conImagenes([{ id: ID3, tipo: "image/png" }]), ENTORNO)).toEqual({
      status: "imagenes_invalidas",
      imagenes: [ID3],
    });
    expect(d2.log).toHaveBeenCalledWith("[reporte-bug] fallo al borrar imagenes no aceptadas causa=StorageError");
  });

  it("R11 — un error al leer que no es «no existe» se propaga sin guardar", async () => {
    const { almacen } = almacenDoble();
    almacen.leer = () => Promise.reject(new Error("Storage caído"));
    const d = doble({ almacen: { almacen, llamadas: [] } });
    await expect(d.servicio.enviar(ACTOR, conImagenes([{ id: ID1, tipo: "image/png" }]), ENTORNO)).rejects.toThrow(
      "Storage caído",
    );
    expect(d.orden).toEqual([]);
  });

  it("R13 — el tamaño que guarda es el medido, no uno del cliente", async () => {
    const almacen = almacenDoble({
      objetos: { [`u-1/${ID1}.jpg`]: bytes(FIRMA_JPEG, 1234), [`u-1/${ID2}.webp`]: bytes(FIRMA_WEBP, 77) },
    });
    const d = doble({ almacen });
    // Un tamaño del cliente no pasa el contrato del envío (`strict`); aunque llegara, no se usaría.
    const entrada = conImagenes([
      { id: ID1, tipo: "image/jpeg", tamano: 1 } as EnviarReporteBugDatos["imagenes"][number],
      { id: ID2, tipo: "image/webp" },
    ]);

    await d.servicio.enviar(ACTOR, entrada, ENTORNO);

    expect(d.guardados[0].imagenes).toEqual([
      { id: ID1, position: 1, storagePath: `u-1/${ID1}.jpg`, contentType: "image/jpeg", sizeBytes: 1234 },
      { id: ID2, position: 2, storagePath: `u-1/${ID2}.webp`, contentType: "image/webp", sizeBytes: 77 },
    ]);
  });

  it("R20 — firma las rutas una vez con 86400 segundos y manda los mismos enlaces a cada destinatario", async () => {
    const almacen = almacenDoble({
      objetos: { [`u-1/${ID1}.png`]: bytes(FIRMA_PNG), [`u-1/${ID2}.jpg`]: bytes(FIRMA_JPEG) },
    });
    const d = doble({ almacen, destinatarios: ["uno@example.test", "dos@example.test"] });

    const r = await d.servicio.enviar(
      ACTOR,
      conImagenes([
        { id: ID1, tipo: "image/png" },
        { id: ID2, tipo: "image/jpeg" },
      ]),
      ENTORNO,
    );

    expect(r).toEqual({ status: "enviado" });
    expect(ENLACE_CORREO_SEGUNDOS).toBe(86400);
    expect(almacen.llamadas.filter((l) => l.op === "firmar")).toEqual([
      { op: "firmar", args: [[`u-1/${ID1}.png`, `u-1/${ID2}.jpg`], 86400], contexto: ORG_CTX },
    ]);
    expect(d.enviados).toHaveLength(2);
    for (const m of d.enviados) {
      expect(m.text).toContain("Imágenes (2). Los enlaces vencen en 24 horas:");
      expect(m.text).toContain(`Ver imagen 1: https://firmada.test/u-1/${ID1}.png?sig=1`);
      expect(m.text).toContain(`Ver imagen 2: https://firmada.test/u-1/${ID2}.jpg?sig=1`);
    }
    // Mismo cuerpo para los dos destinatarios.
    expect(d.enviados[0].text).toBe(d.enviados[1].text);
  });

  it("R21 — si firmar lanza o le falta una ruta, el correo sale con «Imagen {n}: no se pudo generar el enlace…» y la respuesta es enviado", async () => {
    const objetos = { [`u-1/${ID1}.png`]: bytes(FIRMA_PNG), [`u-1/${ID2}.jpg`]: bytes(FIRMA_JPEG) };
    const entrada = conImagenes([
      { id: ID1, tipo: "image/png" },
      { id: ID2, tipo: "image/jpeg" },
    ]);
    const aviso = (n: number) => `Imagen ${n}: no se pudo generar el enlace. Mírala en el detalle del reporte.`;

    // Firmar lanza: las dos llevan el aviso.
    const fallo = new Error("Storage caído");
    fallo.name = "StorageError";
    const lanza = doble({
      destinatarios: ["uno@example.test"],
      almacen: almacenDoble({ objetos, firmar: () => Promise.reject(fallo) }),
    });
    expect(await lanza.servicio.enviar(ACTOR, entrada, ENTORNO)).toEqual({ status: "enviado" });
    expect(lanza.guardados).toHaveLength(1);
    expect(lanza.enviados[0].text).toContain(aviso(1));
    expect(lanza.enviados[0].text).toContain(aviso(2));
    expect(lanza.log).toHaveBeenCalledWith("[reporte-bug] fallo al firmar las imagenes reporte=rep-1 causa=StorageError");

    // Falta una ruta: solo esa lleva el aviso.
    const parcial = doble({
      destinatarios: ["uno@example.test"],
      almacen: almacenDoble({ objetos, firmar: async () => ({ [`u-1/${ID2}.jpg`]: "https://firmada.test/dos" }) }),
    });
    expect(await parcial.servicio.enviar(ACTOR, entrada, ENTORNO)).toEqual({ status: "enviado" });
    expect(parcial.enviados[0].text).toContain(aviso(1));
    expect(parcial.enviados[0].text).not.toContain(aviso(2));
    expect(parcial.enviados[0].text).toContain("Ver imagen 2: https://firmada.test/dos");
  });
});

describe("SLT-98 · ReporteBugService.prepararSubidas y el tope diario", () => {
  const DOS = { imagenes: [{ tipo: "image/png" as const, tamano: 10 }, { tipo: "image/jpeg" as const, tamano: 20 }] };

  it("R24 — prepararSubidas consume el cupo con el usuario de la sesión, la fecha de Costa Rica, el número de imágenes y el tope 21, antes de tocar el almacén", async () => {
    const d = doble({ ids: [ID1, ID2], ahora: new Date("2026-11-10T18:00:00.000Z") });

    await d.servicio.prepararSubidas(ACTOR, DOS);

    expect(IMAGENES_POR_DIA_MAX).toBe(21);
    expect(d.cupo.llamadas).toEqual([{ op: "consumir", args: ["u-1", "2026-11-10", 2, 21], almacenAntes: 0 }]);
    expect(d.almacen.llamadas.map((l) => l.op)).toEqual(["prepararSubida", "prepararSubida"]);
  });

  it("R24 — con consumir devolviendo 25, da listas con un permiso por imagen", async () => {
    const d = doble({ ids: [ID1, ID2], consumirDevuelve: 25 });

    const r = await d.servicio.prepararSubidas(ACTOR, DOS);

    expect(r).toEqual({
      status: "listas",
      permisos: [
        { imagenId: ID1, url: `https://subida.test/u-1/${ID1}.png?token=t` },
        { imagenId: ID2, url: `https://subida.test/u-1/${ID2}.jpg?token=t` },
      ],
    });
    expect(d.cupo.llamadas.map((l) => l.op)).toEqual(["consumir"]);
  });

  it("R24 — la fecha del cupo es el día de Costa Rica: a las 05:30 UTC del 11 cuenta en 2026-11-10", async () => {
    const d = doble({ ids: [ID1], ahora: new Date("2026-11-11T05:30:00.000Z") });

    await d.servicio.prepararSubidas(ACTOR, { imagenes: [{ tipo: "image/png", tamano: 10 }] });

    expect(d.cupo.llamadas[0].args[1]).toBe("2026-11-10");
  });

  it("R25 — si consumir devuelve null, da exactamente { status: \"sin_cupo_imagenes\" } y no llama al almacén ni a devolver", async () => {
    const d = doble({ ids: [ID1, ID2], consumirDevuelve: null });

    const r = await d.servicio.prepararSubidas(ACTOR, DOS);

    expect(r).toStrictEqual({ status: "sin_cupo_imagenes" });
    expect(d.almacen.llamadas).toEqual([]);
    expect(d.cupo.llamadas.map((l) => l.op)).toEqual(["consumir"]);
    expect(d.log).not.toHaveBeenCalled();
  });

  it("R27 — si el almacén falla, devuelve el cupo de la petición y relanza; si devolver también falla, registra «fallo al devolver el cupo de imagenes» y relanza el error original", async () => {
    const falla = (): AlmacenDoble => {
      const a = almacenDoble();
      let n = 0;
      const original = a.almacen.prepararSubida;
      // La segunda imagen falla: la primera ya tenía permiso, y aun así se devuelven las dos.
      a.almacen.prepararSubida = async (ruta) => {
        n += 1;
        if (n === 2) throw Object.assign(new Error("Storage caído"), { name: "StorageError" });
        return original(ruta);
      };
      return a;
    };

    const d = doble({ ids: [ID1, ID2], almacen: falla() });
    await expect(d.servicio.prepararSubidas(ACTOR, DOS)).rejects.toThrow("Storage caído");
    expect(d.cupo.llamadas.map(({ op, args }) => ({ op, args }))).toEqual([
      { op: "consumir", args: ["u-1", "2026-11-10", 2, 21] },
      { op: "devolver", args: ["u-1", "2026-11-10", 2] },
    ]);
    expect(d.log).not.toHaveBeenCalled();

    const roto = Object.assign(new Error("base caída"), { name: "DevolverError" });
    const d2 = doble({ ids: [ID1, ID2], almacen: falla(), devolverLanza: roto });
    await expect(d2.servicio.prepararSubidas(ACTOR, DOS)).rejects.toThrow("Storage caído");
    expect(d2.cupo.llamadas.map((l) => l.op)).toEqual(["consumir", "devolver"]);
    expect(d2.log).toHaveBeenCalledTimes(1);
    expect(d2.log).toHaveBeenCalledWith("[reporte-bug] fallo al devolver el cupo de imagenes causa=DevolverError");
  });

  it("R28 — enviar no consume ni lee el cupo", async () => {
    const almacen = almacenDoble({ objetos: { [`u-1/${ID1}.png`]: bytes(FIRMA_PNG) } });
    const d = doble({ destinatarios: ["soporte@example.test"], almacen, consumirDevuelve: null });

    const r = await d.servicio.enviar(ACTOR, conImagenes([{ id: ID1, tipo: "image/png" }]), ENTORNO);

    expect(r).toEqual({ status: "enviado" });
    expect(d.guardados[0].imagenes).toHaveLength(1);
    expect(d.cupo.llamadas).toEqual([]);
  });

  it("R30 — enviar un reporte sin imágenes da enviado sin llamar al cupo, aunque el cupo doble diga que no hay", async () => {
    const d = doble({ destinatarios: ["soporte@example.test"], consumirDevuelve: null });

    const r = await d.servicio.enviar(ACTOR, ENTRADA, ENTORNO);

    expect(r).toEqual({ status: "enviado" });
    expect(d.guardados).toHaveLength(1);
    expect(d.cupo.llamadas).toEqual([]);
  });
});
