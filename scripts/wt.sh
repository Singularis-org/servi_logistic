#!/usr/bin/env bash
# wt.sh — ciclo de vida de los worktrees del arnes.
#
# Existe porque el arnes creaba entornos y no los desmontaba nunca. Medido sobre un
# proyecto anterior que corria este mismo arnes: 80 worktrees registrados y 0 prunables
# (todos con directorio vivo) repartidos en cuatro sitios distintos -57 carpetas hermanas
# del repo, 19 en la raiz de C:, 4 en el scratchpad del harness y 7 en
# `.claude/worktrees/`-. Ninguno se borro jamas porque ningun paso del flujo lo pedia.
#
# Regla de oro de este script: **ante la duda, NO borra**. El coste de dejar un worktree
# de mas es disco; el de borrar uno con trabajo sin guardar es trabajo perdido.
set -euo pipefail

RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'; DIM=$'\033[2m'; NC=$'\033[0m'
fail() { echo "${RED}✗ $1${NC}" >&2; exit 1; }
ok()   { echo "${GREEN}✓ $1${NC}"; }
warn() { echo "${YELLOW}! $1${NC}"; }

# Separador de campos entre `enumerate` y sus lectores. NO uses tab: el tab es whitespace
# de IFS, asi que `read` colapsa dos seguidos en uno y los campos se corren. Con un
# worktree detached (sin linea `branch` en el porcelain) los flags caian en la columna de
# la rama y `flags` quedaba vacio: `detached` se juzgaba como si fuera una rama, `git
# cherry` fallaba, la ausencia de `+` se leia como "ya mergeado" y el worktree salia SAFE.
# Un falso SAFE borra trabajo; por eso el separador es un caracter no imprimible.
SEP=$'\x1f'

REPO="."
BASE=""
FORCE=0
ASSUME_MERGED=0
PUBLICAR=1
RETOMAR=0
WT_DIR=".worktrees"

usage() {
  cat <<'AYUDA'
wt.sh — ciclo de vida de los worktrees del arnes.

  wt.sh new  <key> <slug>   publica la rama (candado) + crea worktree    (paso F1.0)
                            sale con 4 si la rama ya existe en origin: otro la tomo
  wt.sh done <key>-<slug>   desmonta tras el merge del PR                (paso F2.5)
  wt.sh list                inventario con veredicto SAFE / HOLD por worktree
  wt.sh clean [--force]     dry-run por defecto; con --force desmonta los SAFE

Opciones globales:
  -C <repo>          opera sobre otro repo (ej. -C ../otro-repo)
  --base <ref>       ref contra la que se mide "mergeado" (default: autodeteccion,
                     origin/dev > origin/main > origin/master > dev > main > master)
  --assume-merged    solo `done`: salta la guarda de merge, mantiene las otras tres.
                     Necesario con squash-merge de GitHub, que reescribe los commits y
                     deja la rama sin ser ancestro de dev aunque SI este mergeada.
  --sin-publicar     solo `new`: no publica la rama en origin (sin candado de equipo).
  --retomar          solo `new`: monta el worktree desde origin/<rama> (tu rama, otra maquina).

Las cuatro guardas (cualquiera que salte deja el worktree en pie):
  1. es el worktree principal        3. tiene cambios sin commitear
  2. esta bloqueado (worktree lock)  4. su rama no esta integrada en la base
AYUDA
  exit "${1:-0}"
}

# ---------------------------------------------------------------- parseo de opciones
ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    -C)              REPO="${2:?-C necesita una ruta}"; shift 2 ;;
    --base)          BASE="${2:?--base necesita una ref}"; shift 2 ;;
    --force)         FORCE=1; shift ;;
    --assume-merged) ASSUME_MERGED=1; shift ;;
    --sin-publicar)  PUBLICAR=0; shift ;;
    --retomar)       RETOMAR=1; shift ;;
    -h|--help)       usage 0 ;;
    -*)              fail "opcion desconocida: $1 (usa --help)" ;;
    *)               ARGS+=("$1"); shift ;;
  esac
done
set -- ${ARGS[@]+"${ARGS[@]}"}
CMD="${1:-}"; [ -n "$CMD" ] || usage 2

git -C "$REPO" rev-parse --git-dir >/dev/null 2>&1 || fail "'$REPO' no es un repo git"
# Todo se resuelve contra el worktree PRINCIPAL: si te invocan desde dentro de un
# worktree secundario, `.worktrees/` sigue colgando del principal, no de este.
MAIN_WT="$(git -C "$REPO" worktree list --porcelain | sed -n '1s/^worktree //p')"

# ------------------------------------------------------------------------ utilidades

