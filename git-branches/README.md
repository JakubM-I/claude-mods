# 🌿 Git Branches

Panel boczny w Claude Code z gałęziami repozytorium, w którym działa sesja.
Otwiera się komendą `/git-branches`, obok transkryptu, tak jak panel plików czy przeglądarka.

```
◆ main ● bieżąca
  8485201 · tokenomat: always show the band, every…   ▸
  Jakub Musiałowski, 2 godz. temu

  ├ mod/git-branches
    aaa1111 · git-branches: add pane                   ▸
    Jakub Musiałowski, 5 min temu
    ✗ niewciągnięta · 3 commity ponad main · main ma 1 commit więcej
```

- **Na górze gałąź główna**: domyślna gałąź `origin` (`origin/HEAD`), a bez zdalnego repo
  `main`, potem `master`.
- **Pod nią pozostałe gałęzie lokalne**, od ostatnio zmienianej. Przy każdej ostatni commit:
  skrót i temat w jednej linii (ucięte; strzałka **▸** rozwija pełny temat), a pod spodem
  autor i kiedy. Wszystkie linie gałęzi zaczynają się równo z jej nazwą.
- **Czy wciągnięta do main**:
  - `✓ wciągnięta do main` — każdy commit gałęzi jest już w main (merge, fast-forward);
  - `✓ zmiany są w main (rebase / cherry-pick)` — commity są w main pod innymi hashami;
  - `✗ niewciągnięta · N commitów ponad main` — gałąź ma zmiany, których main nie ma;
    dopisek mówi też, o ile main uciekł do przodu;
  - `= na tym samym commicie co main` — gałąź dopiero odbita, bez własnych zmian.
- `● bieżąca` oznacza gałąź, na której stoi checkout.

Panel odświeża się sam na starcie sesji i po każdej turze (Claude mógł commitować albo
mergować), a ręcznie przyciskiem **↻ odśwież**. Squash merge kilku commitów nie zostanie
rozpoznany jako wciągnięty — git nie widzi go po samych commitach.

## Instalacja

```bash
claude plugin marketplace add /ścieżka/do/claude-mods
claude plugin install git-branches@claude-mods
```

Albo jednorazowo: `claude --plugin-dir ./git-branches`.
