import { cookies } from "next/headers";
import { getPrismaClient } from "@/lib/db/prisma-client";
import { comoPlataforma } from "@/lib/db/contexto-empresa";
import { SessionRepository } from "@/lib/repositories/SessionRepository";
import { SESSION_COOKIE_NAME } from "@/lib/constants/auth";

// SL-17 (design §5, R12, R14) — la empresa de una peticion autenticada por sesion. La llama la
// extension del cliente cuando una operacion de negocio no trae contexto explicito; asi las ~200
// paginas y acciones que ya resuelven la sesion por su cuenta obtienen su empresa sin tocarlas.
//
// La UNICA entrada es el id de la cookie de sesion, que solo sirve de llave para buscar la sesion
// en la base: la empresa sale de `usuario.organizacion_id` del dueno de esa sesion. Ninguna
// cabecera, query, cuerpo ni otra cookie participa (R12): un cliente no puede elegir su empresa.

const MEMO_MS = 60_000;
// Por encima de este tamano se barren las entradas caducadas al escribir: el memo no debe crecer
// sin limite en un proceso de larga vida con muchas sesiones distintas.
const MEMO_BARRIDO = 1_000;

type EntradaMemo = { organizacionId: string | null; caduca: number };

// Memo por proceso `sessionId → organizacionId`. Es seguro porque la empresa de un usuario no
// cambia (D8). Que la sesion SIGA valiendo no lo decide este memo sino la autorizacion de
// siempre (`resolveActorFromSession`/`isSessionActive`), que vuelve a la base: tras un logout el
// memo resuelve empresa hasta 60 s, pero no concede nada que la sesion no conceda (design §12).
const memo = new Map<string, EntradaMemo>();

function leerMemo(sessionId: string, ahora: number): EntradaMemo | undefined {
  const entrada = memo.get(sessionId);
  if (!entrada) return undefined;
  if (entrada.caduca <= ahora) {
    memo.delete(sessionId);
    return undefined;
  }
  return entrada;
}

function escribirMemo(sessionId: string, organizacionId: string | null, ahora: number): void {
  if (memo.size >= MEMO_BARRIDO) {
    for (const [clave, entrada] of memo) if (entrada.caduca <= ahora) memo.delete(clave);
  }
  memo.set(sessionId, { organizacionId, caduca: ahora + MEMO_MS });
}

async function idDeSesion(): Promise<string | undefined> {
  try {
    const almacen = await cookies();
    return almacen.get(SESSION_COOKIE_NAME)?.value;
  } catch {
    // Fuera de una peticion (cron, job, script, test) `cookies()` lanza: no hay sesion de la que
    // sacar empresa, y la operacion de negocio fallara cerrado (R11).
    return undefined;
  }
}

export async function empresaDeLaPeticion(): Promise<string | null> {
  const sessionId = await idDeSesion();
  if (!sessionId) return null;

  const enMemo = leerMemo(sessionId, Date.now());
  if (enMemo) return enMemo.organizacionId;

  // `Session` es de plataforma pero `usuario` es de negocio: leerlo sin contexto volveria a pedir
  // empresa a este mismo resolutor. Se lee en plataforma porque AUN no hay empresa: es justo lo
  // que se esta averiguando.
  const leida = await comoPlataforma("SL-17", "resolver la empresa de la sesión", async () => {
    const prisma = getPrismaClient();
    const session = await new SessionRepository(prisma).findValidById(sessionId);
    if (!session) return undefined;
    const usuario = await prisma.usuario.findUnique({
      where: { id: session.userId },
      select: { organizacionId: true },
    });
    return usuario ?? undefined;
  });

  // Sesion invalida, caducada o de un usuario que ya no existe: sin empresa, y no se memoriza,
  // para no fijar una respuesta sobre una llave que la base no reconoce.
  if (!leida) return null;

  // El superadmin no tiene empresa (`organizacion_id` NULL, R14): devuelve null y toda operacion
  // de negocio sin contexto explicito falla cerrado. Se memoriza igual: tampoco cambia (D8).
  const organizacionId = leida.organizacionId ?? null;
  escribirMemo(sessionId, organizacionId, Date.now());
  return organizacionId;
}
