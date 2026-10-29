# Talaia · eines

`index.html` és la font de veritat de l'app: el codi i totes les dades (preguntes `Tc`, targetes `Fc`, proves oficials `#tl-oficials`) hi són dins. GitHub Pages el publica tal qual i l'iPhone s'actualitza sol.

## Afegir preguntes noves sense duplicar-ne

1. Passa el material (fotos, PDF, text) a un fitxer `lot.json` amb aquest format:

```json
[
  { "q": "Enunciat?", "o": ["Opció", "*Correcta", "Opció", "Opció"],
    "e": "Explicació breu amb l'article o la font", "p": "c3coordinacio", "n": 2, "src": "Flou C3 p. 12" },
  { "front": "Llei 4/2003", "back": "Ordenació del sistema de seguretat pública", "p": "c3coordinacio" }
]
```

   - una sola opció amb `*`; quatre opcions
   - `p` és el període (llista amb `node tools/talaia-bank.js temes`)
   - `n`: 1 bàsic · 2 mitjà · 3 avançat

2. Revisa el lot contra el banc i les proves oficials:

```
node tools/talaia-bank.js check lot.json
```

   Genera `lot.informe.md` amb cada pregunta classificada:
   - **DUPLICADA**: ja hi és; no s'afegeix
   - **CONFLICTE**: el mateix enunciat amb una altra resposta. Cal mirar la norma (BOE, DOGC, CE, Estatut) o la Guia d'estudi i decidir quina és la bona; si la del banc és errònia, corregeix-la
   - **REPETIDA AL LOT**: surt dues vegades al mateix lot
   - **SEMBLANT**: tracta el mateix fet amb una altra formulació; decideix si aporta res
   - **NOVA**

3. Afegeix les noves (les semblants només amb `--tots`):

```
node tools/talaia-bank.js add lot.json
```

   L'eina posa identificadors, rota les opcions perquè la correcta no surti sempre al mateix lloc i no toca mai duplicades, conflictes ni repetides.

4. Comprova (`node tools/talaia-bank.js stats`), obre l'app i publica:

```
git add index.html && git commit -m "Banc: N preguntes noves de ..." && git push
```

## Altres ordres

- `stats`: recompte per àmbit i tema, proves oficials i % de preguntes on la correcta és la més llarga (objectiu: < 45%)
- `remove id1,id2`: esborra preguntes o targetes

## Criteris de contingut

- Català; formes masculines quan es parla de l'Adhiel
- Verificar contra fonts oficials (BOE, DOGC, CE, Estatut). Si no es pot confirmar, seguir el material de Flou i marcar-ho
- La resposta correcta no ha de ser la més llarga ni la més detallada
- Explicació curta amb l'article i, si escau, la prova oficial on ha sortit
