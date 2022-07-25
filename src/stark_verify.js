const Transcript = require("./transcript");
const TranscriptBN128 = require("./transcript.bn128");
const FRI = require("../src/fri.js");
const buildMerkleHashGL = require("./merklehash_p.js");
const buildMerkleHashBN128 = require("./merklehash_bn128_p.js");
const starkInfoGen = require("./starkinfo.js");
const { assert } = require("chai");
const buildPoseidonGL = require("./poseidon");
const buildPoseidonBN128 = require("circomlibjs").buildPoseidon;

module.exports = async function starkVerify(proof, publics, pil, constRoot, starkStruct) {

    const starkInfo = starkInfoGen(pil, starkStruct);

    const poseidon = await buildPoseidonGL();

    let MH;
    let transcript;
    if (starkStruct.verificationHashType == "GL") {
        const poseidonGL = await buildPoseidonGL();
        MH = await buildMerkleHashGL();
        transcript = new Transcript(poseidonGL);
    } else if (starkStruct.verificationHashType == "BN128") {
        const poseidonBN128 = await buildPoseidonBN128();
        MH = await buildMerkleHashBN128();
        transcript = new TranscriptBN128(poseidonBN128);
    } else {
        throw new Error("Invalid Hash Type: "+ starkStruct.verificationHashType);
    }

    const nBits = starkStruct.nBits;
    const N = 1 << nBits;
    const extendBits = starkStruct.nBitsExt - starkStruct.nBits;

    assert(nBits+extendBits == starkStruct.steps[0].nBits, "First step must be just one");

    const F = poseidon.F;

    ctx = {
        challenges: [],
        evals: proof.evals,
        publics: publics
    };
    transcript.put(proof.root1);
    ctx.challenges[0] = transcript.getField(); // u
    ctx.challenges[1] = transcript.getField(); // defVal
    transcript.put(proof.root2);
    ctx.challenges[2] = transcript.getField(); // gamma
    ctx.challenges[3] = transcript.getField(); // beta

    transcript.put(proof.root3);
    ctx.challenges[4] = transcript.getField(); // vc

    transcript.put(proof.root4);
    ctx.challenges[5] = transcript.getField(); // v1
    ctx.challenges[6] = transcript.getField(); // v2
    ctx.challenges[7] = transcript.getField(); // xi

    ctx.Z = F.sub(F.exp(ctx.challenges[7], N), 1n);
    ctx.Zp = F.sub(F.exp(F.mul(ctx.challenges[7], F.w[nBits]), N), 1n);



    const res=executeCode(F, ctx, starkInfo.verifierCode.first);

    if (!F.eq(res, 0n)) return false;

    const fri = new FRI( starkStruct, MH );

    const checkQuery = (query, idx) => {
        console.log("Query:"+  idx)
        let res;
        res = MH.verifyGroupProof(proof.root1, query[0][1], idx, query[0][0]);
        if (!res) return false;
        res = MH.verifyGroupProof(proof.root2, query[1][1], idx, query[1][0]);
        if (!res) return false;
        res = MH.verifyGroupProof(proof.root3, query[2][1], idx, query[2][0]);
        if (!res) return false;
        res = MH.verifyGroupProof(proof.root4, query[3][1], idx, query[3][0]);
        if (!res) return false;
        res = MH.verifyGroupProof(constRoot, query[4][1], idx, query[4][0]);
        if (!res) return false;

        const ctxQry = {};
        ctxQry.tree1 = query[0][0];
        ctxQry.tree2 = query[1][0];
        ctxQry.tree3 = query[2][0];
        ctxQry.tree4 = query[3][0];
        ctxQry.consts = query[4][0];
        ctxQry.evals = ctx.evals;
        ctxQry.publics = ctx.publics;
        ctxQry.challenges = ctx.challenges;

        const x = F.mul(F.shift, F.exp(F.w[nBits + extendBits], idx));
        ctxQry.xDivXSubXi = F.div(x, F.sub(x, ctxQry.challenges[7]));
        ctxQry.xDivXSubWXi = F.div(x, F.sub(x, F.mul(F.w[nBits], ctxQry.challenges[7])));

        const vals = [executeCode(F, ctxQry, starkInfo.verifierQueryCode.first)];

        return vals;
    }

    return fri.verify(transcript, proof.fri, checkQuery);

}


function executeCode(F, ctx, code) {
    const tmp = [];
    for (let i=0; i<code.length; i++) {
        const src = [];
        for (k=0; k<code[i].src.length; k++) {
            src.push(getRef(code[i].src[k]));
        }
        let res;
        switch (code[i].op) {
            case 'add': res = F.add(src[0], src[1]); break;
            case 'sub': res = F.sub(src[0], src[1]); break;
            case 'mul': res = F.mul(src[0], src[1]); break;
            case 'copy': res = src[0]; break;
            default: throw new Error("Invalid op:"+ code[i].op);
        }
        setRef(code[i].dest, res);
    }
    return getRef(code[code.length-1].dest);


    function getRef(r) {
        switch (r.type) {
            case "tmp": return tmp[r.id];
            case "tree1": return extractVal(ctx.tree1, r.treePos, r.dim);
            case "tree2": return extractVal(ctx.tree2, r.treePos, r.dim);
            case "tree3": return extractVal(ctx.tree3, r.treePos, r.dim);
            case "tree4": return extractVal(ctx.tree4, r.treePos, r.dim);
            case "const": return ctx.consts[r.id];
            case "eval": return ctx.evals[r.id];
            case "number": return BigInt(r.value);
            case "public": return BigInt(ctx.publics[r.id]);
            case "challenge": return ctx.challenges[r.id];
            case "xDivXSubXi": return ctx.xDivXSubXi;
            case "xDivXSubWXi": return ctx.xDivXSubWXi;
            case "x": return ctx.challenges[7];
            case "Z": return r.prime ? ctx.Zp : ctx.Z;
            default: throw new Error("Invalid reference type get: " + r.type);
        }
    }

    function extractVal(arr, pos, dim) {
        if (dim==1) {
            return arr[pos];
        } else if (dim==3) {
            return arr.slice(pos, pos+3);
        } else {
            throw new Error("Invalid dimension");
        }
    }

    function setRef(r, val) {
        switch (r.type) {
            case "tmp": tmp[r.id] = val; return;
            default: throw new Error("Invalid reference type set: " + r.type);
        }
    }

}

