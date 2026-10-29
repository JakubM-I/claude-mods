# 🪙 Tokenomat

Pasek nad polem wiadomości w Claude Code z dwoma licznikami:

```
🪙 ✎ szkic ≈42 (z kontekstem ≈35k) · wiadomość 5.5k (↑5.0k ↓500) · sesja 107k (↑106k ↓800)
```

- **szkic** (żółty): przybliżona liczba tokenów wpisywanej wiadomości, liczona na żywo
  (~4 znaki ASCII na token, polskie znaki i emoji gęściej). W nawiasie: ile mniej więcej
  pójdzie do modelu razem z obecnym kontekstem rozmowy. Znika po wysłaniu.
- **wiadomość** (niebieski): tokeny ostatniej tury głównej rozmowy, czyli wszystko, co poszło do API
  (↑ wejście: niecache'owane + zapis i odczyt cache) i wróciło (↓ wyjście).
- **sesja** (zielony): suma wszystkich tur w tej sesji, łącznie z turami subagentów.

Pasek pokazuje się, gdy zaczniesz pisać albo po pierwszej odpowiedzi, i ustępuje miejsca ankietom.
Kolory biorą się z motywu Claude Code, więc pasują do jasnego i ciemnego.
Wartości trzymane są w `$.state`, więc przetrwają przeładowanie moda w obrębie sesji.

## Instalacja

```bash
claude plugin marketplace add /ścieżka/do/claude-mods
claude plugin install tokenomat@claude-mods
```

Albo jednorazowo: `claude --plugin-dir ./tokenomat`.
