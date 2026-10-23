import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE_NAME } from "@/lib/constants/auth";
import { SessionRepository } from "@/lib/repositories/SessionRepository";
import { getPrismaClient } from "@/lib/db/prisma-client";
import { Logo } from "@/components/shared/Logo";
import { RecuperarContrasenaForm } from "./_components/RecuperarContrasenaForm";

// Pagina publica del flujo de recuperacion de contrasena (R12). Si ya hay una
// sesion valida se redirige a la home, replicando el patron de app/login/page.tsx.
//
// Desactivada el 2026-09-04 (el SMTP de entonces rechazaba la credencial y el OTP no llegaba
// nunca) y reactivada el 2026-10-22 por SL-32 (R38): el correo sale ahora por el SMTP de Brevo.
// Un entorno sin SMTP configurado no rompe la pantalla: el envio degrada a la consola.
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
        <p className="relative max-w-sm text-sm leading-relaxed text-white/70">
          Recupera el acceso a tu cuenta de forma segura
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
        <RecuperarContrasenaForm />
      </div>
    </div>
  );
}
