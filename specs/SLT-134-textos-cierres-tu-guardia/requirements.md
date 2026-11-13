# SLT-134 «Textos de pantalla de cierres en tú, con guardia» — requirements

> Ruta: **completa** (zona frontend). Escrito por spec_author el 2026-11-12 sobre el árbol del worktree
> `SLT-134-textos-cierres-tu-guardia` (rama de `dev` tras SLT-113, `0c523559`).
>
> **Rebanada 3** de SLT-103 «Diálogos del módulo de cierres y trato tú» (PA1, Carlos, 2026-11-11).
> Los R56, R142, R143, R144 (filas A1-K4), R145 y R146 son **copia tal cual** de
> `specs/SLT-103-dialogos-trato-tu/requirements.md > Fuera de alcance`, con su número.
> `## Definiciones` y `## Anexo A` viven en ese archivo; aquí se citan. Los R nuevos de esta ficha van
> en el rango R390-R399 (los R148+ ya los usan otras fichas: SLT-137 empieza en R155).
> Cierra la deuda **D65** (`progress/deudas.md`). Depende de SLT-103 y de SLT-133 «Mensajes del
> servidor de cierres en tú y con tildes» (los dos en `dev`).

## Lo que ya existe

Buscado en el board (`feature_list.json`: «SLT-134», «trato», «voseo»), en `specs/` («voseo»,
«cierres-trato-tu», «D65») y en el código (Grep/Read; el grafo no se consultó: el árbol del worktree
se leyó directo).

- **Mensajes del servidor: hechos.** SLT-133 dejó en «tú» y con tildes las filas L1-N1 del Anexo A
  (`CierreDiaService.ts` l.139-141: «Escríbele», «catálogo»). Aquí no se tocan.
- **Diálogos y visor: hechos.** SLT-103 dejó la guardia
  `tests/unit/guards/cierres-dialogos-modal.guardia.test.ts` (R53, R137) con los huecos que anota D65.
- **Regex de voseo con límites Unicode:** `tests/unit/utils/cola-propia-vista.test.ts` (SLT-138, R180)
  vigila solo los textos de la cola propia, con una lista corta. No cubre el módulo.
- **Extracción de textos por AST:** `textosVisibles` en `tests/unit/guards/rechazo-nombre-466.guardia.test.ts`
  (TypeScript compiler API) ya lee literales, plantillas y texto JSX. No excluye especificadores de
  `import` (`design.md > Alternativas`).
- Ninguna ficha del board pasa a «tú» los textos de pantalla del módulo: es esta.

## Alcance

- Pasar a «tú» los 47 textos de pantalla con voseo de `## Inventario re-censado` (filas A1-K4 del
  Anexo A), con el texto exacto del Anexo A.
- Actualizar a mano, al texto nuevo, los 17 archivos de test que hoy afirman el texto viejo.
- Crear la guardia `tests/unit/guards/cierres-trato-tu.guardia.test.ts` sobre todo el censo del
  módulo (`SLT-103 > Definiciones`), con control positivo y contraprueba, dentro del gate rápido.
- Cerrar D65: la guardia de diálogos usa el mismo censo, ve más vías de importar un diálogo y más formas
  de un visor paralelo.

## Lo que NO entra

- Mensajes del servidor (SLT-133, ya en `dev`).
- Cambiar comportamiento, importes, estados, permisos, claves, contratos (D5, R146).
- Tildes que faltan y «su/sus» de usted: la guardia no los busca (PA6, PA7; R394).
- Voseo fuera del censo (`## Preguntas abiertas`, P1 y P2): `components/shared/ErrorState.tsx`
  (default «Si nos escribís, pasanos este código»), `components/shared/estado-cuenta/estado-cuenta-labels.ts`
  (frases de `/mi-wallet`), y los demás módulos de la app.
- Fixtures de test con voseo que no son texto de la app (`tests/components/paginacion/ColasPaginacion.test.tsx`
  l.326: un `motivoBloqueo` inventado para el caso).
- Comentarios del código con voseo: no son texto (`SLT-103 > Definiciones`).

## Inventario re-censado (2026-11-12)

