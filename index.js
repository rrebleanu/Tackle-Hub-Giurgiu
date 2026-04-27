const express = require("express");
const path = require("path");
const fs = require("fs");
const sass = require("sass"); 

const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

global.obGlobal = {
    obErori: null,
    folderScss: path.join(__dirname, "resurse", "scss"),
    folderCss: path.join(__dirname, "resurse", "css"),
    folderBackup: path.join(__dirname, "backup")
};

console.log("Folder index.js (__dirname):", __dirname);
console.log("Folder curent de lucru (process.cwd()):", process.cwd());
console.log("Cale fișier (__filename):", __filename);

let vect_foldere = [
    "temp", 
    "logs", 
    "backup", 
    "fisiere_uploadate", 
    path.join("backup", "resurse", "css")
];

for (let folder of vect_foldere) {
    let caleFolder = path.join(__dirname, folder);
    if (!fs.existsSync(caleFolder)) {
        fs.mkdirSync(caleFolder, { recursive: true });
    }
}

app.use("/resurse", express.static(path.join(__dirname, "resurse")));

app.use((req, res, next) => {
    res.locals.ip = req.ip; 
    next();
});


//cerinta custom etapa 5
const sharp = require('sharp');

app.use((req, res, next) => {
    const galeriePath = path.join(__dirname, 'resurse/json/galerie.json');
    if (fs.existsSync(galeriePath)) {
        let galerieData = JSON.parse(fs.readFileSync(galeriePath, 'utf8'));
        
        let minut = new Date().getMinutes();
        let sfertCurent = Math.floor(minut / 15) + 1;

        let imaginiFiltrate = galerieData.imagini.filter(img => parseInt(img.sfert_ora) === sfertCurent);
        
        if (imaginiFiltrate.length > 10) {
            imaginiFiltrate = imaginiFiltrate.slice(0, 10);
        }

        let folderBaza = path.join(__dirname, galerieData.cale_galerie);
        let folderMediu = path.join(folderBaza, 'mediu');
        let folderMic = path.join(folderBaza, 'mic');

        if (!fs.existsSync(folderMediu)) fs.mkdirSync(folderMediu, { recursive: true });
        if (!fs.existsSync(folderMic)) fs.mkdirSync(folderMic, { recursive: true });

        imaginiFiltrate.forEach(img => {
            let caleAbsoluta = path.join(folderBaza, img.cale_imagine);
            let caleMediu = path.join(folderMediu, img.cale_imagine);
            let caleMic = path.join(folderMic, img.cale_imagine);

            if (fs.existsSync(caleAbsoluta)) {
                if (!fs.existsSync(caleMediu)) sharp(caleAbsoluta).resize(400).toFile(caleMediu);
                if (!fs.existsSync(caleMic)) sharp(caleAbsoluta).resize(200).toFile(caleMic);
            }
        });

        res.locals.imaginiGalerie = imaginiFiltrate;
        res.locals.caleGalerie = galerieData.cale_galerie;
    }
    next();
});

// Partea de compilare  SCSS -> CSS

function compileazaScss(caleScss, caleCss) {
    // Dacă avem căi absolute se iau, dacă sunt relative se raportează la folderScss/folderCss
    let cScss = path.isAbsolute(caleScss) ? caleScss : path.join(global.obGlobal.folderScss, caleScss);
    let cCss;

    // Dacă lipsește calea CSS, o generăm din numele SCSS
    if (!caleCss) {
        let numeFisier = path.basename(cScss, ".scss");
        cCss = path.join(global.obGlobal.folderCss, numeFisier + ".css");
    } else {
        cCss = path.isAbsolute(caleCss) ? caleCss : path.join(global.obGlobal.folderCss, caleCss);
    }

    // Salvare în backup a fișierului CSS vechi
    let caleBackupCss = path.join(global.obGlobal.folderBackup, "resurse", "css");
    if (!fs.existsSync(caleBackupCss)) {
        fs.mkdirSync(caleBackupCss, { recursive: true });
    }

    if (fs.existsSync(cCss)) {
        try {
            let numeCss = path.basename(cCss);
            let timp = new Date().getTime(); // Integrare timestamp pentru a pastra istoricul
            let caleBackupFinala = path.join(caleBackupCss, `${timp}_${numeCss}`);
            fs.copyFileSync(cCss, caleBackupFinala);
        } catch (err) {
            console.error("Eroare la crearea backup-ului pentru " + cCss + ": ", err.message);
        }
    }

    // Compilarea cu SASS
    try {
        let rezultat = sass.compile(cScss, { sourceMap: true });
        fs.writeFileSync(cCss, rezultat.css);
    } catch (err) {
        console.error(`Eroare la compilarea SASS pentru ${cScss}: `, err.message);
    }
}

