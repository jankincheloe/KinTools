# Tool-Manifeste

Jedes veröffentlichbare KinTools-Paket besitzt im Paketverzeichnis eine Datei
`tool-manifest.json`. Das Manifest ist der Registry-Eintrag für Kataloge,
Dokumentationsgeneratoren und spätere Kompatibilitätsprüfungen. Das verbindliche
JSON-Schema liegt in [`tool-manifest.schema.json`](../tool-manifest.schema.json).

## Konventionen

- Die Datei heißt exakt `tool-manifest.json` und liegt neben `package.json`.
- `schemaVersion` ist aktuell `1`.
- `name` ist der lesbare Toolname; `package` und `version` müssen exakt den
  Werten aus `package.json` entsprechen.
- `category`, `features` und die Werte in `targets` sind kleingeschrieben und
  für Katalogfilter geeignet. Erlaubte Targets sind `core`, `react`, `browser`,
  `node` und `styles`.
- `status` ist einer von `experimental`, `beta`, `stable` oder `deprecated`.
- `dependencies` beschreibt ausschließlich Abhängigkeiten zu anderen
  KinTools-Paketen. Externe Laufzeit-, Peer- und Entwicklungsabhängigkeiten
  werden in `package.json` gepflegt.
- `documentation` ist ein sicherer relativer Pfad innerhalb des
  Paketverzeichnisses, üblicherweise `./README.md`.
- `accessibility` dokumentiert, ob Accessibility ein bewusst geprüfter Teil des
  Tools ist; es ersetzt keine komponentenspezifischen Tests.

Ein minimales gültiges Manifest sieht so aus:

```json
{
  "schemaVersion": 1,
  "name": "ListHandler",
  "package": "@jankincheloe/list-handler",
  "version": "0.1.0",
  "description": "Accessible, theme-neutral React table handler.",
  "category": "data-display",
  "status": "stable",
  "targets": ["react", "browser"],
  "features": ["sorting"],
  "accessibility": true,
  "dependencies": [],
  "documentation": "./README.md"
}
```

## Prüfung

Von der Repository-Wurzel aus:

```bash
npm run validate:manifests
```

Der dependency-freie Node-Validator läuft mit Node 18 oder neuer, findet alle
`tool-manifest.json`-Dateien (ausgenommen `node_modules`, `dist`, `coverage`
und `.git`) und prüft Schema, JSON-Syntax, Paketname/-version,
Dokumentationspfad, Duplikate sowie Selbstabhängigkeiten.

- Exit `0`: alle Manifeste sind gültig.
- Exit `1`: mindestens ein Manifest verletzt eine Regel.
- Exit `2`: die Validierung konnte wegen eines fehlenden oder ungültigen
  Validatorschemas nicht eingerichtet werden.

Weitere zentrale Befehle delegieren an die unabhängigen Workspace-Pakete:

```bash
npm run typecheck   # typecheck in allen Workspaces, sofern vorhanden
npm test            # Manifestprüfung und Tests aller Workspaces
npm run build       # Build aller Workspaces, sofern vorhanden
```
