# KinTools einbinden

Diese Anleitung beschreibt die Einbindung der KinTools-Pakete in React-/TypeScript-Anwendungen. Jedes Tool ist separat installierbar. Anwendungen müssen daher nur die Pakete übernehmen, die sie tatsächlich verwenden.

## Voraussetzungen

- Node.js 18 oder neuer für Entwicklung, Builds und den `RequestClient`
- TypeScript 5 oder neuer empfohlen
- React 18 oder 19 nur für Importe aus einem `/react`-Subpfad
- ReactDOM zusätzlich für `ListHandler` und den React-Adapter des `OverlayManager`

## Installation aus einer Registry

Nach Veröffentlichung lassen sich mehrere Tools gemeinsam installieren:

```bash
npm install \
  @jankincheloe/list-handler \
  @jankincheloe/query-state \
  @jankincheloe/selection-handler \
  @jankincheloe/pagination-handler \
  @jankincheloe/form-handler \
  @jankincheloe/request-client \
  @jankincheloe/error-toolkit \
  @jankincheloe/overlay-manager \
  @jankincheloe/permission-evaluator \
  @jankincheloe/filter-builder \
  @jankincheloe/saved-views \
  @jankincheloe/draft-handler \
  @jankincheloe/file-upload \
  @jankincheloe/data-export \
  @jankincheloe/command-registry \
  @jankincheloe/history-handler \
  @jankincheloe/storage-state \
  @jankincheloe/task-queue
```

Die Pakete sind derzeit mit Version `0.1.0` und dem Registry-Reifegrad `experimental` angelegt. Vor einer externen Veröffentlichung sollten Paketname, Registry-Ziel und Versionierungsprozess geprüft werden.

## Lokale Einbindung vor der Veröffentlichung

Ein Tool muss zunächst gebaut werden, weil seine Package-Exports auf `dist` zeigen:

```bash
npm --prefix ../KinTools/QueryState install
npm --prefix ../KinTools/QueryState run build
npm install ../KinTools/QueryState
```

Für aktive Entwicklung ist eine `file:`-Abhängigkeit im Zielprojekt praktisch:

```json
{
  "dependencies": {
    "@jankincheloe/query-state": "file:../KinTools/QueryState"
  }
}
```

Nach Änderungen muss das KinTools-Paket erneut gebaut werden. Abhängig vom Paketmanager kann zusätzlich eine Neuinstallation oder Aktualisierung der lokalen Abhängigkeit nötig sein.

## Import-Konvention

| Tool | React-freier Import | Optionaler React-Import | Weitere Assets |
| --- | --- | --- | --- |
| ListHandler | `@jankincheloe/list-handler/core` | `@jankincheloe/list-handler` | `@jankincheloe/list-handler/styles.css` |
| QueryState | `@jankincheloe/query-state` oder `/core` | `@jankincheloe/query-state/react` | Browser-Adapter im Root-Import |
| SelectionHandler | `@jankincheloe/selection-handler` oder `/core` | `@jankincheloe/selection-handler/react` | – |
| PaginationHandler | `@jankincheloe/pagination-handler` oder `/core` | `@jankincheloe/pagination-handler/react` | – |
| FormHandler | `@jankincheloe/form-handler` oder `/core` | `@jankincheloe/form-handler/react` | – |
| RequestClient | `@jankincheloe/request-client` | – | Fetch-Plattform-APIs |
| ErrorToolkit | `@jankincheloe/error-toolkit` oder `/core` | `@jankincheloe/error-toolkit/react` | – |
| OverlayManager | `@jankincheloe/overlay-manager` oder `/core` | `@jankincheloe/overlay-manager/react` | DOM-Helfer unter `/dom` |
| PermissionEvaluator | `@jankincheloe/permission-evaluator` oder `/core` | `@jankincheloe/permission-evaluator/react` | – |
| FilterBuilder | `@jankincheloe/filter-builder` oder `/core` | `@jankincheloe/filter-builder/react` | – |
| SavedViews | `@jankincheloe/saved-views` oder `/core` | `@jankincheloe/saved-views/react` | Speicheradapter aus der Anwendung |
| DraftHandler | `@jankincheloe/draft-handler` oder `/core` | `@jankincheloe/draft-handler/react` | Asynchroner Persistenzadapter |
| FileUpload | `@jankincheloe/file-upload` oder `/core` | `@jankincheloe/file-upload/react` | XHR-Transport unter `/browser` |
| DataExport | `@jankincheloe/data-export` oder `/core` | – | Download unter `/browser` |
| CommandRegistry | `@jankincheloe/command-registry` oder `/core` | `@jankincheloe/command-registry/react` | Tastenkürzel unter `/browser` |
| HistoryHandler | `@jankincheloe/history-handler` oder `/core` | `@jankincheloe/history-handler/react` | – |
| StorageState | `@jankincheloe/storage-state` oder `/core` | `@jankincheloe/storage-state/react` | Browser-Speicher unter `/browser` |
| TaskQueue | `@jankincheloe/task-queue` oder `/core` | `@jankincheloe/task-queue/react` | – |

