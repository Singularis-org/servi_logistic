import { describe, it, expect, vi } from "vitest";
import { PlantillaMensajeService } from "@/lib/services/PlantillaMensajeService";
import type { IPlantillaMensajeRepository } from "@/lib/interfaces/repositories/IPlantillaMensajeRepository";
import type { Actor } from "@/lib/interfaces/services/IPlantillaMensajeService";
import { PaisSinZonaHoraria } from "@/lib/db/errores-pais";
import { reglasPaisFijas } from "@/tests/fabricas/reglas-pais";

// SLT-42 (R22, R28; decision del humano tras T5.7) — la vista previa «asi lo vera el cliente» de
// una plantilla pinta las fechas con hora del ejemplo en la zona del pais de la empresa, igual
// que el envio real. Solo lee la zona si el cuerpo pinta alguna.

const MAESTRO: Actor = { usuarioId: "m1", rol: "maestro" };
// El preview no toca el repositorio.
const REPO = {} as IPlantillaMensajeRepository;

function servicio(reglasPais?: ReturnType<typeof reglasPaisFijas>): PlantillaMensajeService {
  return new PlantillaMensajeService(REPO, undefined, { reglasPais });
}

describe("SLT-42 — vista previa de plantilla con fecha y hora", () => {
  it("R22: el mismo ejemplo (14:15 UTC) es 08:15 en Costa Rica y 09:15 en Bogota", async () => {
    const cr = await servicio(reglasPaisFijas()).preview("Asignada {{fecha_asignacion}}", MAESTRO);
    const co = await servicio(reglasPaisFijas({ paisId: "CO", zonaHoraria: "America/Bogota" })).preview(
      "Asignada {{fecha_asignacion}}",
      MAESTRO,
    );
    expect(cr).toEqual({ status: "ok", texto: "Asignada 26/08/2026 08:15" });
    expect(co).toEqual({ status: "ok", texto: "Asignada 26/08/2026 09:15" });
  });

  it("R28: sin zona en el pais, la vista previa con fecha y hora falla con PaisSinZonaHoraria", async () => {
    await expect(
      servicio(reglasPaisFijas({ zonaHoraria: null })).preview("Creada {{fecha_creacion}}", MAESTRO),
    ).rejects.toBeInstanceOf(PaisSinZonaHoraria);
  });

  it("sin fechas con hora en el cuerpo, no lee la zona (y no hace falta el puerto)", async () => {
    const reglas = reglasPaisFijas({ zonaHoraria: null });
    const zona = vi.spyOn(reglas, "zonaHoraria");
    expect(await servicio(reglas).preview("Hola {{cliente}}", MAESTRO)).toEqual({
      status: "ok",
      texto: "Hola María Rodríguez",
    });
    expect(zona).not.toHaveBeenCalled();
    expect(await servicio().preview("Reparto {{fecha_reparto}}", MAESTRO)).toEqual({
      status: "ok",
      texto: "Reparto 26/08/2026",
    });
  });
});
