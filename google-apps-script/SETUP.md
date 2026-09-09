# Google-Sheets-Datenerfassung einrichten

Die Ziel-Tabelle ist bereits im Script über ihre ID hinterlegt. Der sichtbare
Kassenablauf wird durch die Datenerfassung nicht verändert.

## Einmalige Einrichtung

1. Die Google-Tabelle öffnen und **Erweiterungen → Apps Script** wählen.
2. Den Inhalt aus `Code.gs` vollständig in die gleichnamige Scriptdatei kopieren.
3. In den Projekteinstellungen die Manifestdatei einblenden und den Inhalt aus
   `appsscript.json` übernehmen.
4. Im Funktionsmenü `setupSheets` auswählen, einmal ausführen und die benötigte
   Berechtigung für diese Tabelle bestätigen.
5. In **Bereitstellen → Neue Bereitstellung → Web-App** wählen:
   - Ausführen als: **Ich**
   - Zugriff: **Jeder**
6. Die Web-App-URL mit der Endung `/exec` kopieren und in `config.js` unter
   `DATA_COLLECTION.endpoint` eintragen.
7. Im Tabellenblatt `Einstellungen` den Wert in `B2` auf `AKTIV` setzen.

## Aktiv-Schalter

Nur wenn `Einstellungen!B2` exakt `AKTIV` enthält, nimmt das Script neue
Bestellungen an. Bei `INAKTIV` werden eingehende Bestellungen verworfen und aus
der lokalen Warteschlange entfernt. Das Umschalten benötigt kein GitHub-Update.

## Warteschlange und Duplikate

Beim Tippen auf **Fertig** wird die Bestellung zuerst im lokalen Browserspeicher
des Kassengeräts abgelegt. Bei fehlender Verbindung versucht die App die
Übertragung später erneut. Jede Bestellung besitzt eine eindeutige ID; das
Apps Script schreibt eine bereits vorhandene ID kein zweites Mal.

Die Browserdaten des Kassengeräts sollten während einer Veranstaltung nicht
gelöscht werden, solange möglicherweise noch Offline-Bestellungen vorgemerkt
sind.
