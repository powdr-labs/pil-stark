const fs = require("fs");
const path = require("path");
const version = require("../package").version;

const F1Field = require("./f3g");
const starkInfoGen = require("./starkinfo.js");
const { compile } = require("pilcom");
const buildCHelpers = require("./chelpers.js");

const argv = require("yargs")
    .version(version)
    .usage("node main_buildchelpers.js -p <input.pil> [-j <input_pil.json>] [-P <pilconfig.json] -s <starkinfo.json> -c <chelpers.cpp> [-C <classname>]")
    .alias("p", "pil")
    .alias("j", "pil-json")
    .alias("P", "pilconfig")
    .alias("s", "starkinfo")
    .alias("c", "chelpers")
    .alias("C", "cls")
    .alias("m", "multiple")
    .alias("o", "optcodes")
    .argv;

async function run() {
    const F = new F1Field();

    if (typeof(argv.pil) === "string" && typeof(argv.pilJson) === "string") {
        console.log("The options '-p' and '-j' exclude each other.");
        process.exit(1);
    }

    const pilConfig = typeof (argv.pilconfig) === "string" ? JSON.parse(fs.readFileSync(argv.pilconfig.trim())) : {};


    const cls = typeof (argv.cls) === "string" ? argv.cls.trim() : "Stark";
    const starkInfoFile = typeof (argv.starkinfo) === "string" ? argv.starkinfo.trim() : "mycircuit.starkinfo.json";
    const chelpersFile = typeof (argv.chelpers) === "string" ? argv.chelpers.trim() : "mycircuit.chelpers.cpp";
    const multipleCodeFiles = argv.multiple;
    const optcodes = argv.optcodes;

    let pil;
    if (typeof(argv.pilJson) === "string") {
        pil = JSON.parse(fs.readFileSync(argv.pilJson.trim()));
    } else {
        const pilFile = typeof(argv.pil) === "string" ?  argv.pil.trim() : "mycircuit.pil";
        pil = await compile(F, pilFile, null, pilConfig);
    }

    const starkInfo = JSON.parse(await fs.promises.readFile(starkInfoFile, "utf8"));

    const cCode = await buildCHelpers(starkInfo, multipleCodeFiles ? { multipleCodeFiles: true, className: cls, optcodes: optcodes } : {});

    if (multipleCodeFiles) {
        const baseDir = path.dirname(chelpersFile);
        if (!fs.existsSync(baseDir)) {
            fs.mkdirSync(baseDir, { recursive: true });
        }
        const dotPos = chelpersFile.lastIndexOf('.');
        const leftFilename = dotPos < 0 ? chelpersFile : chelpersFile.substr(0, dotPos);
        const ext = dotPos < 0 ? '.cpp' : chelpersFile.substr(dotPos);
        const classInclude = cls.charAt(0).toLowerCase() + cls.slice(1) + ".hpp";
        for (cpart in cCode) {
            let code, ext2;
            if (!cpart.includes("parser")) {
                code = `#include "goldilocks_cubic_extension.hpp"\n#include "zhInv.hpp"\n#include "starks.hpp"\n#include "constant_pols_starks.hpp"\n#include "${classInclude}"\n\n` + cCode[cpart];
                ext2 = ext;
            } else {
                code = cCode[cpart];
                cpart = cpart.replace(/_/g, ".");
                ext2 = ".hpp";
            }
            await fs.promises.writeFile(leftFilename + '.' + cpart + ext2, code, "utf8");
        }
    } else {
        await fs.promises.writeFile(chelpersFile, cCode, "utf8");
    }

    console.log("files Generated Correctly");
}

run().then(() => {
    process.exit(0);
}, (err) => {
    console.log(err.message);
    console.log(err.stack);
    process.exit(1);
});
