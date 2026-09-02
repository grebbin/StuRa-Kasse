# StuRa Kasse

Eine kleine mobile Web-App für Getränkebestellungen, Pfandrückgabe und eine
nachvollziehbare Bonansicht. Sie besteht nur aus HTML, CSS und JavaScript und
kann deshalb direkt über GitHub Pages veröffentlicht werden.

## Party und Getränke ändern

Alle Daten stehen in [`config.js`](./config.js). Entscheidend ist diese Zeile:

```js
const ACTIVE_PARTY_ID = "semesterparty";
```

Der Wert muss zu einer Party weiter unten in `PARTIES` passen. Eine Party sieht
zum Beispiel so aus:

```js
semesterparty: {
  name: "Semesterparty",
  deposit: 1.0,
  drinks: [
    { id: "bier", abbreviation: "BI", name: "Bier", price: 2.5 },
    { id: "wasser", abbreviation: "WA", name: "Wasser", price: 1.5 },
  ],
},
```

- `id`: technisch eindeutiger Name ohne Leerzeichen oder Umlaute
- `abbreviation`: die große, möglichst zweistellige Beschriftung der Kachel
- `name`: ausgeschriebener Name für Bestellung und Bon
- `price`: Preis als Zahl; Dezimalstellen werden mit einem Punkt geschrieben
- `deposit`: einheitlicher Pfandwert für diese Party

Weitere Partys können innerhalb von `PARTIES` nach demselben Muster ergänzt
werden. Es erscheint bewusst keine Party-Auswahl in der App: Für einen Wechsel
wird nur `ACTIVE_PARTY_ID` geändert und die Änderung veröffentlicht.

## Bedienung

1. Eine Getränkekachel so oft antippen, wie das Getränk bestellt wurde.
2. Mit dem kleinen Minus unten rechts in einer markierten Kachel korrigieren.
3. Über **Weiter** zur Pfandrückgabe wechseln.
4. Mit Plus und Minus die zurückgegebenen Pfandartikel zählen. Bei keinem Pfand bleibt der Zähler auf 0. Der Berechnen-Button zeigt entsprechend „mit Pfand“ oder „ohne Pfand“ an.
5. Endbetrag und Einzelpositionen prüfen. **Fertig** leert alles für den nächsten Kunden.

Ein sichtbarer Minus-Knopf ist absichtlich statt „lange drücken“ eingebaut:
Long-Press kollidiert auf Smartphones mit Browsergesten, ist schlecht entdeckbar
und kann im hektischen Betrieb leichter versehentlich ausgelöst werden.

## Lokal starten

Zum schnellen Prüfen kann `index.html` direkt im Browser geöffnet werden. Ein
lokaler Webserver bildet GitHub Pages etwas genauer nach, zum Beispiel mit:

```powershell
python -m http.server 8000
```

Danach `http://localhost:8000` öffnen.

## Über GitHub Pages veröffentlichen

1. Dateien committen und in ein GitHub-Repository pushen.
2. Auf GitHub **Settings → Pages** öffnen.
3. Unter **Build and deployment** die Quelle **Deploy from a branch** wählen.
4. Den Branch `main` und den Ordner `/ (root)` auswählen und speichern.
5. Nach kurzer Zeit zeigt GitHub dort die öffentliche Adresse an.

Da kein Build-Schritt nötig ist, veröffentlicht GitHub genau diese Dateien.

## Aufbau

- `index.html`: Inhalte und die drei Ansichten der App
- `styles.css`: Layout, Farben, responsive Kacheln und mobile Bedienflächen
- `config.js`: aktive Party, Getränkeliste, Preise und Pfand
- `app.js`: Auswahl, Berechnung, Ansichtswechsel und Bon

Geldbeträge werden intern als JavaScript-Zahlen behandelt. Für typische
Getränkepreise ist das ausreichend; die Anzeige wird stets als deutscher
Eurobetrag auf zwei Nachkommastellen formatiert.
