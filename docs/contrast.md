# Kontrasttabelle

Erzeugt von `scripts/check-contrast.mjs --table` aus den Design-Tokens in
`src/index.css`. Geprüft wird gegen WCAG AA: 4,5:1 für Fließtext, 3:1 für
gefüllte Bedienelemente und Ränder.

Vor der Umstellung auf Tokens (REVIEW-BACKLOG.md F1/G3) verfehlten drei
Paare die Grenze:

| Paar | vorher | jetzt |
|---|---|---|
| Gedämpfter Text auf Weiß | 2,54:1 | 4,83:1 |
| Gedämpfter Text auf dunkler Fläche | 3,67:1 | 6,99:1 |
| Weiß auf grünem Primärknopf | 3,77:1 | 5,48:1 |
| Weiß auf orangem Primärknopf | 3,56:1 | 5,18:1 |

Verläufe und halbtransparente Werte lassen sich nicht statisch prüfen und
sind ausgenommen; sie liegen ausschließlich hinter großflächigen Elementen,
nicht hinter Fließtext.

## Alle geprüften Paare

| Theme | Pair | Foreground | Background | Ratio | Min | |
|---|---|---|---|---|---|---|
| green | body text | `#111827` | `#ffffff` | 17.74:1 | 4.5:1 | ✓ |
| green | secondary text | `#4b5563` | `#ffffff` | 7.56:1 | 4.5:1 | ✓ |
| green | muted text | `#6b7280` | `#ffffff` | 4.83:1 | 4.5:1 | ✓ |
| green | text on raised surface | `#111827` | `#ffffff` | 17.74:1 | 4.5:1 | ✓ |
| green | input text | `#111827` | `#ffffff` | 17.74:1 | 4.5:1 | ✓ |
| green | primary button label | `#ffffff` | `#047857` | 5.48:1 | 4.5:1 | ✓ |
| green | accent badge | `#065f46` | `#ecfdf5` | 7.29:1 | 4.5:1 | ✓ |
| green | danger button label | `#ffffff` | `#b91c1c` | 6.47:1 | 4.5:1 | ✓ |
| green | danger text | `#991b1b` | `#ffffff` | 8.31:1 | 4.5:1 | ✓ |
| green | warning text | `#92400e` | `#ffffff` | 7.09:1 | 4.5:1 | ✓ |
| green | info text | `#1e40af` | `#ffffff` | 8.72:1 | 4.5:1 | ✓ |
| green | success text | `#065f46` | `#ffffff` | 7.68:1 | 4.5:1 | ✓ |
| green | accent on surface (borders, icons) | `#047857` | `#ffffff` | 5.48:1 | 3:1 | ✓ |
| blue | body text | `#111827` | `#ffffff` | 17.74:1 | 4.5:1 | ✓ |
| blue | secondary text | `#4b5563` | `#ffffff` | 7.56:1 | 4.5:1 | ✓ |
| blue | muted text | `#6b7280` | `#ffffff` | 4.83:1 | 4.5:1 | ✓ |
| blue | text on raised surface | `#111827` | `#ffffff` | 17.74:1 | 4.5:1 | ✓ |
| blue | input text | `#111827` | `#ffffff` | 17.74:1 | 4.5:1 | ✓ |
| blue | primary button label | `#ffffff` | `#1d4ed8` | 6.70:1 | 4.5:1 | ✓ |
| blue | accent badge | `#1e40af` | `#eff6ff` | 8.01:1 | 4.5:1 | ✓ |
| blue | danger button label | `#ffffff` | `#b91c1c` | 6.47:1 | 4.5:1 | ✓ |
| blue | danger text | `#991b1b` | `#ffffff` | 8.31:1 | 4.5:1 | ✓ |
| blue | warning text | `#92400e` | `#ffffff` | 7.09:1 | 4.5:1 | ✓ |
| blue | info text | `#1e40af` | `#ffffff` | 8.72:1 | 4.5:1 | ✓ |
| blue | success text | `#065f46` | `#ffffff` | 7.68:1 | 4.5:1 | ✓ |
| blue | accent on surface (borders, icons) | `#1d4ed8` | `#ffffff` | 6.70:1 | 3:1 | ✓ |
| orange | body text | `#111827` | `#ffffff` | 17.74:1 | 4.5:1 | ✓ |
| orange | secondary text | `#4b5563` | `#ffffff` | 7.56:1 | 4.5:1 | ✓ |
| orange | muted text | `#6b7280` | `#ffffff` | 4.83:1 | 4.5:1 | ✓ |
| orange | text on raised surface | `#111827` | `#ffffff` | 17.74:1 | 4.5:1 | ✓ |
| orange | input text | `#111827` | `#ffffff` | 17.74:1 | 4.5:1 | ✓ |
| orange | primary button label | `#ffffff` | `#c2410c` | 5.18:1 | 4.5:1 | ✓ |
| orange | accent badge | `#9a3412` | `#fff7ed` | 6.88:1 | 4.5:1 | ✓ |
| orange | danger button label | `#ffffff` | `#b91c1c` | 6.47:1 | 4.5:1 | ✓ |
| orange | danger text | `#991b1b` | `#ffffff` | 8.31:1 | 4.5:1 | ✓ |
| orange | warning text | `#92400e` | `#ffffff` | 7.09:1 | 4.5:1 | ✓ |
| orange | info text | `#1e40af` | `#ffffff` | 8.72:1 | 4.5:1 | ✓ |
| orange | success text | `#065f46` | `#ffffff` | 7.68:1 | 4.5:1 | ✓ |
| orange | accent on surface (borders, icons) | `#c2410c` | `#ffffff` | 5.18:1 | 3:1 | ✓ |
| dark | body text | `#f3f4f6` | `#111827` | 16.12:1 | 4.5:1 | ✓ |
| dark | secondary text | `#d1d5db` | `#111827` | 12.04:1 | 4.5:1 | ✓ |
| dark | muted text | `#9ca3af` | `#111827` | 6.99:1 | 4.5:1 | ✓ |
| dark | text on raised surface | `#f3f4f6` | `#1f2937` | 13.34:1 | 4.5:1 | ✓ |
| dark | input text | `#f3f4f6` | `#1f2937` | 13.34:1 | 4.5:1 | ✓ |
| dark | primary button label | `#ffffff` | `#047857` | 5.48:1 | 4.5:1 | ✓ |
| dark | danger button label | `#ffffff` | `#b91c1c` | 6.47:1 | 4.5:1 | ✓ |
| dark | danger text | `#fca5a5` | `#111827` | 9.35:1 | 4.5:1 | ✓ |
| dark | warning text | `#fcd34d` | `#111827` | 12.30:1 | 4.5:1 | ✓ |
| dark | info text | `#93c5fd` | `#111827` | 9.84:1 | 4.5:1 | ✓ |
| dark | success text | `#6ee7b7` | `#111827` | 11.64:1 | 4.5:1 | ✓ |
| dark | accent on surface (borders, icons) | `#047857` | `#111827` | 3.23:1 | 3:1 | ✓ |