# Un registro por worktree: path SEP rama SEP flags(bare,detached,locked,prunable)
enumerate() {
  local path="" branch="" flags="" line
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      "worktree "*) path="${line#worktree }" ;;
      "branch "*)   branch="${line#branch }"; branch="${branch#refs/heads/}" ;;
      detached)     flags="$flags,detached" ;;
      bare)         flags="$flags,bare" ;;
      locked*)      flags="$flags,locked" ;;
      prunable*)    flags="$flags,prunable" ;;
      "")           if [ -n "$path" ]; then
                      printf '%s%s%s%s%s\n' "$path" "$SEP" "$branch" "$SEP" "${flags#,}"
                    fi
                    path=""; branch=""; flags="" ;;
    esac
  done < <(git -C "$REPO" worktree list --porcelain)
  if [ -n "$path" ]; then
    printf '%s%s%s%s%s\n' "$path" "$SEP" "$branch" "$SEP" "${flags#,}"
  fi
}

# Rama de integracion del perfil (`arnes.config.json > ramas.integracion`), `dev` si no hay.
integracion() {
  local cfg="$MAIN_WT/arnes.config.json"
  [ -f "$REPO/arnes.config.json" ] && cfg="$REPO/arnes.config.json"
  node -e "try{console.log(require(process.argv[1]).ramas?.integracion??'dev')}catch{console.log('dev')}" "$(cd "$(dirname "$cfg")" && pwd)/arnes.config.json" 2>/dev/null || echo dev
}
INTEGRACION=""

# La ref contra la que se juzga si una rama ya esta integrada.
resolve_base() {
  if [ -n "$BASE" ]; then echo "$BASE"; return 0; fi
  local r
  [ -n "$INTEGRACION" ] || INTEGRACION="$(integracion)"
  for r in "origin/$INTEGRACION" "$INTEGRACION" origin/dev origin/main origin/master dev main master; do
    if git -C "$REPO" rev-parse --verify -q "$r" >/dev/null 2>&1; then echo "$r"; return 0; fi
  done
  return 1
}

# LAS CUATRO GUARDAS. Imprime "SAFE<SEP>razon" o "HOLD<SEP>razon".
verdict() {
  local path="$1" branch="$2" flags="$3" base="$4"

  case ",$flags," in *,bare,*) printf 'HOLD%ses el repo bare\n' "$SEP"; return 0 ;; esac
  # (1) el worktree principal no se toca, pase lo que pase
  if [ "$path" = "$MAIN_WT" ]; then
    printf 'HOLD%ses el worktree principal\n' "$SEP"; return 0
  fi
  # (2) bloqueado a proposito por alguien
  case ",$flags," in *,locked,*) printf 'HOLD%sbloqueado (git worktree lock)\n' "$SEP"; return 0 ;; esac
  # el directorio ya no existe: no hay nada que perder, lo limpia `git worktree prune`
  case ",$flags," in *,prunable,*) printf 'SAFE%sregistro huerfano (directorio ausente)\n' "$SEP"; return 0 ;; esac
  # (3) trabajo sin commitear
  local dirty
  dirty="$(git -C "$path" status --porcelain 2>/dev/null | wc -l | tr -d ' ')" || dirty="?"
  if [ -z "$dirty" ] || [ "$dirty" = "?" ]; then
    printf 'HOLD%sno se pudo leer su estado\n' "$SEP"; return 0
  fi
  if [ "$dirty" != "0" ]; then
    printf 'HOLD%ssucio: %s archivo(s) sin commitear\n' "$SEP" "$dirty"; return 0
  fi
  # (4) commits que solo viven aqui
  case ",$flags," in *,detached,*) printf 'HOLD%sHEAD detached, no hay rama que juzgar\n' "$SEP"; return 0 ;; esac
  if [ -z "$branch" ]; then printf 'HOLD%ssin rama asociada\n' "$SEP"; return 0; fi
  if [ -z "$base" ]; then printf 'HOLD%sno hay ref base para juzgar el merge\n' "$SEP"; return 0; fi
  if git -C "$REPO" merge-base --is-ancestor "$branch" "$base" 2>/dev/null; then
    printf 'SAFE%smergeada en %s\n' "$SEP" "$base"; return 0
  fi
  # Rebase o cherry-pick: los sha difieren pero los parches ya estan arriba. `git cherry`
  # marca con `+` lo que NO tiene equivalente en la base. Si el comando falla, `out` queda
  # vacio y NO se puede concluir nada: por eso se exige que haya corrido bien.
  local cherry_out cherry_rc=0
  cherry_out="$(git -C "$REPO" cherry "$base" "$branch" 2>/dev/null)" || cherry_rc=$?
  if [ "$cherry_rc" = 0 ] && ! printf '%s\n' "$cherry_out" | grep -q '^+'; then
    printf 'SAFE%ssus parches ya estan en %s\n' "$SEP" "$base"; return 0
  fi
  printf 'HOLD%sno mergeada en %s\n' "$SEP" "$base"
}