Grep sobre el censo de `SLT-103 > Definiciones` en este árbol, con una regex que excluye las
excepciones de R143 y los futuros, más las listas cerradas de las reglas 1 y 3 y la de «usted»;
cada coincidencia leída para separar texto de comentario.

**Voseo: 47 textos en 12 archivos. «Usted»: 0. Ningún texto nuevo** desde el inventario de SLT-103
(2026-11-11): SLT-104 a SLT-113, SLT-137, SLT-138 y SLT-123 no metieron voseo en el censo. Lo único
que cambió es **dónde** viven: las líneas se movieron, y J3 se mudó de `CierreDiaModule.tsx` a
`components/private/cierres/fila/fila-gestion-labels.ts` (SLT-109, R244). `lib/` del censo: limpio.

| Archivo | Textos | Filas del Anexo A · línea de hoy |
|---|---|---|
| `app/(app)/cierres-admin/_components/CierresAdminModule.tsx` | 14 | A1 357 · A2 375 · A3 377 · A4 661 · A5 720, 764 · A6 761, 844, 1087 · A7 842 · A8 846 · A9 1085 · A10 1089 · A11 1474 |
| `app/(app)/cierres-admin/_components/cierre-confirmacion-fisica.tsx` | 6 | B1 45 · B2 51 · B3 69 · B4 119 · B5 138 · B6 139 |
| `app/(app)/cierres-admin/_components/ConsolidacionBodegaModule.tsx` | 4 | C1 392 · A6 394 · C2 396 · A4 423 |
| `app/(app)/cierres-admin/_components/CierresBodegaAdminModule.tsx` | 3 | D1 350 · A6 354 · D2 358 |
| `app/(app)/cierres-admin/_components/DescargarGestionesDialog.tsx` | 4 | E1 154 · E2 174 · E3 195 · E4 197 |
| `app/(app)/cierres-admin/_components/pago-mensajero-labels.ts` | 2 | F1 50 · F2 52 |
| `app/(app)/cierres-admin/error.tsx` | 2 | G1 38 · G2 39 |
| `app/(app)/cierres-admin/_components/cierre-labels.ts` | 1 | H1 171 |
| `app/(app)/cierres-admin/_components/FiltrosCierresBarra.tsx` | 1 | I1 394 |
| `app/(app)/cierre-dia/_components/CierreDiaModule.tsx` | 4 | J1 211 · J2 212 · J4 417 · J5 418 |
| `components/private/cierres/fila/fila-gestion-labels.ts` | 1 | J3 97 (`DESHACER_BLOQUEO_TIENDA`) |
| `components/shared/conciliacion/conciliacion-labels.ts` | 5 | K1 56 · K2 61 · K3 77 · A6 78 · K4 79 |

Sin voseo ni «usted»: `app/(app)/wallet/satelites/**`, el resto de `components/private/cierres/**`,
`components/shared/liquidacion/**`, `DesglosePagoField.tsx`, `EscanerGuiaCard.tsx`,
`lib/constants/bloqueo-mensajero.ts` y los 6 servicios y 5 acciones del censo.

**Tests que afirman hoy un texto viejo (17 archivos; ningún E2E):**
`tests/components/`: `CierresAdminModule`, `CierresAdminPage` (l.363; la l.273 es una negación y no
cambia), `CierresAdminDeepLink`, `CierresAdminConfirmacionFisica`, `CierresBodegaAdminDetalleUnico`,
`ConsolidacionBodegaRefresco`, `descarga/DescargarGestionesDialog`, `PagoMensajeroAcciones`,
`RedDeErrores`, `ComprobanteMensajeroOrigenRechazo`, `CierreDiaComprobanteMarcasDeOrigen`,
`CierreDiaModule`, `CierreDiaModule477Correccion`, `FilaGestion`, `ConciliacionAccionesConAsientos`,
`MarcarRecibidoDeclaradoCero`; `tests/unit/utils/fila-gestion-vista`.

## Decisiones cerradas (heredadas de SLT-103; no reabrir)

