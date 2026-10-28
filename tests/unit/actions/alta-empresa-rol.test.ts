import { describe, it, expect, vi } from "vitest";

import { altaEmpresaAction } from "@/lib/actions/organizaciones";
import { contextoActual, type ContextoDatos } from "@/lib/db/contexto-empresa";
import type { IOrganizacionService } from "@/lib/interfaces/services/IOrganizacionService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";

// SL-32 T15 (R35) — la action de alta de SL-17 pregunta por el rol con la misma fuente que la
// pantalla «Empresas» (`esPlataforma`, vía `exigirSuperadmin`). El contrato de rechazo es el real
// de SL-17, `{ estado: "no_autorizado" }`. El servicio es un doble que cuenta llamadas y anota el
// contexto de datos en el que corre: el alta va en plataforma porque la empresa aún no existe.

const ENTRADA = {
  nombre: "Envíos del Norte",
  slug: "envios-del-norte",
  paisId: "CR",
  maestro: {
    nombre: "Marta",
    email: "marta@ejemplo.test",
    telefono: "88886666",
    documento: "113334444",
    tipoDocumento: "cedula",
  },
};

function servicioDoble() {
  const contextos: (ContextoDatos | undefined)[] = [];
  const altaEmpresa = vi.fn<IOrganizacionService["altaEmpresa"]>(async () => {
    contextos.push(contextoActual());
    return { estado: "creada" as const, organizacionId: "org-1", maestroId: "u-1" };
  });
  const service: IOrganizacionService = { altaEmpresa };
  return { service, altaEmpresa, contextos };
}

describe("SL-32 T15 (R35) — quién llega al alta de empresa", () => {
  it("un maestro recibe no_autorizado y el servicio no se llama", async () => {
    const { service, altaEmpresa } = servicioDoble();
    const maestro: Actor = { usuarioId: "u-maestro", rol: "maestro", organizacionId: "org-x" };

    const r = await altaEmpresaAction(ENTRADA, { getActor: async () => maestro, service });

    expect(r).toEqual({ estado: "no_autorizado" });
    expect(altaEmpresa).not.toHaveBeenCalled();
  });

  it("un superadmin llega al servicio una vez, con la entrada tal cual y en plataforma", async () => {
    const { service, altaEmpresa, contextos } = servicioDoble();
    const superadmin: Actor = { usuarioId: "u-super", rol: "superadmin", organizacionId: null };

    // SL-41: tras `creada` la action envia la bienvenida; un doble la deja fuera de la base.
    const bienvenida = { enviar: vi.fn(async () => ({ estado: "enviada" as const, email: "marta@ejemplo.test" })) };
    const getContext = async () => ({ ipAddress: "203.0.113.5", userAgent: "vitest" });
    const r = await altaEmpresaAction(ENTRADA, { getActor: async () => superadmin, service, bienvenida, getContext });

    expect(altaEmpresa).toHaveBeenCalledTimes(1);
    expect(altaEmpresa).toHaveBeenCalledWith(ENTRADA);
    expect(r).toEqual({ estado: "creada", organizacionId: "org-1", maestroId: "u-1", bienvenida: "enviada" });
    expect(contextos).toEqual([{ tipo: "plataforma", ficha: "SL-17", motivo: "alta de empresa por el superadmin" }]);
  });
});