Die expliziten `/react`-Subpfade verhindern, dass React in Server-, Worker- oder reinen TypeScript-Modulen unnötig geladen wird.

## Listenansicht mit URL, Pagination und Auswahl

`QueryState` hält Navigation in der URL, `PaginationHandler` berechnet den Seitenzustand, `SelectionHandler` verwaltet ausgewählte IDs und `ListHandler` rendert die Tabelle.

```tsx
import { ListHandler, type ReactListColumn } from "@jankincheloe/list-handler";
import "@jankincheloe/list-handler/styles.css";
import { defineQueryField, numberCodec } from "@jankincheloe/query-state";
import { useQueryState } from "@jankincheloe/query-state/react";
import { usePagination } from "@jankincheloe/pagination-handler/react";
import { useSelection } from "@jankincheloe/selection-handler/react";

type Person = { id: string; name: string };

const querySchema = {
  page: defineQueryField(numberCodec, 1),
  pageSize: defineQueryField(numberCodec, 25),
};

const columns: ReactListColumn<Person>[] = [
  { id: "name", header: "Name", cell: (person) => person.name },
];

export function PeopleTable({ people }: { people: Person[] }) {
  const query = useQueryState(querySchema);
  const pagination = usePagination({
    mode: "page",
    value: {
      mode: "page",
      page: query.values.page,
      pageSize: query.values.pageSize,
      totalItems: people.length,
    },
    onChange: (next) => {
      if (next.mode === "page") {
        query.set({ page: next.page, pageSize: next.pageSize }, { mode: "push" });
      }
    },
  });
  const selection = useSelection<string>();
  const state = pagination.state;
  const visible = state.mode === "page"
    ? people.slice((state.page - 1) * state.pageSize, state.page * state.pageSize)
    : people;

  return (
    <>
      <ListHandler
        items={visible}
        columns={columns}
        getRowKey={(person) => person.id}
        caption="People"
      />
      <button disabled={!pagination.info.canPrevious} onClick={pagination.previous}>Zurück</button>
      <button disabled={!pagination.info.canNext} onClick={pagination.next}>Weiter</button>
      <button onClick={() => selection.selectPage(visible.map((person) => person.id))}>
        Sichtbare auswählen
      </button>
    </>
  );
}
```

Bei serverseitiger Pagination werden `page` und `pageSize` an den Daten-Request übergeben. `totalItems`, `itemCount` oder `hasNext` kommen aus der Serverantwort zurück.

## Formular, Request und sichere Fehleranzeige

`FormHandler` steuert Werte und Validierung. `RequestClient` übernimmt HTTP. `ErrorToolkit` trennt Diagnoseinformationen von sicher anzeigbaren Texten.

```tsx
import { createRequestClient } from "@jankincheloe/request-client";
import { normalizeError } from "@jankincheloe/error-toolkit";
import { useFormHandler } from "@jankincheloe/form-handler/react";

const api = createRequestClient({ baseUrl: "https://api.example.test/" });

export function ProfileForm() {
  const { state, form } = useFormHandler({
    initialValues: { email: "" },
    fields: {
      email: { validate: (value) => value.includes("@") ? undefined : "Ungültige E-Mail-Adresse" },
    },
  });

  const save = async () => {
    await form.submit(async (values) => {
      try {
        await api.post("profile", values);
      } catch (thrown) {
        const error = normalizeError(thrown, {
          userMessage: "Das Profil konnte nicht gespeichert werden.",
        });
        const emailError = error.fieldErrors.email?.[0];
        form.setServerErrors(emailError ? { email: emailError } : {}, error.userMessage);
        // FormHandler markiert den Submit nur bei einem Throw als fehlgeschlagen.
        throw new Error(error.userMessage);
      }
    });
  };

  return (
    <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <input
        value={state.values.email}
        onChange={(event) => form.setValue("email", event.target.value)}
        onBlur={() => form.markTouched("email")}
        aria-invalid={Boolean(state.errors.email)}
      />
      {state.errors.email && <p role="alert">{state.errors.email}</p>}
      {state.formError && <p role="alert">{state.formError}</p>}
      <button disabled={state.submitting}>Speichern</button>
    </form>
  );
}
```

