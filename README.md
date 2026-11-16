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
