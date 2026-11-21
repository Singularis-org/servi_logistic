# Review SLT-240 «Moneda del país en pantallas: órdenes, novedades e incidentes»

Revisor: reviewer · 2026-11-21 · rama `feature/SLT-240-moneda-pantallas-ordenes` · diff `origin/dev...9cc5b91b`
(12 commits, 41 archivos en total contando spec/progress; 36 de código y tests).

## Checklist

- [x] **Ruta**: completa (requirements + design + tasks). Toca dinero: la ruta completa es la que pide.
- [x] **Trazabilidad R1–R19**: cada R tiene test concreto y no vacío (mapa en `progress/impl_SLT-240.md`,
  comprobado contra los archivos). Casos con moneda de prueba (0 decimales, «€», espacio de miles) más R13
  (sin proveedor) y R12 (CR igual a sin proveedor) por pantalla; R12 queda anclado además por los tests
  existentes con literales CR que no cambian (p. ej. `₡9.999.999.999,99` de `IncidentesAdminModule.test.tsx`).
  R14 con `@ts-expect-error` (lo hace cumplir el typecheck) y caso de ejecución que lanza. R10 comprueba que el
  tope anunciado, re-tecleado, lo acepta `montoValido`. R16 con censo «sin IVA» y contraprueba. R19 con caso propio.
- [~] **Tasks**: T1.1–T4.2 `[x]`. T4.3 (cierre: `./init.sh`, E2E, comprobaciones del reviewer) sin marcar: sus
  comprobaciones de diff las hago aquí; `init.sh` completo y E2E van a CI por decisión del leader (menor 1).
- [x] **Tamaño**: `node scripts/tamano-pr.mjs` → aviso 36/40 archivos, 439/1000 líneas de producción, 1243/3000
  de tests. Dentro del máximo; pasar del 80% lo aceptó el humano (P1) y el archivo 36 el leader
  (`progress/features/SLT-240.md > Decisiones`).
- [x] **`design.md > Lo que ya existe`**: presente y con contenido; el diff no re-crea nada de esa lista (reusa
  `formatearMontoEn`, `useMonedaDelPais`, `useImpuestoDelPais`, `IMPUESTO_ROTULO`, `ESCALA_PRESENTACION`; solo
  exporta `formatearTopeEn`, que ya existía privada).
- [x] **Dinero, moneda explícita**: todas las pantallas pasan la moneda del hook al formateador. Sin caída silenciosa
  a CRC: `etiquetas-dibujo.ts` pierde `moneda ?? MONEDA_PLATAFORMA`; `buildEtiquetasPdf`/`descargarEtiquetasPdf`/
  `drawEtiqueta`/`datosDeEtiqueta`/`textosConFuenteEmbebida` con `moneda` obligatoria. La única caída es la
  decidida (proveedor ausente → `MONEDA_PLATAFORMA`, SLT-235 R15). R3 usa la escala de presentación (2) con
  símbolo y separadores del país, por lo que dos montos distintos nunca coinciden. R10: tope con
  `formatearTopeEn`, cuadre hacia el cero a la escala de la moneda.
- [x] **CR sin cambios (R12)**: `money`/`moneyTope`/`formatMonto`/`montoExacto` son alias de los formateadores con
  `MONEDA_PLATAFORMA` (guardia 359), así que con CR el texto es el mismo; `conImpuestoDelPais` devuelve el mismo
  arreglo con `IMPUESTO_ROTULO`; encabezados de descarga con CR idénticos. Ningún valor esperado de los tests
  existentes cambió.
- [x] **R15**: de los `*-descarga-columnas.ts` solo cambia `ordenes-descarga-columnas.ts`, y solo los encabezados
  de `fleteConIva`/`comisionConIva`; claves, orden e importes crudos intactos.
- [x] **R17**: los textos «con hasta 2 decimales (por ejemplo 12500.00)» y «(10 dígitos y 2 decimales)» intactos;
  los únicos «IVA» que salen del código de producción son los de los 3 archivos de T3.6 (más el nuevo
  `rotulos-con-impuesto.ts`, sin literal). `monto-cliente.ts` no se toca.
- [x] **Sin pantallas de plataforma** ni de cierres/wallet/tarifas/analítica en el diff.
- [x] **R18/R19**: censo `CENSO_MONEDA_DEL_PAIS` gana los 12 archivos de design §7 con contraprueba `money(`/
  `formatMonto(`; `_pais-sin-literales-excepciones.ts` sin tocar, ninguna entrada de SLT-240, tope 19.
- [x] **Literales de país/moneda en código nuevo**: ninguno (perfil reviewer). Sin dependencias nuevas, sin `db/`,
  sin queries ni tablas nuevas, sin recursos de Ordenex, sin secretos.
- [x] **Comentarios**: explican el porqué (caída eliminada, escala de presentación en R3, cota del tope).
- [x] **Typecheck**: `pnpm run typecheck` → exit 0.
- [x] **Lint** de los 36 archivos: 0 errores, 6 warnings, todos previos (líneas no tocadas).
- [x] **Tests de los archivos tocados**: `vitest run` de los 20 archivos de test del diff →
  `Test Files 19 passed | 1 skipped (20)` / `Tests 509 passed | 4 skipped (513)` (el saltado es
  `snapshot-correccion.test.ts`, sin base de datos).
- [x] **Guardias**: `pnpm run test:guardias` → `Test Files 357 passed | 3 skipped (360)` /
  `Tests 5419 passed | 28 skipped (5447)`.
- [ ] **`vitest related` de los 16 archivos de producción**: lanzado y detenido por el sistema por falta de
  memoria; no relanzado (menor 2). La bitácora reporta 73 archivos / 1027 tests en verde en T3.6.
- [ ] **`gate-completo` en CI y E2E afectados**: pendientes; condición de merge (menor 1).

## Hallazgos

### Mayores (bloqueantes)

Ninguno.

### Menores

1. **menor (condición de merge, no del código).** T4.3 sin marcar: no hay constancia de `./init.sh` ni de los E2E
   afectados (grupo `dinero`, `etiquetas-lote-tienda`, `seleccion-entre-busquedas`, `historial-orden`) corridos
   en local. `docs/perfil-agentes.md > reviewer` lo pone como bloqueante («PR que toca pantallas o dinero sin
   constancia de los E2E afectados corridos en local»), pero el leader fijó que en esta máquina el gate completo y
   el E2E corren en CI (mismo criterio que la review de SLT-235). Lo dejo como condición: no se avisa «listo para
   mergear» sin `gate-completo` y esos E2E en verde en el PR a `dev`, y T4.3 se marca entonces. Si el leader no
   puede garantizar que el PR corra el E2E, esto pasa a bloqueante.
2. **menor.** `vitest related` sobre los archivos de producción no terminó en esta revisión (el sistema lo mató por
   memoria). La cobertura directa (tests tocados + guardias + typecheck) está verde; lo indirecto lo cubre
   `gate-completo`.
3. **menor (fuera de alcance, para SLT-238).** Con una moneda de 0 decimales la ayuda dice «hasta €9 999 999 999,
   con hasta 2 decimales (por ejemplo 12500.00)»: el tope sale sin cola pero el texto de entrada sigue hablando de 2
   decimales. Es lo que pide R17 (ese texto es de SLT-238 «Carga de órdenes con céntimos según la moneda del país»);
   lo anoto para que SLT-238 lo recoja.

## Veredicto

**OK (APROBADO).** 0 bloqueantes, 3 menores. Condición de merge: `gate-completo` y los E2E afectados en verde en CI
(menor 1).
