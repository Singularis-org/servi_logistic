import { describe, expect, it, vi } from "vitest";

import { conEmpresa } from "@/lib/db/contexto-empresa";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { ReglasPaisEmpresaService } from "@/lib/services/ReglasPaisEmpresaService";
import { DOCUMENTO_TIPOS } from "@/lib/types/postulacion-mensajero";
import { ResetRateLimiter } from "@/lib/utils/reset-rate-limit";

// SLT-42 (T4.2; R10, R11, R14-R16) — EL COMPOSITION ROOT *PASA* LAS REGLAS DEL PAÍS.
//
// En `PostulacionMensajeroService` y `AprobacionPostulacionService` las reglas son el último
// parámetro y son OPCIONALES (si no, rompen las decenas de `new …(repo, …)` de los tests), así que
// olvidarlas en la action NO rompe el typecheck: solo haría lanzar `postular`/`aprobar` en
// producción. Lo único que lo detecta es ejecutar la action SIN servicio inyectado y mirar QUÉ
// construyó. Mismo patrón que `usuarios-composition.test.ts`. Prisma y Storage se sustituyen: lo
// que se mide es el cableado, no la base.

const capturado = vi.hoisted(() => ({ postulacion: [] as unknown[][], aprobacion: [] as unknown[][] }));

vi.mock("@/lib/db/prisma-client", () => ({ getPrismaClient: () => ({}) }));
vi.mock("@/lib/storage/SupabaseFileStorage", () => ({ SupabaseFileStorage: class {} }));
vi.mock("@/lib/storage/SupabaseSignedUrlProvider", () => ({ SupabaseSignedUrlProvider: class {} }));
vi.mock("@/lib/notificaciones/notificadores", () => ({ notificarPostulacionPendienteReal: vi.fn() }));
vi.mock("@/lib/services/PostulacionMensajeroService", () => ({
  PostulacionMensajeroService: class {
    constructor(...args: unknown[]) {
      capturado.postulacion.push(args);
    }
    postular = async () => ({ status: "ok" as const });
  },
}));
vi.mock("@/lib/services/AprobacionPostulacionService", () => ({
  AprobacionPostulacionService: class {
    constructor(...args: unknown[]) {
      capturado.aprobacion.push(args);
    }
    aprobar = async () => ({ status: "ok" as const, usuarioId: "usr-1", estado: "activo" as const });
  },
}));

const { postularMensajero } = await import("@/lib/actions/postulacion-mensajero");
const { aprobarPostulacion } = await import("@/lib/actions/aprobacion-postulaciones");

function formMensajero(): FormData {
  const fd = new FormData();
  const campos: Record<string, string> = {
    nombre: "Ana",
    primer_apellido: "Perez",
    email: "ana@example.com",
    telefono: "88887777",
    tipo_identificacion_id: "tipo-1",
    cedula: "112223333",
    vehiculo_id: "veh-1",
    placa: "abc123",
    password: "Abcdef1!",
    confirmacion_password: "Abcdef1!",
  };
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  for (const tipo of DOCUMENTO_TIPOS) {
    fd.set(tipo, new File([new Uint8Array([1, 2, 3, 4])], "doc.jpg", { type: "image/jpeg" }));
  }
  return fd;
}

describe("SLT-42 — las actions de la postulación cablean las reglas REALES del país", () => {
  it("R10, R11, R14-R16: `postularMensajero` construye el servicio con `ReglasPaisEmpresaService` como cuarto argumento", async () => {
    const r = await conEmpresa("org-1", () =>
      postularMensajero(formMensajero(), {
        getContext: async () => ({ ipAddress: "203.0.113.9" }),
        limiter: new ResetRateLimiter(),
      }),
    );

    expect(r).toEqual({ status: "ok" });
    expect(capturado.postulacion).toHaveLength(1);
    expect(capturado.postulacion[0][3]).toBeInstanceOf(ReglasPaisEmpresaService);
  });

  it("R10, R11, R14, R16: `aprobarPostulacion` construye el servicio con `ReglasPaisEmpresaService` como cuarto argumento", async () => {
    const maestro: Actor = { usuarioId: "maestro-1", rol: "maestro" };
    const r = await aprobarPostulacion("usr-1", { getActor: async () => maestro });

    expect(r).toEqual({ status: "ok", usuarioId: "usr-1", estado: "activo" });
    expect(capturado.aprobacion).toHaveLength(1);
    // El tercero es el TTL de las URLs firmadas: `undefined` deja el de la config.
    expect(capturado.aprobacion[0][2]).toBeUndefined();
    expect(capturado.aprobacion[0][3]).toBeInstanceOf(ReglasPaisEmpresaService);
  });
});
