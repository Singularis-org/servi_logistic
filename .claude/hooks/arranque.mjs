#!/usr/bin/env node
// Hook SessionStart del arnes v2 (docs/lectura.md). Inyecta al arrancar SOLO lo que hay que
// leer siempre y es corto: la sesion personal (`progress/sesion.local.md`) y mis features en
// vuelo segun la copia local del board. Todo lo demas se lee bajo demanda.
// Nunca falla: un hook de arranque roto no debe impedir trabajar.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const salida = [];
try {
  let raiz = '.';
  try {
    raiz = path.dirname(execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim());
  } catch { /* sin git: directorio actual */ }

  const sesion = path.join(raiz, 'progress', 'sesion.local.md');
  if (existsSync(sesion)) {
    const lineas = readFileSync(sesion, 'utf8').split('\n');
    salida.push('## Tu sesion anterior (progress/sesion.local.md)', ...lineas.slice(0, 40));
    if (lineas.length > 40) salida.push(`(... ${lineas.length - 40} lineas mas: recorta el archivo, debe ser corto)`);
  } else {
    salida.push('No hay progress/sesion.local.md: sesion nueva (plantilla en progress/sesion.local.example.md).');
  }

  const ident = path.join(raiz, '.arnes.local.json');
  const lista = path.join(raiz, 'feature_list.json');
  const yo = existsSync(ident) ? JSON.parse(readFileSync(ident, 'utf8')).jira_account_id : null;
  if (!yo) salida.push('AVISO: sin .arnes.local.json — corre /jira-connect para fijar tu identidad de Jira.');
  if (existsSync(lista)) {
    const { features } = JSON.parse(readFileSync(lista, 'utf8'));
    const mias = features.filter((f) => ['spec_ready', 'in_progress'].includes(f.status) && (!yo || f.assignee?.accountId === yo));
    salida.push('', `## ${yo ? 'Mis features' : 'Features'} en vuelo (copia local del board; F0 la refresca)`);
    if (mias.length === 0) salida.push('(ninguna)');
    for (const f of mias) salida.push(`- ${f.key ?? f.id}${f.title ? ` «${f.title}»` : ''} (${f.name}) — ${f.status}, zona ${f.zone ?? '?'} → progress/features/${f.key ?? f.id}.md`);
  } else {
    salida.push('No hay feature_list.json en la raiz: corre F0 (AGENTS.md) antes de elegir trabajo.');
  }
} catch (err) {
  salida.push(`(hook de arranque del arnes: ${err.message})`);
}
console.log(salida.join('\n'));
