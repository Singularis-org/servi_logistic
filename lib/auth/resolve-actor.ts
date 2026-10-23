import { cookies } from "next/headers";
import { getPrismaClient } from "@/lib/db/prisma-client";
import { comoPlataforma } from "@/lib/db/contexto-empresa";
import { SessionRepository } from "@/lib/repositories/SessionRepository";
import { SESSION_COOKIE_NAME } from "@/lib/constants/auth";
import { puedeIniciarSesion } from "@/lib/auth/puede-iniciar-sesion";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";

/**
 * Resuelve el actor autenticado desde la cookie de sesion (R18/R19 feature 6,
 * R10 feature 15): valida la sesion y resuelve el rol (RolValue) del usuario.
 * Devuelve null si no hay sesion valida. Compartido entre la Server Action de
 * ordenes (`lib/actions/ordenes.ts`) y el Route Handler de carga masiva
 * (`app/api/ordenes/carga-masiva/route.ts`), sin duplicar la lectura de
 * cookie/sesion (feature 15/T17).
 */
export async function resolveActorFromSession(): Promise<Actor | null> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionId) return null;

  // SL-17 (design §7): `usuario` es de negocio y aqui todavia no hay empresa, porque es este
  // usuario quien la dice. Se lee en plataforma, buscando por el id que da la sesion.
  return comoPlataforma("SL-17", "validar sesión", async () => {
    const prisma = getPrismaClient();
    const session = await new SessionRepository(prisma).findValidById(sessionId);
    if (!session) return null;

    const usuario = await prisma.usuario.findUnique({
      where: { id: session.userId },
      include: { rol: true },
    });
    // SLT-32: una sesion abierta antes de que la cuenta quedara sin empresa deja de valer aqui,
    // con la misma regla que el login (`puedeIniciarSesion`).
    if (!usuario || !puedeIniciarSesion(usuario)) return null;

    // Feature 146 (A3): `zonaId` viaja en el actor porque el alcance por zona de las
    // notificaciones (R16) se resuelve contra `usuario.zona_id`. SL-17: `organizacionId` viaja
    // por lo mismo (claves de cache por empresa sin volver a la base). Los dos ya venian en la
    // fila leida: no hay consulta extra.
    return {
      usuarioId: usuario.id,
      rol: usuario.rol.value,
      zonaId: usuario.zonaId ?? null,
      organizacionId: usuario.organizacionId,
    };
  });
}
