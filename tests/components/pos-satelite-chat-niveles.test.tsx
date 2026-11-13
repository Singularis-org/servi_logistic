// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

// SLT-125 (design §5; R11, R15, P7) — LOS DOS LUGARES MÁS HONDOS DE LA RUTA DE LA ORDEN en la tarjeta POS
// (mosaico, detalle en fila y bloque de navegación), la tarjeta de satélite y la fila del chat. Cada una
// conserva el orden y el separador de hoy: «arriba · abajo» en las tarjetas y «abajo · arriba» en el chat.
//
// Países de 2, 3 (Costa Rica) y 4 niveles. En uno de 4 niveles la ruta de una orden llega al nivel 3
// hasta SLT-48, así que se ven los niveles 2·3. Sin proveedor de niveles o sin `lugarRuta`, los campos de
// hoy. Los textos esperados son literales; los de Costa Rica, los de hoy.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

import { PosOrderCardMosaico } from "@/app/(app)/mis-asignaciones/_components/pos-card/PosOrderCardMosaico";
import { PosOrderCardDetalle } from "@/app/(app)/mis-asignaciones/_components/pos-card/PosOrderCardDetalle";
import { PosNavBlock } from "@/app/(app)/mis-asignaciones/_components/pos-card/PosNavBlock";
import { SateliteOrderCard } from "@/app/(app)/recepcion-satelite/_components/SateliteOrderCard";
import { ChatOrdenesLista } from "@/app/(app)/mis-asignaciones/_components/chat/ChatOrdenesLista";
import { agruparContactosChat } from "@/app/(app)/mis-asignaciones/_components/chat/chat-contactos";
import { zonaCorta } from "@/app/(app)/mis-asignaciones/_components/chat/chat-format";
import type { MiAsignacionDTO } from "@/lib/interfaces/services/IMisAsignacionesService";
import type { RecepcionSateliteDTO } from "@/lib/interfaces/services/IRecepcionSateliteService";
import type { NivelDeFiltroDTO } from "@/lib/types/filtros-ordenes";
import { NivelesGeograficosProvider } from "@/providers/EtiquetasGeograficasProvider";
import { NIVELES_CR, NIVELES_XA } from "@/tests/fabricas/etiquetas-geograficas";
import { CAMPOS_BASE_ORDEN } from "@/tests/fixtures/fila-bodega-satelite";

afterEach(() => cleanup());

const NIVELES_2: NivelDeFiltroDTO[] = [
  { profundidad: 1, singular: "Departamento", plural: "Departamentos" },
  { profundidad: 2, singular: "Municipio", plural: "Municipios" },
];

const ruta = (...nombres: string[]) => nombres.map((nombre, i) => ({ id: `n-${i + 1}`, nombre }));

function makeOrden(over: Partial<MiAsignacionDTO> = {}): MiAsignacionDTO {
  return {
    id: "o1",
    numGuia: 1001,
    numRemision: "REM-1",
    estatusValue: "en_reparto",
    destinatario: "Ana Mora",
    telefonoDest: "70001111",
    direccion: "200m sur de la iglesia",
    producto: "Caja",
    peso: 1.2,
    montoCobrar: 25000,
    latitud: 9.93,
    longitud: -84.08,
    notas: null,
    tiendaNombre: "Tienda Norte",
    zonaNombre: "GAM",
    provinciaNombre: "San José",
    cantonNombre: "Escazú",
    distritoNombre: "San Rafael",
    sinpeNumero: "80000000",
    sinpeNombre: "Titular de Prueba",
    secuenciaRuta: 1,
    marcarLuego: false,
    intentosEntrega: 0,
    ...over,
  };
}

// Un caso por país: la orden, sus niveles y lo que se espera en cada superficie.
const CASOS = [
  {
    pais: "2 niveles",
    niveles: NIVELES_2,
    orden: makeOrden({
      direccion: "Calle 30 #12",
      provinciaNombre: "Bolívar",
      cantonNombre: "Cartagena",
      distritoNombre: null,
      lugarRuta: ruta("Bolívar", "Cartagena"),
    }),
    tarjeta: "Bolívar · Cartagena",
    arriba: "Bolívar",
    abajo: "Cartagena",
    chat: "Cartagena · Bolívar",
  },
  {
    pais: "Costa Rica (3 niveles)",
    niveles: NIVELES_CR,
    orden: makeOrden({ lugarRuta: ruta("San José", "Escazú", "San Rafael") }),
    tarjeta: "Escazú · San Rafael",
    arriba: "Escazú",
    abajo: "San Rafael",
    chat: "San Rafael · Escazú",
  },
  {
    pais: "4 niveles (la ruta llega al nivel 3 hasta SLT-48)",
    niveles: NIVELES_XA,
    orden: makeOrden({
      direccion: "Av. Libertad 99",
      provinciaNombre: "Costa",
      cantonNombre: "Litoral",
      distritoNombre: "Viña",
      lugarRuta: ruta("Costa", "Litoral", "Viña"),
    }),
    tarjeta: "Litoral · Viña",
    arriba: "Litoral",
    abajo: "Viña",
    chat: "Viña · Litoral",
  },
] as const;

function conNiveles(niveles: readonly NivelDeFiltroDTO[]) {
  return function Envoltorio({ children }: Readonly<{ children: ReactNode }>) {
    return <NivelesGeograficosProvider niveles={niveles}>{children}</NivelesGeograficosProvider>;
  };
}

