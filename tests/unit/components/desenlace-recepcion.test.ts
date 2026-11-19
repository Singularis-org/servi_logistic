// SLT-202 «Escritorio igual a prod: tamaños de controles y un solo botón de recibir» — review B1 y B2.
//
// Al quitar la guía suelta, los motivos de cada receptor viven solo en `desenlace*` (la fila de la
// sesión continua y la página). Aquí se fija, por receptor, el desenlace EXACTO de cada `status` de su
// acción. Los textos están escritos a mano y son los de los toasts de la guía suelta de prod
// (`git show origin/prod:<archivo>`): no se comparan contra la función que los genera.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions/recepcion-bodega-central", () => ({ recibirEnBodegaCentralPorQr: vi.fn() }));
vi.mock("@/lib/actions/recepcion-origen", () => ({ recibirEnOrigenPorQr: vi.fn() }));
vi.mock("@/lib/actions/recepcion-satelite", () => ({
  recibirPorQr: vi.fn(),
  listarRecepcionSatelite: vi.fn(),
}));

import { desenlaceBodegaCentral } from "@/app/(app)/ordenes/_components/EscanerRecepcionBodegaCentral";
import { desenlaceOrigen } from "@/app/(app)/ordenes/_components/EscanerRecepcionOrigen";
import { desenlaceSatelite } from "@/app/(app)/recepcion-satelite/_components/EscanerRecepcion";
import type { RecibirEnBodegaCentralResult } from "@/lib/types/recepcion-bodega-central";
import type { RecibirEnOrigenResult } from "@/lib/types/recepcion-origen";
import type { RecibirResult } from "@/lib/types/recepcion-satelite";

const RESUMEN = { destinatario: "Ana Pérez", tienda: "Tienda Norte" };
const EN_REPARTO = 'No se puede recibir: la orden está en "En reparto".';
const SIN_PERMISO = "No tienes permiso para recibir órdenes.";
const SESION = "Tu sesión expiró. Inicia sesión de nuevo.";
const INVALIDO = "Código inválido.";
const no = (motivo: string) => ({ tipo: "no_se_pudo", motivo });

describe("desenlaceBodegaCentral (prod: EscanerRecepcionBodegaCentral.tsx:62-80)", () => {
  it.each<[string, RecibirEnBodegaCentralResult, unknown]>([
    [
      "ok en bodega central: Recibida, sin aviso",
      { status: "ok", ordenId: "o1", estado: "en_bodega_central", resumen: RESUMEN },
      { tipo: "recibida", resumen: RESUMEN },
    ],
    [
      "B1 · ok de una devolución: Recibida, «queda por devolver a la tienda» (feature 139 R17)",
      { status: "ok", ordenId: "o1", estado: "por_devolver_a_tienda", resumen: RESUMEN },
      { tipo: "recibida", resumen: RESUMEN, aviso: "Queda por devolver a la tienda." },
    ],
    ["ya_recibida", { status: "ya_recibida", resumen: RESUMEN }, { tipo: "ya_recibida", resumen: RESUMEN }],
    ["no_encontrada", { status: "no_encontrada" }, { tipo: "no_encontrada" }],
    ["estado_invalido", { status: "estado_invalido", estado: "en_reparto" }, no(EN_REPARTO)],
    ["validation_error", { status: "validation_error", fieldErrors: {} }, no(INVALIDO)],
    ["forbidden", { status: "forbidden" }, no(SIN_PERMISO)],
    ["unauthenticated", { status: "unauthenticated" }, no(SESION)],
    ["conflict", { status: "conflict" }, no("La orden cambió de estado. Vuelve a intentar.")],
  ])("%s", (_caso, resultado, esperado) => {
    expect(desenlaceBodegaCentral(resultado)).toEqual(esperado);
  });
});

describe("desenlaceSatelite (prod: recepcion-satelite EscanerRecepcion.tsx:62-89)", () => {
  it.each<[string, RecibirResult, unknown]>([
    ["ok", { status: "ok", ordenId: "o1", resumen: RESUMEN } as RecibirResult, { tipo: "recibida", resumen: RESUMEN }],
    ["ya_recibida", { status: "ya_recibida", resumen: RESUMEN } as RecibirResult, { tipo: "ya_recibida", resumen: RESUMEN }],
    ["no_encontrada", { status: "no_encontrada" }, { tipo: "no_encontrada" }],
    ["zona_ajena", { status: "zona_ajena" } as RecibirResult, no("Esta orden pertenece a otra zona.")],
    ["estado_invalido", { status: "estado_invalido", estado: "en_reparto" } as RecibirResult, no(EN_REPARTO)],
    ["validation_error", { status: "validation_error", fieldErrors: {} } as RecibirResult, no(INVALIDO)],
    ["sin_zona", { status: "sin_zona" } as RecibirResult, no("No tienes una zona asignada.")],
    ["forbidden", { status: "forbidden" }, no(SIN_PERMISO)],
    ["unauthenticated", { status: "unauthenticated" }, no(SESION)],
    ["conflict", { status: "conflict" }, no("La orden cambió de estado. Vuelve a escanear.")],
  ])("%s", (_caso, resultado, esperado) => {
    expect(desenlaceSatelite(resultado)).toEqual(esperado);
  });
});

describe("desenlaceOrigen (prod: EscanerRecepcionOrigen.tsx:54-79)", () => {
  it.each<[string, RecibirEnOrigenResult, unknown]>([
    ["ok", { status: "ok", ordenId: "o1", resumen: RESUMEN } as RecibirEnOrigenResult, { tipo: "recibida", resumen: RESUMEN }],
    ["ya_recibida", { status: "ya_recibida", resumen: RESUMEN } as RecibirEnOrigenResult, { tipo: "ya_recibida", resumen: RESUMEN }],
    ["no_encontrada", { status: "no_encontrada" }, { tipo: "no_encontrada" }],
    ["tienda_ajena", { status: "tienda_ajena" } as RecibirEnOrigenResult, no("Esta orden es de otra tienda.")],
    ["estado_invalido", { status: "estado_invalido", estado: "en_reparto" } as RecibirEnOrigenResult, no(EN_REPARTO)],
    ["validation_error", { status: "validation_error", fieldErrors: {} } as RecibirEnOrigenResult, no(INVALIDO)],
    ["forbidden", { status: "forbidden" }, no(SIN_PERMISO)],
    ["unauthenticated", { status: "unauthenticated" }, no(SESION)],
    ["conflict", { status: "conflict" }, no("La orden cambió de estado. Vuelve a escanear.")],
  ])("%s", (_caso, resultado, esperado) => {
    expect(desenlaceOrigen(resultado)).toEqual(esperado);
  });
});
