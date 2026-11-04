import { getPrismaClient } from "@/lib/db/prisma-client";
import { comoPlataforma } from "@/lib/db/contexto-empresa";
import { SessionRepository } from "@/lib/repositories/SessionRepository";
import { puedeIniciarSesion } from "@/lib/auth/puede-iniciar-sesion";

/**
 * Comprueba que un id de sesion corresponde a una sesion REAL y utilizable.
 * Pensado para el middleware, que hasta la feature 78 solo miraba que la cookie
 * `session` existiera: cualquiera con `document.cookie = "session=x"` pasaba el
 * guard.
 *
 * "Utilizable" son tres condiciones, no una:
 *  1. la sesion existe en la DB y no expiro (`findValidById`, R23a feature 6);
 *  2. el usuario dueno sigue en estado `activo`;
 *  3. el usuario dueno puede tener sesion (`puedeIniciarSesion`, SLT-32): que tenga empresa o
 *     sea de plataforma (SL-32).
 *
 * Los puntos 2 y 3 no son redundantes: `AuthService.login` ya los exige para EMITIR
 * la sesion, pero un usuario desactivado/bloqueado o que perdio su empresa DESPUES
 * del login se quedaba dentro hasta que su sesion expirara. Revalidar aqui lo saca
 * en el siguiente request (el middleware borra la cookie y lo manda a /login, igual
 * que con una sesion caducada).
 *
 * Devuelve un booleano a proposito: el middleware solo decide pasar o no. Quien
 * necesite el rol usa `resolveActorFromSession()`.
 */
export async function isSessionActive(sessionId: string): Promise<boolean> {
  // SL-17 (design §7): el middleware valida la sesion antes de saber la empresa, y `usuario` es
  // de negocio; sin plataforma la lectura fallaria cerrado y nadie pasaria el guard.
  return comoPlataforma("SL-17", "validar sesión", async () => {
    const prisma = getPrismaClient();

    const session = await new SessionRepository(prisma).findValidById(sessionId);
    if (!session) return false;

    // Empresa y rol viajan en la misma lectura que el estado: el chequeo SLT-32 no cuesta otra ida
    // a la DB. `puedeIniciarSesion` exige tambien `activo` (punto 2).
    const usuario = await prisma.usuario.findUnique({
      where: { id: session.userId },
      select: { estado: true, organizacionId: true, rol: { select: { value: true } } },
    });

    return usuario !== null && puedeIniciarSesion({ ...usuario, rol: usuario.rol.value });
  });
}
