import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

import { contextoActual } from "@/lib/db/contexto-empresa";
import type { EmailMessage, IEmailSender } from "@/lib/interfaces/external/IEmailSender";

// SL-17 / T2.8 — EL COMPOSITION ROOT, EJERCITADO DE VERDAD (memoria «el composition root que no
// inyecta»). Que `lib/actions/organizaciones.ts` IMPORTE `OrganizacionRepository` no prueba que
// lo PASE. Aquí se abre la puerta de autorización (hoy cerrada para todos) solo en este archivo,
// se llama a la action SIN `deps.service`, y se exige que el repositorio real llegue al cliente
// de `getPrismaClient` y que lo haga dentro del contexto de plataforma citando SL-17.
//
// SL-41 / T8 — lo mismo para la bienvenida: SIN `deps.bienvenida`, el `BienvenidaMaestroRepository`
// real tiene que leer el maestro de la empresa recién creada, el `PasswordResetService` real tiene
// que crear el desafío, y el emisor que elige `crearEmailSender` tiene que recibir el correo.

vi.mock("@/lib/auth/exigir-superadmin", () => ({ exigirSuperadmin: () => true }));

const enviados: EmailMessage[] = [];
const emisor: IEmailSender = {
  enviar: vi.fn(async (m: EmailMessage) => {
    enviados.push(m);
    return { messageId: null };
  }),
};
// Solo se sustituye la fábrica del emisor: el resto del módulo es el real.
vi.mock("@/lib/services/EmailProvider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/services/EmailProvider")>()),
  crearEmailSender: () => emisor,
}));

const CHALLENGE_ID = "0b9d7c1e-2f3a-4b5c-8d6e-7f8091a2b3c4";

const contextos: unknown[] = [];
const contextosBienvenida: unknown[] = [];
const creados: unknown[] = [];
const tx = {
  $executeRaw: vi.fn(async () => {
    contextos.push(contextoActual());
    return 1;
  }),
  organizacion: {
    findUnique: vi.fn(async () => null),
    create: vi.fn(async (args: unknown) => {
      creados.push(args);
      return { id: "org-nueva" };
    }),
  },
  // SL-20 (R6, R45): el alta comprueba que el país existe y está disponible antes de escribir.
  pais: { findUnique: vi.fn(async () => ({ id: "CR", disponible: true })) },
  tipoIdentificacion: { findUnique: vi.fn(async () => ({ id: "ti-1" })) },
  rol: { findUnique: vi.fn(async () => ({ id: "rol-maestro" })) },
  usuario: {
    findFirst: vi.fn(async () => null),
    create: vi.fn(async (args: unknown) => {
      creados.push(args);
      return { id: "u-maestro" };
    }),
  },
  // SL-17 T3.9: el alta siembra el podio de la empresa en la misma transacción.
  premioRanking: { createMany: vi.fn(async () => ({ count: 3 })) },
};
const $transaction = vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx));

// SL-41: lo que la bienvenida toca FUERA de la transacción del alta.
const usuario = {
  findFirst: vi.fn(async () => {
    contextosBienvenida.push(contextoActual());
    return { id: "u-maestro", nombre: "Lucía", email: "lucia@ejemplo.test", organizacion: { nombre: "Envíos del Sur" } };
  }),
};
const emailOtpChallenge = {
  create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    ...data,
    id: CHALLENGE_ID,
    consumedAt: null,
    createdAt: new Date(),
  })),
};
const organizacion = { findUnique: vi.fn(async () => null) };

vi.mock("@/lib/db/prisma-client", () => ({
  getPrismaClient: () => ({ $transaction, usuario, emailOtpChallenge, organizacion }),
  PRISMA_OMIT: {},
}));

const { altaEmpresaAction } = await import("@/lib/actions/organizaciones");

const VARIABLES = ["NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_SITE_URL", "SMTP_USER", "SMTP_PASSWORD", "EMAIL_CONTACTO"] as const;
const original: Partial<Record<(typeof VARIABLES)[number], string | undefined>> = {};

