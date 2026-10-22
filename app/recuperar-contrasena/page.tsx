import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE_NAME } from "@/lib/constants/auth";
import { SessionRepository } from "@/lib/repositories/SessionRepository";
import { getPrismaClient } from "@/lib/db/prisma-client";
import { Logo } from "@/components/shared/Logo";
import { RecuperacionDesactivadaAviso } from "./_components/RecuperacionDesactivadaAviso";

// Pagina publica del flujo de recuperacion de contrasena (R12). Si ya hay una
// sesion valida se redirige a la home, replicando el patron de app/login/page.tsx.
//
// ⚠️ DESACTIVADO EL 2026-09-04: la ruta sigue viva y publica, pero en vez del formulario de
// 3 pasos monta `RecuperacionDesactivadaAviso`. La causa esta escrita entera en la cabecera de
// ese componente y se resume aqui: el paso 1 manda un OTP por correo y el SMTP de Gmail rechaza
// la credencial con `535-5.7.8 Username and Password not accepted` (EAUTH), asi que el envio
// FALLA SIEMPRE; como ese paso responde un `ok` generico anti-enumeracion, el fallo es MUDO
// (12 intentos de 2 personas reales medidos en produccion el 2026-09-04, ninguna aviso alguno).
//
// La pagina NO se borra ni se saca del middleware A PROPOSITO: quien tenga el enlace guardado o
// llegue por un correo viejo debe encontrar una salida, no un redirect a /login sin explicacion.
//
// PARA VOLVER A ENCENDERLO cuando el correo funcione: importar de nuevo
// `./_components/RecuperarContrasenaForm` (sigue en el repo, intacto y probado), montarlo abajo
// en lugar del aviso, devolver el subtitulo del panel de marca y reponer el enlace del login.
export default async function RecuperarContrasenaPage() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (sessionId) {
    const prisma = getPrismaClient();
    const sessionRepo = new SessionRepository(prisma);
    const session = await sessionRepo.findValidById(sessionId);

    if (session) {
      redirect("/dashboard");
    }
  }

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      {/* Panel de marca: visible desde md, oculto en movil para no forzar scroll */}
      <div className="relative hidden overflow-hidden bg-navy px-12 py-16 text-white md:flex md:w-1/2 md:flex-col md:justify-between lg:w-[45%]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(255,208,0,0.16),transparent_55%)]"
        />
        <div className="relative">
          <Logo fondo="oscuro" ancho={200} />
          <div className="mt-3 h-1 w-10 rounded-full bg-brand-light" />
        </div>
        {/* El subtitulo dice lo que la pantalla PUEDE cumplir hoy. El anterior —«Recupera el
          acceso a tu cuenta de forma segura»— prometia un flujo que ya no esta montado; se
          repone tal cual cuando vuelva el formulario. */}
        <p className="relative max-w-sm text-sm leading-relaxed text-white/70">
          Te ayudamos a volver a entrar a tu cuenta.
        </p>
      </div>

      {/* Panel de formulario */}
      <div className="flex flex-1 flex-col items-center justify-center gap-8 bg-background px-6 py-12">
        {/* Logo compacto, solo visible en movil */}
        <div className="md:hidden">
          {/* El logo de móvil va sobre `bg-background`, que aquí es claro (el tema
            solo se aplica dentro del portal), así que lleva la variante de fondo claro;
            el panel de escritorio es `bg-navy` fijo y lleva la de fondo oscuro. */}
          <Logo fondo="claro" ancho={160} />
        </div>
        <RecuperacionDesactivadaAviso />
      </div>
    </div>
  );
}
