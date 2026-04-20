const express = require("express");
const path = require("path");
const fs = require("fs");
const sass = require("sass"); 

const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

let obGlobal = {
    obErori: null,
    folderScss: path.join(__dirname, "resurse/scss"),
    folderCss: path.join(__dirname, "resurse/css"),
    folderBackup: path.join(__dirname, "backup")
};

console.log("Folder index.js (__dirname):", __dirname);
console.log("Folder curent de lucru (process.cwd()):", process.cwd());
console.log("Cale fișier (__filename):", __filename);

let vect_foldere = ["temp", "logs", "backup", "fisiere_uploadate"];
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
    obGlobal.obErori = erori;
    
    let err_default = obGlobal.obErori.eroare_default;
    err_default.imagine = path.join(erori.cale_baza, err_default.imagine);
    for (let eroare of obGlobal.obErori.info_erori) {
        eroare.imagine = path.join(erori.cale_baza, eroare.imagine);
    }
}
initErori();

function afisareEroare(res, identificator, titlu, text, imagine) {
    let eroare = obGlobal.obErori.info_erori.find(e => e.identificator == identificator);
    
    if (eroare?.status) {
        res.status(eroare.identificator);
    }
    
    let errDefault = obGlobal.obErori.eroare_default;
    
    res.render("pagini/eroare", {
        titlu: titlu || eroare?.titlu || errDefault.titlu,
        text: text || eroare?.text || errDefault.text,
        imagine: imagine || eroare?.imagine || errDefault.imagine
    });
}

function compileazaScss(caleScss, caleCss) {
    if (!caleCss) {
        let numeFisExt = path.basename(caleScss);
        let numeFis = numeFisExt.split(".")[0];
        caleCss = numeFis + ".css";
    }

    if (!path.isAbsolute(caleScss)) caleScss = path.join(obGlobal.folderScss, caleScss);
    if (!path.isAbsolute(caleCss)) caleCss = path.join(obGlobal.folderCss, caleCss);

    let caleBackup = path.join(obGlobal.folderBackup, "resurse/css");
    if (!fs.existsSync(caleBackup)) fs.mkdirSync(caleBackup, { recursive: true });

    if (fs.existsSync(caleCss)) {
        fs.copyFileSync(caleCss, path.join(caleBackup, path.basename(caleCss)));
    }
    try {
        let rez = sass.compile(caleScss, { sourceMap: true });
        fs.writeFileSync(caleCss, rez.css);
    } catch (err) { console.error("Eroare SASS: " + err.message); }
}

if (fs.existsSync(obGlobal.folderScss)) {
    let vFisiere = fs.readdirSync(obGlobal.folderScss);
    for (let numeFis of vFisiere) {
        if (path.extname(numeFis) == ".scss") compileazaScss(numeFis);
    }
    fs.watch(obGlobal.folderScss, function (eveniment, numeFis) {
        if (eveniment == "change" || eveniment == "rename") {
            let caleCompleta = path.join(obGlobal.folderScss, numeFis);
            if (fs.existsSync(caleCompleta)) compileazaScss(caleCompleta);
        }
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

app.listen(8080, () => {
    console.log("Serverul Danube Tackle Hub a pornit! Accesează: http://localhost:8080");
});