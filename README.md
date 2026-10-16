# Projekti in tisk

Samostojna aplikacija za PDF projekte, pošiljke, evidenco tiskanja in potrjevanje dela sodelavcev.

## Projekti in tisk

PDF-je lahko ročno naložiš in razvrstiš po skupinah ter oštevilčenih pošiljkah. Zaključek pošiljke pripravi naslednjo pošiljko. Dokumente lahko izbrišeš ali dodeliš sodelavcu z izbiro PDF-jev. Dodelitev ohrani dokument v upraviteljskem pogledu; ne ustvarja kopije.

Privzeta oznaka za tisk je **5**, nastavljiva za vsak projekt. Pripravljeni PDF vsebuje oznako, skupino oziroma pošiljko, zaporedno številko in izvorno številko strani. Risba se prenese na novo stran z dodatnim prostorom za oznake. Za izpis na A4/A3 uporabi prilagoditev papirju; za natančno merilo uporabi izvirnik. Prenos PDF-ja ne označi strani kot natisnjene. Evidenco tiskanja potrdi upravitelj po tiskanju.

## Sodelavci in potrditev dela

Upravitelj doda ime sodelavca in njegove naloge. Sodelavec izbere ime brez PIN-a ter vidi PDF-je in naloge dodeljene temu imenu. Izbira imena ni preverjanje identitete. Upraviteljski pogled in spremembe projektov zahtevajo skrbniški PIN, preverjen na strežniku.

Mape sodelavca so razdeljene po projektu, skupini in pošiljki. Potrditi je mogoče posamezno stran, celoten PDF ali celotno mapo. Enake možnosti ima upravitelj tudi za lastne nedodeljene PDF-je. Pri njegovi potrditvi se shrani ime »Upravitelj«. Kontrole »Narejeno« so ločene od izbire strani za tisk. Upraviteljski pregled »Kaj je narejeno – moje mape in sodelavci« prikazuje ime dokumenta, potrjene in nepotrjene strani ter napredek mape. Ena potrjena stran od šestih pomeni **1/6 – delno potrjeno**. PDF in mapa sta v celoti potrjena šele po potrditvi vseh strani. Strani niso samodejno število fizičnih pločevin.

Potrditve strani hranijo ime izbrane seje in čas. Potrditev naloge je dovoljena šele, ko so v celoti potrjeni vsi PDF-ji tega projekta, dodeljeni istemu sodelavcu. Naloge brez dodeljenih PDF-jev se lahko potrdijo samostojno. Potrditev dela je ločena od evidence tiskanja. Dodelitev drugemu sodelavcu ponastavi potrditev dela; ponovna dodelitev istemu sodelavcu jo ohrani. Stare potrditve celotnih PDF-jev se ob branju prenesejo na vse njihove strani.

## Pregledovalci in iskanje oznak

Pri »Dodaj uporabnika« izberi vrsto dostopa **Pregled PDF-jev – brez sprememb**, vpiši ime in ga dodaj. V razdelku **Dostop za pregled tega projekta** označi njegovo ime pri vsakem dovoljenem projektu. Pregledovalec izbere ime na prijavni strani, nato projekt. Vidi vse PDF-je dovoljenega projekta, tudi nove pošiljke; ne more potrjevati dela, spreminjati tiskanja, dodajati ali brisati dokumentov. Dovoljenje je neodvisno od dodelitve dokumentov delavcem. Odstranitev kljukice prekliče nadaljnji dostop tudi v že odprti seji.

Upravitelj in pregledovalec najprej izbereta PDF (npr. horizontale ali vertikale). Iskalnik ob odprtem dokumentu privzeto preišče samo ta PDF, npr. **H22** ali **V23**. Izbira »Celoten projekt« razširi iskanje na vse dostopne PDF-je projekta. Pred odprtjem dokumenta je iskanje po projektu dostopno v zložljivem razdelku. Rezultati vsebujejo ime PDF-ja, pošiljko, skupino, odlomek in številko strani. Gumb odpre zadeto stran. Iskanje razlikuje H22 od H220 ter upošteva male/velike črke in razmik med H/V in številko. Več zadetkov na isti strani pomeni en rezultat za to stran; prikazanih je največ 300 strani.

Besedilo izlušči lokalni `pdftotext` iz paketa Poppler. Docker slika ga namesti samodejno; pri zagonu brez Dockerja mora biti ukaz nameščen v sistemu. Prvo iskanje pripravi predpomnilnik tudi za obstoječe PDF-je v `/data/search`. Ta je obnovljiv in se pri brisanju PDF-ja odstrani. Vsako iskanje znova preveri dostop do projektov in dokumentov. Skenirane strani brez besedila niso podprte za iskanje brez OCR; prazne/neberljive strani oziroma dokumenti so navedeni v rezultatu in jih je še vedno mogoče odpreti ročno.

## Namestitev

Potrebna sta Docker Compose in Caddy. Kopiraj `.env.example` v `.env`, nastavi `ADMIN_PIN` (6–12 številk), `APP_ORIGIN` in `CADDY_NETWORK`, nato zaženi:

```sh
docker compose up -d --build
```

Privzeti lokalni naslov je `127.0.0.1:3105`, vrata aplikacije v vsebniku pa `3100`. Caddy mora biti v istem omrežju:

```caddy
tisk.dservis.si {
    reverse_proxy projekti-tisk:3100
}
```

Zdravje aplikacije preveri z `curl http://127.0.0.1:3105/health`. Po spremembi Caddyfile preveri konfiguracijo in jo ponovno naloži.

Za posodobitev v `/opt/projekti-tisk` izvedi `git pull --ff-only` in `docker compose up -d --build`. Podatki ostanejo v volume `projekti_tisk_data`; ne uporabljaj `docker compose down -v`, če želiš podatke ohraniti. Za varnostno kopijo ustavi aplikacijo in arhiviraj celoten volume.

## Razvoj in preverjanje

```sh
npm ci
npm test
npm run build
```

Preverjanja pokrivajo dostop upravitelja in sodelavcev, delne potrditve strani, preprečevanje prezgodnje potrditve nalog, ločeno evidenco tiskanja, pošiljke, trajnost podatkov in pripravo oznak na PDF-jih.
