# 🪙 Tokenomat

Pasek nad polem wiadomości w Claude Code z dwoma licznikami:

```
🪙 Tokenomat · wiadomość 5.5k (↑5.0k ↓500) · sesja 107k (↑106k ↓800)
```

- **wiadomość**: tokeny ostatniej tury głównej rozmowy, czyli wszystko, co poszło do API
  (↑ wejście: niecache'owane + zapis i odczyt cache) i wróciło (↓ wyjście).
- **sesja**: suma wszystkich tur w tej sesji, łącznie z turami subagentów.

Pasek pokazuje się po pierwszej odpowiedzi i ustępuje miejsca ankietom.
Wartości trzymane są w `$.state`, więc przetrwają przeładowanie moda w obrębie sesji.

## Instalacja

```bash
claude plugin marketplace add /ścieżka/do/claude-mods
claude plugin install tokenomat@claude-mods
```

Albo jednorazowo: `claude --plugin-dir ./tokenomat`.
