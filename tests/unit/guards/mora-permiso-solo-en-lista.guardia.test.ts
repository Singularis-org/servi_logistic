import { describe, expect, it } from "vitest";

import { MOTIVOS_EN_MORA, type MotivoEnMora } from "@/lib/db/permiso-en-mora";

import { archivosDeCodigo, leer, sinComentarios } from "./_aislamiento-por-empresa";

/**
 * SLT-121 (design §6.1, §8.3; R11, R15, R17) — GUARDIA: EL PERMISO DE LA MORA SOLO SE CONCEDE EN LA LISTA.
 *
 * `permitidoEnMora` abre el bloqueo de la base (`bloqueo_por_mora`) para una empresa congelada. La lista de
 * quien puede abrirlo, y con que motivo, la cerro el humano (decisiones P1, P2, P3). Un archivo nuevo que lo
 * llame, o uno de la lista que use otro motivo, pone esta guardia en rojo: ampliarla es una decision, no un
 * atajo. En sentido contrario, un archivo de la lista que deja de concederlo tambien falla, para que la
 * lista no quede con permisos de mas.
 */

const PERMISOS: Readonly<Record<string, MotivoEnMora>> = {
  "app/api/cron/procesar-jobs/route.ts": "sistema", // conSuEmpresa (P1)
  "lib/actions/confirmar-correo.ts": "cuenta_propia",
  "lib/actions/notificaciones.ts": "cuenta_propia", // P2
  "lib/actions/push.ts": "cuenta_propia", // P2
  "lib/actions/vistas-filtro.ts": "cuenta_propia", // P2
  "lib/actions/wallet-anulacion.ts": "pago_plataforma", // P3
  "lib/actions/wallet-egresos.ts": "pago_plataforma",
  "lib/db/para-cada-empresa.ts": "sistema", // P1
  "lib/services/WebhookWhatsappService.ts": "whatsapp_entrante",
};

/** Donde se define: declara la funcion, no concede nada. */
const DEFINICION = "lib/db/permiso-en-mora.ts";

const LLAMADA = /\bpermitidoEnMora\s*(?:<[^>]*>)?\s*\(\s*(?:(["'`])([^"'`]*)\1|([^,)]*))/g;

/** Los motivos que concede un fuente (sin comentarios). Un motivo que no es un literal sale como `?<expr>`. */
function motivosConcedidos(fuente: string): string[] {
  return [...sinComentarios(fuente).matchAll(LLAMADA)].map((m) => (m[2] !== undefined ? m[2] : `?${m[3].trim()}`));
}

const archivos = archivosDeCodigo(["lib", "app", "scripts"]).filter((rel) => rel !== DEFINICION);
const concedidos = new Map(
  archivos.map((rel) => [rel, motivosConcedidos(leer(rel))] as const).filter(([, motivos]) => motivos.length > 0),
);

describe("SLT-121 · permitidoEnMora solo en la lista (R11, R15, R17)", () => {
  it("control positivo: el barrido recorre lib/, app/ y scripts/ y encuentra las llamadas", () => {
    expect(archivos.length).toBeGreaterThan(200);
    expect(concedidos.get("lib/db/para-cada-empresa.ts")).toEqual(["sistema"]);
  });

  it("todo archivo que concede el permiso esta en la lista", () => {
    const fuera = [...concedidos.keys()].filter((rel) => !(rel in PERMISOS));
    expect(fuera, "Ampliar la lista es una decision del humano (design §6.1)").toEqual([]);
  });

  it("cada archivo concede solo su motivo, escrito como literal", () => {
    const mal = [...concedidos].flatMap(([rel, motivos]) =>
      motivos.filter((m) => m !== PERMISOS[rel]).map((m) => `${rel}: ${m}`),
    );
    expect(mal).toEqual([]);
  });

  it("la lista no tiene permisos de mas: cada archivo de la lista lo concede", () => {
    const sobran = Object.keys(PERMISOS).filter((rel) => !concedidos.has(rel));
    expect(sobran, "Ya no lo concede: quitalo de la lista").toEqual([]);
  });

  it("los motivos de la lista son los de MOTIVOS_EN_MORA", () => {
    for (const motivo of Object.values(PERMISOS)) expect(MOTIVOS_EN_MORA).toContain(motivo);
  });

  describe("autocomprobacion del detector", () => {
    it("lee el motivo literal, tambien con generico y salto de linea", () => {
      expect(motivosConcedidos('await permitidoEnMora("sistema", () => f());')).toEqual(["sistema"]);
      expect(motivosConcedidos("permitidoEnMora<number>(\n  'cuenta_propia', g)")).toEqual(["cuenta_propia"]);
    });

    it("marca un motivo que no es literal", () => {
      expect(motivosConcedidos("permitidoEnMora(motivo, g)")).toEqual(["?motivo"]);
    });

    it("no cuenta comentarios ni otros identificadores", () => {
      expect(motivosConcedidos('// permitidoEnMora("sistema", f)\nconst a = 1;')).toEqual([]);
      expect(motivosConcedidos('noPermitidoEnMora("sistema", f)')).toEqual([]);
    });
  });
});
