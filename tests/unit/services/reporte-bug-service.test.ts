import { describe, expect, it, vi } from "vitest";

import type { EmailMessage, IEmailSender } from "@/lib/interfaces/external/IEmailSender";
import type { IBugReportRepository } from "@/lib/interfaces/repositories/IBugReportRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { ReporteBugService } from "@/lib/services/ReporteBugService";
import type { BugReportCreado, EnviarReporteBugDatos, NuevoBugReport } from "@/lib/types/reporte-bug";

// SLT-87 (design §5; R11, R15, R16, R17) — el servicio con dobles: un repositorio en memoria que anota
// lo que guarda y un emisor que anota lo que manda. El SQL se prueba en
// `tests/integration/db/bug-report.test.ts`.

const ACTOR: Actor = { usuarioId: "u-1", rol: "mensajero", organizacionId: "org-1" };
const ENTRADA: EnviarReporteBugDatos = {
  descripcion: "No carga el mapa",
  pagina: "/mis-asignaciones",
  ventana: { ancho: 390, alto: 844 },
  appInstalada: true,
  imagenes: [],
};
const ENTORNO = { userAgent: "Mozilla/5.0 (Android)" };

interface Doble {
  servicio: ReporteBugService;
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
  const servicio = new ReporteBugService(repo, sender, () => o.destinatarios ?? [], log);
  return { servicio, guardados, enviados, log, orden };
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