beforeAll(() => {
  for (const v of VARIABLES) {
    original[v] = process.env[v];
    delete process.env[v];
  }
  process.env.NEXT_PUBLIC_APP_URL = "https://app.ejemplo.test";
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterAll(() => {
  for (const v of VARIABLES) {
    if (original[v] === undefined) delete process.env[v];
    else process.env[v] = original[v];
  }
  vi.restoreAllMocks();
});

describe("SL-17 — la action pasa un OrganizacionRepository real y corre en plataforma", () => {
  it("sin deps.service, el alta llega al cliente de la app con la ficha SL-17", async () => {
    const r = await altaEmpresaAction(
      {
        nombre: "Envíos del Sur",
        slug: "envios-del-sur",
        paisId: "CR",
        maestro: { nombre: "Lucía", email: "lucia@ejemplo.test", telefono: "8888", documento: "1122", tipoDocumento: "cedula" },
      },
      {
        getActor: async () => ({ usuarioId: "u-super", rol: "maestro" }),
        getContext: async () => ({ ipAddress: "203.0.113.5", userAgent: "vitest" }),
      },
    );

    // Sin SMTP en el entorno del test, el correo pasa por el emisor y el estado es `sin_correo` (R24).
    expect(r).toEqual({ estado: "creada", organizacionId: "org-nueva", maestroId: "u-maestro", bienvenida: "sin_correo" });
    expect($transaction).toHaveBeenCalledTimes(1);
    expect(creados).toHaveLength(2);
    // Cada SQL a mano del repositorio (cerrojo y set_config) corrió en el contexto de plataforma.
    expect(contextos.length).toBeGreaterThanOrEqual(2);
    for (const c of contextos) {
      expect(c).toEqual({ tipo: "plataforma", ficha: "SL-17", motivo: "alta de empresa por el superadmin" });
    }
    // SL-20 (R6): la organización nace en el país de la entrada, no en el DEFAULT de la columna.
    expect(tx.organizacion.create.mock.calls[0]).toEqual([
      { data: { nombre: "Envíos del Sur", slug: "envios-del-sur", paisId: "CR" }, select: { id: true } },
    ]);
    expect(tx.usuario.create.mock.calls[0][0]).toMatchObject({
      data: { organizacionId: "org-nueva", rolId: "rol-maestro", estado: "activo", email: "lucia@ejemplo.test" },
    });
    expect(tx.premioRanking.createMany.mock.calls).toEqual([
      [{ data: [1, 2, 3].map((posicion) => ({ posicion, organizacionId: "org-nueva" })) }],
    ]);
  });

  it("SL-41: sin deps.bienvenida, el repositorio real recibe la empresa nueva y el emisor recibe el correo", async () => {
    // El repositorio real filtra por la empresa del alta y por el rol, en plataforma con SL-41.
    expect(usuario.findFirst).toHaveBeenCalledTimes(1);
    expect(usuario.findFirst.mock.calls[0]).toMatchObject([
      { where: { organizacionId: "org-nueva", rol: { value: "maestro" } } },
    ]);
    expect(contextosBienvenida).toEqual([{ tipo: "plataforma", ficha: "SL-41", motivo: "bienvenida del maestro" }]);

    // El PasswordResetService real creó el desafío de bienvenida para ese maestro, con la IP de la petición.
    expect(emailOtpChallenge.create).toHaveBeenCalledTimes(1);
    expect(emailOtpChallenge.create.mock.calls[0][0].data).toMatchObject({
      usuarioId: "u-maestro",
      deviceHash: "bienvenida",
      ipAddress: "203.0.113.5",
    });

    // El emisor elegido por `crearEmailSender` recibió el correo, con el enlace en el fragmento.
    expect(enviados).toHaveLength(1);
    expect(enviados[0].to).toBe("lucia@ejemplo.test");
    expect(enviados[0].text).toContain(`https://app.ejemplo.test/recuperar-contrasena#enlace=${CHALLENGE_ID}.`);
  });
});
