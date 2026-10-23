import { beforeEach, describe, expect, it, vi } from "vitest";

import { comoPlataforma, conEmpresa } from "@/lib/db/contexto-empresa";
import { ResetRateLimiter } from "@/lib/utils/reset-rate-limit";
import { DOCUMENTO_TIPOS } from "@/lib/types/postulacion-mensajero";

// SL-17 · R41 — una postulacion publica sin empresa en contexto se rechaza sin crear usuario,
// documentos ni postulacion.
//
// Aqui NO se inyecta el service: se prueba la composicion REAL de cada action, con sus piezas
// sustituidas por espias en el borde del modulo. Asi se ve que nada se construye ni se llama
// —ni el cliente de la base, ni los repositorios, ni el storage que sube los documentos— y no
// solo que un doble devolvio otra cosa.

const espias = vi.hoisted(() => ({
  getPrismaClient: vi.fn(() => ({})),
  postulacionRepo: vi.fn(),
  recursoRepo: vi.fn(),
  storage: vi.fn(),
  storageUpload: vi.fn(),
  postular: vi.fn(async () => ({ status: "ok" as const })),
  registrar: vi.fn(async () => ({ status: "ok" as const })),
}));

vi.mock("@/lib/db/prisma-client", () => ({ getPrismaClient: espias.getPrismaClient }));
vi.mock("@/lib/repositories/PostulacionRepository", () => ({
  PostulacionRepository: class {
    constructor() {
      espias.postulacionRepo();
    }
  },
}));
vi.mock("@/lib/repositories/PostulacionRecursoRepository", () => ({
  PostulacionRecursoRepository: class {
    constructor() {
      espias.recursoRepo();
    }
  },
}));
vi.mock("@/lib/storage/SupabaseFileStorage", () => ({
  SupabaseFileStorage: class {
    constructor() {
      espias.storage();
    }
    upload = espias.storageUpload;
  },
}));
vi.mock("@/lib/services/PostulacionMensajeroService", () => ({
  PostulacionMensajeroService: class {
    postular = espias.postular;
  },
}));
vi.mock("@/lib/services/PostulacionRecursoService", () => ({
  PostulacionRecursoService: class {
    registrar = espias.registrar;
  },
}));
vi.mock("@/lib/notificaciones/notificadores", () => ({
  notificarPostulacionPendienteReal: vi.fn(),
  notificarPostulacionRecursoPendienteReal: vi.fn(),
}));

const { postularMensajero } = await import("@/lib/actions/postulacion-mensajero");
const { postularRecurso } = await import("@/lib/actions/postulacion-recurso");

const getContext = async () => ({ ipAddress: "203.0.113.9" });

function formMensajero(): FormData {
  const fd = new FormData();
  const campos: Record<string, string> = {
    nombre: "Ana",
    primer_apellido: "Perez",
    segundo_apellido: "Gomez",
    email: "ana@example.com",
    telefono: "0991234567",
    tipo_identificacion_id: "tipo-1",
    cedula: "1710034065",
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

const RECURSO = {
  tipo: "vehiculo",
  nombre: "Ana Solis",
  telefono: "+506 8888-8888",
  correo: "ana.solis@example.com",
  mensaje: "Camion de 3 toneladas, disponible entre semana.",
};

function nadaSeEscribio() {
  expect(espias.getPrismaClient).not.toHaveBeenCalled();
  expect(espias.postulacionRepo).not.toHaveBeenCalled();
  expect(espias.recursoRepo).not.toHaveBeenCalled();
  expect(espias.storage).not.toHaveBeenCalled();
  expect(espias.storageUpload).not.toHaveBeenCalled();
  expect(espias.postular).not.toHaveBeenCalled();
  expect(espias.registrar).not.toHaveBeenCalled();
}

beforeEach(() => {
  for (const espia of Object.values(espias)) espia.mockClear();
});

describe("SL-17 · R41 — postulación de mensajero sin empresa", () => {
  it("sin sesión ni empresa responde el `error` neutro y no crea usuario, documentos ni postulación", async () => {
    const r = await postularMensajero(formMensajero(), { getContext, limiter: new ResetRateLimiter() });

    expect(r).toEqual({ status: "error" });
    nadaSeEscribio();
  });

  it("en contexto de plataforma tampoco: la plataforma no es una empresa", async () => {
    const r = await comoPlataforma("SL-17", "test R41", () =>
      postularMensajero(formMensajero(), { getContext, limiter: new ResetRateLimiter() }),
    );

    expect(r).toEqual({ status: "error" });
    nadaSeEscribio();
  });

  it("control: con empresa en contexto llega a la composición real (el rechazo no es ciego)", async () => {
    const r = await conEmpresa("org-1", () =>
      postularMensajero(formMensajero(), { getContext, limiter: new ResetRateLimiter() }),
    );

    expect(r).toEqual({ status: "ok" });
    expect(espias.storage).toHaveBeenCalledTimes(1);
    expect(espias.postular).toHaveBeenCalledTimes(1);
  });
});

describe("SL-17 · R41 — postulación de recurso sin empresa", () => {
  it("sin sesión ni empresa responde el `error` neutro y no crea la postulación", async () => {
    const r = await postularRecurso(RECURSO, { getContext, limiter: new ResetRateLimiter() });

    expect(r).toEqual({ status: "error" });
    nadaSeEscribio();
  });

  it("en contexto de plataforma tampoco", async () => {
    const r = await comoPlataforma("SL-17", "test R41", () =>
      postularRecurso(RECURSO, { getContext, limiter: new ResetRateLimiter() }),
    );

    expect(r).toEqual({ status: "error" });
    nadaSeEscribio();
  });

  it("control: con empresa en contexto llega a la composición real", async () => {
    const r = await conEmpresa("org-1", () =>
      postularRecurso(RECURSO, { getContext, limiter: new ResetRateLimiter() }),
    );

    expect(r).toEqual({ status: "ok" });
    expect(espias.registrar).toHaveBeenCalledTimes(1);
  });

  it("el rechazo no consume intentos del límite: sin empresa no hubo intento", async () => {
    const limiter = new ResetRateLimiter();
    const registrar = vi.spyOn(limiter, "registrar");

    await postularRecurso(RECURSO, { getContext, limiter });
    await postularMensajero(formMensajero(), { getContext, limiter });

    expect(registrar).not.toHaveBeenCalled();
  });
});