Technische Fehlermeldungen und Response-Bodies dürfen nicht ungeprüft in der Oberfläche erscheinen. Für Logging kann `serializeAppError` verwendet werden; sensible Schlüssel werden dabei redigiert.

## Overlays einbinden

Der `OverlayManager` liefert Mechanik, aber bewusst kein Dialogdesign und keine automatisch erfundenen ARIA-Beschriftungen:

```tsx
import { OverlayProvider, useOverlay } from "@jankincheloe/overlay-manager/react";

type AppOverlays = {
  confirmDelete: { recordId: string };
};

export function App() {
  return (
    <OverlayProvider<AppOverlays>
      render={(entry, { close }) => (
        <section role="dialog" aria-modal={entry.modal} aria-labelledby={`${entry.id}-title`}>
          <h2 id={`${entry.id}-title`}>Datensatz löschen?</h2>
          <button onClick={close}>Abbrechen</button>
        </section>
      )}
    >
      <Page />
    </OverlayProvider>
  );
}

function Page() {
  const overlay = useOverlay<AppOverlays>();
  return (
    <button onClick={() => overlay.open("confirmDelete", { recordId: "42" }, { modal: true })}>
      Löschen
    </button>
  );
}
```

Der Renderer bleibt für Rolle, zugänglichen Namen, Beschreibung, sichtbaren Fokus und die eigentliche Aktion verantwortlich.

## Berechtigungen einbinden

Policies werden außerhalb der Komponenten erstellt. Der React-Provider erhält den aktuellen Benutzer und den Evaluator:

```tsx
import { createPermissionEvaluator } from "@jankincheloe/permission-evaluator";
import { PermissionGuard, PermissionProvider } from "@jankincheloe/permission-evaluator/react";

type Action = "ticket.read" | "ticket.update";
type Role = "agent" | "manager";

const permissions = createPermissionEvaluator<Action, Role>({
  actions: ["ticket.read", "ticket.update"],
  rules: [
    { effect: "allow", action: "ticket.read", roles: ["agent", "manager"] },
    { effect: "allow", action: "ticket.update", roles: ["manager"] },
  ],
});

<PermissionProvider user={user} evaluator={permissions}>
  <PermissionGuard<Action> action="ticket.update" fallback={null}>
    <button>Ticket bearbeiten</button>
  </PermissionGuard>
</PermissionProvider>;
```

Die Prüfung im Browser verbessert die Bedienoberfläche, ist aber keine Sicherheitsgrenze. Das Backend muss jede relevante Berechtigung erneut anhand vertrauenswürdiger Identitäts- und Ressourcendaten prüfen.

## Filter, gespeicherte Ansichten und Export

`FilterBuilder` definiert die Filterlogik. `QueryState` kann deren JSON-String
über einen `stringCodec` in der URL halten. `SavedViews` speichert dauerhafte
Ansichten; `DataExport` exportiert anschließend die gewünschten Datensätze.

```ts
import { createFilterBuilder, parseFilter } from "@jankincheloe/filter-builder";
import { createSavedViews } from "@jankincheloe/saved-views";
import { createMemoryStorage } from "@jankincheloe/storage-state";
import { exportCsv } from "@jankincheloe/data-export";

type Person = { name: string };
const schema = { name: { type: "text" as const, getValue: (person: Person) => person.name } };
const filter = createFilterBuilder(schema);
filter.set({ field: "name", operator: "contains", value: "Ada" });

type View = { filter: string };
const adapter = createMemoryStorage();
const views = createSavedViews<View>({
  validate: (value): value is View => {
    if (!value || typeof value !== "object" || !("filter" in value) || typeof value.filter !== "string") return false;
    try { parseFilter(schema, value.filter); return true; } catch { return false; }
  },
  storage: { read: () => adapter.read("people:views"), write: (source) => adapter.write("people:views", source) },
});
const saved = views.save({ name: "Ada", value: { filter: filter.serialize() } });
views.apply(saved.id, (value) => filter.set(parseFilter(schema, value.filter)));
const csv = exportCsv(filter.filter([{ name: "Ada" }, { name: "Grace" }]), [
  { key: "name", header: "Name", value: (person) => person.name },
]);
```

Ein Browser-Speicher kann `createMemoryStorage()` durch `createBrowserStorage()`
aus `@jankincheloe/storage-state/browser` ersetzen. Views sollten Filter,
Sortierung, Spalten und Seitengröße enthalten. Antwortmetadaten, Cursor-Historie
und eine vorübergehende Zeilenauswahl bleiben im aktuellen Anwendungszustand.
Bei serverseitiger Pagination muss ein Export aller Treffer durch die Anwendung
geladen oder serverseitig erzeugt werden; die Tools erfinden keine fehlenden Daten.

