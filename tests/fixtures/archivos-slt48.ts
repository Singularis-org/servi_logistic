// SLT-48 (T4.6; R47) — LOS ARCHIVOS DE PANTALLA DE SLT-48 QUE PASAN A N NIVELES, PARA LA GUARDIA
// `etiquetas-geograficas-sin-literal`.
//
// Son los que la tanda T4 crea o modifica para pintar los niveles del país (corregir ubicación, etiquetas
// del historial, tarifas y zonas). Van escritos y no se calculan en el test: el CI clona sin la rama base.
// Si T4 toca otro archivo que pinte un nivel, se suma aquí.
//
// `filtrar-arbol-geografico.ts` no está: el selector de zonas ya usaba su filtro de N niveles
// (`filtrarArbolDeNodos`, SLT-46) y SLT-48 no lo cambió.

export const ARCHIVOS_SLT48_PANTALLAS: readonly string[] = [
  "app/(app)/configuracion/_shared/nivel-del-grupo.ts",
  "app/(app)/configuracion/tarifas/_components/TarifasGrupos.tsx",
  "app/(app)/configuracion/tarifas/_components/TarifasZonas.tsx",
  "app/(app)/configuracion/tarifas/_components/tarifas-textos.ts",
  "app/(app)/configuracion/zonas/_components/CrearZonaForm.tsx",
  "app/(app)/configuracion/zonas/_components/GeografiaSelector.tsx",
  "app/(app)/configuracion/zonas/_components/seleccion-de-zona.ts",
  "app/(app)/ordenes/_components/CorregirDatosClienteModal.tsx",
  "app/(app)/ordenes/_components/CorregirUbicacionAviso.tsx",
  "app/(app)/ordenes/_components/corregir-ubicacion-arbol.ts",
  "lib/types/historial-accion-etiquetas.ts",
];
