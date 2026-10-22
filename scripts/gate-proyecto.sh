#!/usr/bin/env bash
# scripts/gate-proyecto.sh — pasos del gate PROPIOS de servi_logistic (perfil, no arnes).
#
# `init.sh` lo carga con `source` despues de cargar el `.env` y ANTES de typecheck/lint/tests, en
# los dos modos. Tiene a mano `ok`, `warn`, `fail` y `MODO` (rapido|completo). No esta en
# `arnes.manifest`: el sync no lo toca.
#
# Sin `prisma generate`, un arbol recien instalado no tiene cliente de Prisma y el typecheck sale
# rojo en cientos de archivos con "has no exported member 'Prisma'" (medido 2026-10-21, /arnes-init).
# `prisma.config.ts` exige DATABASE_URL aunque `generate` no conecte; en un worktree sin `.env`
# se le da una URL inalcanzable (127.0.0.1:1), como la guardia de drift (docs/verification.md).
if DATABASE_URL="${DATABASE_URL:-postgresql://gate:gate@127.0.0.1:1/gate}" pnpm exec prisma generate >/dev/null 2>&1; then ok "cliente de Prisma al dia"
else fail "prisma generate fallo: corre 'pnpm exec prisma generate' para ver el error"; fi
if pnpm exec next typegen >/dev/null 2>&1; then ok "tipos de ruta de Next al dia"
else warn "next typegen fallo: el typecheck puede dar errores de tipos de ruta"; fi
