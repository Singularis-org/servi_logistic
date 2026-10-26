import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { EmailOtpChallengeRepository } from "@/lib/repositories/EmailOtpChallengeRepository";
import { UserRepository } from "@/lib/repositories/UserRepository";
import { DEVICE_HASH_BIENVENIDA, PasswordResetService } from "@/lib/services/PasswordResetService";
import { loadAuthConfig } from "@/lib/config/auth";
import { ResetRateLimiter } from "@/lib/utils/reset-rate-limit";
import { crearOrganizacion } from "../../fabricas/organizaciones";
import { HAY_BASE_DE_DATOS, crearPrismaDeTest, tomarLockDeEscrituraReal } from "./_postgres-real";
import { idDeRol, insertarUsuario } from "./_fixtures/superadmin-32";

// SL-41 / T3 (design §5.4, R20, R22) — `consumirSiActivo` y el canje del enlace contra Postgres real.
//
// La carrera solo existe con DOS conexiones: dentro de una transaccion revertida las dos llamadas
// irian en serie por la misma conexion y no probarian el bloqueo de fila. Por eso las filas se
// COMMITEAN y cada «canje» va por su propio cliente. Se sostiene el lock de escrituras reales del
// `beforeAll` al `afterAll` (ver `tomarLockDeEscrituraReal`): las filas viven ese tiempo y se borran
// al final. Nada de este archivo pide ese lock por otra conexion mientras tanto.
//
// Mutacion de T3: sin `consumedAt: null` en el `where`, las dos llamadas devuelven `true` y cae
// el primer caso (y el de «ya consumida»).

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let a: PrismaClient;
let b: PrismaClient;
let soltarLock: (() => Promise<void>) | undefined;
let organizacionId: string;
let rolMaestro: string;
const usuarios: string[] = [];

const FUTURO = () => new Date(Date.now() + 3_600_000);

async function nuevoUsuario(): Promise<string> {
  const id = await a.$transaction(async (tx) => {
    const u = await insertarUsuario(tx, rolMaestro, organizacionId);
    if (!u.desenlace.ok) throw new Error(`no se sembro el usuario: ${JSON.stringify(u.desenlace)}`);
    return u.id;
  });
  usuarios.push(id);
  return id;
}

async function nuevoDesafio(usuarioId: string, over: { expiresAt?: Date; deviceHash?: string } = {}) {
  return new EmailOtpChallengeRepository(a).create({
    usuarioId,
    codeHash: "hash-de-prueba",
    deviceHash: over.deviceHash ?? DEVICE_HASH_BIENVENIDA,
    ipAddress: "10.0.0.1",
    expiresAt: over.expiresAt ?? FUTURO(),
  });
}

async function consumidoEn(id: string): Promise<Date | null> {
  const f = await a.emailOtpChallenge.findUniqueOrThrow({ where: { id }, select: { consumedAt: true } });
  return f.consumedAt;
}

function servicio(cliente: PrismaClient): PasswordResetService {
  return new PasswordResetService(
    new UserRepository(cliente),
    new EmailOtpChallengeRepository(cliente),
    { sender: { enviar: vi.fn() }, baseUrl: null },
    new ResetRateLimiter(),
    loadAuthConfig(),
  );
}