| # | Fecha · quién | Decisión | Requisitos |
|---|---|---|---|
| D5 | 2026-11-08 · Carlos | Sin cambios de dinero. | R146 |
| D6 (regla 7) | canvas n2 (v2) | Un solo trato en todo el módulo: «tú». | R56, R142, R144 |
| PA1 | 2026-11-11 · Carlos | Tres fichas; SLT-134 = pantalla y guardia. | R56, R142-R145 |
| PA6 | 2026-11-11 · Carlos | La guardia no busca tildes que faltan. | R394 |
| PA7 | 2026-11-11 · Carlos | La guardia no mira el «su/sus» de usted. | R394 |
| PA8 | 2026-11-11 · Carlos | Los compartidos con `/wallet/*` entran en el censo de la guardia. | R145, R392 |
| D65 | 2026-11-11 · review de SLT-103 | Los huecos de la guardia de diálogos se cierran en SLT-134. | R390, R391, R392 |

## Requisitos (EARS)

Copia tal cual de SLT-103 (R56, R142-R146); R390-R394 son de esta ficha. El test de cada R está en
`tasks.md > Trazabilidad`.

### Copia de SLT-103

- **R56** [S5] — Todos los textos del módulo (pantallas, diálogos, toasts, avisos y mensajes del
  servidor que el módulo muestra) DEBEN usar el trato «tú» y llevar sus tildes. Ningún texto del módulo
  DEBE contener voseo («Indicá», «tenés», «podés», «resolvé»…).

  *En SLT-134 se cumple para los textos de pantalla (filas A1-K4) y queda vigilado para todo el censo
  por la guardia de R142. Las tildes que faltan no las vigila la guardia (PA6).*
- **R142** — SI un texto del módulo (`## Definiciones`) contiene una forma de voseo o de «usted»,
  ENTONCES la guardia `tests/unit/guards/cierres-trato-tu.guardia.test.ts` DEBE fallar y nombrar el
  archivo, la línea y la forma encontrada. SI la forma está solo en un comentario o en un especificador
  de `import`, ENTONCES NO DEBE fallar.
- **R143** — La guardia NO DEBE marcar como voseo ni como «usted»: las formas de «tú» (`puedes`,
  `tienes`, `estás`, `estés`, `enviarás`, `deberás`, `inténtalo`, `escríbele`, `gestiónalos`, `revisa`,
  `indica`, `elige`, `vuelve`), los futuros (`será`, `podrá`, `verá`, `quedará`, `enviará`), los
  subjuntivos de tercera persona en mitad de frase (`revise`, `apruebe`, `vuelva`) ni estas palabras:
  `está`, `aquí`, `allí`, `ahí`, `así`, `acá`, `allá`, `qué`, `sí`, `más`, `jamás`, `además`, `demás`,
  `atrás`, `detrás`, `después`, `través`, `inglés`, `interés`, `país`, `caché`. Cada excepción nueva
  DEBE llevar su motivo, y la lista de excepciones NO DEBE pasar de 40.
- **R144** (filas A1-K4) — Cada texto del `## Inventario` DEBE quedar exactamente como dice
  `## Anexo A`: la misma frase, cambiando solo la forma verbal o el pronombre a «tú» y añadiendo las
  tildes que faltan.

  *El Inventario es el de `## Inventario re-censado` (mismas filas, líneas de hoy; J3 vive ahora en
  `fila-gestion-labels.ts`).*
- **R145** — La guardia DEBE tener control positivo y contraprueba: DEBE comprobar que su censo incluye
  al menos `CierreDiaModule.tsx`, `CierresAdminModule.tsx`, `conciliacion-labels.ts` y
  `CierreDiaService.ts`, y que mira más de 60 archivos; y DEBE ponerse en rojo con un texto de muestra
  que contenga cada forma de las tres listas de voseo y de la de «usted».
- **R146** — Los cambios de esta ficha NO DEBEN cambiar ningún importe, estado, permiso, clave de
  traducción ni contrato de servicio: solo textos, el visor y el resumen de R140.

  *En SLT-134: solo textos (y tests). El visor y R140 eran de SLT-103.*

### De esta ficha

- **R390** (D65) — SI un archivo del censo de pantalla importa o reexporta un diálogo que no es el
  `Modal` compartido —`@/components/ui/dialog`, `@/components/ui/alert-dialog`, `@/components/ui/sheet`,
  `@radix-ui/react-dialog`, `@radix-ui/react-alert-dialog`, o cualquiera de las tres rutas `ui/…` escrita
  como ruta relativa, en `import`, `export … from` o `import()`—, ENTONCES la guardia
  `cierres-dialogos-modal.guardia.test.ts` DEBE fallar y nombrar el archivo y el especificador, salvo la
  excepción de hoy (`DetalleCierre.tsx`, marco del detalle, D1).
