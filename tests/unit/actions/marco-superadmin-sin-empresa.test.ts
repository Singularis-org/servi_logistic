import { describe, it, expect, vi } from "vitest";
import {
  descartarNotificacion,
  listarNotificaciones,
  marcarTodasLeidas,
} from "@/lib/actions/notificaciones";
import {
  eliminarSuscripcionPush,
  obtenerClavePublicaPush,
  olvidarPreferenciaDeAvisos,
  registrarSuscripcionPush,
} from "@/lib/actions/push";
import type { INotificacionService } from "@/lib/interfaces/services/INotificacionService";
import type { IPushSuscripcionRepository } from "@/lib/interfaces/repositories/IPushSuscripcionRepository";
import type { IUsuarioPreferenciaRepository } from "@/lib/interfaces/repositories/IUsuarioPreferenciaRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { ROLES_PLATAFORMA } from "@/lib/auth/plataforma";

// SL-32 (R6) — el marco del portal (la campana y el canal de avisos) se pinta en todas las páginas
// del superadmin, y él no tiene empresa: cada sondeo daba `EmpresaNoResuelta` y un 500. Para un
// actor de plataforma, las actions devuelven su desenlace vacío y NO tocan la capa de datos. El
// doble lanza si alguien lo llama, así que una rama de plataforma ausente se ve como rojo y no como
// un vacío que coincida por casualidad.

const SUPERADMIN: Actor = { usuarioId: "u-plataforma", rol: ROLES_PLATAFORMA[0], organizacionId: null };
const MAESTRO: Actor = { usuarioId: "u-maestro", rol: "maestro", organizacionId: "org-1" };
const ID_VALIDO = "11111111-1111-4111-8111-111111111111";
const SUSCRIPCION = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
  p256dh: "BP256DH",
  auth: "AUTH",
  etiqueta: "Chrome en Android",
};

/** Cualquier método que se llame lanza y queda apuntado: la plataforma no debe llegar aquí. */
function dobleQueNoSeLlama<T>(): { doble: T; llamadas: string[] } {
  const llamadas: string[] = [];
  const doble = new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === "then") return undefined;
        return () => {
          llamadas.push(String(prop));
          throw new Error(`no debía llamarse: ${String(prop)}`);
        };
      },
    },
  ) as T;
  return { doble, llamadas };
}

describe("SL-32 R6 — la campana del superadmin, sin tocar notificaciones de empresa", () => {
  it("listarNotificaciones: lista vacía y contadores en cero, sin llamar al servicio", async () => {
    const { doble, llamadas } = dobleQueNoSeLlama<INotificacionService>();
    const r = await listarNotificaciones({ service: doble, getActor: async () => SUPERADMIN });
    expect(r).toEqual({ status: "ok", items: [], noLeidas: 0, porHacer: 0 });
    expect(llamadas).toEqual([]);
  });

  it("marcarTodasLeidas: ok con cero marcadas, sin escribir", async () => {
    const { doble, llamadas } = dobleQueNoSeLlama<INotificacionService>();
    const r = await marcarTodasLeidas({ service: doble, getActor: async () => SUPERADMIN });
    expect(r).toEqual({ status: "ok", marcadas: 0 });
    expect(llamadas).toEqual([]);
  });

  it("descartarNotificacion: forbidden, sin escribir; el id malo sigue siendo validation_error", async () => {
    const { doble, llamadas } = dobleQueNoSeLlama<INotificacionService>();
    const deps = { service: doble, getActor: async () => SUPERADMIN };
    expect(await descartarNotificacion(ID_VALIDO, deps)).toEqual({ status: "forbidden" });
    expect((await descartarNotificacion("", deps)).status).toBe("validation_error");
    expect(llamadas).toEqual([]);
  });

  it("contraprueba: un rol de empresa sí llega al servicio", async () => {
    const listar = vi.fn(async () => ({ status: "ok" as const, items: [], noLeidas: 3, porHacer: 1 }));
    const service = { listar } as unknown as INotificacionService;
    const r = await listarNotificaciones({ service, getActor: async () => MAESTRO });
    expect(listar).toHaveBeenCalledWith(MAESTRO);
    expect(r).toMatchObject({ status: "ok", noLeidas: 3 });
  });
});

describe("SL-32 R6 — el canal de avisos del superadmin, sin push_suscripcion ni usuario_preferencia", () => {
  function deps() {
    const repo = dobleQueNoSeLlama<IPushSuscripcionRepository>();
    const pref = dobleQueNoSeLlama<IUsuarioPreferenciaRepository>();
    return {
      repo,
      pref,
      deps: {
        repo: repo.doble,
        preferenciaRepo: pref.doble,
        getActor: async () => SUPERADMIN,
        clavePublica: () => "CLAVE-PUBLICA-DE-PRUEBA",
      },
    };
  }

  it("obtenerClavePublicaPush: sin canal (null), así el interruptor no se ofrece", async () => {
    const d = deps();
    expect(await obtenerClavePublicaPush(d.deps)).toEqual({ status: "ok", clavePublica: null });
  });

  it("registrarSuscripcionPush: forbidden, y no escribe ni la suscripción ni la preferencia", async () => {
    const d = deps();
    expect(await registrarSuscripcionPush(SUSCRIPCION, d.deps)).toEqual({ status: "forbidden" });
    expect(d.repo.llamadas).toEqual([]);
    expect(d.pref.llamadas).toEqual([]);
  });

  it("olvidarPreferenciaDeAvisos: ok sin escribir", async () => {
    const d = deps();
    expect(await olvidarPreferenciaDeAvisos(d.deps)).toEqual({ status: "ok" });
    expect(d.pref.llamadas).toEqual([]);
  });

  it("eliminarSuscripcionPush: ok sin escribir (el cierre de sesión sigue saliendo)", async () => {
    const d = deps();
    expect(await eliminarSuscripcionPush({ endpoint: SUSCRIPCION.endpoint }, d.deps)).toEqual({
      status: "ok",
    });
    expect(d.repo.llamadas).toEqual([]);
  });

  it("contraprueba: un rol de empresa recibe la clave real", async () => {
    const d = deps();
    const r = await obtenerClavePublicaPush({ ...d.deps, getActor: async () => MAESTRO });
    expect(r).toEqual({ status: "ok", clavePublica: "CLAVE-PUBLICA-DE-PRUEBA" });
  });
});
