# SLT-88 «Las fotos pesadas del chat no se envían y no avisan» (hotfix)

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-88 | adjuntos-chat-sin-aviso | frontend | small | hotfix/SLT-88-adjuntos-chat-sin-aviso | Carlos Restrepo | spec |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F1.2: falta el spec. HOTFIX: rama desde `origin/prod` (fae6a5d3), worktree `.worktrees/SLT-88-hotfix`. `node_modules` compartido con checkout en `dev`: no correr `prisma generate` aquí.

## Síntoma (producción, 2026-11-05)
Video del reporte: el mensajero adjunta la foto, pulsa enviar y no pasa nada, sin aviso. Guía 63078626, 15:42-15:48 hora de Costa Rica: el cliente ya había escrito ese día, los textos salieron, ninguna imagen quedó guardada y no hay errores en los logs de la función. Producción, 14 días: 1 imagen enviada y leída; 1 audio con fallo 131053.

## Evaluación
frontend / small. Causa probable, sin medir: Vercel rechaza a 4,5 MB, por debajo del límite de 5 MB de la app, que solo comprime por encima de 5 MB; `enviarAdjunto` no captura el rechazo. Un corte de red daría el mismo síntoma. Se mide en el Preview.

## Decisiones
- 2026-11-05 (Carlos, «si»): comprimir fotos de más de 4 MB, avisar de todo fallo de envío y bajar a 4 MB los límites de video, audio y documentos. Enviar archivos más grandes queda fuera.

## Preguntas abiertas
Ninguna.

## Tandas
- 2026-11-05 · T1-T3 · 02962a72, 10df2d72, 9e81d351 · 38/38 mutaciones. `./init.sh` local no aplica: el `typecheck` da 12 errores, idénticos en `origin/prod` limpio, porque el cliente Prisma compartido viene de `dev`. El gate lo mide el CI.
- T6, paso A, causa **sin medir**: el Preview tiene Vercel Authentication y responde 302 antes de la función, con peticiones de 3,9 a 5,1 MB. Se mide en el paso B, con Carlos.
- Incidente: la primera corrida de `vitest related` llevó tests de integración a la base local del `.env`. Se repitió sobre la desechable.

## Modelos (overrides)
Subagentes en Opus.

## Cierre
