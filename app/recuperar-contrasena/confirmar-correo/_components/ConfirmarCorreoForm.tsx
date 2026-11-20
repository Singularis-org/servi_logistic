"use client";

import { useLayoutEffect, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";

import { confirmarCambioCorreo } from "@/lib/actions/confirmar-correo";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

// El enlace del correo trae `<id>.<secreto>` en el fragmento, nunca en la ruta ni en la query
// (R1632): así no llega al servidor ni a sus registros. Mismo formato que el de `/recuperar-contrasena`.
const PREFIJO_ENLACE = "#enlace=";

// Textos de la pantalla en un solo sitio (R1622-R1624).
export const TEXTOS_CONFIRMAR_CORREO = {
  titulo: "Confirma tu correo",
  explicacion:
    "Tu administrador cambió el correo de tu cuenta. Confírmalo para empezar a entrar con él.",
  confirmar: "Confirmar correo",
  confirmando: "Confirmando...",
  tituloHecho: "Correo confirmado",
  hecho: "Listo. Desde ahora entras con tu correo nuevo y tu misma contraseña.",
  invalido: "El enlace no es válido o ya venció. Pide a tu administrador que te envíe otro.",
  enUso: "Ese correo ya lo usa otra cuenta de tu empresa. Habla con tu administrador.",
  irALogin: "Ir a iniciar sesión",
} as const;

const T = TEXTOS_CONFIRMAR_CORREO;

type Fase = "listo" | "hecho" | "invalido" | "en_uso";

// La fuente externa del fragmento, para `useSyncExternalStore` (el mismo patrón que
// `RecuperarContrasenaForm`): el servidor no lo tiene y el cliente lo lee al hidratar.
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
 * SLT-221 (design §4.3, §7): confirmar el correo nuevo. Abrir la página no llama a nada (R1626): el
 * cambio solo ocurre al pulsar «Confirmar correo». Sin sesión ni contraseña (R1628).
 */
export function ConfirmarCorreoForm() {
  const [isPending, startTransition] = useTransition();
  const [fase, setFase] = useState<Fase>("listo");
  const [enlace, setEnlace] = useState<string | null>(null);

  const hashUrl = useSyncExternalStore(sinSuscripcion, hashDelCliente, hashDelServidor);

  // El enlace se copia a estado durante el render: en cuanto el efecto de abajo limpia la barra,
  // `hashUrl` pasa a "" y se perdería.
  const [hashVisto, setHashVisto] = useState("");
  if (hashUrl !== hashVisto) {
    setHashVisto(hashUrl);
    if (hashUrl.startsWith(PREFIJO_ENLACE)) {
      const valor = hashUrl.slice(PREFIJO_ENLACE.length);
      if (valor !== "") setEnlace(valor);
    }
  }

  // El secreto sale de la barra en cuanto se lee: `replaceState` no recarga ni llama a nadie.
  useLayoutEffect(() => {
    if (!hashUrl.startsWith(PREFIJO_ENLACE)) return;
    window.history.replaceState(null, "", window.location.pathname);
  }, [hashUrl]);

  const confirmar = () => {
    // Sin enlace en la URL no hay nada que confirmar: el mismo mensaje genérico (R1623).
    if (!enlace) {
      setFase("invalido");
      return;
    }
    startTransition(async () => {
      const res = await confirmarCambioCorreo({ enlace });
      startTransition(() => {
        switch (res.status) {
          case "ok":
            setFase("hecho");
            break;
          case "correo_en_uso":
            setFase("en_uso");
            break;
          // Un enlace mal formado es un enlace que no sirve: mismo mensaje que el vencido (R1623).
          case "invalid_or_expired":
          case "validation_error":
            setFase("invalido");
            break;
        }
      });
    });
  };

  // `cn(...)` y no `buttonVariants(...)` a pelo: ficha 439
  // (`tests/unit/guards/buttonvariants-pasa-por-cn.guardia.test.ts`).
  const irALogin = (
    <Link href="/login" className={cn(buttonVariants({ className: "w-full" }))}>
      {T.irALogin}
    </Link>
  );

  if (fase === "hecho") {
    return (
      <Card className="w-full max-w-md border-t-4 border-t-brand p-8 space-y-6">
        <div role="status" aria-live="polite">
          <h1 className="text-2xl font-semibold text-center text-foreground">{T.tituloHecho}</h1>
          <p className="text-sm text-muted-foreground text-center mt-2">{T.hecho}</p>
        </div>
        {irALogin}
      </Card>
    );
  }

  if (fase === "invalido" || fase === "en_uso") {
    return (
      <Card className="w-full max-w-md border-t-4 border-t-brand p-8 space-y-6">
        <h1 className="text-2xl font-semibold text-center text-foreground">{T.titulo}</h1>
        <Alert variant="destructive" role="alert" aria-live="assertive">
          <AlertDescription>{fase === "invalido" ? T.invalido : T.enUso}</AlertDescription>
        </Alert>
        {irALogin}
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md border-t-4 border-t-brand p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-center text-foreground">{T.titulo}</h1>
        <p className="text-sm text-muted-foreground text-center mt-2">{T.explicacion}</p>
      </div>
      <Button type="button" loading={isPending} onClick={confirmar} className="w-full">
        {isPending ? T.confirmando : T.confirmar}
      </Button>
    </Card>
  );
}
