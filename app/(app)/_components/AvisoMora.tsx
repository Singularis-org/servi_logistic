import type { RolValue } from "@prisma/client";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ROLES_MI_PLAN } from "@/lib/auth/menu-visibility";
import { MORA_TEXTOS, type EstadoMora } from "@/lib/planes/mora";

// SLT-121 (design §7.1; R24) — el banner de la mora, en todas las pantallas autenticadas del maestro y el admin.
// El estado lo resuelve `app/(app)/layout.tsx` en el servidor y baja por props; aquí no se lee nada. Sin
// "use client": es solo texto y un enlace. El enlace a «Mi plan» lo lleva solo quien está en `ROLES_MI_PLAN`
// (SLT-91): el admin ve el aviso, pero no la vía hasta las facturas.

interface AvisoMoraProps {
  readonly estado: EstadoMora | null;
  readonly rol: RolValue;
}

type Tono = "aviso" | "alerta";

function contenido(estado: EstadoMora): { texto: string; tono: Tono } | null {
  switch (estado.estado) {
    case "al_dia":
      return null;
    case "en_plazo":
      return { texto: MORA_TEXTOS.banner.enPlazo(estado.fechaLimite), tono: "aviso" };
    case "vencida":
      return { texto: MORA_TEXTOS.banner.vencida, tono: "alerta" };
    case "congelada":
      return { texto: MORA_TEXTOS.banner.congelada, tono: "alerta" };
    case "con_plazo":
      return { texto: MORA_TEXTOS.banner.conPlazo(estado.hasta), tono: "aviso" };
  }
}

export function AvisoMora({ estado, rol }: AvisoMoraProps) {
  if (!estado) return null;
  const banner = contenido(estado);
  if (!banner) return null;
  const conEnlace = estado.estado === "en_plazo" && (ROLES_MI_PLAN as readonly string[]).includes(rol);
  return (
    <Alert
      role={banner.tono === "alerta" ? "alert" : "status"}
      variant={banner.tono === "alerta" ? "destructive" : "default"}
      data-tono={banner.tono}
      className="mx-4 mt-4 w-auto md:mx-6"
    >
      <AlertDescription className={banner.tono === "alerta" ? undefined : "text-foreground"}>
        <p>
          {banner.texto}
          {conEnlace && (
            <>
              {" "}
              <Link href="/mi-plan">{MORA_TEXTOS.banner.verFacturas}</Link>
            </>
          )}
        </p>
      </AlertDescription>
    </Alert>
  );
}
