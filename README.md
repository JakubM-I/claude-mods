# Claude Code Mods

Kolekcja modów (pluginów) dla [Claude Code](https://claude.com/claude-code).
Każdy mod żyje we własnym katalogu i powstaje na własnej gałęzi `mod/<nazwa>`.

## Mody

| Mod | Opis |
| --- | --- |
| [tokenomat](tokenomat/) | Licznik tokenów nad polem wiadomości: ostatnia wiadomość i suma w sesji |
| [git-branches](git-branches/) | Panel boczny z gałęziami repozytorium: main na górze, ostatni commit i czy gałąź jest wciągnięta do main |

## Instalacja

Repo jest marketplace'em Claude Code. Lokalnie:

```bash
claude plugin marketplace add /ścieżka/do/claude-mods
claude plugin install <mod>@claude-mods
```

## Development

Zasady i struktura moda: [CLAUDE.md](CLAUDE.md).
