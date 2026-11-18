# Frifrigobot

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Fscut29%2Ffrifrigobot)

Bot Telegram condiviso per scadenze alimentari e durata dopo apertura. Cloudflare Workers Free + D1 Free; nessun servizio a pagamento previsto.

## Contenuto

`worker.js` è il bundle completo pronto per Cloudflare. `Frifrigobot-sorgenti.zip` contiene il codice modulare completo, i 19 test locali superati, il resoconto e la documentazione. Per sviluppare e verificare: estrarre i sorgenti, eseguire `npm ci` e `npm test` con Node 24. Nessuna credenziale è inclusa nel progetto.

## Pubblicazione

Il pulsante apre il flusso ufficiale Cloudflare nel proprio browser. Scegliere esclusivamente Workers Free. Il flusso crea il database; il comando deploy applica la migrazione prima di pubblicare. I quattro valori in `.dev.vars.example` sono segnaposto: inserire i veri valori esclusivamente nei segreti Cloudflare.

- BOT_TOKEN: token di @Frifrigobot fornito da BotFather.
- WEBHOOK_SECRET: stringa casuale di 32–256 caratteri alfanumerici, trattini o underscore.
- CHAT_ID: ID numerico del solo gruppo Telegram privato, con segno meno.
- ALLOWED_USER_IDS: due ID Telegram distinti separati da virgola.

Dopo la pubblicazione aprire `/setup` sull’indirizzo del Worker e inserire il WEBHOOK_SECRET scelto. La pagina registra il webhook e accoda un unico messaggio iniziale nel gruppo. Solo il gruppo e gli utenti autorizzati possono usare l’inventario.

## Funzioni

Inventario per confezione, aggiunta guidata con durata ricordata, apertura oggi o precedente, scadenza minima fra confezione e dopo apertura, categorie, quantità, modifiche, terminato, annullamento, CSV con recupero, notifiche alle 8 italiane configurabili e ora legale automatica. Menu in italiano.

Il servizio è pubblicato. Sono in corso i collaudi reali nel gruppo Telegram e la verifica dei due telefoni. La Bot API non consente una garanzia assoluta di invio esattamente una volta dopo una risposta di rete persa: la coda persistente deduplica gli invii ordinari e ritenta gli errori.

## Creazione D1 nel deploy ordinario

Il comando `npm run deploy` ora esegue `deploy.mjs`: cerca il database per nome, lo crea solo se assente, scrive il suo ID reale in una configurazione temporanea esclusa da Git, applica le migrazioni e pubblica il Worker. I deploy successivi riutilizzano lo stesso database. Il token usato da Workers Builds deve avere anche **Account → D1 → Edit**. I token creati automaticamente da Workers Builds possono non includere questo permesso; si modifica dal profilo Cloudflare, senza condividere il token. Nessuna operazione attiva piani a pagamento.

## Versione 1.0.1

La pagina `/health` riporta la versione del Worker per distinguere le pubblicazioni e verificare la persistenza dei dati D1 dopo il ricambio del runtime.

## Versione 1.1.0

- Nessun codice tecnico nei messaggi, nei pulsanti e nelle notifiche. Le confezioni omonime sono indicate come confezione 1, confezione 2.
- All’aggiunta scegliere **Solo scadenza** oppure **Giorni dopo apertura**. La scelta viene ricordata. Nei dettagli **Modifica → Solo scadenza** converte un prodotto esistente; **Giorni dopo apertura** ripristina la gestione dell’apertura.
- Inventario e Scadenze mostrano sezioni separate per ciascun giorno rimanente, indipendentemente dall’apertura.
- La migrazione 0002 conserva i prodotti e corregge le uova inserite con la durata provvisoria di 365 giorni.
- CSV aggiornato con modalità di apertura; lettura dei vecchi CSV ancora supportata.
- 23 test automatici superati, inclusi migrazione, modalità senza apertura e raggruppamento giornaliero.

## Versione 1.2.0 — chat compatta

Menu e inventario vengono aggiornati nello stesso messaggio. Le domande e le risposte di una procedura vengono rimosse dopo la consegna del passo successivo. Ogni utente ha il proprio pannello, per non cancellare la domanda ancora in uso dell’altra persona. Solo le risposte dirette alle domande del bot e i comandi riconosciuti vengono ripuliti; conversazioni, notifiche e CSV restano visibili. Il bot necessita del permesso di eliminare messaggi per ripulire anche le risposte degli utenti. I vecchi messaggi anteriori all’aggiornamento non vengono cancellati in blocco.

Migrazione 0003: pannelli personali e coda persistente per ritentare le cancellazioni fallite. Gli alimenti non vengono modificati. Test: 29 superati, inclusi casi di risposta Telegram persa/rifiutata, pannello eliminato manualmente e procedure indipendenti. Pubblicazione e test reali ancora da completare.

## Versione 1.2.1 — migrazione del gruppo

Recupera il nuovo ID se il gruppo è stato convertito in supergruppo. Accetta esclusivamente un redirect confermato dalla Bot API per il gruppo già autorizzato; nomi e campi inoltrati da utenti non autorizzano altri gruppi. La relazione viene conservata in D1 ed è usata anche dal cron. Le confezioni non vengono toccate. Vecchi pannelli, procedure incomplete e cancellazioni riferite al vecchio gruppo vengono invalidati per evitare collisioni tra ID messaggio. 33 test automatici superati.

## Versione 1.2.2

Nell’inventario i giorni rimanenti compaiono solo nell’intestazione della sezione. Sotto gli alimenti rimane la data di apertura, quando presente. La scheda del singolo prodotto e gli avvisi conservano le indicazioni sulla scadenza. Controllo sintattico e test esistente dell’inventario per giorno superati.

## Versione 1.2.3

Una riga vuota separa il titolo della categoria dal primo alimento e ciascun prodotto dal successivo.

## Versione 1.2.4

I pulsanti dei prodotti e delle operazioni di apertura usano l’icona alimentare 🍽️ al posto dei lucchetti. Controllo sintattico superato.
