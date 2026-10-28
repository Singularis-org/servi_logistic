"use client";

import {
  useState,
  useTransition,
  useRef,
  useEffect,
  useLayoutEffect,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { z } from "zod";
import {
  solicitarRecuperacion,
  crearContrasenaConEnlace,
} from "@/lib/actions/password-reset";
import { strongPasswordSchema } from "@/lib/types/password-policy";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FormField } from "@/components/shared/FormField";
import { PasswordInput } from "@/components/shared/PasswordInput";

// Fases del flujo. SL-18 (R16, R20): el paso 1 acaba en «Revisa tu correo» (`sent`); la contraseña
// solo se crea con el enlace del correo (`password`), y ya no hay paso de código.
type Phase = "email" | "sent" | "password" | "done";

// Validación de cliente: feedback temprano. La validación fuerte real la hace el backend.
const emailSchema = z.object({
  email: z.string().email("Correo electrónico inválido"),
});

// SL-41: el enlace del correo de bienvenida trae su secreto en el fragmento, nunca en la ruta ni
// en la query (R16), para que no llegue al servidor ni a sus registros.
const PREFIJO_ENLACE = "#enlace=";

// SL-41 (R19): un único mensaje para el enlace usado, vencido, sustituido o desconocido.
const ENLACE_INVALIDO_MESSAGE = "El enlace no es válido o ya venció.";

// La fuente externa del fragmento, para `useSyncExternalStore`. No se suscribe a `hashchange`: el
// enlace solo cuenta al llegar a la página, y lo que cambie después lo provoca el propio
// formulario al limpiar la barra.
function sinSuscripcion(): () => void {
  return () => {};
}

function hashDelCliente(): string {
  return window.location.hash;
}

function hashDelServidor(): string {
  return "";
}

/**
 * Recuperación de contraseña. Lo monta `app/recuperar-contrasena/page.tsx`. Desmontado el
 * 2026-09-04 (el OTP no llegaba) y vuelto a montar el 2026-10-22 por SL-32 (R38).
 *
 * SL-41 añade el modo enlace: con `#enlace=` en la URL arranca en «Crea tu contraseña» y guarda con
 * el enlace. SL-18 (R16, R20): el paso 1 solo pide el correo y avisa de que llega un enlace por cada
 * cuenta; el canje es siempre por enlace (SLT-41 pule estas pantallas).
 */
