# KinTools – Plan für eine modulare Tool-Datenbank

KinTools soll weniger ein klassisches UI-Kit und mehr ein modularer Werkzeugkasten aus **headless Logik, optionalen React-Komponenten und austauschbaren Adaptern** werden. Der vorhandene `ListHandler` dient als Vorbild: produktneutral, barrierearm, typisiert und unabhängig von Backend, Sprache und Designsystem.

## Umsetzungsstand (8. September 2026)

Die erste Ausbaustufe ist umgesetzt und zentral in der Tool-Registry erfasst:

- [x] gemeinsamer npm-Workspace mit zentralen Build-, Typecheck- und Testbefehlen
- [x] versioniertes JSON-Schema für Tool-Manifeste
- [x] dependency-freier Manifest-Validator
- [x] Manifest und Registry-Eintrag für jedes vorhandene Tool
- [x] `ListHandler` als bestehendes Referenzpaket registriert
- [x] `QueryState` v0.1 mit TypeScript-Core, Browser-Adapter und optionalem React-Hook
- [x] `SelectionHandler` v0.1 mit immutablem Core und optionalem React-Hook
- [x] `FormHandler` v0.1 mit synchroner/asynchroner Validierung, Submit-Steuerung und optionalem React-Hook
- [x] `ErrorToolkit` v0.1 mit sicherer Fehlernormalisierung, Redaction und optionaler React Error Boundary
- [x] `RequestClient` v0.1 mit Fetch-Transport, Retry, Abort/Timeout, Auth-Refresh und Request-IDs

Die neuen Pakete tragen zunächst den Reifegrad `experimental`. Noch offen sind insbesondere `OverlayManager`, Pagination, Filter/Saved Views, Berechtigungen, Datei-Upload sowie das Dokumentationsportal. Bei `FormHandler` bleiben Autosave, Entwurfswiederherstellung, Wizards, Navigation Guards und Schema-Adapter bewusst spätere Erweiterungen.

## Architekturprinzipien

Größere Tools können in mehrere Ebenen aufgeteilt werden:

```text
@kintools/<tool>-core       Reine TypeScript-Logik
@kintools/<tool>-react      Hooks und React-Komponenten
@kintools/<tool>-browser    localStorage, URL, Clipboard usw.
@kintools/<tool>-styles     Optionale neutrale Styles
```

Nicht jedes Tool benötigt alle vier Pakete. Es gelten jedoch folgende Grundsätze:

- Fachlogik ist ohne React verwendbar und testbar.
- Browser-APIs liegen hinter austauschbaren Interfaces.
- Sichtbare Texte werden über Labels oder Übersetzungsadapter eingebunden.
- Styling erfolgt über CSS Custom Properties, `className` und optionale Stylesheets.
- Komponenten sind per Tastatur und Screenreader bedienbar.
- Externe Bibliotheken werden bevorzugt über Adapter integriert statt fest eingebaut.
- Pakete bleiben unabhängig von konkreten Produkten, Backends und Datenmodellen.

## Priorisierte Tools

### 1. FormHandler

Einheitliche Infrastruktur für Formulare:

- typisierte Formwerte und Feldregistrierung
- synchrone und asynchrone Validierung
- Feld-, Formular- und Serverfehler
- Zustände wie `dirty`, `touched`, `valid` und `submitting`
- Schutz vor dem Verlassen ungespeicherter Formulare
- Autosave und Wiederherstellung von Entwürfen
- mehrstufige Formulare
- Abhängigkeiten zwischen Feldern
- Fokus auf das erste fehlerhafte Feld
- Adapter für Zod, Valibot oder eigene Validatoren

Bestehende Lösungen wie React Hook Form sollen nicht vollständig nachgebaut werden. KinTools bietet stattdessen eine produktneutrale, einheitliche Abstraktion und passende Adapter.

### 2. QueryState

Typisierte Synchronisierung von UI-Zustand mit der URL:

- Filter und Suche
- Sortierung und Pagination
- Tabs und ausgewählte Datensätze
- Datumsspannen
- Serialisierung eigener Datentypen
- Entfernen von Standardwerten aus der URL
- korrekte Browsernavigation vor und zurück

`QueryState` sollte sich direkt mit dem bestehenden `ListHandler` kombinieren lassen.

### 3. SelectionHandler

Wiederverwendbare Auswahlsteuerung für Tabellen, Karten und Listen:

- einzelne und mehrere Elemente auswählen
- Bereichsauswahl mit Shift
- alle Elemente auf einer Seite auswählen
- alle Ergebnisse auswählen
- Ausnahmen aus einer Gesamtauswahl verwalten
- Massenaktionen
- maximale Auswahlgröße
- kontrollierter und unkontrollierter Zustand

### 4. OverlayManager

Gemeinsame Infrastruktur für:

- Dialoge und Bestätigungsfenster
- Drawer
- Popover und Context Menus
- Toasts
- Fokusverwaltung
- Escape-Verhalten
- Scroll-Locking
- gestapelte Overlays

Positionierung und Accessibility können auf etablierten Lösungen wie Floating UI oder Radix aufbauen.

### 5. RequestClient

Eine schmale, typisierte HTTP-Schicht:

- einheitliche Fehlerobjekte
- `AbortSignal` und Request-Abbruch
- Timeouts
- Auth-Header und Token-Refresh
- Retry-Regeln
- Upload- und Download-Fortschritt
- Request- und Korrelations-IDs
- JSON-, Text- und Dateiantworten
- austauschbarer Transport
- Mock-Transport für Tests

Caching und Server-State können weiterhin Werkzeuge wie TanStack Query übernehmen.

### 6. ErrorToolkit

Konsistente Fehlerbehandlung für die gesamte Anwendung:

- Normalisierung unbekannter Fehler
- technische und nutzerfreundliche Fehlermeldungen
- Fehlercodes
- Feldfehler aus APIs
- React Error Boundary
- Retry-Komponente
- globale Fehleranzeige
- kopierbare Support-ID
- Adapter für Sentry oder andere Monitoring-Systeme

## Weitere Komponenten für Webanwendungen

### Daten und Navigation

- `PaginationHandler`
- `FilterBuilder`
- `SearchHandler` mit Debouncing und Request-Abbruch
- `TreeHandler`
- `TabsHandler`
- `BreadcrumbBuilder`
- `CommandPalette`
- `RecentItems`
- `SavedViews` für gespeicherte Filter- und Tabelleneinstellungen
- `DataExport` für CSV, JSON und XLSX
- `DataImport` mit Mapping, Vorschau und Fehlerbericht

### Formulare und Eingabe

- `Combobox`
- `MultiSelect`
- `DateRangePicker`
- `TagInput`
- `EditableField`
- `InlineEdit`
- `FileUpload`
- `RichTextAdapter`
- `AddressInput`
- `UnsavedChangesGuard`
- `WizardHandler`

Komplexe Widgets müssen nicht vollständig neu implementiert werden. KinTools kann zugängliche Zustandslogik, gemeinsame Props und Adapter bereitstellen.

### Berechtigungen und Produktsteuerung

- `PermissionEvaluator`
- `PermissionGuard`
- `FeatureFlag`
- `TenantContext`
- `ImpersonationContext`
- `EnvironmentBanner`
- `ReadOnlyMode`

Der Permission Evaluator soll auch als reine TypeScript-Funktion nutzbar sein:

```ts
can(user, "ticket.update", {
  ticket,
  tenant,
});
```

React-Komponenten sind lediglich Adapter für diese Logik.

### Benutzerinteraktion

- `ConfirmAction`
- `ToastQueue`
- `UndoAction`
- `CopyToClipboard`
- `KeyboardShortcuts`
- `HotkeyScope`
- `DragAndDropHandler`
- `Disclosure`
- `EmptyState`
- `LoadingState`
- `ProgressTracker`

### Dateien und Medien

- Upload-Warteschlange
- Größen- und Dateitypvalidierung
- Vorschaubilder
- Mehrfach-Upload
- Chunked Upload
- Wiederaufnahme abgebrochener Uploads
- Download-Helfer
- Drag-and-drop
- austauschbarer Storage-Adapter
- sichere Dateinamenbehandlung

### Authentifizierung und Sitzung

KinTools stellt keinen eigenen Identity Provider bereit, sondern eine Integrationsschicht:

- `SessionProvider`
- Login-Status
- Rollen und Claims
- Warnung vor Sitzungsablauf
- Koordination des Token-Refreshs
- Weiterleitung nach dem Login
- Multi-Tab-Logout
- OIDC- und OAuth-Adapter
- Mock-Session für Storybook und Tests

### Beobachtbarkeit und Support

