# Ajuste: retirar «Trayecto desde aquí» (trayecto en vivo, feature 92)

- Tipo: ajuste sin SDD. Decisión humana (Cristian, 2026-11-03): «solo retira lo de trayecto desde aquí».
- Motivo: cada pulsación era una llamada facturada a Google Routes. Para navegar ya está
  «Abrir en:» (`AbrirEnAppNavegacion`, feature 289), que no se toca.
- Rama `ajuste/retirar-trayecto-vivo`, creada desde `origin/dev` d7d58d7.

## Qué se retiró
- UI: se borró `TrayectoVivoButton.tsx`. En `RepartoModule.tsx` se quitaron su uso y el estado
  `trayectoVivo`. El tramo resaltado del mapa sale ahora solo de `ruta.tramoSiguiente`.
- Servidor:
  - la action `trazarTramoVivo` y sus tipos/esquema (`lib/types/ruta-mensajero.ts`);
  - `IOptimizacionRutaService.trazarTramoVivo` y `TrazarTramoVivoResult`;
  - `IRutaOptimizadaRepository.marcarTramoVivo` y el campo de dominio `tramoVivoAt`;
  - el motivo de log `trayecto_vivo` de `MOTIVOS_LLAMADA_RUTA`.
- Tests:
  - se borró `optimizacion-ruta-tramo-vivo.test.ts`;
  - se quitaron casos, mocks y fixtures del tramo vivo en otros 16 tests;
  - en la guardia `dinero-centimos-cuando-existen` se quitó la entrada de lista blanca del archivo
    borrado. La guardia sigue fallando si una entrada apunta a un archivo inexistente.

## Verificación (binarios de `../../node_modules/.bin`, `NODE_OPTIONS=--max-old-space-size=8192`)
- `tsc --noEmit`: exit 0.
- eslint de los archivos tocados: 0 errores (1 warning previo en la guardia de dinero).
- vitest de los tests tocados y relacionados: `Test Files 35 passed | 1 skipped (36)`, `Tests 860 passed | 11 skipped (871)`.
- `vitest run guard`: `Test Files 1 failed | 322 passed | 3 skipped (326)`. El rojo es `dependencias-declaradas-presentes.guardia.test.ts` (marcadores de init.sh): está en `tests/baseline-rojos.json` y este diff no toca init.sh, así que no cuenta.
El `.int.test` de corrección de día se salta en el worktree porque no hay `DATABASE_URL`; corre en CI.

## Revisión
Reviewer: OK, sin mayores. Menores que quedan sin aplicar:
1. `lib/services/OptimizacionRutaService.ts` ~l.1123: un JSDoc huérfano («Guarda el trazado… NUNCA
   LANZA») queda encima del JSDoc de `trazadoDesdeCache`. Ya estaba huérfano antes del ajuste.
2. Formato de comentarios: `IMisAsignacionesService.ts:317` mide 152 columnas y en
   `RepartoModule.tsx:330` una línea quedó cortada.

## Abierto
- La columna `ruta_optimizada.tramo_vivo_at` (`db/schema.prisma` ~l.3529, migración
  `20260814160000_ruta_tramo_vivo_at`) ya no la usa ningún código. Se queda sin migración por
  decisión del encargo. Si se retira, que sea en una migración aparte y que se quite también su
  comentario en el schema.
- `specs/SLT-59…/design.md:881` y `progress/impl_SLT-59.md` todavía mencionan `trayecto_vivo`.
  Son registro histórico y no se tocan.