print_row() {
  local v="$1" branch="$2" path="$3" reason="$4" color
  if [ "$v" = "SAFE" ]; then color="$GREEN"; else color="$YELLOW"; fi
  printf '%s%-4s%s  %-46s %-46s %s%s%s\n' \
    "$color" "$v" "$NC" "${branch:-(sin rama)}" "$path" "$DIM" "$reason" "$NC"
}

# Recorre e imprime el inventario. Deja los SAFE en SAFE_PATHS / SAFE_BRANCHES.
SAFE_PATHS=(); SAFE_BRANCHES=(); N_TOTAL=0; N_SAFE=0; N_HOLD=0
inventory() {
  local base path branch flags v reason
  base="$(resolve_base || true)"
  [ -n "$base" ] || warn "sin ref base (origin/dev, dev, main...): no puedo juzgar merges"
  echo "${DIM}repo: $(cd "$REPO" && pwd)   base: ${base:-(ninguna)}${NC}"
  echo
  while IFS="$SEP" read -r path branch flags; do
    N_TOTAL=$((N_TOTAL + 1))
    IFS="$SEP" read -r v reason < <(verdict "$path" "$branch" "$flags" "$base")
    print_row "$v" "$branch" "$path" "$reason"
    if [ "$v" = "SAFE" ]; then
      N_SAFE=$((N_SAFE + 1)); SAFE_PATHS+=("$path"); SAFE_BRANCHES+=("$branch")
    else
      N_HOLD=$((N_HOLD + 1))
    fi
  done < <(enumerate)
  echo
  echo "${DIM}$N_TOTAL worktree(s): $N_SAFE desmontable(s), $N_HOLD retenido(s).${NC}"
}

# Desmonta un worktree ya juzgado SAFE. No vuelve a juzgar: eso es de quien llama.
remove_wt() {
  local path="$1" branch="$2"
  if [ -d "$path" ]; then
    # Sin --force git se niega si quedan ficheros ignorados (node_modules). Ya sabemos por
    # la guarda (3) que no hay nada tracked modificado ni untracked no-ignorado.
    git -C "$REPO" worktree remove "$path" 2>/dev/null \
      || git -C "$REPO" worktree remove --force "$path" \
      || { warn "no se pudo desmontar $path (¿archivo en uso en Windows?)"; return 1; }
  fi
  git -C "$REPO" worktree prune
  if [ -n "$branch" ] && git -C "$REPO" rev-parse --verify -q "$branch" >/dev/null 2>&1; then
    git -C "$REPO" branch -d "$branch" >/dev/null 2>&1 \
      || git -C "$REPO" branch -D "$branch" >/dev/null 2>&1 \
      || warn "worktree fuera, pero la rama '$branch' no se pudo borrar"
  fi
  ok "desmontado: $path${branch:+  (rama $branch borrada)}"
}

# ------------------------------------------------------------------------ subcomandos

