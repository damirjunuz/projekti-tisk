# Projekti in tisk
Ločena aplikacija za PDF projekte, pregled natisnjenih strani in pripravo PDF-ja za tisk.

## Tisk
Privzeta oznaka je **5**; spremeniš jo v polju »Številka za tisk«. Vsaka pripravljena stran dobi oznako zgoraj desno, zaporedno številko spodaj na sredini in številko izvorne strani spodaj levo. Začetno številko lahko določiš. Če izbereš izvorne strani 4, 8 in 12, je izpis »Stran 1 / 3« … »Stran 3 / 3« ter izvorna stran 4, 8, 12.

Načrt se v celoti prenese na novo stran z dodatnim prostorom za oznake. Razmerje in risba ostaneta ohranjena; velikost izhodnega lista je malo večja. V tiskalniku izberi A4/A3 in »Prilagodi velikosti papirja«. Za risbe v natančnem merilu uporabi izvirnik. Izvorni dokument se ne prepiše. Prenos ne označi strani kot natisnjene; to potrdiš po tiskanju. Vsak uvoz je ločen dokument, tudi pri enakem imenu.

## Namestitev na strežnik
Potrebna sta Docker Compose in obstoječe Caddy omrežje. Pred spremembami preveri prost port 3105, pravilno omrežje in DNS za izbrano domeno. Privzeti primer je `tisk.dservis.si`; domena ni samodejno nastavljena.

1. Kopiraj `.env.example` v `.env` in nastavi močno `APP_PASSWORD`, pravilni `APP_ORIGIN` in `CADDY_NETWORK`.
2. Zaženi `docker compose up -d --build`.
3. Dodaj v obstoječi Caddyfile blok (drugo vsebino ohrani):

```caddy
 tisk.dservis.si {
     reverse_proxy projekti-tisk:3100
 }
```

4. Preveri Caddy konfiguracijo in jo ponovno naloži. Lokalno zdravje preveri z `curl http://127.0.0.1:3105/health`; nato preveri zunanji HTTPS naslov in prijavo.

Aplikacija uporablja lastno uporabniško ime in geslo preko HTTPS. Podatki ostajajo v Docker volume `projekti_tisk_data`. Za varnostno kopijo ustavi aplikacijo in arhiviraj celoten volume; nato jo znova zaženi. Posodobitve ne smejo brisati volume-a (`docker compose down -v` izbriše podatke).

## Razvoj in preverjanje
`npm ci`, `npm test`, `npm run build`. Za razvoj zaženi strežnik z nastavljenim `APP_PASSWORD` in `DATA_DIR`, nato `npm run dev`. Za razvoj na Vite nastavi `APP_ORIGIN=http://localhost:5173`.

## GitHub
Ustvari zaseben repozitorij `projekti-tisk`. Ta paket vsebuje preverjanje ob pushu in pull requestu. Samodejno nameščanje na strežnik se uredi po potrditvi njegove poti, dostopa in domene; paket ga še ne sproži. Gesla, podatkov in PDF-jev ne dodajaj v Git.

## Prenos obstoječih podatkov
Ta različica uporablja lokalne datoteke namesto Sites/R2. Projekti, PDF-ji in oznake iz obstoječe aplikacije se ne prenesejo samodejno. Pred preklopom je treba narediti izvoz iz obstoječe aplikacije in uvoz v novo; stara aplikacija naj ostane dostopna do preverjenega prenosa.

## E-pošta
Samodejni prevzem posredovanih PDF-jev še ni povezan. API je pripravljen za n8n: POST `/api/data` ustvari projekt, POST `/api/data?kind=upload&project=ID&name=IME.pdf` sprejme PDF. Za dostop uporabi Basic Auth in HTTPS. Pred uvozom poišči projekt preko GET `/api/data`, da ne ustvarjaš podvojenih projektov. Dokončna pravila za predmet sporočila in deduplikacijo se dogovorijo ob povezavi maila.