/** La primera línea del bloque de ubicación sobre navy (mosaico y satélite): «arriba · abajo». */
function lineaDeLugares(): string | null | undefined {
  return document.querySelector(".bg-navy span.block")?.textContent;
}

function satelite(o: MiAsignacionDTO): RecepcionSateliteDTO {
  return {
    ...CAMPOS_BASE_ORDEN,
    id: o.id,
    numGuia: o.numGuia,
    numRemision: o.numRemision,
    estatusValue: "en_ruta_bodega_satelite",
    destinatario: o.destinatario,
    telefonoDest: o.telefonoDest,
    direccion: o.direccion,
    producto: o.producto,
    montoCobrar: o.montoCobrar,
    tiendaNombre: o.tiendaNombre,
    zonaNombre: o.zonaNombre,
    provinciaNombre: o.provinciaNombre,
    cantonNombre: o.cantonNombre,
    distritoNombre: o.distritoNombre,
    lugarRuta: o.lugarRuta,
  } as RecepcionSateliteDTO;
}

describe("R11 — los dos lugares más hondos de la ruta de la orden, por país", () => {
  for (const caso of CASOS) {
    describe(caso.pais, () => {
      const wrapper = conNiveles(caso.niveles);

      it("POS mosaico: «arriba · abajo»", () => {
        render(<PosOrderCardMosaico orden={caso.orden} total={1} />, { wrapper });
        expect(lineaDeLugares()).toBe(caso.tarjeta);
      });

      it("POS detalle en fila: «arriba · abajo — dirección»", () => {
        render(<PosOrderCardDetalle orden={caso.orden} total={1} />, { wrapper });
        expect(screen.getByText(`${caso.tarjeta} — ${caso.orden.direccion}`)).toBeTruthy();
      });

      it("POS bloque de navegación: arriba destacado y abajo en su distintivo", () => {
        render(<PosNavBlock orden={caso.orden} />, { wrapper });
        const arriba = screen.getByText(caso.arriba, { selector: "span.font-mono" });
        expect(arriba.nextElementSibling?.textContent).toBe(caso.abajo);
      });

      it("tarjeta de satélite: «arriba · abajo»", () => {
        render(<SateliteOrderCard orden={satelite(caso.orden)} />, { wrapper });
        expect(lineaDeLugares()).toBe(caso.tarjeta);
      });

      it("chat: «abajo · arriba», el más hondo primero", () => {
        render(
          <ChatOrdenesLista
            contactos={agruparContactosChat([caso.orden], [], [])}
            noLeidos={new Map()}
            seleccionadaId={null}
            ordenEnDetalleId={null}
            onSeleccionar={vi.fn()}
          />,
          { wrapper },
        );
        expect(screen.getByText(caso.chat)).toBeTruthy();
        expect(zonaCorta(caso.orden, caso.niveles)).toBe(caso.chat);
      });
    });
  }

  it("sin dirección, el nombre accesible del enlace al mapa nombra el lugar de arriba", () => {
    const orden = { ...CASOS[2].orden, direccion: null };
    render(<PosNavBlock orden={orden} />, { wrapper: conNiveles(NIVELES_XA) });
    expect(screen.getByRole("button", { name: "Ver en el mapa la ruta hasta Litoral" })).toBeTruthy();
  });
});

describe("R15 / P7 — Costa Rica, con los textos de hoy", () => {
  const wrapper = conNiveles(NIVELES_CR);
  const sinDistrito = makeOrden({ distritoNombre: null, lugarRuta: ruta("San José", "Escazú") });

  it("orden sin distrito: las tarjetas y el chat enseñan solo el cantón", () => {
    render(<PosOrderCardMosaico orden={sinDistrito} total={1} />, { wrapper });
    expect(lineaDeLugares()).toBe("Escazú");
    cleanup();

    render(<PosOrderCardDetalle orden={sinDistrito} total={1} />, { wrapper });
    expect(screen.getByText("Escazú — 200m sur de la iglesia")).toBeTruthy();
    cleanup();

    render(<PosNavBlock orden={sinDistrito} />, { wrapper });
    expect(screen.getByText("Escazú", { selector: "span.font-mono" }).nextElementSibling).toBeNull();
    cleanup();

    render(<SateliteOrderCard orden={satelite(sinDistrito)} />, { wrapper });
    expect(lineaDeLugares()).toBe("Escazú");

    expect(zonaCorta(sinDistrito, NIVELES_CR)).toBe("Escazú");
  });

  it("sin proveedor de niveles o sin `lugarRuta`: los campos de hoy", () => {
    const sinRuta = makeOrden();
    render(<PosOrderCardMosaico orden={sinRuta} total={1} />, { wrapper });
    expect(lineaDeLugares()).toBe("Escazú · San Rafael");
    cleanup();

    // Un país de 2 niveles sin proveedor: la ruta no se usa y salen el cantón y el distrito de hoy.
    render(<PosOrderCardMosaico orden={CASOS[0].orden} total={1} />);
    expect(lineaDeLugares()).toBe("Cartagena");

    expect(zonaCorta(sinRuta)).toBe("San Rafael · Escazú");
    expect(zonaCorta({ ...sinRuta, distritoNombre: null })).toBe("Escazú");
  });
});