cmd_new() {
  local id="${1:?uso: wt.sh new <key> <slug>}" slug="${2:?uso: wt.sh new <key> <slug>}"
  local name="$id-$slug" branch="feature/$id-$slug" path="$MAIN_WT/$WT_DIR/$id-$slug"

  if [ -d "$path" ]; then
    ok "el worktree ya existe: $path"   # idempotente: reanudar sesion no debe romper
    return 0
  fi

  [ -n "$INTEGRACION" ] || INTEGRACION="$(integracion)"
  git -C "$REPO" fetch origin "$INTEGRACION" >/dev/null 2>&1 || warn "no se pudo hacer fetch de origin/$INTEGRACION"
  local base
  base="$(resolve_base)" || fail "no encuentro una ref base (origin/dev, dev, main...)"

  if git -C "$REPO" rev-parse --verify -q "$branch" >/dev/null 2>&1; then
    git -C "$REPO" worktree add "$path" "$branch"          # la rama ya existia en local: es mia
  elif [ "$RETOMAR" = 1 ]; then
    # Mi propia rama, publicada desde otra maquina. Quien la tiene lo dice Jira (assignee):
    # el leader lo comprueba ANTES de llamar con --retomar.
    git -C "$REPO" fetch --quiet origin "refs/heads/$branch:refs/remotes/origin/$branch"       || fail "no existe origin/$branch: no hay nada que retomar"
    git -C "$REPO" worktree add -b "$branch" "$path" "origin/$branch"
  else
    # CANDADO DE EQUIPO (docs/equipo.md). La rama se publica ANTES de crear el worktree y con
    # lease vacio: `--force-with-lease=<ref>:` exige que la rama NO exista en el remoto, y el
    # servidor lo comprueba de forma atomica. Si dos personas toman la misma feature a la vez,
    # solo una gana. Ni siquiera el lease basta si los dos publican el MISMO commit de dev: git
    # ve "Everything up-to-date", no actualiza nada, no evalua el lease y sale en verde para
    # los dos (comprobado). Por eso la rama nace con un commit vacio PROPIO —sha unico, y de
    # paso deja escrito quien la tomo y cuando—.
    if [ "$PUBLICAR" = 1 ]; then
      local sha quien
      quien="$(git -C "$REPO" config user.name || echo desconocido)"
      sha="$(git -C "$REPO" commit-tree "$base^{tree}" -p "$base" \
        -m "chore($id): feature tomada por $quien" -m "Candado de equipo (scripts/wt.sh new). $(date -u +%Y-%m-%dT%H:%MZ)")"
      local base_wt="$sha"
      if ! git -C "$REPO" push --quiet --force-with-lease="refs/heads/$branch:" origin "$sha:refs/heads/$branch" 2>/dev/null; then
        if git -C "$REPO" ls-remote --exit-code --heads origin "$branch" >/dev/null 2>&1; then
          echo "${RED}✗ TOMADA: la rama $branch ya existe en origin. Otra persona tomo esta feature.${NC}" >&2
          echo "  Suelta el assignee en Jira si lo pusiste y elige otra feature." >&2
          echo "  Si la tomaste TU desde otra maquina: ./scripts/wt.sh --retomar new $id $slug" >&2
          exit 4
        fi
        fail "no se pudo publicar $branch en origin (¿sin red o sin permisos?). Reintenta, o usa --sin-publicar si trabajas solo."
      fi
      git -C "$REPO" fetch --quiet origin "refs/heads/$branch:refs/remotes/origin/$branch" || true
    else
      warn "--sin-publicar: la rama no se publica y NO hay candado de equipo"
    fi
    git -C "$REPO" worktree add --no-track -b "$branch" "$path" "${base_wt:-$base}"
    [ "$PUBLICAR" = 1 ] && git -C "$REPO" branch --quiet --set-upstream-to="origin/$branch" "$branch" 2>/dev/null || true
  fi
  ok "worktree $path  (rama $branch desde $base)"
  echo
  echo "El implementer trabaja DENTRO de ese directorio."
  echo "Cuando el humano mergee el PR:  ./scripts/wt.sh done $name"
}

cmd_done() {
  local name="${1:?uso: wt.sh done <key>-<slug>}"
  local path="$MAIN_WT/$WT_DIR/$name" branch="" flags="" p b f base found=0

  # Acepta `8-slug`, una ruta o un nombre de rama: se busca en el registro.
  while IFS="$SEP" read -r p b f; do
    if [ "$p" = "$path" ] || [ "$p" = "$name" ] || [ "$b" = "$name" ] || [ "$b" = "feature/$name" ]; then
      path="$p"; branch="$b"; flags="$f"; found=1; break
    fi
  done < <(enumerate)
  [ "$found" = 1 ] || fail "no hay ningun worktree registrado para '$name'"

  base="$(resolve_base || true)"
  local v reason
  IFS="$SEP" read -r v reason < <(verdict "$path" "$branch" "$flags" "$base")

  if [ "$v" != "SAFE" ] && [ "$ASSUME_MERGED" = 1 ] && [ "${reason#no mergeada en}" != "$reason" ]; then
    warn "se salta la guarda de merge por --assume-merged ($reason)"
    v="SAFE"
  fi

  if [ "$v" != "SAFE" ]; then
    print_row "$v" "$branch" "$path" "$reason"
    echo
    warn "NO se desmonto nada. Anotalo en 'progress/deudas.md'"
    warn "y sigue: un worktree retenido no bloquea el cierre de la feature."
    exit 3
  fi
  remove_wt "$path" "$branch"
}

cmd_list() { inventory; }

cmd_clean() {
  inventory
  if [ "$N_SAFE" = 0 ]; then
    git -C "$REPO" worktree prune
    ok "nada que desmontar"
    return 0
  fi
  if [ "$FORCE" != 1 ]; then
    echo
    warn "DRY-RUN: no se borro nada. $N_SAFE worktree(s) se desmontarian."
    local hint=""
    [ "$REPO" = "." ] || hint="-C $REPO "
    echo "Para ejecutarlo:  $0 ${hint}clean --force"
    return 0
  fi
  echo
  local i
  for i in "${!SAFE_PATHS[@]}"; do
    remove_wt "${SAFE_PATHS[$i]}" "${SAFE_BRANCHES[$i]}" || true
  done
}

case "$CMD" in
  new)   shift; cmd_new "$@" ;;
  done)  shift; cmd_done "$@" ;;
  list)  cmd_list ;;
  clean) cmd_clean ;;
  *)     fail "subcomando desconocido: $CMD (usa --help)" ;;
esac