describeSiHayBase("SL-41 — enlace de bienvenida contra Postgres (R20, R22)", () => {
  beforeAll(async () => {
    a = crearPrismaDeTest();
    b = crearPrismaDeTest();
    soltarLock = await tomarLockDeEscrituraReal();
    const org = await a.$transaction(async (tx) => ({
      org: await crearOrganizacion(tx),
      rol: await idDeRol(tx, "maestro"),
    }));
    organizacionId = org.org.id;
    rolMaestro = org.rol;
  }, 60_000);

  afterAll(async () => {
    try {
      if (usuarios.length > 0) {
        await a.emailOtpChallenge.deleteMany({ where: { usuarioId: { in: usuarios } } });
        await a.usuario.deleteMany({ where: { id: { in: usuarios } } });
      }
      if (organizacionId) await a.organizacion.delete({ where: { id: organizacionId } });
    } finally {
      await soltarLock?.();
      await a?.$disconnect();
      await b?.$disconnect();
    }
  }, 60_000);

  describe("consumirSiActivo (design §5.4)", () => {
    it("R20: dos llamadas a la vez por conexiones distintas: exactamente una devuelve true", async () => {
      const usuarioId = await nuevoUsuario();
      // Varias rondas: una sola podria salir bien por el orden de llegada.
      for (let i = 0; i < 5; i++) {
        const d = await nuevoDesafio(usuarioId);
        const resultados = await Promise.all([
          new EmailOtpChallengeRepository(a).consumirSiActivo(d.id),
          new EmailOtpChallengeRepository(b).consumirSiActivo(d.id),
        ]);
        expect(resultados.filter(Boolean)).toHaveLength(1);
        expect(await consumidoEn(d.id)).toBeInstanceOf(Date);
      }
    });

    it("una fila vencida devuelve false y sigue sin consumir", async () => {
      const usuarioId = await nuevoUsuario();
      const d = await nuevoDesafio(usuarioId, { expiresAt: new Date(Date.now() - 1_000) });

      expect(await new EmailOtpChallengeRepository(a).consumirSiActivo(d.id)).toBe(false);
      expect(await consumidoEn(d.id)).toBeNull();
    });

    it("una fila ya consumida devuelve false y no cambia su consumed_at", async () => {
      const usuarioId = await nuevoUsuario();
      const d = await nuevoDesafio(usuarioId);
      const repo = new EmailOtpChallengeRepository(a);

      expect(await repo.consumirSiActivo(d.id)).toBe(true);
      const primero = await consumidoEn(d.id);
      expect(await repo.consumirSiActivo(d.id)).toBe(false);
      expect(await consumidoEn(d.id)).toEqual(primero);
    });

    it("solo toca la fila pedida: otro desafio activo del mismo usuario sigue vivo", async () => {
      const usuarioId = await nuevoUsuario();
      const uno = await nuevoDesafio(usuarioId);
      const otro = await nuevoDesafio(usuarioId);

      expect(await new EmailOtpChallengeRepository(a).consumirSiActivo(uno.id)).toBe(true);
      expect(await consumidoEn(otro.id)).toBeNull();
    });

    it("un id que no existe devuelve false", async () => {
      expect(
        await new EmailOtpChallengeRepository(a).consumirSiActivo("00000000-0000-4000-8000-000000000000"),
      ).toBe(false);
    });
  });

  describe("canje del enlace con los repositorios reales (design §6.1)", () => {
    async function hashDe(usuarioId: string) {
      return a.usuario.findUniqueOrThrow({
        where: { id: usuarioId },
        select: { passwordHash: true, contrasenaDefinidaAt: true },
      });
    }

    it("R22: el ultimo manda — un enlace nuevo deja sin valor al anterior; el nuevo se canjea una vez", async () => {
      const usuarioId = await nuevoUsuario();
      const s = servicio(a);
      const viejo = await s.emitirEnlaceBienvenida({ usuarioId, ipAddress: "10.0.0.1" });
      // `created_at` es TIMESTAMP(3): dos emisiones en el mismo milisegundo empatarian.
      await a.emailOtpChallenge.update({
        where: { id: viejo.enlace.split(".")[0] },
        data: { createdAt: new Date(Date.now() - 60_000) },
      });
      const nuevo = await s.emitirEnlaceBienvenida({ usuarioId, ipAddress: "10.0.0.1" });
      const antes = await hashDe(usuarioId);

      expect(await s.crearContrasenaConEnlace({ enlace: viejo.enlace, newPassword: "Viejo-2026!x", ipAddress: "1.1.1.1" })).toEqual({
        status: "invalid_or_expired",
      });
      expect(await hashDe(usuarioId)).toEqual(antes);

      expect(await s.crearContrasenaConEnlace({ enlace: nuevo.enlace, newPassword: "Nuevo-2026!x", ipAddress: "1.1.1.1" })).toEqual({
        status: "ok",
      });
      const despues = await hashDe(usuarioId);
      expect(despues.passwordHash).not.toBe(antes.passwordHash);
      expect(despues.contrasenaDefinidaAt).toBeInstanceOf(Date);

      // Segundo uso del mismo enlace: consumido.
      expect(await s.crearContrasenaConEnlace({ enlace: nuevo.enlace, newPassword: "Otra-2026!xx", ipAddress: "1.1.1.1" })).toEqual({
        status: "invalid_or_expired",
      });
      expect((await hashDe(usuarioId)).passwordHash).toBe(despues.passwordHash);
    });

    // Revision m2: un «Reenviar» cuyo correo falla anula el enlace nuevo, y el anterior, que ya habia
    // salido, vuelve a ser el ultimo activo y se canjea.
    it("m2: anular el enlace nuevo devuelve el valor al anterior; el anulado no se canjea", async () => {
      const usuarioId = await nuevoUsuario();
      const s = servicio(a);
      const viejo = await s.emitirEnlaceBienvenida({ usuarioId, ipAddress: "10.0.0.1" });
      await a.emailOtpChallenge.update({
        where: { id: viejo.enlace.split(".")[0] },
        data: { createdAt: new Date(Date.now() - 60_000) },
      });
      const nuevo = await s.emitirEnlaceBienvenida({ usuarioId, ipAddress: "10.0.0.1" });

      await s.anularEnlaceBienvenida(nuevo.enlace);

      expect(await consumidoEn(nuevo.enlace.split(".")[0])).toBeInstanceOf(Date);
      expect(await consumidoEn(viejo.enlace.split(".")[0])).toBeNull();
      expect(await s.crearContrasenaConEnlace({ enlace: nuevo.enlace, newPassword: "Nuevo-2026!x", ipAddress: "1.1.1.1" })).toEqual({
        status: "invalid_or_expired",
      });
      expect(await s.crearContrasenaConEnlace({ enlace: viejo.enlace, newPassword: "Viejo-2026!x", ipAddress: "1.1.1.1" })).toEqual({
        status: "ok",
      });
      expect((await hashDe(usuarioId)).contrasenaDefinidaAt).toBeInstanceOf(Date);
    });

    it("R22: un codigo de «recuperar contrasena» posterior deja sin valor el enlace", async () => {
      const usuarioId = await nuevoUsuario();
      const s = servicio(a);
      const enlace = await s.emitirEnlaceBienvenida({ usuarioId, ipAddress: "10.0.0.1" });
      await a.emailOtpChallenge.update({
        where: { id: enlace.enlace.split(".")[0] },
        data: { createdAt: new Date(Date.now() - 60_000) },
      });
      await nuevoDesafio(usuarioId, { deviceHash: "a".repeat(64) });

      expect(await s.crearContrasenaConEnlace({ enlace: enlace.enlace, newPassword: "Nuevo-2026!x", ipAddress: "1.1.1.1" })).toEqual({
        status: "invalid_or_expired",
      });
      expect((await hashDe(usuarioId)).contrasenaDefinidaAt).toBeNull();
    });

    it("R20: dos canjes a la vez del mismo enlace: uno ok, el otro el generico, y queda UNA contrasena", async () => {
      const usuarioId = await nuevoUsuario();
      const { enlace } = await servicio(a).emitirEnlaceBienvenida({ usuarioId, ipAddress: "10.0.0.1" });

      const r = await Promise.all([
        servicio(a).crearContrasenaConEnlace({ enlace, newPassword: "Primera-2026!x", ipAddress: "1.1.1.1" }),
        servicio(b).crearContrasenaConEnlace({ enlace, newPassword: "Segunda-2026!x", ipAddress: "2.2.2.2" }),
      ]);

      expect(r.map((x) => x.status).sort()).toEqual(["invalid_or_expired", "ok"]);
    });
  });
});