- strukturierter Logger
- Korrelations- und Request-IDs
- Error-Reporting-Adapter
- Performance-Messung
- Audit-Event-Builder
- Diagnoseinformationen
- Support-Bundle ohne sensible Daten
- Development Debug Panel

## Übergreifende TypeScript-Werkzeuge

Kleine Pakete mit hoher Wiederverwendbarkeit:

- `Result<T, E>` und typisierte Fehler
- `AsyncState<T>`
- Event-Bus mit typisierten Events
- `assertNever` und Exhaustiveness-Helfer
- Objekt- und Collection-Helfer
- Deep-Path-Zugriff
- Sortierungs- und Vergleichsfunktionen
- Normalisierung von Suchtext
- Datums- und Zahlenformatierung mit `Intl`
- sichere JSON-Serialisierung
- Debounce und Throttle
- Retry mit Backoff
- ID-Generierung
- Maskierung sensibler Werte
- kleine State-Machine-Grundlage

## Tool-Registry

Damit KinTools eine einheitliche Tool-Datenbank und nicht nur eine Sammlung von Ordnern wird, erhält jedes Tool ein maschinenlesbares Manifest, beispielsweise:

```json
{
  "name": "ListHandler",
  "package": "@jankincheloe/list-handler",
  "category": "data-display",
  "status": "stable",
  "targets": ["react", "browser"],
  "features": ["sorting", "resizing", "column-visibility"],
  "accessibility": true,
  "dependencies": [],
  "documentation": "./README.md"
}
```

Auf Basis dieser Manifeste können später automatisch erzeugt werden:

- ein durchsuchbarer Tool-Katalog
- generierte Dokumentation
- Kompatibilitätsübersichten
- ein Abhängigkeitsgraph
- Storybook oder eine eigene Demo-Anwendung
- Änderungsprotokolle
- Reifegrade wie `experimental`, `beta` und `stable`
- Prüfungen gemeinsamer Qualitätsstandards

## Qualitätsstandard für jedes Tool

Ein Tool gilt als veröffentlichungsbereit, wenn es mindestens Folgendes besitzt:

- klar definierte öffentliche API
- vollständige TypeScript-Typen
- Unit-Tests für die Kernlogik
- Accessibility-Prüfung für React-Komponenten
- README mit Installation, Beispiel und API-Beschreibung
- Beispiel oder Story
- Changelog
- deklarierte Browser- und React-Kompatibilität
- keine produktbezogenen Farben, Texte oder Datenmodelle
- definierte Strategie für Breaking Changes

## Roadmap

### Phase 1 – Fundament

1. Gemeinsame Paket-, Build-, Test- und Manifest-Konventionen festlegen.
2. Repository als Workspace organisieren, ohne die unabhängige Nutzbarkeit der Pakete aufzugeben.
3. Registry-Schema und Qualitätsprüfung erstellen.
4. `ListHandler` auf die neuen Konventionen umstellen und als Referenzpaket dokumentieren.

### Phase 2 – Listen und Navigation

1. `QueryState` entwickeln.
2. `SelectionHandler` entwickeln.
3. Beide Werkzeuge optional in `ListHandler` integrieren.
4. `PaginationHandler`, `FilterBuilder` und `SavedViews` ergänzen.

### Phase 3 – Anwendungsgrundlagen

1. `FormHandler` entwickeln.
2. `ErrorToolkit` entwickeln.
3. `OverlayManager` entwickeln.
4. `RequestClient` entwickeln.

### Phase 4 – Geschäftsanwendungen

1. `PermissionEvaluator` und `PermissionGuard` entwickeln.
2. `FileUpload` entwickeln.
3. Import- und Exportwerkzeuge ergänzen.
4. Session-, Feature-Flag- und Observability-Adapter ergänzen.

### Phase 5 – Katalog und Dokumentation

1. Durchsuchbares Dokumentationsportal aus den Manifesten generieren.
2. Interaktive Beispiele für alle React-Komponenten anbieten.
3. Abhängigkeiten, Reifegrad und Kompatibilität sichtbar machen.
4. Release- und Changelog-Prozess automatisieren.

## Empfohlener nächster Schritt

Als nächste konkrete Tools bieten sich `QueryState` und anschließend `SelectionHandler` an. Beide sind überschaubar, stark wiederverwendbar und unmittelbar mit dem vorhandenen `ListHandler` kombinierbar. Parallel dazu sollten die Paket- und Manifest-Konventionen definiert werden, damit alle weiteren Werkzeuge von Beginn an einheitlich aufgebaut sind.
