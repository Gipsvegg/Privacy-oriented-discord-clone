// NEVER FORGET TO BUILD THIS FILE AFTER EDITS: npm run build
// (the git hook builds on commit, but to TEST in the browser you have to build yourself)

// ─── STEP 1: bring in the functions we need from ts-mls ───────────────
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

// ─── STEP 2: helpers to turn text into bytes and back ─────────────────
// Crypto only works on bytes (Uint8Array), never on strings.
const toBytes = (text) => new TextEncoder().encode(text);
const toText = (bytes) => new TextDecoder().decode(bytes);

// ─── STEP 3: which crypto algorithms to use ───────────────────────────
// Ciphersuite 1 in the ts-mls README: X25519 + AES-128-GCM + Ed25519.
// This one needs no extra npm packages.
const SUITE = "MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519";

// ─── STEP 4: a "user" = a name + a key package ────────────────────────
async function makeUser(name, impl) {
    const credential = { credentialType: "basic", identity: toBytes(name) };
    // Returns { publicPackage, privatePackage }
    //   publicPackage  -> safe to upload to the server
    //   privatePackage -> must NEVER leave this browser
    return generateKeyPackage(credential, defaultCapabilities(), defaultLifetime, [], impl);
}

// ─── STEP 5: the demo – Alice AND Bob, both inside this one browser tab ─
async function demo(text = "Hello Bob!") {
    const impl = await getCiphersuiteImpl(getCiphersuiteFromName(SUITE));

    const alice = await makeUser("alice", impl);
    const bob = await makeUser("bob", impl);

    // Alice starts a group with only herself in it
    let aliceGroup = await createGroup(toBytes("chat-1"), alice.publicPackage, alice.privatePackage, [], impl);

    // Alice adds Bob. (Real app: she downloads Bob's publicPackage from the server.)
    const addBob = { proposalType: "add", add: { keyPackage: bob.publicPackage } };
    const commit = await createCommit({ state: aliceGroup, cipherSuite: impl }, { extraProposals: [addBob] });
    aliceGroup = commit.newState;
    commit.consumed.forEach(zeroOutUint8Array); // wipe used secret keys

    // Bob joins with the Welcome. (Real app: it reaches him through the server.)
    let bobGroup = await joinGroup(commit.welcome, bob.publicPackage, bob.privatePackage, emptyPskIndex, impl, aliceGroup.ratchetTree);

    // ── Alice encrypts ──
    const sent = await createApplicationMessage(aliceGroup, toBytes(text), impl);
    aliceGroup = sent.newState;
    sent.consumed.forEach(zeroOutUint8Array);

    // Turn it into raw bytes: THIS is what your server would store and relay
    const wireBytes = encodeMlsMessage({
        privateMessage: sent.privateMessage,
        wireformat: "mls_private_message",
        version: "mls10",
    });
    console.log("What the server sees:", wireBytes);

    // ── Bob decrypts ──
    const decoded = decodeMlsMessage(wireBytes, 0)[0];
    const received = await processPrivateMessage(bobGroup, decoded.privateMessage, emptyPskIndex, impl);
    bobGroup = received.newState;
    if (received.kind === "newState") throw new Error("Expected a chat message, got a group change");
    received.consumed.forEach(zeroOutUint8Array);

    const plain = toText(received.message);
    console.log("What Bob reads:", plain);
    return plain;
}

// ─── STEP 6: make it reachable from outside this module ───────────────
window.e2ee = { demo };
console.log("e2ee loaded. Try in the console:  await e2ee.demo('hi')");