- **R391** (D65) — SI fuera de `components/private/cierres/dialogos/dialogos-labels.ts` aparece el
  título «Evidencia de la gestión» —en un literal, partido en una concatenación de literales con `+` o en
  una plantilla sin interpolaciones—, o fuera de `VisorEvidencia.tsx` se lee
  `VISOR_EVIDENCIA_TEXTO.titulo` o se declara `VisorEvidencia` (con `function`, como `const` con flecha o
  con `function` anónima), ENTONCES la guardia de diálogos DEBE fallar y nombrar el archivo.
- **R392** (D65, PA8) — La guardia de diálogos y la de trato DEBEN leer el censo de UNA sola definición
  compartida, la de `SLT-103 > Definiciones`: la de diálogos, su parte de pantalla (los seis árboles más
  `components/shared/DesglosePagoField.tsx` y `components/shared/EscanerGuiaCard.tsx`); la de trato,
  el censo entero (pantalla más los archivos de `lib/`). El control positivo de la de diálogos DEBE
  exigir al menos un archivo de `app/(app)/wallet/satelites/`, uno de `components/shared/liquidacion/` y
  los dos compartidos sueltos.
- **R393** — La guardia de trato DEBE correr en el gate rápido de cada PR: su ruta DEBE casar con un
  patrón de `arnes.config.json > gate.siempre`, y la propia guardia DEBE comprobarlo.
- **R394** (PA6, PA7) — La guardia de trato NO DEBE fallar por una palabra a la que solo le falta la
  tilde (`gestion`, `esta`, `catalogo`) ni por los posesivos `su` o `sus`.

## Tamaño

32 archivos (12 de producción, 20 de tests) y ~800 líneas: **el 80 % justo** de `gate.tamano_pr`
(40 archivos). Detalle y plan de corte en `tasks.md > Tamaño`.

## Preguntas abiertas

- **P1 — `ErrorState` con voseo en la pantalla de error de `/cierres-admin`.** El default de
  `components/shared/ErrorState.tsx` l.82 («Si nos escribís, pasanos este código: con él ubicamos qué
  falló.») se pinta en `app/(app)/cierres-admin/error.tsx` cuando hay `digest`. No está en el censo
  (es de toda la app) ni en el Anexo A. **Recomendación:** fuera de SLT-134; anotar deuda para una ficha
  que pase `ErrorState` a «tú» en todas las pantallas a la vez. Pasarle a `error.tsx` un
  `explicacionCodigo` propio crearía un texto que el Anexo A no tiene.
- **P2 — Voseo en `/mi-wallet` compartido con el estado de cuenta.** `components/shared/estado-cuenta/estado-cuenta-labels.ts`
  l.91-92 («Le debés…», «… y vos no se deben nada») lo usa `/mi-wallet`, no el módulo; el estado de
  cuenta de satélites (`EstadoCuentaSatelite.tsx`, en el censo) no pinta esas frases.
  **Recomendación:** fuera; deuda para el trato de las pantallas de wallet.
- **P3 — El comentario de `DESHACER_BLOQUEO_TIENDA`** (`fila-gestion-labels.ts` l.91-94) dice que el
  texto es el mismo que el del servidor (L4). No lo es ni lo será: J3 lleva «desde su pantalla de ayuda»
  y L4 no (Anexo A). **Recomendación:** dejar J3 como manda el Anexo A (R144) y corregir solo el
  comentario («el mismo imperativo, «Escríbele»; la frase de la pantalla nombra la pantalla de ayuda»).
- **P4 — Margen de tamaño cero.** Si el re-censo de T0 tras el merge de SLT-139, SLT-140 y SLT-141 suma
  un archivo, la ficha pasa del 80 %. **Recomendación:** en ese caso sacar D65 (R390-R392 y el fixture
  compartido) a una ficha propia que dependa de esta; la guardia de trato lleva su censo dentro hasta
  entonces.