export function RecuperarContrasenaForm() {
  const [isPending, startTransition] = useTransition();

  const [phase, setPhase] = useState<Phase>("email");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Errores por fase.
  const [emailFieldErrors, setEmailFieldErrors] = useState<Record<string, string[]>>({});
  const [passwordFieldErrors, setPasswordFieldErrors] = useState<Record<string, string[]>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);

  // Modo enlace (SL-41). `enlaceInvalido` sustituye el formulario: un enlace muerto no se
  // reintenta, se piden enlaces nuevos.
  const [enlace, setEnlace] = useState<string | null>(null);
  const [enlaceInvalido, setEnlaceInvalido] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // El fragmento de la URL, leído como fuente externa: el servidor no lo tiene (ve "") y el
  // cliente lo lee al hidratar, sin discrepancia y sin un `setState` dentro de un efecto, que en
  // este repo es error de lint (`react-hooks/set-state-in-effect`).
  const hashUrl = useSyncExternalStore(sinSuscripcion, hashDelCliente, hashDelServidor);

  // El enlace se copia a estado DURANTE el render, la forma que React documenta para reaccionar a
  // un valor nuevo. Hace falta copiarlo: en cuanto el efecto de abajo limpia la barra, `hashUrl`
  // pasa a "" y el enlace se perdería. Un `#enlace=` vacío es un enlace roto: va directo al
  // genérico (R19) sin llamar a nadie.
  const [hashVisto, setHashVisto] = useState("");
  if (hashUrl !== hashVisto) {
    setHashVisto(hashUrl);
    if (hashUrl.startsWith(PREFIJO_ENLACE)) {
      const valor = hashUrl.slice(PREFIJO_ENLACE.length);
      if (valor === "") {
        setEnlaceInvalido(true);
      } else {
        setEnlace(valor);
        setPhase("password");
      }
    }
  }

  // R21: el secreto sale de la barra en cuanto se lee, antes de que el maestro escriba nada. De
  // layout para que corra antes del pintado. `replaceState` no recarga ni avisa a nadie: solo
  // quita el fragmento.
  useLayoutEffect(() => {
    if (!hashUrl.startsWith(PREFIJO_ENLACE)) return;
    window.history.replaceState(null, "", window.location.pathname);
    setTimeout(() => passwordRef.current?.focus(), 0);
  }, [hashUrl]);

  // Foco en el campo de cada fase al entrar en ella (al montar, el email). En un efecto y no en un
  // `setTimeout`: la fase nueva llega con la transición, que puede pintarse después del temporizador.
  useEffect(() => {
    if (phase === "email") emailRef.current?.focus();
    else if (phase === "password") passwordRef.current?.focus();
  }, [phase]);

  // R19: del enlace muerto se vuelve al paso 1 del flujo normal, sin rastro del enlace.
  const pedirEnlaceNuevo = () => {
    setEnlace(null);
    setEnlaceInvalido(false);
    setGeneralError(null);
    setPhase("email");
    setTimeout(() => emailRef.current?.focus(), 0);
  };

  // Paso 1 (R1/R12; SL-18 R16): solicitar recuperación. Respuesta siempre genérica: se acaba en
  // «Revisa tu correo» tanto si el email existe como si no.
  const handleSubmitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);
    setEmailFieldErrors({});

    const result = emailSchema.safeParse({ email });
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors as Record<string, string[]>;
      setEmailFieldErrors(errors);
      emailRef.current?.focus();
      return;
    }

    startTransition(async () => {
      const res = await solicitarRecuperacion({ email });

      // Lo que sigue al `await` ya no es parte de la transición (React 19): sin este
      // `startTransition`, la fase nueva se pinta con `isPending` aún en true y sus campos
      // salen deshabilitados; lo que se teclea en ese hueco se pierde.
      startTransition(() => {
        switch (res.status) {
          case "ok":
            setPhase("sent");
            break;
          case "validation_error":
            setEmailFieldErrors(res.fieldErrors);
            emailRef.current?.focus();
            break;
        }
      });
    });
  };

  // Paso de la contraseña (R7/R8/R9/R10/R11), solo con el enlace del correo (SL-41, SL-18 R20).
  const handleSubmitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);
    setPasswordFieldErrors({});

    // Feedback temprano reutilizando la politica fuerte (R8) y la coincidencia (R7).
    const clientErrors: Record<string, string[]> = {};
    const strong = strongPasswordSchema.safeParse(password);
    if (!strong.success) {
      clientErrors.password = strong.error.issues.map((i) => i.message);
    }
    if (password !== confirmPassword) {
      clientErrors.confirmPassword = ["Las contraseñas no coinciden"];
    }
    if (Object.keys(clientErrors).length > 0) {
      setPasswordFieldErrors(clientErrors);
      if (clientErrors.password) {
        passwordRef.current?.focus();
      }
      return;
    }

    // Sin enlace no hay con qué guardar: el paso de la contraseña solo se alcanza desde él.
    if (!enlace) {
      setEnlaceInvalido(true);
      return;
    }

    startTransition(async () => {
      const res = await crearContrasenaConEnlace({ enlace, password, confirmPassword });

      // Tras el `await`, de nuevo en la transición: ver `handleSubmitEmail`.
      startTransition(() => {
        switch (res.status) {
          case "ok":
            setPhase("done");
            break;
          case "invalid_or_expired":
            // El enlace dejó de servir: mensaje genérico, sin tocar la contraseña.
            setEnlaceInvalido(true);
            break;
          case "validation_error":
            // R19: un enlace mal formado (truncado, con un carácter de más) es un enlace que no
            // sirve. La pantalla no tiene campo para `enlace`, así que su error iría a ningún
            // sitio: se trata igual que el caducado o ya usado.
            if (res.fieldErrors.enlace) {
              setEnlaceInvalido(true);
              break;
            }
            setPasswordFieldErrors(res.fieldErrors);
            passwordRef.current?.focus();
            break;
        }
      });
    });
  };

  // Fase 4 (R17): confirmacion de exito + enlace de regreso al login.
  if (phase === "done") {
    return (
      <Card className="w-full max-w-md border-t-4 border-t-brand p-8 space-y-6">
        <div>
          {/* El texto sigue al flujo: quien llega del enlace de bienvenida la crea por primera
              vez, no la restablece. `enlace` sigue en estado tras el éxito. */}
          <h1 className="text-2xl font-semibold text-center text-foreground">
            {enlace ? "Contraseña creada" : "Contraseña actualizada"}
          </h1>
          <p className="text-sm text-muted-foreground text-center mt-2">
            {enlace
              ? "Tu contraseña se creó correctamente. Ya puedes iniciar sesión con ella."
              : "Tu contraseña se restableció correctamente. Ya puedes iniciar sesión con tu nueva contraseña."}
          </p>
        </div>
        {/* `cn(...)` y no `buttonVariants(...)` a pelo: ficha 439. Esta variante es la de
            fondo solido, asi que HOY no se ve nada raro, pero la composicion es la misma que
            dejo la salida de `ErrorState` sin borde visible —sin tailwind-merge sobreviven las
            clases en conflicto y gana la de la base—. Un enlace con pinta de boton pasa por
            `cn`, siempre. Lo sostiene
            `tests/unit/guards/buttonvariants-pasa-por-cn.guardia.test.ts`. */}
        <Link href="/login" className={cn(buttonVariants({ className: "w-full" }))}>
          Ir a iniciar sesión
        </Link>
      </Card>
    );
  }

  // SL-41 (R19): el enlace ya no sirve. Sin formulario: se ofrece pedir enlaces nuevos por correo.
  if (enlaceInvalido) {
    return (
      <Card className="w-full max-w-md border-t-4 border-t-brand p-8 space-y-6">
        <h1 className="text-2xl font-semibold text-center text-foreground">
          Crea tu contraseña
        </h1>

        <Alert variant="destructive" role="alert" aria-live="assertive">
          <AlertDescription>{ENLACE_INVALIDO_MESSAGE}</AlertDescription>
        </Alert>

        <Button type="button" onClick={pedirEnlaceNuevo} className="w-full">
          Pedir un enlace nuevo por correo
        </Button>
      </Card>
    );
  }

  // Fase 1: email.
  if (phase === "email") {
    return (
      <Card className="w-full max-w-md border-t-4 border-t-brand p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-center text-foreground">
            Recuperar contraseña
          </h1>
          <p className="text-sm text-muted-foreground text-center mt-2">
            Ingresa tu correo y, si existe una cuenta, te enviaremos un enlace para
            crear una contraseña nueva.
          </p>
        </div>

        {generalError && (
          <Alert variant="destructive" role="alert" aria-live="assertive">
            <AlertDescription>{generalError}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmitEmail} noValidate className="space-y-4">
          <FormField
            id="reset-email"
            label="Correo electrónico"
            error={emailFieldErrors.email}
          >
            {(control) => (
              <Input
                {...control}
                ref={emailRef}
                type="email"
                placeholder="tu@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isPending}
              />
            )}
          </FormField>

          <Button type="submit" loading={isPending} className="w-full">
            {isPending ? "Enviando..." : "Enviar enlace"}
          </Button>
        </form>

        <div className="text-center">
          <Link
            href="/login"
            className="text-sm text-muted-foreground hover:text-foreground underline"
          >
            Volver a iniciar sesión
          </Link>
        </div>
      </Card>
    );
  }

  // SL-18 (R16): el paso 1 acaba aquí. Sin formulario: el canje es con el enlace del correo, y llega
  // uno por cada empresa en la que esté ese correo.
  if (phase === "sent") {
    return (
      <Card className="w-full max-w-md border-t-4 border-t-brand p-8 space-y-6">
        <div role="status" aria-live="polite">
          <h1 className="text-2xl font-semibold text-center text-foreground">
            Revisa tu correo
          </h1>
          <p className="text-sm text-muted-foreground text-center mt-2">
            Si el correo existe, te enviamos un enlace para cada cuenta. Revisa tu correo.
          </p>
        </div>

        <div className="text-center">
          <Link
            href="/login"
            className="text-sm text-muted-foreground hover:text-foreground underline"
          >
            Volver a iniciar sesión
          </Link>
        </div>
      </Card>
    );
  }

  // Fase 3: nueva contrasena + confirmacion.
  return (
    <Card className="w-full max-w-md border-t-4 border-t-brand p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-center text-foreground">
          {enlace ? "Crea tu contraseña" : "Nueva contraseña"}
        </h1>
        <p className="text-sm text-muted-foreground text-center mt-2">
          Debe tener al menos 8 caracteres e incluir mayúscula, minúscula, dígito y
          símbolo.
        </p>
      </div>

      {generalError && (
        <Alert variant="destructive" role="alert" aria-live="assertive">
          <AlertDescription>{generalError}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmitPassword} noValidate className="space-y-4">
        <FormField
          id="reset-password"
          label="Nueva contraseña"
          error={passwordFieldErrors.password}
        >
          {(control) => (
            <PasswordInput
              {...control}
              ref={passwordRef}
              etiqueta="Nueva contraseña"
              placeholder="Tu nueva contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isPending}
            />
          )}
        </FormField>

        <FormField
          id="reset-confirm-password"
          label="Confirmar contraseña"
          error={passwordFieldErrors.confirmPassword}
        >
          <PasswordInput
            etiqueta="Confirmar contraseña"
            placeholder="Repite la contraseña"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={isPending}
          />
        </FormField>

        <Button type="submit" loading={isPending} className="w-full">
          {isPending ? "Guardando..." : enlace ? "Crear contraseña" : "Restablecer contraseña"}
        </Button>
      </form>
    </Card>
  );
}
