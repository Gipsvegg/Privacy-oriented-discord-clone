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
    zeroOutUint8Array, encodeGroupState, decodeGroupState,
} from "ts-mls";

import { defaultClientConfig } from "ts-mls/clientConfig.js";

import { get, set, del } from "idb-keyval";

// ─── STEP 2: helpers to turn text into bytes and back ─────────────────
// Crypto only works on bytes (Uint8Array), never on strings.
const toBytes = (text) => new TextEncoder().encode(text);
const toText = (bytes) => new TextDecoder().decode(bytes);


// ─── STEP 3: which crypto algorithms to use ───────────────────────────
// Ciphersuite 1 in the ts-mls README: X25519 + AES-128-GCM + Ed25519.
// This one needs no extra npm packages.
const SUITE = "MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519";

// ─── STEP 4: a "user" = a name + a key package ────────────────────────
async function makeUser(userId, impl) {
    let user;
    const credential = { credentialType: "basic", identity: toBytes(userId) };
    
    const saved = await get(`user:${userId}`);
    
    if(saved !== undefined) {
        return saved;
    }
    
    // Returns { publicPackage, privatePackage }
    //   publicPackage  -> safe to upload to the server
    //   privatePackage -> must NEVER leave this browser
    
    user = await generateKeyPackage(credential, defaultCapabilities(), defaultLifetime, [], impl);
    await set(`user:${userId}`, user);
    
    return user;
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
    
    console.log("Encrypted message: ", sent.privateMessage);

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

async function testGroupFlow() {
    const impl = await getCiphersuiteImpl(getCiphersuiteFromName(SUITE));

    // Bob has to exist first (pretend his key package is on the server)
    const bob = await makeUser("test-bob", impl);

    // Alice creates the group with Bob in it
    const welcomeBytes = await groupCreation("test-alice", "test-chat", [{ keyPackage: bob.publicPackage }]);
    console.log("1. Welcome bytes:", welcomeBytes.length);

    // Bob accepts
    await inviteAccept("test-bob", "test-chat", welcomeBytes);
    console.log("2. Both saved a group:",
        !!(await get("test-alice:group:test-chat")),
        !!(await get("test-bob:group:test-chat")));
    
    
    let message = "Hello Bob!";
    let sent = await encryptMessage(message, "test-alice", "test-chat");
    let got = await decryptMessage(sent, "test-bob", "test-chat");
    console.log("3. Bob reads:", got);
    
    message = "hay Alice:)";
    sent = await encryptMessage(message, "test-bob", "test-chat");
    got = await decryptMessage(sent, "test-alice", "test-chat");
    console.log("4. Alice reads:", got);
}

async function loadGroupState(userId, conversationId) {
    const encodedGroupState = await get(`${userId}:group:${conversationId}`);
    if(encodedGroupState === undefined) {
        throw new Error(`No such group state in DB for user: ${userId} and conversationId: ${conversationId}`);
    }
    const groupState = decodeGroupState(encodedGroupState, 0)[0]
    return {...groupState, clientConfig: defaultClientConfig };
}

async function saveGroupState(userId, conversationId, groupState) {
    await set(`${userId}:group:${conversationId}`, encodeGroupState(groupState));
}

async function encryptMessage(message, userId, conversationId) {
    let groupState = await loadGroupState(userId, conversationId);
    const impl = await getCiphersuiteImpl(getCiphersuiteFromName(SUITE));
    
    const encryptedMessage = await createApplicationMessage(groupState, toBytes(message), impl);
    groupState = encryptedMessage.newState;
    encryptedMessage.consumed.forEach(zeroOutUint8Array);

    await saveGroupState(userId, conversationId, groupState);
    
    const messageBytes = encodeMlsMessage({
        privateMessage: encryptedMessage.privateMessage,
        wireformat: "mls_private_message",
        version: "mls10",
    })
    
    return messageBytes;
}

async function decryptMessage(message, userId, conversationId) {
    const impl = await getCiphersuiteImpl(getCiphersuiteFromName(SUITE));
    
    const decoded = decodeMlsMessage(message, 0)[0];
    if(decoded.wireformat !== "mls_private_message") {
        throw new Error("Not a private message");
    }
    let groupState = await loadGroupState(userId, conversationId);
    const decryptedMessage = await processPrivateMessage(groupState, decoded.privateMessage, emptyPskIndex, impl);
    
    groupState = decryptedMessage.newState;
    decryptedMessage.consumed.forEach(zeroOutUint8Array);

    await saveGroupState(userId, conversationId, groupState);
    
    if(decryptedMessage.kind === "applicationMessage") {
        return toText(decryptedMessage.message);
    } else {
        return null;
    }
}

//creating the group, this would be for any conversation
async function groupCreation(userId, conversationId, groupMembers) {
    const impl = await getCiphersuiteImpl(getCiphersuiteFromName(SUITE));
    let addMembers = [];
    
    
    const user = await makeUser(userId, impl);
    let userGroup = await createGroup(toBytes(conversationId), user.publicPackage, user.privatePackage, [], impl);
    
    for (const member of groupMembers) {
        const addMember = { proposalType: "add", add: { keyPackage: member.keyPackage }};
        
        addMembers.push(addMember);
    }
       
    const commit = await createCommit({ state: userGroup, cipherSuite: impl }, { extraProposals: addMembers, ratchetTreeExtension: true });
        
    userGroup = commit.newState;
    commit.consumed.forEach(zeroOutUint8Array);
    
    const welcome = commit.welcome;
    await saveGroupState(userId, conversationId, userGroup);
    
    return encodeMlsMessage({ welcome, wireformat: "mls_welcome", version: "mls10" });
}

//lets the user into the group after they download the welcome after group creation(should be automatic)
async function inviteAccept(userId, conversationId, welcome) {
    const checkGroupStatus = await get(`${userId}:group:${conversationId}`);
    if(checkGroupStatus !== undefined) {
        throw new Error("Invite already accepted");
    }
    
    const impl = await getCiphersuiteImpl(getCiphersuiteFromName(SUITE));
    const decodedWelcome = decodeMlsMessage(welcome, 0)[0]
    if (decodedWelcome.wireformat !== "mls_welcome") {
        throw new Error("Expected a welcome");
    }
    
    const user = await makeUser(userId, impl);
    let acceptInvite = await joinGroup(decodedWelcome.welcome, user.publicPackage, user.privatePackage, emptyPskIndex, impl);

    await saveGroupState(userId, conversationId, acceptInvite);
}

//adding new users to the group
async function inviteUsersToGroup() {
    
}

// ─── STEP 6: make it reachable from outside this module ───────────────
window.e2ee = { demo };
window.e2ee = { demo, testGroupFlow }
console.log("e2ee loaded. Try in the console:  await e2ee.demo('hi')");