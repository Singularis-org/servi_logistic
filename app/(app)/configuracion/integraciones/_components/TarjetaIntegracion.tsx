"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { BookOpen, KeyRound, Plug, RefreshCw, Unplug } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { VistaIntegracion } from "@/lib/interfaces/services/IIntegracionesService";
import { CATALOGO_INTEGRACIONES } from "@/lib/types/integraciones";

// Mismo formato de fecha que `Configuración › API`: la sección de configuración dice las fechas de
// una sola forma, y una segunda copia del formato acabaría divergiendo.
import { formatFechaHoraLegible } from "../../api/_components/fecha-legible";
import {
  ETIQUETA_DATO_PUBLICO,
  ETIQUETA_ESTADO,
  ETIQUETA_MARCA,
  TEXTOS_PANTALLA,
  VARIANTE_ESTADO,
} from "./integraciones-textos";

export interface TarjetaIntegracionProps {
  vista: VistaIntegracion;
  /** Hay una operación en curso sobre este servicio: los botones se bloquean (anti doble envío). */
  ocupado?: boolean;
  /** El formulario abierto se pinta dentro de la tarjeta: en el teléfono no hay que buscarlo. */
  formularioAbierto?: boolean;
  onConfigurar: () => void;
  onProbar: () => void;
  onRegenerarToken: () => void;
  onDesconectar: () => void;
  /** El formulario de alta o edición, cuando está abierto. */
  children?: ReactNode;
}

function fechaOVacio(valor: string | null): string | null {
  return valor === null ? null : formatFechaHoraLegible(valor);
}

/**
 * SL-36 (R34, R35) — un servicio: estado, marca, último error (solo en «error»), hora de la última
 * prueba y, en WhatsApp, la del último contacto del webhook. Solo pinta: las operaciones las decide
 * el módulo, que es quien llama a las actions.
 */
export function TarjetaIntegracion({
  vista,
  ocupado = false,
  formularioAbierto = false,
  onConfigurar,
  onProbar,
  onRegenerarToken,
  onDesconectar,
  children,
}: TarjetaIntegracionProps) {
  const entrada = CATALOGO_INTEGRACIONES[vista.servicio];
  const configurada = vista.estado !== "sin_configurar";
  const idTitulo = `integracion-${vista.servicio}-titulo`;
  const ultimaPrueba = fechaOVacio(vista.ultimaPruebaAt);
  const ultimoWebhook = fechaOVacio(vista.ultimoWebhookAt);
  const datos = Object.entries(vista.datosPublicos).filter(
    ([clave, valor]) => valor !== "" && Object.hasOwn(ETIQUETA_DATO_PUBLICO, clave),
  );

  return (
    <Card role="region" aria-labelledby={idTitulo}>
      <CardHeader>
        <CardTitle>
          <h2 id={idTitulo}>{entrada.nombre}</h2>
        </CardTitle>
        <CardDescription className="flex flex-wrap items-center gap-2">
          <Badge variant={VARIANTE_ESTADO[vista.estado]} data-testid="estado-integracion">
            {ETIQUETA_ESTADO[vista.estado]}
          </Badge>
          <Badge variant="secondary" data-testid="marca-integracion">
            {ETIQUETA_MARCA[vista.marca]}
          </Badge>
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-3 text-sm">
        {/* R34: el error solo existe en «error». Una integración conectada con un texto viejo de
            error haría creer al maestro que sigue rota. */}
        {vista.estado === "error" && vista.ultimoErrorTexto ? (
          <p role="alert" className="text-destructive">
            {vista.ultimoErrorTexto}
          </p>
        ) : null}

        {datos.length > 0 ? (
          <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
            {datos.map(([clave, valor]) => (
              <div key={clave} className="contents">
                <dt className="text-muted-foreground">{ETIQUETA_DATO_PUBLICO[clave]}</dt>
                <dd className="break-all">{valor}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        {configurada ? (
          <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
            <dt className="text-muted-foreground">{TEXTOS_PANTALLA.ultimaPrueba}</dt>
            <dd data-testid="ultima-prueba">{ultimaPrueba ?? TEXTOS_PANTALLA.sinPrueba}</dd>
            {vista.servicio === "whatsapp" ? (
              <>
                <dt className="text-muted-foreground">{TEXTOS_PANTALLA.ultimoWebhook}</dt>
                <dd data-testid="ultimo-webhook">{ultimoWebhook ?? TEXTOS_PANTALLA.sinWebhook}</dd>
              </>
            ) : null}
          </dl>
        ) : null}

        {/* R35: la guía de cada servicio, a mano desde la tarjeta y desde su formulario. */}
        <Link href={entrada.guia} className="inline-flex items-center gap-1.5 text-primary underline-offset-4 hover:underline">
          <BookOpen aria-hidden="true" className="size-4" />
          {TEXTOS_PANTALLA.guia}
          <span className="sr-only">: {entrada.nombre}</span>
        </Link>

        {children}
      </CardContent>

      {formularioAbierto ? null : (
        <CardFooter className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={onConfigurar} disabled={ocupado}>
            <Plug aria-hidden="true" />
            {configurada ? TEXTOS_PANTALLA.editar : TEXTOS_PANTALLA.configurar}
          </Button>
          {configurada ? (
            <>
              <Button type="button" size="sm" variant="outline" onClick={onProbar} disabled={ocupado}>
                <RefreshCw aria-hidden="true" />
                {TEXTOS_PANTALLA.probar}
              </Button>
              {vista.servicio === "whatsapp" ? (
                <Button type="button" size="sm" variant="outline" onClick={onRegenerarToken} disabled={ocupado}>
                  <KeyRound aria-hidden="true" />
                  {TEXTOS_PANTALLA.regenerar}
                </Button>
              ) : null}
              <Button type="button" size="sm" variant="destructive" onClick={onDesconectar} disabled={ocupado}>
                <Unplug aria-hidden="true" />
                {TEXTOS_PANTALLA.desconectar}
              </Button>
            </>
          ) : null}
        </CardFooter>
      )}
    </Card>
  );
}
