// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

// SLT-47 / T5.2 (design §4.2, §5.3; R19, R20) — un enlace viejo de `/novedades` por nombre, sobre la
// pantalla REAL (hook + barra) y con el conjunto llegando DESPUÉS del montaje, que es como llega: se
// pide de forma perezosa cuando se monta un control. Sin el arranque perezoso del traductor, las
// listas de lugar no tienen opciones al entrar, ninguna se activa y el conjunto no se pide nunca.

const replaceMock = vi.fn();
let parametros = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/novedades",
  useSearchParams: () => parametros,
}));

import { NovedadesFiltrosBarra } from "@/app/(app)/novedades/_components/NovedadesFiltrosBarra";
import { useNovedadesFiltro } from "@/app/(app)/novedades/_components/useNovedadesFiltro";
import { olvidarParamsBorrados } from "@/hooks/useFiltrosUrl";
import type { ListarNovedadesCompletoActionResult } from "@/lib/actions/novedades";
import type { NovedadDTO } from "@/lib/types/novedad";
import { EtiquetasGeograficasProvider } from "@/providers/EtiquetasGeograficasProvider";
import { ETIQUETAS_CR, NIVELES_CR } from "../fabricas/etiquetas-geograficas";

const base: NovedadDTO = {
  id: "o1",
  numGuia: 1001,
  numRemision: "REM-1",
  estatusValue: "novedad",
  intentosContacto: 0,
  mensajeroNombre: "Marta Mensajera",
  destinatario: "Ana Cliente",
  telefonoDest: "88887777",
  causa: "not_found",
  producto: "Zapatos",
  peso: 1,
  direccion: "Av. Central",
  montoCobrar: 0,
  latitud: null,
  longitud: null,
  notas: null,
  tiendaNombre: "Tienda Demo",
  zonaNombre: "GAM Oeste",
  provinciaNombre: "San José",
  cantonNombre: "Escazú",
  distritoNombre: null,
  sinpeNumero: "80000000",
  sinpeNombre: "Titular de Prueba",
  secuenciaRuta: null,
};

const CONJUNTO: NovedadDTO[] = [
  {
    ...base,
    id: "o1",
    destinatario: "Ana Cliente",
    lugarRuta: [
      { id: "p-sj", nombre: "San José" },
      { id: "c-cen-sj", nombre: "Central" },
    ],
  },
  {
    ...base,
    id: "o2",
    destinatario: "Beto Cliente",
    provinciaNombre: "Alajuela",
    lugarRuta: [
      { id: "p-ala", nombre: "Alajuela" },
      { id: "c-cen-ala", nombre: "Central" },
    ],
  },
  {
    ...base,
    id: "o3",
    destinatario: "Carla Cliente",
    lugarRuta: [
      { id: "p-sj", nombre: "San José" },
      { id: "c-esc", nombre: "Escazú" },
    ],
  },
];

function listadoDiferido() {
  let resolver: ((res: ListarNovedadesCompletoActionResult) => void) | null = null;
  const promesa = new Promise<ListarNovedadesCompletoActionResult>((resolve) => {
    resolver = resolve;
  });
  return {
    listarCompleto: vi.fn(() => promesa),
    entregar: () => resolver?.({ status: "ok", items: CONJUNTO, total: CONJUNTO.length }),
  };
}

function Pantalla({ listarCompleto }: { listarCompleto: () => Promise<ListarNovedadesCompletoActionResult> }) {
  const filtro = useNovedadesFiltro("devolucion", listarCompleto);
  return (
    <>
      <NovedadesFiltrosBarra filtro={filtro} label="Buscar novedades" regionLabel="Filtros de novedades" />
      <ul aria-label="Resultados">
        {filtro.resultados.map((n) => (
          <li key={n.id}>{n.destinatario}</li>
        ))}
      </ul>
    </>
  );
}

function montar(listarCompleto: () => Promise<ListarNovedadesCompletoActionResult>) {
  return render(
    <EtiquetasGeograficasProvider etiquetas={ETIQUETAS_CR} niveles={NIVELES_CR}>
      <Pantalla listarCompleto={listarCompleto} />
    </EtiquetasGeograficasProvider>,
  );
}

function acotados(): string[] {
  const lista = screen.queryByRole("list", { name: "Resultados" });
  return lista === null ? [] : Array.from(lista.querySelectorAll("li")).map((li) => li.textContent ?? "");
}

beforeEach(() => {
  replaceMock.mockClear();
  parametros = new URLSearchParams();
  olvidarParamsBorrados();
});

afterEach(() => cleanup());

describe("R19 — enlace viejo por nombre en la pantalla real de /novedades", () => {
  it("`?provincia=San José&canton=Central` pide el conjunto, marca San José y su Central, y acota como hoy", async () => {
    parametros = new URLSearchParams("provincia=San José&canton=Central");
    const { listarCompleto, entregar } = listadoDiferido();

    montar(listarCompleto);

    // Las listas de provincia y cantón se montan desde la URL, y eso pide el conjunto.
    await screen.findByRole("button", { name: /^Provincia:/ });
    expect(screen.getByRole("button", { name: /^Cantón:/ })).toBeInTheDocument();
    expect(listarCompleto).toHaveBeenCalledTimes(1);

    entregar();

    await waitFor(() => expect(screen.getByRole("button", { name: /^Provincia:/ })).toHaveTextContent("San José"));
    await waitFor(() => expect(screen.getByRole("button", { name: /^Cantón:/ })).toHaveTextContent("Central"));
    // Solo el «Central» de San José: el de Alajuela tiene el mismo nombre y no sale (R13).
    await waitFor(() => expect(acotados()).toEqual(["Ana Cliente"]));
  });

  it("sin params no monta ninguna lista ni pide el conjunto", () => {
    const { listarCompleto } = listadoDiferido();
    montar(listarCompleto);
    expect(screen.queryByRole("button", { name: /^Provincia:/ })).toBeNull();
    expect(listarCompleto).not.toHaveBeenCalled();
  });
});
