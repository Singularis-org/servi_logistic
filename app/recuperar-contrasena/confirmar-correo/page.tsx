import { Logo } from "@/components/shared/Logo";
import { ConfirmarCorreoForm } from "./_components/ConfirmarCorreoForm";

// SLT-221 (design §7; R1626, R1628): página pública donde la persona confirma su correo nuevo con el
// enlace del correo. Es pública sin tocar `PUBLIC_ROUTES`: el middleware deja pasar todo
// `/recuperar-contrasena/`. Copia el marco de `/recuperar-contrasena`. A diferencia de esa, no
// redirige con sesión: confirmar no pide ni cambia la sesión (R1627), y quien la tenga abierta en
// el mismo navegador también tiene que poder confirmar.
export default function ConfirmarCorreoPage() {
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
          Confirma el correo nuevo de tu cuenta
        </p>
      </div>

      {/* Panel de formulario */}
      <div className="flex flex-1 flex-col items-center justify-center gap-8 bg-background px-6 py-12">
        {/* Logo compacto, solo visible en movil (fondo claro, como en /recuperar-contrasena) */}
        <div className="md:hidden">
          <Logo fondo="claro" ancho={160} />
        </div>
        <ConfirmarCorreoForm />
      </div>
    </div>
  );
}