## Formulare mit Entwurfssicherung

Ein `DraftHandler` erhält geänderte Formwerte über eine Subscription oder einen
Effect. `flush()` wartet auf die neueste Fassung. Eine Wiederherstellung erfolgt
vor dem Verbinden der Formänderungen mit der Entwurfssicherung.

```ts
import { createFormHandler } from "@jankincheloe/form-handler";
import { createDraftHandler } from "@jankincheloe/draft-handler";
import { createStorageState } from "@jankincheloe/storage-state";

type Values = { text: string };
const validate = (value: unknown): value is Values => Boolean(value && typeof value === "object"
  && "text" in value && typeof value.text === "string");
const storage = createStorageState({ key: "profile:draft", initialValue: { text: "" }, validate });
const draft = createDraftHandler({
  initialValue: { text: "" }, validate,
  persistence: {
    save: (value) => { if (!storage.set(value)) throw storage.getState().error; },
    load: () => storage.getState().value,
  },
});
const form = createFormHandler({ initialValues: { text: "" } });
if (await draft.restore()) form.reset(draft.getState().value);
let lastText = form.getState().values.text;
const unsubscribe = form.subscribe(() => {
  const values = form.getState().values;
  if (values.text !== lastText) { lastText = values.text; draft.set(values); }
});
form.setValue("text", "Entwurf");
await draft.flush();
unsubscribe(); draft.dispose(); storage.dispose();
```

Das Beispiel verwendet standardmäßig Speicher im Arbeitsspeicher. Für dauerhafte
Entwürfe erhält `StorageState` einen Browser-Adapter. Für Remote-Autosave verwendet
`DraftHandler` einen asynchronen Adapter, beispielsweise einen RequestClient-Aufruf,
der das übergebene `AbortSignal` berücksichtigt.

## Uploads, Aktionen und React-Lebenszyklus

`FileUpload` übernimmt Dateiprüfung und Ablaufsteuerung. Sein `/browser`-Adapter
`createXhrUploadTransport` sendet Multipart-Daten und meldet Upload-Fortschritt.
`TaskQueue` bietet dieselben grundlegenden Abläufe für beliebige Aufgaben wie
Massenaktionen. Abbruch sendet ein Signal; laufende Arbeit behält ihren Platz,
bis die tatsächliche Promise endet. Wiederholungen sind explizit.

`CommandRegistry` kann `PermissionEvaluator` und `SelectionHandler` im eigenen
Kontext verwenden. `available` entscheidet über die Bedienoberfläche; `execute`
prüft den Kontext erneut und verhindert eine parallele Ausführung derselben
Aktion. Tastenkürzel lassen sich an die aktiven Overlay-/Editor-Scopes binden.
`HistoryHandler` steuert lokale Undo/Redo-Schritte; serverseitige Aktionen brauchen
eigene Gegenaktionen.

Die acht neuen React-Hooks erhalten einen bereits existierenden Controller und
geben `{ state, <controller> }` zurück. Die Controllerinstanz gehört der Anwendung.
Sie wird einmal pro gewünschtem Lebenszyklus erstellt und dort gegebenenfalls
mit `dispose()` aufgeräumt. Die Hooks führen beim Rendern keine Uploads, Saves
oder Browser-Bindings aus. Controller mit Seiteneffekten können in einem Effect
erstellt und vor der Instanzierung mit einer Ladeansicht überbrückt werden;
so bleiben Setup/Cleanup auch im React Strict Mode korrekt.

SSR-Controller gehören jeweils zu einer Anfrage. Server und Client müssen für
die Hydration denselben Ausgangszustand verwenden; Browser-Persistenz kann nach
der Hydration angebunden werden. Die Pakete bleiben separat installierbar und
erzwingen keine gegenseitigen KinTools-Abhängigkeiten.

## Qualität im KinTools-Repository prüfen

Von der Repository-Wurzel aus:

```bash
npm run validate:manifests
npm run typecheck
npm test
npm run build
```

`npm test` prüft zusätzlich gemeinsame Abläufe, React-SSR und ESM-/CommonJS-
Importe ohne Laden des optionalen React-Peers. Details zu API und Randfällen
stehen in der jeweiligen Tool-README. Registry-Felder und Reifegrade sind in
[tool-manifests.md](./tool-manifests.md) beschrieben.
