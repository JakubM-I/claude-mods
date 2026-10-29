# claude-mods

Repozytorium z modami (pluginami) dla Claude Code. Każdy mod to osobny plugin
w osobnym katalogu w korzeniu repo.

## Zasady pracy

- **Jeden mod = jeden katalog** w korzeniu repo, nazwany w kebab-case
  (np. `token-meter/`). Nazwa katalogu = `name` w `plugin.json`.
- **Jeden mod = jedna gałąź**: `mod/<nazwa-moda>`, odbita od `main`.
  Zanim zaczniesz nowy mod: `git switch main && git pull && git switch -c mod/<nazwa>`.
  Na gałęzi moda zmieniamy tylko jego katalog (plus jego wpis w
  `.claude-plugin/marketplace.json` i w tabeli w `README.md`).
- Mody piszemy **tutaj, w repo** — nie w `~/.claude/dev-mods/...`, który podsuwa
  skill `plugin-authoring`. Repo jest jedynym źródłem prawdy.
- Do `main` mod trafia przez merge/PR, gdy jest zwalidowany i przetestowany.

## Struktura moda

```
<nazwa-moda>/
├── .claude-plugin/
│   └── plugin.json        # { "name", "version", "description" [, "types"] }
├── hooks/
│   ├── hooks.json         # { "modules": ["./register.tsx"] }
│   └── register.tsx       # export const register: Register = (on, options) => { ... }
├── types/index.d.ts       # tylko gdy mod trzyma wartości w $.state (kontrakt PluginState)
├── *.test.ts(x)           # testy dla `claude plugin test`
└── README.md              # co robi mod i jak go zainstalować
```

Typ `Register` importujemy z `'claude-code'`. Szczegóły API (eventy, `$`, elementy UI)
są w skillu `plugin-authoring` — załaduj go przed pisaniem moda.
`<mod>/.claude-plugin/types/` jest generowany przez silnik — nie commitujemy go.

## Sprawdzanie

```bash
claude plugin validate ./<nazwa-moda>
claude plugin test ./<nazwa-moda>
tsc -p ./<nazwa-moda>          # gdy silnik wygenerował już typy
```

## Uruchamianie podczas developmentu

- Jednorazowo: `claude --plugin-dir ./<nazwa-moda>` (folder jest obserwowany, zapis przeładowuje mod).
- Na stałe: repo jest marketplace'em (`.claude-plugin/marketplace.json`, źródła względne),
  więc po `claude plugin marketplace add <ścieżka-do-repo>` i
  `claude plugin install <mod>@claude-mods` zmiany w katalogu wczytuje `/reload-plugins`.
- Nowy mod dopisujemy do `plugins` w `.claude-plugin/marketplace.json`:
  `{ "name": "<nazwa-moda>", "source": "./<nazwa-moda>" }`.

## Commity

Krótkie, po angielsku, w trybie rozkazującym, z prefiksem moda gdy dotyczy jednego:
`token-meter: add pane with live usage`.
