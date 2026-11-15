"use client";

import { useCallback, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QrScanner } from "@/components/shared/QrScanner";
import { useToast } from "@/hooks/useToast";
import { leerGuia } from "@/lib/utils/paquete-url";

// Feature 98: gate de verificación de guía ANTES de habilitar la gestión de una
// orden en reparto. El mensajero debe confirmar que tiene en la mano el paquete
// correcto escaneando el QR de la etiqueta o tecleando el `num_guia`, y ese
// número debe COINCIDIR con la orden del panel. Evita gestionar el paquete
// equivocado.
//
// Reutiliza el patrón de la feature 96 (recoger por guía/escaneo):
//  - `QrScanner` (click-to-start; NO auto-enciende la cámara) para el QR o el CODE128
//    de la etiqueta.
//  - Input donde se teclea o donde escribe la pistola.
// Los dos caminos leen con la MISMA `leerGuia` (SLT-157) y rechazan con mensaje.
// A diferencia de la 96, aquí NO se llama ninguna Server Action: solo confirma
// que el número coincide y avanza el flujo local del panel (`onVerificado`).

export interface VerificarGuiaGateProps {
  /**
   * `num_guia` de la orden del panel (la que se quiere gestionar). `null` = la
   * orden aún no tiene guía asignada: no hay contra qué verificar y se BLOQUEA.
   */
  numGuiaEsperado: number | null;
  /** Se invoca cuando el número confirmado (tecleado o escaneado) COINCIDE. */
  onVerificado: () => void;
  /** Bloquea input y escáner (p. ej. mientras el padre procesa la verificación). */
  disabled?: boolean;
}

export function VerificarGuiaGate({
  numGuiaEsperado,
  onVerificado,
  disabled = false,
}: Readonly<VerificarGuiaGateProps>) {
  // TODOS los hooks al inicio (rules-of-hooks): el branch
  // `numGuiaEsperado === null` vive en el JSX de retorno, NUNCA antes de los hooks.
  const toast = useToast();
  const [valor, setValor] = useState("");
  const inputId = useId();

  /** Compara un número contra el esperado: coincide → onVerificado; si no → toast. */
  const confirmarNumero = useCallback(
    (numero: number) => {
      if (numero === numGuiaEsperado) {
        onVerificado();
        return;
      }
      toast.error(`La guía ${numero} no corresponde a esta orden.`);
    },
    [numGuiaEsperado, onVerificado, toast],
  );

  /**
   * Lectura por cámara o por teclado: lee el num_guia con `leerGuia`; lo que no es
   * guía → toast (antes, lo tecleado se ignoraba en silencio); si es guía, compara.
   */
  const handleLectura = useCallback(
    (texto: string) => {
      const numGuia = leerGuia(texto);
      if (numGuia === null) {
        toast.error("Código inválido.");
        return;
      }
      confirmarNumero(numGuia);
    },
    [confirmarNumero, toast],
  );

  // Orden sin guía asignada: sin guía no hay contra qué verificar, así que se
  // BLOQUEA la gestión (ni input ni escáner, solo el aviso).
  if (numGuiaEsperado === null) {
    return (
      <div
        role="alert"
        className="w-full rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm text-warning-strong"
      >
        Esta orden aún no tiene guía asignada; no se puede gestionar.
      </div>
    );
  }

  return (
    <section
      aria-label="Verificar la guía del paquete antes de gestionar"
      className="flex w-full flex-col gap-3"
    >
      <p className="text-sm text-muted-foreground">
        Escanea el QR de la etiqueta o ingresa el número de guía para confirmar
        que tienes el paquete correcto.
      </p>

      <form
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          handleLectura(valor);
        }}
      >
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor={inputId} className="text-sm font-medium">
            Número de guía
          </label>
          <Input
            id={inputId}
            inputMode="numeric"
            autoComplete="off"
            value={valor}
            disabled={disabled}
            onChange={(event) => setValor(event.target.value)}
            placeholder="Ingresa el número de guía"
          />
        </div>
        <Button type="submit" disabled={disabled || valor.trim() === ""}>
          Gestionar
        </Button>
      </form>

      <QrScanner
        onDecoded={handleLectura}
        disabled={disabled}
        mensajeErrorCamara="No se pudo abrir la cámara."
      />
    </section>
  );
}
