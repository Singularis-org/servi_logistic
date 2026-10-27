// @vitest-environment jsdom
// SL-23 (design §7; R8, R9) — LOS INTERRUPTORES DE MÓDULOS DEL DETALLE DE UNA EMPRESA.
//
// Se monta el componente REAL con el `ToastProvider` real; la action llega por props como un doble.
// Se mide lo que ve el superadmin: el switch llama a la action con la empresa y el módulo, queda
// deshabilitado mientras espera, y si la action no responde `ok` (o lanza) vuelve al estado anterior
// y lo avisa.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ToastProvider } from "@/providers/ToastProvider";
import { ModulosEmpresa } from "@/app/(app)/plataforma/empresas/[organizacionId]/_components/ModulosEmpresa";
import { MODULOS_APAGABLES, ORDEN_MODULOS } from "@/lib/modulos/catalogo";
import type { FijarModuloEmpresaResult, ModuloDeEmpresa } from "@/lib/types/modulos-empresa";

const ORG = "6f1c2a4e-7b1d-4c3e-9a2f-1b2c3d4e5f60";

function modulos(encendidos: readonly string[] = []): ModuloDeEmpresa[] {
  return ORDEN_MODULOS.map((clave) => ({
    clave,
    nombre: MODULOS_APAGABLES[clave].nombre,
    activo: encendidos.includes(clave),
  }));
}

function montar(fijarModulo: (input: unknown) => Promise<FijarModuloEmpresaResult>, encendidos: string[] = []) {
  return render(
    <ToastProvider>
      <ModulosEmpresa organizacionId={ORG} modulos={modulos(encendidos)} fijarModulo={fijarModulo} />
    </ToastProvider>,
  );
}

function diferido<T>() {
  let resolver!: (v: T) => void;
  const promesa = new Promise<T>((r) => {
    resolver = r;
  });
  return { promesa, resolver };
}

afterEach(() => cleanup());

describe("SL-23 (R8) — una fila por módulo con su interruptor", () => {
  it("pinta los 8 módulos en el orden del catálogo, con su descripción y su estado", () => {
    montar(vi.fn(), ["wallet"]);

    const switches = screen.getAllByRole("switch");
    expect(switches.map((s) => s.getAttribute("aria-label"))).toEqual(
      ORDEN_MODULOS.map((c) => MODULOS_APAGABLES[c].nombre),
    );
    expect(screen.getByRole("switch", { name: "Wallet" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("switch", { name: "Ranking" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("switch", { name: "WhatsApp" })).toHaveAccessibleDescription(
      MODULOS_APAGABLES.whatsapp.descripcion,
    );
  });
});

describe("SL-23 (R8, R9) — el switch llama a la action", () => {
  it("al encender, llama con la empresa, el módulo y `activo: true`, y se queda encendido", async () => {
    const fijar = vi.fn().mockResolvedValue({ estado: "ok", cambio: true });
    montar(fijar);
    const user = userEvent.setup();

    await user.click(screen.getByRole("switch", { name: "Ranking" }));

    expect(fijar).toHaveBeenCalledWith({ organizacionId: ORG, modulo: "ranking", activo: true });
    await waitFor(() =>
      expect(screen.getByRole("switch", { name: "Ranking" })).not.toHaveAttribute("aria-disabled", "true"),
    );
    expect(screen.getByRole("switch", { name: "Ranking" })).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByText(/No se pudo cambiar/)).toBeNull();
  });

  it("al apagar, llama con `activo: false`", async () => {
    const fijar = vi.fn().mockResolvedValue({ estado: "ok", cambio: true });
    montar(fijar, ["whatsapp"]);
    const user = userEvent.setup();

    await user.click(screen.getByRole("switch", { name: "WhatsApp" }));

    expect(fijar).toHaveBeenCalledWith({ organizacionId: ORG, modulo: "whatsapp", activo: false });
    await waitFor(() =>
      expect(screen.getByRole("switch", { name: "WhatsApp" })).toHaveAttribute("aria-checked", "false"),
    );
  });

  it("se deshabilita mientras espera la respuesta, y un segundo clic no vuelve a llamar", async () => {
    const { promesa, resolver } = diferido<FijarModuloEmpresaResult>();
    const fijar = vi.fn().mockReturnValue(promesa);
    montar(fijar);
    const user = userEvent.setup();

    await user.click(screen.getByRole("switch", { name: "Analítica" }));
    const sw = screen.getByRole("switch", { name: "Analítica" });
    expect(sw).toHaveAttribute("aria-disabled", "true");
    await user.click(sw);
    expect(fijar).toHaveBeenCalledTimes(1);

    resolver({ estado: "ok", cambio: true });
    await waitFor(() => expect(sw).not.toHaveAttribute("aria-disabled", "true"));
  });
});

describe("SL-23 (R8) — si falla, vuelve atrás y avisa", () => {
  it.each<FijarModuloEmpresaResult>([
    { estado: "forbidden" },
    { estado: "not_found" },
    { estado: "validation_error" },
  ])("respuesta $estado → el switch vuelve a su estado y sale el aviso", async (respuesta) => {
    const fijar = vi.fn().mockResolvedValue(respuesta);
    montar(fijar);
    const user = userEvent.setup();

    await user.click(screen.getByRole("switch", { name: "Monitoreo" }));

    expect((await screen.findAllByText("No se pudo cambiar «Monitoreo». Inténtalo de nuevo.")).length).toBeGreaterThan(0);
    const sw = screen.getByRole("switch", { name: "Monitoreo" });
    expect(sw).toHaveAttribute("aria-checked", "false");
    expect(sw).not.toHaveAttribute("aria-disabled", "true");
  });

  it("si la action lanza, también vuelve atrás y avisa", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const fijar = vi.fn().mockRejectedValue(new Error("red caída"));
    montar(fijar, ["recoleccion"]);
    const user = userEvent.setup();

    await user.click(screen.getByRole("switch", { name: "Recolección" }));

    expect((await screen.findAllByText("No se pudo cambiar «Recolección». Inténtalo de nuevo.")).length).toBeGreaterThan(0);
    expect(screen.getByRole("switch", { name: "Recolección" })).toHaveAttribute("aria-checked", "true");
    error.mockRestore();
  });
});
