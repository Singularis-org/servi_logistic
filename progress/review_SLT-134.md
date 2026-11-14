# Review SLT-134 «Textos de pantalla de cierres en tú, con guardia» — vuelta 1

> Reviewer, 2026-11-13. Diff propio: `origin/feature/SLT-141-excel-hojas-cierre-bodega...HEAD`
> (rama apilada sobre SLT-141 «Excel del modelo nuevo: hojas por cierre de bodega», PR #153).
> Ruta completa (requirements + design + tasks).

## Checklist

- [x] **Trazabilidad R→test.** R56, R142, R143, R144, R145, R146 y R390-R394 tienen test real
  (`tasks.md > Trazabilidad` = `impl_SLT-134.md > T4.2`). Comprobado en el código:
  - R56/R142: «ningún texto del censo…» sobre `censoModulo()`; hallazgo con ruta:línea forma; comentario
    e import (`import`, `export … from`, `import type`, `import()`, `import("x").T`, comentario JSX) no cuentan.
  - R143: muestra con formas de tú, futuros, subjuntivos en mitad de frase y las 21 palabras; motivo y ≤ 40.
  - R144: 44 casos escritos a mano (40 filas A1-K4; A4 ×2 archivos, A6 ×4 archivos) con número de apariciones.
  - R145: control positivo (>60 y los cuatro archivos) + contraprueba `it.each` por cada forma de las listas.
  - R146: 16 tests de componente/unidad con solo el literal cambiado (ver diff de `app/`, abajo).
  - R390/R391: contraprueba por vía (8 imports, 9 visor) que se detecta y, comentada, no; más un negativo.
  - R392: las dos guardias importan `tests/fixtures/censo-cierres.ts`; control positivo de diálogos fija
    `ConciliacionSatelite.tsx`, `RegistrarPagoDialog.tsx`, `DesglosePagoField.tsx`, `EscanerGuiaCard.tsx`.
  - R393: lee `arnes.config.json > gate.siempre` (`["guard"]`) y comprueba su propia ruta.
  - R394: «Esta gestion ya esta en el catalogo», «su/sus» → sin hallazgos.
- [ ] **Tasks.** T0-T3 y T4.2 en `[x]`; **T4.1 sin marcar** (la corre el leader; gate verde reportado
  `INIT_EXIT=0`). Ver m1.
- [x] **Tamaño.** `node scripts/tamano-pr.mjs`: 59/40 archivos, 4 495/1 000 líneas contra `dev` (incluye
  SLT-141 apilada); aceptado en `progress/features/SLT-134.md` (`tamano-pr-aceptado`, Carlos «dale»;
  diff propio 31 archivos, 1 091 líneas).
- [x] **`design.md > ## Lo que ya existe`** presente y con contenido; el diff no re-crea nada de la lista
  (`textosDeFuente` frente a `textosVisibles`: alternativa 2 descartada con motivo, ver m6).
- [x] **CHECKPOINTS / checkpoints-proyecto.** Sin tablas, queries, migraciones, permisos ni
  dependencias nuevas (`typescript` ya es dependencia). Flujo de cierres: ningún E2E afirma un texto del
  inventario (design l.173); el cambio es solo de literales, no de flujo. Ningún recurso de Ordenex.
- [x] **Verificación ejecutable (mía, base desechable `slt134_wt`).** `vitest run` de los 18 archivos de
  test del diff (16 actualizados + las dos guardias): `Test Files 18 passed (18)`, `Tests 579 passed (579)`,
  `VT_EXIT=0`. Typecheck y lint: cubiertos por el gate del leader (`INIT_EXIT=0`).

## Lo que se miró expresamente

1. **Diff de `app/`/`components/` = solo textos (T4.1, R146).** Leído entero (12 archivos): cada cambio
   está dentro de un literal, una plantilla, un atributo JSX o texto JSX, más el comentario de P3 en
   `fila-gestion-labels.ts` (l.91-95). Ni constantes nuevas, ni ramas, ni claves, ni estados. OK.
2. **Textos contra el Anexo A.** Los 47 textos (A1-K4) cotejados uno a uno con
   `specs/SLT-103-dialogos-trato-tu/requirements.md > Anexo A`: idénticos. Las aserciones de los 16 tests
   y las 44 filas de la guardia son literales escritos a mano, no importados de la constante. OK.
3. **Guardia de trato.** Reglas 1-3 y «usted» son copia exacta de `SLT-103 > Definiciones`.
   `EXCEPCIONES` = 24: las 21 de R143 + `estás`/`estés` (tú) + `esté` (subjuntivo de tercera; la mutación 4
   prueba que hace falta). Ninguna tapa voseo. Que muerde: bitácora 59 hallazgos → 0, mutaciones 1-6
   (la 5 rompe el control positivo; la 3 rompe `\p{L}`/`u`). Mutación 6: mover el archivo a otra carpeta
   con el mismo nombre sigue verde **y es correcto**: `test-rapido.mjs` casa `gate.siempre` por subcadena,
   así que el gate la seguiría corriendo; la guardia afirma exactamente lo que hace el gate (ver m3).
4. **Guardia de diálogos por AST (D65).** Imports por `moduleSpecifier`/`import()`, regex de las tres
   rutas `ui/` alias/relativa y los dos `@radix-ui`; visor por plegado de `+`/paréntesis/plantilla sin
   interpolación, `.titulo`/`["titulo"]`, `function`/flecha/`function` anónima. Mutaciones M1-M7 anotadas.
   D65 cerrada en `progress/deudas.md` con qué hueco cierra cada R. La concatenación que empieza por
   variable (`x + "Evidencia " + "de la gestión"`) no se detecta: `plegar` devuelve `null` en cuanto un
   lado no es literal. R391 pide «concatenación **de literales**», así que está dentro de la letra (m2).
5. **Decisiones del leader.** `wallet-mensajeros-labels.ts` l.214 queda en voseo, fuera del censo (D70,
   en la rama de SLT-115): anotado en la bitácora; el archivo no está en el censo y no se toca. A6 cuenta
   2 en `ConsolidacionBodegaModule.tsx` (l.358 ya estaba en tú + l.394 fila A6): la guardia lo fija con
   `veces: 2` y comentario. OK.

## Hallazgos

Ningún bloqueante.

- **m1 (menor)** — `tasks.md` T4.1 sigue en `[ ]` y la bitácora no tiene la nota «diff solo textos». El
  contenido se cumple (gate `INIT_EXIT=0` del leader; diff revisado aquí, punto 1). Marcar T4.1 `[x]` con
  el `INIT_EXIT` y la nota antes de abrir el PR.
- **m2 (menor)** — `cierres-dialogos-modal.guardia.test.ts`: no ve el título partido cuando la
  concatenación empieza (o acaba) en una variable, ni `VisorEvidencia` declarado como
  `const VisorEvidencia = memo(...)`/`forwardRef(...)` o clase. Fuera de la letra de R391; conviene una
  línea en la cabecera de la guardia que lo diga, para que nadie lo dé por cubierto.
- **m3 (menor, sin acción)** — R393 comprueba por subcadena `guard`, igual que el gate: cualquier ruta
  con «guard» pasa. Es fiel al comportamiento real del gate; no es un hueco.
- **m4 (menor)** — `design.md` l.16-17 dice que la guardia de diálogos sigue usando
  `tests/fixtures/sin-comentarios.ts`; tras T3.1 todo es AST y ya no lo importa. Texto del design desfasado.
- **m5 (menor, de la definición)** — la regla 2 trata como futuro todo `-rá`/`-ré` fuera de la lista
  cerrada: imperativos de vos como «recordá», «cobrá», «comprá», «aclará», «entrá» pasarían. Es la
  definición aprobada de SLT-103 (no un fallo de esta ficha); si aparecen, se suman a `IMPERATIVOS_EN_R`.
- **m6 (menor, sin acción)** — `textosDeFuente` (fixture) y `textosVisibles` (`rechazo-nombre-466`)
  duplican la extracción por AST; descartado mudarlo por tamaño (design, alternativa 2). Candidato a
  unificar más adelante.

## Veredicto

**OK (APROBADO).** Sin bloqueantes; m1 es trámite a cerrar antes del PR.
