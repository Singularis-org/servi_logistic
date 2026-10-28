// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DesconectarDialogo } from "@/app/(app)/configuracion/integraciones/_components/DesconectarDialogo";
import type { ServicioIntegracion } from "@/lib/types/integraciones";

// SL-36 (R31) — el aviso antes de desconectar. Los textos son los LITERALES del design §7 y la marca
// la propuesta del catálogo (pregunta abierta 1), copiados a mano: comparar contra
// `CATALOGO_INTEGRACIONES` saldría verde aunque el catálogo dijera otra cosa.
const ESPERADO: ReadonlyArray<readonly [ServicioIntegracion, string, string, string]> = [
  [
    "whatsapp",
    "¿Desconectar WhatsApp Business?",
    "Requerido",
    "No salen los avisos automáticos a los clientes, no hay chat con ellos, no se envía el mensaje de bienvenida y no se pueden crear ni sincronizar plantillas.",
  ],
  [
    "google_maps",
    "¿Desconectar Google Maps?",
    "Requerido",
    "Las órdenes nuevas se quedan sin ubicación. Se pueden asignar igual, pero no aparecen en el mapa y la ruta del mensajero no las ordena por cercanía. Las direcciones que la app ya conocía siguen ubicándose.",
  ],
  [
    "optimizacion_rutas",
    "¿Desconectar Optimización de rutas?",
    "Recomendado",
    "La ruta de cada mensajero se ordena con un cálculo aproximado en línea recta, sin calles ni tráfico, y el mapa no dibuja el trazado.",
  ],
  [
    "asistente",
    "¿Desconectar Asistente IA?",
    "Recomendado",
    "El panel del asistente dice que no está configurado. La ayuda escrita de cada pantalla sigue disponible.",
  ],
];

afterEach(cleanup);

describe("DesconectarDialogo (SL-36)", () => {
  it.each(ESPERADO)(
    "SL-36/R31: muestra marca y qué deja de funcionar antes de confirmar (%s)",
    async (servicio, titulo, marca, queDeja) => {
      const user = userEvent.setup();
      const onConfirmar = vi.fn(async () => {});
      render(<DesconectarDialogo servicio={servicio} open onOpenChange={vi.fn()} onConfirmar={onConfirmar} />);

      const dialogo = await screen.findByRole("dialog", { name: titulo });
      expect(dialogo).toBeInTheDocument();
      expect(screen.getByTestId("marca-desconexion")).toHaveTextContent(marca);
      expect(screen.getByTestId("que-deja-de-funcionar").textContent).toBe(queDeja);
      // Todo lo anterior se ve sin haber confirmado.
      expect(onConfirmar).not.toHaveBeenCalled();

      await user.click(screen.getByRole("button", { name: "Desconectar" }));
      await waitFor(() => expect(onConfirmar).toHaveBeenCalledTimes(1));
    },
  );

  it("SL-36/R31: cancelar no desconecta", async () => {
    const user = userEvent.setup();
    const onConfirmar = vi.fn(async () => {});
    const onOpenChange = vi.fn();
    render(<DesconectarDialogo servicio="whatsapp" open onOpenChange={onOpenChange} onConfirmar={onConfirmar} />);
    await user.click(await screen.findByRole("button", { name: "Cancelar" }));
    expect(onConfirmar).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
