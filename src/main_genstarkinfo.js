const fs = require("fs");
const version = require("../package").version;

const F3g = require("./helpers/f3g.js");
const starkInfoGen = require("./stark/stark_info.js");
const { compile } = require("pilcom");

const argv = require("yargs")
    .version(version)
    .usage("node main_genstarkinfo.js -p <input.pil> [-j <input_pil.json>] [-P <pilconfig.json] -s <starkstruct.json> -i <starkinfo.json>")
    .alias("p", "pil")
    .alias("j", "pil-json")
    .alias("P", "pilconfig")
    .alias("s", "starkstruct")
    .alias("i", "starkinfo")
    .argv;

async function run() {
    const F = new F3g();

    if (typeof(argv.pil) === "string" && typeof(argv.pilJson) === "string") {
        console.log("The options '-p' and '-j' exclude each other.");
        process.exit(1);
    }

    const pilConfig = typeof(argv.pilconfig) === "string" ? JSON.parse(fs.readFileSync(argv.pilconfig.trim())) : {};

    const starkStructFile = typeof(argv.starkstruct) === "string" ?  argv.starkstruct.trim() : "mycircuit.stark_struct.json";
    const starkInfoFile = typeof(argv.starkinfo) === "string" ?  argv.starkinfo.trim() : "mycircuit.starkinfo.json";

    let pil;
    if (typeof(argv.pilJson) === "string") {
        pil = JSON.parse(fs.readFileSync(argv.pilJson.trim()));
    } else {
        const pilFile = typeof(argv.pil) === "string" ?  argv.pil.trim() : "mycircuit.pil";
        pil = await compile(F, pilFile, null, pilConfig);
    }

    const starkStruct = JSON.parse(await fs.promises.readFile(starkStructFile, "utf8"));

    const starkInfo = starkInfoGen(pil, starkStruct);

    await fs.promises.writeFile(starkInfoFile, JSON.stringify(starkInfo, null, 1), "utf8");

    console.log("files Generated Correctly");
}

run().then(()=> {
    process.exit(0);
}, (err) => {
    console.log(err.message);
    console.log(err.stack);
    process.exit(1);
});

