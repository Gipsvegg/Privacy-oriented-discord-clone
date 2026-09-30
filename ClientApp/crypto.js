//NEVER FORGET TO BUILD THIS FILE AFTER EDITS
//npm run build
//satt inn en git hook som skal bygge den automatisk hver gang

import {
    getCiphersuiteImpl,
    getCiphersuiteFromName,
    generateKeyPackage,
    createGroup,
    createCommit,
    joinGroup,
    createApplicationMessage,
    processPrivateMessage,
    encodeMlsMessage,
    decodeMlsMessage,
    defaultCapabilities,
    defaultLifetime,
    emptyPskIndex,
    zeroOutUint8Array, 
} from "ts-mls";

console.log({
    getCiphersuiteImpl,
    getCiphersuiteFromName,
    generateKeyPackage,
    createGroup,
    createCommit,
    joinGroup,
    createApplicationMessage,
    processPrivateMessage,
    encodeMlsMessage,
    decodeMlsMessage,
    defaultCapabilities,
    defaultLifetime,
    emptyPskIndex,
    zeroOutUint8Array,
});