// Compilare inițială la pornirea serverului
if (fs.existsSync(global.obGlobal.folderScss)) {
    let vFisiere = fs.readdirSync(global.obGlobal.folderScss);
    for (let fisier of vFisiere) {
        if (path.extname(fisier) === ".scss") {
            compileazaScss(fisier);
        }
    }

    // Urmărire modificări pe parcurs (watch)
    fs.watch(global.obGlobal.folderScss, function (eveniment, numeFisier) {
        if (eveniment === "change" || eveniment === "rename") {
            if (numeFisier && path.extname(numeFisier) === ".scss") {
                let caleCompleta = path.join(global.obGlobal.folderScss, numeFisier);
                if (fs.existsSync(caleCompleta)) {
                    console.log(`[SCSS Watch] Fișier modificat: ${numeFisier}. Se recompilează...`);
                    compileazaScss(caleCompleta);
                }
            }
        }
    });
}

// ==========================================
// PARTEA DE ERORI (Păstrată 100% intactă)
// ==========================================
function validareEroriFisierJSON() {
    const caleFisierErori = path.join(__dirname, "resurse/json/erori.json");

    if (!fs.existsSync(caleFisierErori)) {
        console.error("EROARE: Fișierul 'erori.json' nu a fost găsit!");
        process.exit(1); 
    }

    let continutRaw = fs.readFileSync(caleFisierErori, "utf-8");
    let erori;
    try { erori = JSON.parse(continutRaw); } 
    catch (err) { console.error("EROARE: JSON invalid!"); process.exit(1); }

    const propietatilipsete = ["info_erori", "cale_baza", "eroare_default"].filter(prop => !(prop in erori));
    if (propietatilipsete.length > 0) {
        console.error(`EROARE: Lipsesc proprietăți de bază: ${propietatilipsete.join(", ")}`);
        process.exit(1);
    }

    const lipsaDefault = ["titlu", "text", "imagine"].filter(prop => !(prop in erori.eroare_default));
    if (lipsaDefault.length > 0) {
        console.error("EROARE: Eroarea default nu are titlu, text sau imagine!");
        process.exit(1);
    }

    const caleBasaAbsoluta = path.join(__dirname, erori.cale_baza);
    if (!fs.existsSync(caleBasaAbsoluta)) {
        console.error(`EROARE: Folderul ${erori.cale_baza} nu există!`);
        process.exit(1);
    }

    const grupId = erori.info_erori.reduce((acc, e) => ((acc[e.identificator] ??= []).push(e), acc), {});
    const dubluri = Object.entries(grupId).filter(([, v]) => v.length > 1);
    if (dubluri.length) {
        console.error("EROARE: Există identificatori de eroare repetați în JSON!");
        process.exit(1);
    }

    console.log("Validare erori.json: OK");
    return erori;
}

function initErori() {
    let erori = validareEroriFisierJSON(); 
    global.obGlobal.obErori = erori;
    
    let err_default = global.obGlobal.obErori.eroare_default;
    err_default.imagine = path.join(erori.cale_baza, err_default.imagine);
    for (let eroare of global.obGlobal.obErori.info_erori) {
        eroare.imagine = path.join(erori.cale_baza, eroare.imagine);
    }
}
initErori();

function afisareEroare(res, identificator, titlu, text, imagine) {
    let eroare = global.obGlobal.obErori.info_erori.find(e => e.identificator == identificator);
    
    if (eroare?.status) {
        res.status(eroare.identificator);
    }
    
    let errDefault = global.obGlobal.obErori.eroare_default;
    
    res.render("pagini/eroare", {
        titlu: titlu || eroare?.titlu || errDefault.titlu,
        text: text || eroare?.text || errDefault.text,
        imagine: imagine || eroare?.imagine || errDefault.imagine
    });
}


app.get("/favicon.ico", function (req, res) {
    res.sendFile(path.join(__dirname, "resurse/imagini/favicon/favicon.ico"));
});

app.get(["/", "/index", "/home"], function (req, res) {
    res.render("pagini/index");
});

app.get("/despre", function (req, res) {
    res.render("pagini/despre");
});

app.get("/*pagini", function (req, res) {
    if (req.url.startsWith("/resurse") && path.extname(req.url) === "") {
        afisareEroare(res, 403);
        return;
    }

    if (path.extname(req.url) === ".ejs") {
        afisareEroare(res, 400);
        return;
    }

    try {
        res.render("pagini" + req.url, function (err, rezRandare) {
            if (err) {
                if (err.message.includes("Failed to lookup view")) {
                    afisareEroare(res, 404); 
                } else {
                    afisareEroare(res); 
                }
                return;
            }
            res.send(rezRandare); 
        });
    } catch (err) {
        afisareEroare(res);
    }
});

const PORT = 8080;
app.listen(PORT, () => {
    console.log(`Serverul Danube Tackle Hub a pornit! Accesează: http://localhost:${PORT}`);
});